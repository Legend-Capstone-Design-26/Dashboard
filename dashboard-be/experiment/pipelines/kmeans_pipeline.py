"""A1: preprocessed features directly clustered by K-Means."""
from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans


def run(train: np.ndarray, validation: np.ndarray, test: np.ndarray, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, float]]:
    """Fit K-Means only on training features and predict held-out splits."""
    model = KMeans(n_clusters=5, n_init=20, random_state=seed)
    return model.fit_predict(train), model.predict(validation), model.predict(test), {}
