"""Leave-one-recession-out cross-validation."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from eval.metrics import brier_score, lead_time_hit, median_onset_month, onset_mae, probability_within_horizon
from data.constants import FEATURE_NAMES, HAZARD_HORIZON, INPUT_WINDOW
from data.prepare_panel import parse_recession_starts


@dataclass
class LoroFoldResult:
    held_out_recession: int
    brier_24: float
    brier_12: float
    onset_mae: float
    n_test: int


@dataclass
class LoroSummary:
    folds: list[LoroFoldResult]
    mean_brier_24: float
    mean_brier_12: float
    mean_onset_mae: float
    lead_time_rate: float


def make_windows(
    df: pd.DataFrame,
    input_window: int = INPUT_WINDOW,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    X_list, y24, y12, tte, dates, rids = [], [], [], [], [], []
    feats = df[FEATURE_NAMES].to_numpy(np.float32)
    for i in range(input_window, len(df)):
        X_list.append(feats[i - input_window : i])
        y24.append(df["event_24mo"].iloc[i])
        y12.append(df["event_12mo"].iloc[i])
        tte.append(df["time_to_recession"].iloc[i])
        dates.append(df.index[i])
        rids.append(df["recession_id"].iloc[i])
    return (
        np.stack(X_list),
        np.array(y24, dtype=np.float32),
        np.array(y12, dtype=np.float32),
        np.array(tte, dtype=np.float32),
        np.array(dates),
        np.array(rids, dtype=np.int32),
    )


def loro_split(rids: np.ndarray, held_out: int) -> tuple[np.ndarray, np.ndarray]:
    """Train on all months not in pre-recession window of held_out recession."""
    test = rids == held_out
    train = ~test
    return train, test


def summarize_loro(
    df: pd.DataFrame,
    predict_fn,
    us_rec: pd.Series,
) -> LoroSummary:
    X, y24, y12, tte, dates, rids = make_windows(df)
    recession_ids = sorted(set(rids) - {-1})
    folds: list[LoroFoldResult] = []
    all_probs: list[float] = []
    all_dates: list = []

    for rid in recession_ids:
        train, test = loro_split(rids, rid)
        if test.sum() == 0:
            continue
        probs = predict_fn(X[test])
        p24 = probability_within_horizon(probs)
        b24 = brier_score(y24[test], p24)
        b12 = brier_score(y12[test], probability_within_horizon(probs[:, :12]))
        onset_pred = median_onset_month(probs)
        mask = y24[test] > 0.5
        mae = onset_mae(tte[test], onset_pred, mask)
        folds.append(LoroFoldResult(rid, b24, b12, mae, int(test.sum())))
        all_probs.extend(p24.tolist())
        all_dates.extend(dates[test].tolist())

    starts = parse_recession_starts(us_rec.reindex(df.index, method="ffill").fillna(0))
    lead = lead_time_hit(
        np.array(all_dates, dtype="datetime64[ns]"),
        np.array(all_probs),
        starts,
    ) if all_probs else 0.0

    return LoroSummary(
        folds=folds,
        mean_brier_24=float(np.mean([f.brier_24 for f in folds])) if folds else float("nan"),
        mean_brier_12=float(np.mean([f.brier_12 for f in folds])) if folds else float("nan"),
        mean_onset_mae=float(np.nanmean([f.onset_mae for f in folds])) if folds else float("nan"),
        lead_time_rate=lead,
    )
