"""
Label-free fixed-K=5 clustering model comparison.

Model/configuration selection uses validation silhouette and seed stability only.
Persona labels are used only to report final test metrics after selection.
"""

import argparse
import os
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.cluster import AgglomerativeClustering, KMeans, SpectralClustering
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.mixture import GaussianMixture
from sklearn.neighbors import KNeighborsClassifier

from experiment_contract import evaluate
from k_selection_diagnostics import feature_columns, load_frames
from temporal_feature_experiment import transform_standard_l2


K = 5
DEFAULT_SEEDS = [7, 42, 2026]


def stability(labels_by_seed: list[np.ndarray]) -> float:
    scores = [adjusted_rand_score(left, right) for left, right in combinations(labels_by_seed, 2)]
    return float(np.mean(scores)) if scores else float("nan")


def silhouette(values: np.ndarray, labels: np.ndarray) -> float:
    if len(np.unique(labels)) < 2:
        return float("-inf")
    return float(silhouette_score(values, labels))


def nearest_centroid_predict(train_x: np.ndarray, train_labels: np.ndarray, target_x: np.ndarray) -> np.ndarray:
    centers = np.vstack([train_x[train_labels == label].mean(axis=0) for label in range(K)])
    squared_distances = ((target_x[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    return squared_distances.argmin(axis=1)


def labels_for_config(config: dict[str, object], train_x: np.ndarray, target_x: np.ndarray, seed: int) -> np.ndarray:
    model = config["model"]
    if model == "kmeans":
        return KMeans(n_clusters=K, n_init=20, max_iter=300, random_state=seed).fit(train_x).predict(target_x)
    if model == "gmm":
        return GaussianMixture(
            n_components=K,
            covariance_type=str(config["covariance_type"]),
            n_init=3,
            random_state=seed,
        ).fit(train_x).predict(target_x)

    if model == "agglomerative":
        train_labels = AgglomerativeClustering(n_clusters=K, linkage="ward").fit_predict(train_x)
        return nearest_centroid_predict(train_x, train_labels, target_x)

    if model == "spectral":
        train_labels = SpectralClustering(
            n_clusters=K,
            affinity="nearest_neighbors",
            n_neighbors=int(config["n_neighbors"]),
            assign_labels="kmeans",
            random_state=seed,
        ).fit_predict(train_x)
        # SpectralClustering has no predict API, so propagate its unsupervised IDs by local geometry.
        classifier = KNeighborsClassifier(n_neighbors=15, weights="distance")
        return classifier.fit(train_x, train_labels).predict(target_x)

    raise ValueError(f"Unsupported model: {model}")


def config_name(config: dict[str, object]) -> str:
    if config["model"] == "gmm":
        return f"gmm_{config['covariance_type']}"
    if config["model"] == "spectral":
        return f"spectral_nn{config['n_neighbors']}"
    return str(config["model"])


def evaluate_config(config, train_x, val_x, test_x, y_test, seeds):
    val_labels_by_seed = []
    test_metrics_by_seed = []
    val_scores = []
    for seed in seeds:
        val_labels = labels_for_config(config, train_x, val_x, seed)
        test_labels = labels_for_config(config, train_x, test_x, seed)
        val_labels_by_seed.append(val_labels)
        val_scores.append(silhouette(val_x, val_labels))
        test_metrics_by_seed.append(evaluate(y_test, test_labels, test_x))

    row = {
        "configuration": config_name(config),
        **config,
        "k": K,
        "val_silhouette": float(np.mean(val_scores)),
        "val_stability_ari": stability(val_labels_by_seed),
    }
    for metric in ["ari", "nmi", "ami", "macro_f1", "hungarian_accuracy", "majority_accuracy"]:
        row[f"test_{metric}"] = float(np.mean([item[metric] for item in test_metrics_by_seed]))
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="../benchmark/output/merged-7500")
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--feature-set", default="F13_core_temporal")
    parser.add_argument("--seeds", default="7,42,2026")
    parser.add_argument("--out-dir", default="artifacts/fixed-k5-model-comparison")
    args = parser.parse_args()

    seeds = [int(value) for value in args.seeds.split(",") if value.strip()]
    train_df, val_df, test_df = load_frames(args)
    train_x, val_x, test_x = transform_standard_l2(train_df, val_df, test_df, feature_columns(args.feature_set))
    y_test = test_df["persona_id"].to_numpy()
    configs = [
        {"model": "kmeans"},
        {"model": "gmm", "covariance_type": "diag"},
        {"model": "gmm", "covariance_type": "full"},
        {"model": "agglomerative"},
        *[{"model": "spectral", "n_neighbors": neighbors} for neighbors in (10, 25, 50)],
    ]
    results = pd.DataFrame([
        evaluate_config(config, train_x, val_x, test_x, y_test, seeds)
        for config in configs
    ])
    results = results.sort_values(["val_silhouette", "val_stability_ari"], ascending=[False, False])

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), args.out_dir))
    os.makedirs(out_dir, exist_ok=True)
    results.to_csv(os.path.join(out_dir, f"{args.feature_set}-results.csv"), index=False)
    selected = results.iloc[0].to_frame().T
    selected.to_csv(os.path.join(out_dir, f"{args.feature_set}-selected.csv"), index=False)
    print(results.to_string(index=False))
    print(f"[fixed-k5] wrote results -> {out_dir}")


if __name__ == "__main__":
    main()
