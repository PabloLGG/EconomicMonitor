"""Combined Temporal VAE + hazard model for export."""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from data.constants import FORECAST_HORIZON, HAZARD_HORIZON, N_CORR
from models.hazard_head import HazardHead
from models.temporal_vae import TemporalEncoder


class RecessionModel(nn.Module):
    def __init__(self, n_features: int, latent: int = 32, hidden: int = 64):
        super().__init__()
        self.encoder = TemporalEncoder(n_features, hidden, latent)
        self.hazard = HazardHead(latent, hidden, HAZARD_HORIZON)
        self.future_proj = nn.Sequential(
            nn.Linear(latent + N_CORR, hidden),
            nn.GELU(),
            nn.Linear(hidden, FORECAST_HORIZON * N_CORR),
        )
        self.latent = latent
        self.n_features = n_features

    def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        return self.encoder(x)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encode(x)
        z = mu  # deterministic at inference
        hazards = self.hazard(z)
        last_corr = x[:, -1, :N_CORR]
        future_flat = self.future_proj(torch.cat([z, last_corr], dim=-1))
        future = future_flat.view(-1, FORECAST_HORIZON, N_CORR)
        return hazards, future, mu

    def sample_futures(self, x: torch.Tensor, n_samples: int = 32) -> torch.Tensor:
        mu, logvar = self.encode(x)
        std = torch.exp(0.5 * logvar)
        last_corr = x[:, -1, :N_CORR]
        samples = []
        for _ in range(n_samples):
            eps = torch.randn_like(mu)
            z = mu + eps * std
            flat = self.future_proj(torch.cat([z, last_corr], dim=-1))
            samples.append(flat.view(-1, FORECAST_HORIZON, N_CORR))
        return torch.stack(samples, dim=0)

    @staticmethod
    def combined_loss(
        hazards: torch.Tensor,
        future: torch.Tensor,
        future_target: torch.Tensor,
        event_24: torch.Tensor,
        tte: torch.Tensor,
    ) -> torch.Tensor:
        from models.hazard_head import event_bce, survival_nll

        haz_loss = 0.5 * survival_nll(hazards, tte) + 0.5 * event_bce(hazards, event_24)
        mse = F.mse_loss(future, future_target)
        d1_f = future[:, 1:] - future[:, :-1]
        d1_t = future_target[:, 1:] - future_target[:, :-1]
        return haz_loss + mse + 2.0 * F.mse_loss(d1_f, d1_t)

    @staticmethod
    def rollout_consistency_loss(
        model: "RecessionModel",
        x: torch.Tensor,
        future_target: torch.Tensor,
        step_months: int = 24,
    ) -> torch.Tensor:
        _, future, _ = model(x)
        step = min(step_months, future.shape[1])
        synth = x.clone()
        for m in range(step):
            synth[:, -(step - m) :, :N_CORR] = future[:, m : m + 1, :]
        _, future2, _ = model(synth)
        target2 = future_target[:, step:, :]
        pred2 = future2[:, : target2.shape[1], :]
        if pred2.shape[1] == 0:
            return torch.tensor(0.0, device=x.device)
        return F.mse_loss(pred2, target2)
