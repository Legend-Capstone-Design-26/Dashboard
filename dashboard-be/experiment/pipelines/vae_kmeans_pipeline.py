"""A3: minimal train-only VAE latent representation plus K-Means."""
from __future__ import annotations

import random

import numpy as np
import torch
from sklearn.cluster import KMeans
from torch import nn


class VAE(nn.Module):
    """Small tabular VAE; mutation is required by torch's training contract."""  # noqa: MUTABLE_OK

    def __init__(self, inputs: int, latent: int) -> None:
        super().__init__()
        self.encoder = nn.Sequential(nn.Linear(inputs, 16), nn.ReLU(), nn.Linear(16, latent * 2))
        self.decoder = nn.Sequential(nn.Linear(latent, 16), nn.ReLU(), nn.Linear(16, inputs))
        self.latent = latent

    def forward(self, values: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        encoded = self.encoder(values)
        mean, log_variance = encoded[:, :self.latent], encoded[:, self.latent:]
        latent = mean + torch.randn_like(mean) * torch.exp(0.5 * log_variance)
        return self.decoder(latent), mean, log_variance


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def run(train: np.ndarray, validation: np.ndarray, test: np.ndarray, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, float]]:
    """Train VAE on train only, select best validation epoch, then cluster latents."""
    _set_seed(seed)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model = VAE(train.shape[1], max(2, min(8, train.shape[1] // 2))).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    train_tensor, validation_tensor = torch.tensor(train, dtype=torch.float32, device=device), torch.tensor(validation, dtype=torch.float32, device=device)
    best_state, best_loss, patience, final_train_loss, epochs = None, float("inf"), 0, float("nan"), 0
    for epoch in range(100):
        model.train(); reconstructed, mean, log_variance = model(train_tensor)
        loss = nn.functional.mse_loss(reconstructed, train_tensor) - 0.001 * torch.mean(1 + log_variance - mean.pow(2) - log_variance.exp())
        optimizer.zero_grad(); loss.backward(); optimizer.step(); final_train_loss = float(loss.item()); epochs = epoch + 1
        model.eval()
        with torch.no_grad():
            reconstruction, _, _ = model(validation_tensor)
            validation_loss = float(nn.functional.mse_loss(reconstruction, validation_tensor).item())
        if validation_loss < best_loss:
            best_loss, patience = validation_loss, 0
            best_state = {key: value.detach().clone() for key, value in model.state_dict().items()}
        else:
            patience += 1
            if patience >= 10:
                break
    if best_state is not None:
        model.load_state_dict(best_state)
    def latent(values: np.ndarray) -> np.ndarray:
        with torch.no_grad():
            encoded = model.encoder(torch.tensor(values, dtype=torch.float32, device=device))
        return encoded[:, :model.latent].cpu().numpy()
    train_latent, validation_latent, test_latent = latent(train), latent(validation), latent(test)
    clusterer = KMeans(n_clusters=5, n_init=20, random_state=seed)
    return clusterer.fit_predict(train_latent), clusterer.predict(validation_latent), clusterer.predict(test_latent), {"validation_loss": best_loss, "train_loss": final_train_loss, "epochs": float(epochs), "early_stopped": float(patience >= 10), "latent_dimension": float(model.latent), "device": str(device), "latent_finite": float(np.isfinite(test_latent).all())}
