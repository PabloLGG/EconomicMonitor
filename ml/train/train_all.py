"""Train Temporal VAE + hazard model and export artifacts."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader, random_split

ML_ROOT = Path(__file__).resolve().parents[1]
if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))

from calibrate.isotonic import fit_isotonic
from data.constants import DATA_DIR, FEATURE_NAMES, FORECAST_HORIZON, HAZARD_HORIZON, INPUT_WINDOW, N_CORR, PROBABILITY_HORIZON, PUBLIC_MODELS
from data.prepare_panel import load_panel, main as prepare_main
from eval.forward_outlook import HORIZONS, rollout_hazards, rollout_probabilities
from eval.loro_cv import make_windows
from eval.metrics import probability_within_horizon
from export.to_onnx import export_model
from models.recession_model import RecessionModel
from train.baseline_survival import train_baseline
from train.dataset import RecessionWindowDataset, compute_norm_stats


def compute_attribution(
    model: RecessionModel,
    x_raw: np.ndarray,
    mean: np.ndarray,
    std: np.ndarray,
    top_k: int = 5,
) -> list[dict[str, float | str]]:
    x_norm = torch.from_numpy(((x_raw - mean) / np.maximum(std, 1e-6)).astype(np.float32))
    x_norm = x_norm.unsqueeze(0).requires_grad_(True)
    model.eval()
    model.zero_grad()
    hazards, _, _ = model(x_norm)
    hazards.sum().backward()
    grad = x_norm.grad.abs().mean(dim=1).squeeze(0).detach().numpy()
    total = float(grad.sum()) or 1.0
    signed = (x_norm.grad.mean(dim=1).squeeze(0).detach().numpy() / total).tolist()
    ranked = sorted(
        zip(FEATURE_NAMES, signed),
        key=lambda item: abs(item[1]),
        reverse=True,
    )[:top_k]
    return [{"feature": name, "contribution": float(val)} for name, val in ranked]


def train_model(epochs: int = 80, batch_size: int = 32, lr: float = 1e-3) -> Path:
    panel_path = DATA_DIR / "panel.parquet"
    if not panel_path.exists():
        prepare_main()

    df = load_panel()
    train_baseline(df)

    mean, std = compute_norm_stats(df)
    ds = RecessionWindowDataset(df, mean, std)
    n_val = max(1, len(ds) // 5)
    n_train = len(ds) - n_val
    train_ds, val_ds = random_split(ds, [n_train, n_val], generator=torch.Generator().manual_seed(42))

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size)

    model = RecessionModel(len(FEATURE_NAMES))
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    best_val = float("inf")
    ckpt = DATA_DIR / "recession_model.pt"

    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        for x, fut, y24, tte in train_loader:
            opt.zero_grad()
            hazards, future, _ = model(x)
            tte_f = tte.clone()
            tte_f[tte_f < 0] = float("nan")
            loss = RecessionModel.combined_loss(hazards, future, fut, y24, tte_f)
            loss.backward()
            opt.step()
            train_loss += loss.item()
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for x, fut, y24, tte in val_loader:
                hazards, future, _ = model(x)
                tte_f = tte.clone()
                tte_f[tte_f < 0] = float("nan")
                val_loss += RecessionModel.combined_loss(hazards, future, fut, y24, tte_f).item()
        val_loss /= max(len(val_loader), 1)
        if val_loss < best_val:
            best_val = val_loss
            torch.save({"model": model.state_dict(), "mean": mean, "std": std}, ckpt)
        if (epoch + 1) % 10 == 0:
            print(f"epoch {epoch+1}/{epochs} train={train_loss/len(train_loader):.4f} val={val_loss:.4f}")

    bundle = torch.load(ckpt, weights_only=False)
    model.load_state_dict(bundle["model"])
    model.eval()

    mean_np, std_np = bundle["mean"], bundle["std"]

    def predict_step(x_norm: np.ndarray):
        with torch.no_grad():
            h, f, _ = model(torch.from_numpy(x_norm))
            future = f.numpy().reshape(-1, FORECAST_HORIZON, N_CORR)
            return h.numpy(), future

    def rollout_predict(x_raw: np.ndarray):
        return predict_step(((x_raw - mean_np) / np.maximum(std_np, 1e-6)).astype(np.float32))

    X, _, y12, _, _, _ = make_windows(df)
    X_norm = ((X - mean_np) / np.maximum(std_np, 1e-6)).astype(np.float32)
    label_cols = {
        12: y12,
        24: df["event_24mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        36: df["event_36mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        48: df["event_48mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
        60: df["event_60mo"].to_numpy()[INPUT_WINDOW : INPUT_WINDOW + len(X)],
    }

    raw_probs_12 = probability_within_horizon(predict_step(X_norm)[0], horizon=PROBABILITY_HORIZON)
    curve_12 = fit_isotonic(y12, raw_probs_12)

    calibration_by_horizon: dict[str, dict] = {"12": curve_12.to_dict()}
    rollout_metrics: dict[str, float] = {}
    for h in HORIZONS:
        if h == 12:
            continue
        raw = rollout_probabilities(predict_step, X, mean_np, std_np, h)
        curve = fit_isotonic(label_cols[h], raw)
        calibration_by_horizon[str(h)] = curve.to_dict()
        rollout_metrics[f"brier_{h}_rollout_calibrated"] = float(
            np.mean((curve.apply(raw) - label_cols[h]) ** 2)
        )

    latest_window = X[-1]
    attribution = compute_attribution(model, latest_window, mean_np, std_np)

    metrics = {
        "brier_12_calibrated_full": float(np.mean((curve_12.apply(raw_probs_12) - y12) ** 2)),
        "brier_12_raw_full": float(np.mean((raw_probs_12 - y12) ** 2)),
        "n_windows": len(ds),
        **rollout_metrics,
    }
    (DATA_DIR / "train_metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))

    meta = {
        "version": "recession_v1",
        "feature_names": FEATURE_NAMES,
        "mean": mean_np.tolist(),
        "std": std_np.tolist(),
        "input_window": 60,
        "forecast_horizon": 36,
        "hazard_horizon": HAZARD_HORIZON,
        "probability_horizon": PROBABILITY_HORIZON,
        "mc_noise_scale": 0.08,
        "calibration": curve_12.to_dict(),
        "calibration_by_horizon": calibration_by_horizon,
        "attribution": attribution,
        "metrics": metrics,
    }
    PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)
    (PUBLIC_MODELS / "recession_v1_meta.json").write_text(json.dumps(meta, indent=2))

    export_model(model, PUBLIC_MODELS / "recession_v1.onnx")
    print(f"Exported to {PUBLIC_MODELS}")
    return PUBLIC_MODELS / "recession_v1.onnx"


def main() -> None:
    train_model()


if __name__ == "__main__":
    main()
