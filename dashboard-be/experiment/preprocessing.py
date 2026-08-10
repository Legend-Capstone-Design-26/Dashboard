"""Train-only feature preprocessing for every experiment pipeline."""
from __future__ import annotations

import numpy as np
from sklearn.preprocessing import StandardScaler

from .feature_sets import BINARY, COUNT_DURATION, RATIOS


class TrainOnlyPreprocessor:
    """Fit scalers only on training rows and preserve binary columns unchanged."""

    def __init__(self, columns: tuple[str, ...]) -> None:
        self.columns = columns
        self.count_indices = [index for index, name in enumerate(columns) if name in COUNT_DURATION]
        self.ratio_indices = [index for index, name in enumerate(columns) if name in RATIOS]
        self.scaler = StandardScaler()
        self.fitted = False

    def fit(self, values: np.ndarray) -> "TrainOnlyPreprocessor":
        transformed = self._base_transform(values)
        scale_indices = self.count_indices + self.ratio_indices
        if scale_indices:
            self.scaler.fit(transformed[:, scale_indices])
        self.fitted = True
        return self

    def transform(self, values: np.ndarray) -> np.ndarray:
        if not self.fitted:
            raise RuntimeError("preprocessor must be fitted on train data before transform")
        transformed = self._base_transform(values)
        scale_indices = self.count_indices + self.ratio_indices
        if scale_indices:
            transformed[:, scale_indices] = self.scaler.transform(transformed[:, scale_indices])
        return transformed

    def _base_transform(self, values: np.ndarray) -> np.ndarray:
        output = np.asarray(values, dtype=float).copy()
        if not np.isfinite(output).all():
            raise RuntimeError("feature matrix contains missing or non-finite values")
        if self.count_indices:
            output[:, self.count_indices] = np.log1p(output[:, self.count_indices])
        return output
