"""Logistic baseline on pooled window features."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from data.constants import DATA_DIR, FEATURE_NAMES, INPUT_WINDOW
from data.prepare_panel import load_panel
from eval.loro_cv import make_windows
from eval.metrics import brier_score, probability_within_horizon


def window_summary_features(X: np.ndarray) -> np.ndarray:
    """Pool (N, T, F) -> (N, F*4) with mean, std, last, delta."""
    mean = X.mean(axis=1)
    std = X.std(axis=1)
    last = X[:, -1, :]
    delta = last - X[:, 0, :]
    return np.concatenate([mean, std, last, delta], axis=1)


def train_baseline(df: pd.DataFrame | None = None) -> dict:
    df = df if df is not None else load_panel()
    feats = df[FEATURE_NAMES].to_numpy(np.float32)
    X_list, y24, rids = [], [], []
    for i in range(INPUT_WINDOW, len(df)):
        X_list.append(feats[i - INPUT_WINDOW : i])
        y24.append(df["event_24mo"].iloc[i])
        rids.append(df["recession_id"].iloc[i])
    X = np.stack(X_list)
    y = np.array(y24)
    Z = window_summary_features(X)
    scaler = StandardScaler()
    Zs = scaler.fit_transform(Z)
    clf = LogisticRegression(max_iter=2000, class_weight="balanced")
    clf.fit(Zs, y)
    probs = clf.predict_proba(Zs)[:, 1]
    brier = brier_score(y, probs)
    out_dir = DATA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "type": "logistic_baseline",
        "brier_24_in_sample": brier,
        "n_features": Z.shape[1],
        "coef": clf.coef_.tolist(),
        "intercept": clf.intercept_.tolist(),
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
    }
    (out_dir / "baseline_meta.json").write_text(json.dumps(meta, indent=2))
    print(f"Baseline Brier (in-sample): {brier:.4f}")
    return meta


if __name__ == "__main__":
    train_baseline()
