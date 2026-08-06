"""A2: train-fit UMAP plus HDBSCAN with validation candidate selection."""
from __future__ import annotations

import hdbscan
import numpy as np
import umap
from sklearn.metrics import silhouette_score


def _candidate_score(values: np.ndarray, labels: np.ndarray) -> float:
    valid = labels != -1
    if valid.sum() < 3 or len(set(labels[valid])) < 2:
        return -1.0
    return float(silhouette_score(values[valid], labels[valid]))


def run(train: np.ndarray, validation: np.ndarray, test: np.ndarray, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, float]]:
    """Choose HDBSCAN min cluster size by validation structure, never labels."""
    neighbors = min(15, max(2, len(train) - 1))
    embedding = umap.UMAP(n_components=min(5, train.shape[1]), n_neighbors=neighbors, random_state=seed, transform_seed=seed).fit(train)
    train_embedding, validation_embedding, test_embedding = embedding.transform(train), embedding.transform(validation), embedding.transform(test)
    candidates: list[tuple[float, int, hdbscan.HDBSCAN]] = []
    for minimum in (5, 10):
        clusterer = hdbscan.HDBSCAN(min_cluster_size=min(minimum, max(2, len(train) // 2)), prediction_data=True).fit(train_embedding)
        validation_labels, _ = hdbscan.approximate_predict(clusterer, validation_embedding)
        candidates.append((_candidate_score(validation_embedding, validation_labels), minimum, clusterer))
    _, selected_minimum, selected = max(candidates, key=lambda item: item[0])
    validation_labels, _ = hdbscan.approximate_predict(selected, validation_embedding)
    test_labels, _ = hdbscan.approximate_predict(selected, test_embedding)
    return selected.labels_, validation_labels, test_labels, {"noise_ratio_train": float((selected.labels_ == -1).mean()), "umap_components": float(min(5, train.shape[1])), "umap_neighbors": float(neighbors), "hdbscan_min_cluster_size": float(selected_minimum)}
