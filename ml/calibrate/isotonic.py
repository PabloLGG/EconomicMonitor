"""Isotonic probability calibration."""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
from sklearn.isotonic import IsotonicRegression


@dataclass
class CalibrationCurve:
    x_thresholds: list[float]
    y_calibrated: list[float]

    def apply(self, p: np.ndarray) -> np.ndarray:
        x = np.array(self.x_thresholds, dtype=np.float64)
        y = np.array(self.y_calibrated, dtype=np.float64)
        return np.interp(np.clip(p, 0, 1), x, y)

    def to_dict(self) -> dict:
        return {"x_thresholds": self.x_thresholds, "y_calibrated": self.y_calibrated}

    @classmethod
    def from_dict(cls, d: dict) -> "CalibrationCurve":
        return cls(d["x_thresholds"], d["y_calibrated"])


def fit_isotonic(y_true: np.ndarray, y_pred: np.ndarray) -> CalibrationCurve:
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit(y_pred, y_true)
    xs = np.linspace(0, 1, 21)
    ys = iso.predict(xs)
    return ensure_monotonic_at_least_raw(CalibrationCurve(xs.tolist(), ys.tolist()))


def ensure_monotonic_at_least_raw(curve: CalibrationCurve) -> CalibrationCurve:
    """Keep isotonic shape but never calibrate below the raw score at each knot."""
    new_ys: list[float] = []
    for x, y in zip(curve.x_thresholds, curve.y_calibrated):
        v = max(float(y), float(x))
        if new_ys:
            v = max(v, new_ys[-1])
        new_ys.append(v)
    return CalibrationCurve(curve.x_thresholds, new_ys)


def save_calibration(curve: CalibrationCurve, path) -> None:
    path.write_text(json.dumps(curve.to_dict(), indent=2))
