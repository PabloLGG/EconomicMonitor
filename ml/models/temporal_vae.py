"""Temporal VAE encoder/decoder for correlation paths."""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from data.constants import FORECAST_HORIZON, INPUT_WINDOW, N_CORR


class TemporalEncoder(nn.Module):
    def __init__(self, n_features: int, hidden: int = 64, latent: int = 32):
        super().__init__()
        self.conv1 = nn.Conv1d(n_features, hidden, kernel_size=5, padding=2)
        self.conv2 = nn.Conv1d(hidden, hidden, kernel_size=5, padding=2)
        self.gru = nn.GRU(hidden, hidden, batch_first=True, bidirectional=True)
        self.mu = nn.Linear(hidden * 2, latent)
        self.logvar = nn.Linear(hidden * 2, latent)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        # x: (B, T, F)
        h = x.transpose(1, 2)
        h = F.gelu(self.conv1(h))
        h = F.gelu(self.conv2(h))
        h = h.transpose(1, 2)
        out, _ = self.gru(h)
        pooled = out.mean(dim=1)
        return self.mu(pooled), self.logvar(pooled)


class TemporalDecoder(nn.Module):
    def __init__(self, latent: int = 32, hidden: int = 64, horizon: int = FORECAST_HORIZON, n_corr: int = N_CORR):
        super().__init__()
        self.horizon = horizon
        self.n_corr = n_corr
        self.fc = nn.Linear(latent, hidden)
        self.gru = nn.GRU(hidden + n_corr, hidden, batch_first=True)
        self.out = nn.Linear(hidden, n_corr)

    def forward(self, z: torch.Tensor, last_corr: torch.Tensor) -> torch.Tensor:
        # z: (B, latent), last_corr: (B, n_corr)
        b = z.shape[0]
        h0 = F.gelu(self.fc(z)).unsqueeze(0)
        outputs = []
        prev = last_corr
        for _ in range(self.horizon):
            inp = torch.cat([h0.squeeze(0).unsqueeze(1).expand(b, 1, -1), prev.unsqueeze(1)], dim=-1)
            # simplify: direct autoregressive from z
            pass
        # Simpler direct projection per step with positional embedding
        steps = torch.arange(self.horizon, device=z.device, dtype=z.dtype).unsqueeze(0).unsqueeze(-1)
        steps = steps / self.horizon
        base = F.gelu(self.fc(z)).unsqueeze(1).expand(b, self.horizon, -1)
        pos = nn.Linear(1, base.shape[-1], device=z.device, dtype=z.dtype)
        # use fixed weights via embedding
        pos_emb = steps * 0.1
        h = base + pos_emb
        return self.out(h) + last_corr.unsqueeze(1)


class TemporalVAE(nn.Module):
    def __init__(self, n_features: int, latent: int = 32, hidden: int = 64):
        super().__init__()
        self.encoder = TemporalEncoder(n_features, hidden, latent)
        self.decoder = TemporalDecoder(latent, hidden)
        self.latent = latent

    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, logvar = self.encoder(x)
        z = self.reparameterize(mu, logvar)
        last_corr = x[:, -1, :3]
        recon = self.decoder(z, last_corr)
        return recon, mu, logvar, z

    def decode(self, z: torch.Tensor, last_corr: torch.Tensor) -> torch.Tensor:
        return self.decoder(z, last_corr)

    @staticmethod
    def loss(recon: torch.Tensor, target: torch.Tensor, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        # target: (B, H, 3) future corr channels
        mse = F.mse_loss(recon, target)
        d1_r = recon[:, 1:] - recon[:, :-1]
        d1_t = target[:, 1:] - target[:, :-1]
        d1_loss = F.mse_loss(d1_r, d1_t)
        kl = -0.5 * torch.mean(1 + logvar - mu.pow(2) - logvar.exp())
        return mse + 2.0 * d1_loss + 0.001 * kl
