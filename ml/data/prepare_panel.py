"""Rolling correlation and panel feature engineering."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from .constants import (
    CORRELATION_WINDOW,
    DATA_DIR,
    ECONOMIC_JSON,
    FEATURE_NAMES,
    FRED_SERIES,
    START_1960,
)


def month_key(d: pd.Timestamp) -> str:
    return f"{d.year}-{d.month}"


def month_end(d: pd.Timestamp) -> pd.Timestamp:
    return pd.Timestamp(d.year, d.month, 1) + pd.offsets.MonthEnd(0)


def series_from_points(points: list[dict]) -> pd.Series:
    idx = [pd.Timestamp(p["date"]) for p in points]
    vals = [float(p["value"]) for p in points]
    s = pd.Series(vals, index=idx).sort_index()
    s.index = s.index.map(month_end)
    return s


def build_month_timeline(*series: pd.Series) -> pd.DatetimeIndex:
    keys: set[pd.Timestamp] = set()
    for s in series:
        for d in s.index:
            keys.add(month_end(pd.Timestamp(d)))
    return pd.DatetimeIndex(sorted(keys))


def forward_fill_to_dates(sparse: pd.Series, dates: pd.DatetimeIndex) -> pd.Series:
    sparse = sparse.sort_index()
    out: list[float] = []
    idx = 0
    current = sparse.iloc[0]
    for d in dates:
        while idx + 1 < len(sparse) and month_end(sparse.index[idx + 1]) <= d:
            idx += 1
            current = sparse.iloc[idx]
        out.append(float(current) if d >= month_end(sparse.index[idx]) else np.nan)
    return pd.Series(out, index=dates)


def align_by_month(series: pd.Series, dates: pd.DatetimeIndex) -> pd.Series:
    mapping = {month_key(month_end(pd.Timestamp(d))): v for d, v in series.items()}
    return pd.Series([mapping.get(month_key(d), np.nan) for d in dates], index=dates)


def pearson(xs: np.ndarray, ys: np.ndarray) -> float | None:
    if len(xs) < 3:
        return None
    mx, my = xs.mean(), ys.mean()
    dx, dy = xs - mx, ys - my
    den = np.sqrt((dx * dx).sum() * (dy * dy).sum())
    if den == 0:
        return None
    return float((dx * dy).sum() / den)


def rolling_correlation(a: pd.Series, b: pd.Series, window: int = CORRELATION_WINDOW) -> pd.Series:
    timeline = build_month_timeline(a, b)
    a_vals = forward_fill_to_dates(a, timeline)
    b_vals = align_by_month(b, timeline)
    out: dict[pd.Timestamp, float] = {}
    for i in range(window - 1, len(timeline)):
        xs, ys = [], []
        for j in range(i - window + 1, i + 1):
            av, bv = a_vals.iloc[j], b_vals.iloc[j]
            if pd.notna(av) and pd.notna(bv):
                xs.append(av)
                ys.append(bv)
        if len(xs) >= window - 2:
            r = pearson(np.array(xs), np.array(ys))
            if r is not None:
                out[timeline[i]] = r
    return pd.Series(out)


def diffs(series: pd.Series) -> pd.Series:
    return series.diff().fillna(0)


def second_diffs(series: pd.Series) -> pd.Series:
    return diffs(series).diff().fillna(0)


def rolling_std_diffs(series: pd.Series, window: int = 24) -> pd.Series:
    d1 = diffs(series)
    return d1.rolling(window, min_periods=3).std().fillna(0)


def parse_recession_starts(us_rec: pd.Series) -> list[pd.Timestamp]:
    starts: list[pd.Timestamp] = []
    prev = 0.0
    for d, v in us_rec.sort_index().items():
        if prev == 0 and v == 1:
            starts.append(month_end(pd.Timestamp(d)))
        prev = v
    return starts


def time_to_next_recession(dates: pd.DatetimeIndex, recession_starts: list[pd.Timestamp]) -> np.ndarray:
    starts = sorted(recession_starts)
    tte = np.full(len(dates), np.nan, dtype=np.float32)
    for i, d in enumerate(dates):
        future = [s for s in starts if s > d]
        if future:
            tte[i] = (future[0].year - d.year) * 12 + (future[0].month - d.month)
    return tte


def event_within_horizon(tte: np.ndarray, horizon: int) -> np.ndarray:
    out = np.zeros(len(tte), dtype=np.float32)
    for i, t in enumerate(tte):
        if not np.isnan(t) and 0 < t <= horizon:
            out[i] = 1.0
    return out


def load_json_series(path: Path) -> dict[str, pd.Series]:
    raw = json.loads(path.read_text())
    out: dict[str, pd.Series] = {}
    for key, points in raw.items():
        if key == "fetchedAt" or not isinstance(points, list):
            continue
        out[key] = series_from_points(points)
    return out


def fetch_fred(api_key: str) -> dict[str, pd.Series]:
    import time
    import requests

    base = "https://api.stlouisfed.org/fred/series/observations"
    out: dict[str, pd.Series] = {}
    for spec in FRED_SERIES:
        params = {
            "series_id": spec["series_id"],
            "api_key": api_key,
            "file_type": "json",
            "observation_start": spec.get("start", START_1960),
        }
        if "units" in spec:
            params["units"] = spec["units"]
        if "frequency" in spec:
            params["frequency"] = spec["frequency"]
        if "aggregation_method" in spec:
            params["aggregation_method"] = spec["aggregation_method"]
        resp = requests.get(base, params=params, timeout=60)
        resp.raise_for_status()
        obs = resp.json().get("observations", [])
        idx, vals = [], []
        for o in obs:
            if o["value"] in (".", ""):
                continue
            idx.append(month_end(pd.Timestamp(o["date"])))
            vals.append(float(o["value"]))
        out[spec["key"]] = pd.Series(vals, index=idx).sort_index()
        time.sleep(0.25)
    return out


def build_feature_panel(source: dict[str, pd.Series]) -> pd.DataFrame:
    gdp = source["gdpYoy"]
    sp500 = source["sp500"]
    jobs = source["jobsCreated"]
    yc = source["yieldCurve"]

    timeline1 = build_month_timeline(gdp, sp500)
    corr1 = rolling_correlation(forward_fill_to_dates(gdp, timeline1), align_by_month(sp500, timeline1))

    timeline2 = build_month_timeline(jobs, gdp)
    corr2 = rolling_correlation(forward_fill_to_dates(gdp, timeline2), align_by_month(jobs, timeline2))

    timeline4 = build_month_timeline(yc, gdp)
    corr4 = rolling_correlation(align_by_month(yc, timeline4), forward_fill_to_dates(gdp, timeline4))

    idx = corr1.index.intersection(corr2.index).intersection(corr4.index)
    df = pd.DataFrame(index=idx)
    df["corr1"] = corr1.reindex(idx)
    df["corr2"] = corr2.reindex(idx)
    df["corr4"] = corr4.reindex(idx)

    for c in ["corr1", "corr2", "corr4"]:
        s = df[c]
        df[f"d1_{c}"] = diffs(s)
        df[f"d2_{c}"] = second_diffs(s)
        df[f"vol_{c}"] = rolling_std_diffs(s)

    yc_aligned = align_by_month(yc, idx)
    df["yield_curve"] = yc_aligned
    df = df.dropna(how="any")
    return df


def add_survival_labels(df: pd.DataFrame, us_rec: pd.Series) -> pd.DataFrame:
    us_aligned = align_by_month(us_rec, df.index).fillna(0)
    starts = parse_recession_starts(us_aligned)
    tte = time_to_next_recession(df.index, starts)
    df = df.copy()
    df["time_to_recession"] = tte
    df["event_24mo"] = event_within_horizon(tte, 24)
    df["event_12mo"] = event_within_horizon(tte, 12)
    df["event_36mo"] = event_within_horizon(tte, 36)
    df["event_48mo"] = event_within_horizon(tte, 48)
    df["event_60mo"] = event_within_horizon(tte, 60)
    rid = np.full(len(df), -1, dtype=np.int32)
    for k, s in enumerate(starts):
        for i, d in enumerate(df.index):
            t = tte[i]
            if not np.isnan(t) and t <= 36 and d < s:
                rid[i] = k
    df["recession_id"] = rid
    return df


def build_panel(source: dict[str, pd.Series]) -> pd.DataFrame:
    features = build_feature_panel(source)
    return add_survival_labels(features, source["usRec"])


def save_panel(df: pd.DataFrame, out_dir: Path = DATA_DIR) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "panel.parquet"
    df.to_parquet(path)
    meta = {
        "feature_names": FEATURE_NAMES,
        "n_rows": len(df),
        "date_min": str(df.index.min().date()) if len(df) else None,
        "date_max": str(df.index.max().date()) if len(df) else None,
        "input_window": 60,
        "forecast_horizon": 36,
        "hazard_horizon": 24,
    }
    (out_dir / "panel_meta.json").write_text(json.dumps(meta, indent=2))
    return path


def load_panel(path: Path | None = None) -> pd.DataFrame:
    path = path or (DATA_DIR / "panel.parquet")
    return pd.read_parquet(path)


def main() -> None:
    import os

    if ECONOMIC_JSON.exists():
        print(f"Loading {ECONOMIC_JSON}")
        source = load_json_series(ECONOMIC_JSON)
    else:
        api_key = os.environ.get("VITE_FRED_API_KEY") or os.environ.get("FRED_API_KEY")
        if not api_key:
            raise SystemExit("No economic-data.json and no FRED API key")
        print("Fetching FRED series from 1960…")
        source = fetch_fred(api_key)

    panel = build_panel(source)
    path = save_panel(panel)
    print(f"Wrote {path} ({len(panel)} rows, {panel.index.min()} → {panel.index.max()})")


if __name__ == "__main__":
    main()
