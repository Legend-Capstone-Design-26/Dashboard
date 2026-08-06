"""External and internal clustering metrics with permutation-aware Macro-F1."""
from __future__ import annotations

import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.metrics import adjusted_mutual_info_score, adjusted_rand_score, calinski_harabasz_score, davies_bouldin_score, f1_score, normalized_mutual_info_score, silhouette_score


def cluster_mapping(labels: np.ndarray, clusters: np.ndarray) -> dict[int, str]:
    """Return Hungarian cluster-to-persona mapping while excluding HDBSCAN noise."""
    valid = clusters != -1
    if not valid.any():
        return {}
    truth, predicted = labels[valid], clusters[valid]
    classes, class_index = np.unique(truth, return_inverse=True)
    cluster_ids, cluster_index = np.unique(predicted, return_inverse=True)
    matrix = np.zeros((len(classes), len(cluster_ids)), dtype=int)
    np.add.at(matrix, (class_index, cluster_index), 1)
    rows, columns = linear_sum_assignment(matrix.max() - matrix)
    return {int(cluster_ids[column]): str(classes[row]) for row, column in zip(rows, columns)}


def macro_f1_hungarian(labels: np.ndarray, clusters: np.ndarray) -> float | None:
    """Map non-noise clusters to labels by Hungarian assignment before Macro-F1."""
    valid = clusters != -1
    if not valid.any():
        return None
    truth, predicted = labels[valid], clusters[valid]
    mapping = cluster_mapping(labels, clusters)
    mapped = np.asarray([mapping.get(cluster, "__unmatched__") for cluster in predicted])
    return float(f1_score(truth, mapped, average="macro", zero_division=0))


def align_predictions(session_ids: tuple[str, ...], labels: dict[str, str], predictions: dict[str, int]) -> tuple[np.ndarray, np.ndarray]:
    """Join true labels and clusters by session_id in sorted session order."""
    if len(session_ids) != len(set(session_ids)):
        raise RuntimeError("test split contains duplicate session ids")
    if set(session_ids) != set(predictions):
        raise RuntimeError("prediction session ids do not match test split")
    if any(session_id not in labels for session_id in session_ids):
        raise RuntimeError("true label missing for a test session")
    ordered = tuple(sorted(session_ids))
    return np.asarray([labels[session_id] for session_id in ordered]), np.asarray([predictions[session_id] for session_id in ordered])


def contingency(labels: np.ndarray, clusters: np.ndarray) -> tuple[list[str], list[int], np.ndarray]:
    """Build a persona-by-cluster contingency matrix including noise label -1."""
    personas = [str(value) for value in sorted(set(labels))]
    cluster_ids = sorted(int(value) for value in set(clusters))
    matrix = np.zeros((len(personas), len(cluster_ids)), dtype=int)
    row_index, column_index = {value: index for index, value in enumerate(personas)}, {value: index for index, value in enumerate(cluster_ids)}
    for label, cluster in zip(labels, clusters):
        matrix[row_index[str(label)], column_index[int(cluster)]] += 1
    return personas, cluster_ids, matrix


def evaluate(values: np.ndarray, labels: np.ndarray, clusters: np.ndarray) -> dict[str, float | int | None]:
    """Compute evaluation-only metrics while preserving HDBSCAN noise labels."""
    valid = clusters != -1
    metrics: dict[str, float | int | None] = {
        "ari": float(adjusted_rand_score(labels, clusters)),
        "nmi": float(normalized_mutual_info_score(labels, clusters)),
        "ami": float(adjusted_mutual_info_score(labels, clusters)),
        "macro_f1": macro_f1_hungarian(labels, clusters),
        "noise_ratio": float((clusters == -1).mean()),
        "cluster_count": int(len(set(clusters[valid]))),
        "silhouette": None,
        "davies_bouldin": None,
        "calinski_harabasz": None,
    }
    if valid.sum() >= 3 and len(set(clusters[valid])) >= 2:
        compact_values, compact_clusters = values[valid], clusters[valid]
        metrics["silhouette"] = float(silhouette_score(compact_values, compact_clusters))
        metrics["davies_bouldin"] = float(davies_bouldin_score(compact_values, compact_clusters))
        metrics["calinski_harabasz"] = float(calinski_harabasz_score(compact_values, compact_clusters))
    return metrics
