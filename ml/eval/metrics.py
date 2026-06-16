"""Evaluation metrics for recession forecasting."""

from __future__ import annotations

import numpy as np
import pandas as pd


def hazards_to_survival(hazards: np.ndarray) -> np.ndarray:
    """hazards: (N, H) -> survival after each step (N, H+1) with S0=1."""
    h = np.clip(hazards, 1e-6, 1 - 1e-6)
    surv = np.ones((h.shape[0], h.shape[1] + 1), dtype=np.float64)
    for t in range(h.shape[1]):
        surv[:, t + 1] = surv[:, t] * (1 - h[:, t])
    return surv


def probability_within_horizon(hazards: np.ndarray, horizon: int | None = None) -> np.ndarray:
    h = hazards[:, :horizon] if horizon is not None else hazards
    surv = hazards_to_survival(h)
    return 1.0 - surv[:, -1]


def median_onset_month(hazards: np.ndarray) -> np.ndarray:
    """Approximate median time-to-event from discrete hazards."""
    h = np.clip(hazards, 1e-6, 1 - 1e-6)
    n, horizon = h.shape
    onset = np.full(n, horizon, dtype=np.float32)
    for i in range(n):
        cumulative = 0.0
        for t in range(horizon):
            cumulative += h[i, t] * (1 - cumulative)
            if cumulative >= 0.5:
                onset[i] = t + 1
                break
        else:
            onset[i] = float(np.argmax(h[i]) + 1)
    return onset


def brier_score(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    y_true = y_true.astype(np.float64)
    y_prob = np.clip(y_prob.astype(np.float64), 0, 1)
    return float(np.mean((y_prob - y_true) ** 2))


def onset_mae(y_true_months: np.ndarray, y_pred_months: np.ndarray, mask: np.ndarray) -> float:
    if mask.sum() == 0:
        return float("nan")
    err = np.abs(y_true_months[mask] - y_pred_months[mask])
    return float(np.mean(err))


def lead_time_hit(
    dates: np.ndarray,
    probs: np.ndarray,
    recession_starts: list,
    threshold: float = 0.5,
    lead_months: int = 6,
) -> float:
    hits = 0
    for start in recession_starts:
        start_ts = pd.Timestamp(start)
        window_start = start_ts - pd.DateOffset(months=lead_months)
        mask = (dates >= np.datetime64(window_start)) & (dates < np.datetime64(start_ts))
        if mask.any() and (probs[mask] >= threshold).any():
            hits += 1
    return hits / max(len(recession_starts), 1)
