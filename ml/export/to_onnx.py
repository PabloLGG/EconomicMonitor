"""Export RecessionModel to ONNX."""

from __future__ import annotations

from pathlib import Path

import torch

from models.recession_model import RecessionModel
from data.constants import FEATURE_NAMES, INPUT_WINDOW


class ExportWrapper(torch.nn.Module):
    def __init__(self, model: RecessionModel):
        super().__init__()
        self.model = model

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.model.encode(x)
        hazards, future, _ = self.model(x)
        return hazards, future, mu, logvar


def export_model(model: RecessionModel, path: Path) -> None:
    model.eval()
    wrapper = ExportWrapper(model)
    wrapper.eval()
    dummy = torch.randn(1, INPUT_WINDOW, len(FEATURE_NAMES))
    path.parent.mkdir(parents=True, exist_ok=True)
    # opset 18 matches PyTorch's default exporter; avoids failed downgrade to 17.
    torch.onnx.export(
        wrapper,
        dummy,
        str(path),
        input_names=["features"],
        output_names=["hazards", "future_corr", "mu", "logvar"],
        dynamic_axes={
            "features": {0: "batch"},
            "hazards": {0: "batch"},
            "future_corr": {0: "batch"},
            "mu": {0: "batch"},
            "logvar": {0: "batch"},
        },
        opset_version=18,
        dynamo=False,
    )
