"""Multi-step 5-year forward outlook mirroring browser logic."""

from __future__ import annotations

import numpy as np

from data.constants import FEATURE_NAMES, FORECAST_HORIZON, HAZARD_HORIZON, INPUT_WINDOW, N_CORR, PROBABILITY_HORIZON
from eval.metrics import brier_score, lead_time_hit, median_onset_month, onset_mae, probability_within_horizon

FORWARD_HORIZON = 60
ROLLOUT_STEPS = 3
ROLLOUT_STEP_MONTHS = HAZARD_HORIZON
HORIZONS = [12, 24, 36, 48, 60]


def _diffs(series: np.ndarray) -> np.ndarray:
    out = np.zeros_like(series)
    out[1:] = series[1:] - series[:-1]
    return out


def _second_diffs(series: np.ndarray) -> np.ndarray:
    d1 = _diffs(series)
    return _diffs(d1)


def _rolling_std_diffs(series: np.ndarray, window: int = 24) -> np.ndarray:
    d1 = _diffs(series)
    out = np.zeros_like(series)
    for i in range(len(series)):
        start = max(1, i - window + 1)
        sl = d1[start : i + 1]
        if len(sl) < 2:
            continue
        out[i] = float(np.std(sl))
    return out


def recompute_derived_features(rows: np.ndarray, flat_yield: float) -> np.ndarray:
    c1, c2, c4 = rows[:, 0], rows[:, 1], rows[:, 2]
    rows[:, 3] = _diffs(c1)
    rows[:, 4] = _diffs(c2)
    rows[:, 5] = _diffs(c4)
    rows[:, 6] = _second_diffs(c1)
    rows[:, 7] = _second_diffs(c2)
    rows[:, 8] = _second_diffs(c4)
    rows[:, 9] = _rolling_std_diffs(c1)
    rows[:, 10] = _rolling_std_diffs(c2)
    rows[:, 11] = _rolling_std_diffs(c4)
    rows[:, 12] = flat_yield
    return rows


def append_synthetic_rows(panel: np.ndarray, future_corr: np.ndarray, step_months: int, flat_yield: float) -> np.ndarray:
    extra = np.zeros((step_months, len(FEATURE_NAMES)), dtype=np.float32)
    for m in range(step_months):
        extra[m, 0:3] = future_corr[m]
    extended = np.vstack([panel, extra])
    return recompute_derived_features(extended, flat_yield)


def rollout_hazards(predict_fn, x_raw: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    flat_yield = float(x_raw[-1, 12])
    panel = x_raw.copy()
    stitched: list[float] = []

    for _ in range(ROLLOUT_STEPS):
        window = panel[-INPUT_WINDOW:]
        x_norm = ((window - mean) / np.maximum(std, 1e-6)).astype(np.float32)
        hazards, future = predict_fn(x_norm[np.newaxis, ...])
        hazards = hazards[0]
        future = future[0].reshape(FORECAST_HORIZON, N_CORR)
        for m in range(ROLLOUT_STEP_MONTHS):
            stitched.append(float(hazards[m]))
        panel = append_synthetic_rows(panel, future, ROLLOUT_STEP_MONTHS, flat_yield)

    return np.array(stitched[:FORWARD_HORIZON], dtype=np.float32)


def rollout_probabilities(
    predict_fn,
    X: np.ndarray,
    mean: np.ndarray,
    std: np.ndarray,
    horizon: int,
) -> np.ndarray:
    out = []
    for i in range(len(X)):
        h = rollout_hazards(predict_fn, X[i], mean, std)
        out.append(probability_within_horizon(h[np.newaxis, :], horizon=min(horizon, len(h)))[0])
    return np.array(out, dtype=np.float32)


def rollout_onset_months(predict_fn, X: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    out = []
    for i in range(len(X)):
        h = rollout_hazards(predict_fn, X[i], mean, std)
        out.append(float(median_onset_month(h[np.newaxis, :])[0]))
    return np.array(out, dtype=np.float32)


def evaluate_forward_outlook_loro(
    df,
    predict_fn,
    mean: np.ndarray,
    std: np.ndarray,
    us_rec,
) -> dict:
    """Leave-one-recession-out metrics on roll-forward scores."""
    from eval.loro_cv import loro_split, make_windows, parse_recession_starts

    X, _, y12, tte, dates, rids = make_windows(df)
    labels = {
        12: y12,
        24: df["event_24mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        36: df["event_36mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        48: df["event_48mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        60: df["event_60mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
    }
    starts = parse_recession_starts(us_rec.reindex(df.index, method="ffill").fillna(0))
    recession_ids = sorted(set(rids) - {-1})
    fold_metrics: list[dict] = []

    for rid in recession_ids:
        train, test = loro_split(rids, rid)
        if test.sum() == 0:
            continue
        fold = evaluate_forward_outlook(
            X[test],
            {h: labels[h][test] for h in HORIZONS},
            tte[test],
            predict_fn,
            mean,
            std,
            dates[test],
            starts,
        )
        fold["held_out_recession"] = int(rid)
        fold_metrics.append(fold)

    if not fold_metrics:
        return {"folds": [], "gates_passed": False}

    summary = {
        f"mean_{key}": float(np.nanmean([f[key] for f in fold_metrics]))
        for key in fold_metrics[0]
        if key != "held_out_recession"
    }
    gates_passed = (
        summary.get("mean_brier_12", 1.0) <= 0.15
        and summary.get("mean_brier_60", 1.0) <= 0.25
        and summary.get("mean_lead_time_60", 0.0) >= 0.5
    )
    return {"folds": fold_metrics, "summary": summary, "gates_passed": gates_passed}


def evaluate_forward_outlook(
    X: np.ndarray,
    labels: dict[int, np.ndarray],
    tte: np.ndarray,
    predict_fn,
    mean: np.ndarray,
    std: np.ndarray,
    dates: np.ndarray,
    recession_starts: list,
) -> dict:
    metrics: dict = {}
    probs_by_h: dict[int, np.ndarray] = {}
    for h in HORIZONS:
        probs = rollout_probabilities(predict_fn, X, mean, std, h)
        probs_by_h[h] = probs
        y = labels[h]
        metrics[f"brier_{h}"] = brier_score(y, probs)

    p60 = probs_by_h[60]
    onset = rollout_onset_months(predict_fn, X, mean, std)
    mask = labels[60] > 0.5
    metrics["onset_mae"] = onset_mae(tte, onset, mask)
    metrics["lead_time_60"] = lead_time_hit(dates, p60, recession_starts, threshold=0.5)
    return metrics
