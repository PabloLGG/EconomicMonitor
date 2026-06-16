"""PyTorch dataset for recession panel windows."""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from data.constants import FEATURE_NAMES, FORECAST_HORIZON, INPUT_WINDOW, N_CORR


class RecessionWindowDataset(Dataset):
    def __init__(self, df: pd.DataFrame, mean: np.ndarray, std: np.ndarray):
        self.mean = mean.astype(np.float32)
        self.std = np.maximum(std.astype(np.float32), 1e-6)
        feats = df[FEATURE_NAMES].to_numpy(np.float32)
        self.X, self.y24, self.y12, self.tte, self.future = [], [], [], [], []
        for i in range(INPUT_WINDOW, len(df) - FORECAST_HORIZON):
            window = (feats[i - INPUT_WINDOW : i] - self.mean) / self.std
            future_corr = feats[i : i + FORECAST_HORIZON, :N_CORR]
            self.X.append(window)
            self.future.append(future_corr)
            self.y24.append(df["event_24mo"].iloc[i])
            self.y12.append(df["event_12mo"].iloc[i])
            self.tte.append(df["time_to_recession"].iloc[i])
        self.X = np.stack(self.X)
        self.future = np.stack(self.future)
        self.y24 = np.array(self.y24, dtype=np.float32)
        self.y12 = np.array(self.y12, dtype=np.float32)
        self.tte = np.array(self.tte, dtype=np.float32)

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, idx: int):
        tte = self.tte[idx]
        if np.isnan(tte):
            tte = -1.0
        return (
            torch.from_numpy(self.X[idx]),
            torch.from_numpy(self.future[idx]),
            torch.tensor(self.y24[idx]),
            torch.tensor(tte),
        )


def compute_norm_stats(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    arr = df[FEATURE_NAMES].to_numpy(np.float64)
    return arr.mean(axis=0), arr.std(axis=0)
