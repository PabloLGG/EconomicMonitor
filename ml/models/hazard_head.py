"""Discrete-time survival hazard head."""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from data.constants import HAZARD_HORIZON


class HazardHead(nn.Module):
    def __init__(self, latent: int = 32, hidden: int = 64, horizon: int = HAZARD_HORIZON):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(latent, hidden),
            nn.GELU(),
            nn.Linear(hidden, hidden),
            nn.GELU(),
            nn.Linear(hidden, horizon),
        )

    def forward(self, z: torch.Tensor) -> torch.Tensor:
        return torch.sigmoid(self.net(z))


def survival_nll(hazards: torch.Tensor, tte: torch.Tensor, horizon: int = HAZARD_HORIZON) -> torch.Tensor:
    """Discrete-time survival negative log-likelihood with censoring."""
    h = torch.clamp(hazards, 1e-6, 1 - 1e-6)
    loss = torch.zeros(hazards.shape[0], device=hazards.device)
    for i in range(hazards.shape[0]):
        t = tte[i]
        if torch.isnan(t) or t <= 0 or t > horizon:
            # censored: survive all steps
            surv = torch.prod(1 - h[i])
            loss[i] = -torch.log(surv + 1e-8)
        else:
            t_int = int(torch.floor(t).item())
            t_int = max(1, min(t_int, horizon))
            surv = torch.prod(1 - h[i, : t_int - 1]) if t_int > 1 else torch.tensor(1.0, device=h.device)
            loss[i] = -torch.log(surv * h[i, t_int - 1] + 1e-8)
    return loss.mean()


def event_bce(hazards: torch.Tensor, event_24: torch.Tensor) -> torch.Tensor:
    p = 1 - torch.prod(1 - torch.clamp(hazards, 1e-6, 1 - 1e-6), dim=1)
    return F.binary_cross_entropy(p, event_24)
