"""Run forward-outlook evaluation metrics."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch

ML_ROOT = Path(__file__).resolve().parents[1]
if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))

from data.constants import ECONOMIC_JSON, FEATURE_NAMES, FORECAST_HORIZON, INPUT_WINDOW, N_CORR
from data.prepare_panel import align_by_month, load_panel, parse_recession_starts, series_from_points
from eval.forward_outlook import evaluate_forward_outlook, evaluate_forward_outlook_loro
from eval.loro_cv import make_windows
from models.recession_model import RecessionModel


def load_us_rec(index: pd.DatetimeIndex) -> pd.Series:
    raw = json.loads(ECONOMIC_JSON.read_text())["usRec"]
    series = series_from_points(raw)
    return align_by_month(series, index).fillna(0)


def main() -> None:
    df = load_panel()
    ckpt = torch.load(ML_ROOT / "data/artifacts/recession_model.pt", weights_only=False)
    model = RecessionModel(len(FEATURE_NAMES))
    model.load_state_dict(ckpt["model"])
    model.eval()
    mean_np, std_np = ckpt["mean"], ckpt["std"]

    def predict_step(x_norm: np.ndarray):
        with torch.no_grad():
            h, f, _ = model(torch.from_numpy(x_norm))
            future = f.numpy().reshape(-1, FORECAST_HORIZON, N_CORR)
            return h.numpy(), future

    X, _, y12, tte, dates, _ = make_windows(df)
    labels = {
        12: y12,
        24: df["event_24mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        36: df["event_36mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        48: df["event_48mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        60: df["event_60mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
    }

    us_rec = load_us_rec(df.index)
    starts = parse_recession_starts(us_rec.reindex(df.index, method="ffill").fillna(0))

    metrics = evaluate_forward_outlook(X, labels, tte, predict_step, mean_np, std_np, dates, starts)
    loro = evaluate_forward_outlook_loro(df, predict_step, mean_np, std_np, us_rec)
    out_path = ML_ROOT / "data/artifacts/forward_outlook_metrics.json"
    out_path.write_text(
        json.dumps(
            {
                "full_sample": {
                    k: float(v) if isinstance(v, (float, np.floating)) else v for k, v in metrics.items()
                },
                "loro": loro,
            },
            indent=2,
        )
    )
    print(json.dumps({"full_sample": metrics, "loro": loro}, indent=2, default=float))


if __name__ == "__main__":
    main()
