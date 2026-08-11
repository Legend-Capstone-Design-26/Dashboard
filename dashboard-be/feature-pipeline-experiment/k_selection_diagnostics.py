"""
Label-free K selection diagnostics.

Compares internal K selection criteria for K=2..10:
- K-Means validation Silhouette
- K-Means validation Calinski-Harabasz
- K-Means validation Davies-Bouldin
- K-Means seed stability on validation assignments
- GMM BIC/AIC on validation log-likelihood criteria

Ground-truth labels are used only in the final external diagnostics columns.
"""

import argparse
import json
import os
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, calinski_harabasz_score, davies_bouldin_score, silhouette_score
from sklearn.mixture import GaussianMixture

from experiment_contract import FEATURE_SUBSETS, evaluate
from temporal_feature_experiment import CORE_TEMPORAL_FEATURES, build_temporal_frame, transform_standard_l2


K_GRID = list(range(2, 11))
DEFAULT_SEEDS = [7, 42, 2026]
FUNNEL_FEATURES = {"cart_add_count", "cart_remove_count", "checkout_entered", "payment_attempt_count", "purchase_completed"}


def safe_internal(values: np.ndarray, labels: np.ndarray) -> dict[str, float]:
    unique = np.unique(labels)
    if len(unique) < 2 or len(unique) >= len(labels):
        return {"silhouette": float("nan"), "calinski_harabasz": float("nan"), "davies_bouldin": float("nan")}
    return {
        "silhouette": float(silhouette_score(values, labels)),
        "calinski_harabasz": float(calinski_harabasz_score(values, labels)),
        "davies_bouldin": float(davies_bouldin_score(values, labels)),
    }


def stability_score(label_sets: list[np.ndarray]) -> float:
    scores = [adjusted_rand_score(left, right) for left, right in combinations(label_sets, 2)]
    return float(np.mean(scores)) if scores else float("nan")


def load_frames(args):
    here = os.path.dirname(__file__)
    dataset_dir = os.path.abspath(os.path.join(here, args.dataset))
    feature_path = os.path.abspath(os.path.join(here, args.features))
    split_path = os.path.abspath(os.path.join(here, args.split))

    frame = pd.read_csv(feature_path)
    with open(split_path, "r", encoding="utf-8") as handle:
        split = json.load(handle)
    temporal = build_temporal_frame(dataset_dir, set(frame["session_id"]))
    merged = frame.merge(temporal, on="session_id", how="left")
    merged[CORE_TEMPORAL_FEATURES] = merged[CORE_TEMPORAL_FEATURES].fillna(0.0)

    train_df = merged[merged["session_id"].isin(split["train"])].reset_index(drop=True)
    val_df = merged[merged["session_id"].isin(split["val"])].reset_index(drop=True)
    test_df = merged[merged["session_id"].isin(split["test"])].reset_index(drop=True)
    return train_df, val_df, test_df


def feature_columns(feature_set: str) -> list[str]:
    if feature_set == "F0_core_temporal":
        return FEATURE_SUBSETS["F0"] + CORE_TEMPORAL_FEATURES
    if feature_set == "F13_core_temporal":
        return [column for column in FEATURE_SUBSETS["F0"] if column not in FUNNEL_FEATURES] + CORE_TEMPORAL_FEATURES
    raise ValueError(f"Unsupported feature set: {feature_set}")


def evaluate_kmeans_for_k(train_x, val_x, test_x, y_test, k: int, seeds: list[int]):
    val_labels_by_seed = []
    test_rows = []
    internal_rows = []
    for seed in seeds:
        model = KMeans(n_clusters=k, n_init=20, max_iter=300, random_state=seed).fit(train_x)
        val_labels = model.predict(val_x)
        test_labels = model.predict(test_x)
        val_labels_by_seed.append(val_labels)
        internal_rows.append(safe_internal(val_x, val_labels))
        test_rows.append(evaluate(y_test, test_labels, test_x))

    row = {
        "k": k,
        "stability_ari": stability_score(val_labels_by_seed),
    }
    for metric in ["silhouette", "calinski_harabasz", "davies_bouldin"]:
        values = [item[metric] for item in internal_rows]
        row[f"val_{metric}"] = float(np.nanmean(values))
    for metric in ["ari", "nmi", "ami", "macro_f1", "hungarian_accuracy", "majority_accuracy"]:
        row[f"test_{metric}"] = float(np.mean([item[metric] for item in test_rows]))
    return row


def evaluate_gmm_for_k(train_x, test_x, y_test, k: int, seeds: list[int], covariance_type: str):
    rows = []
    for seed in seeds:
        model = GaussianMixture(n_components=k, covariance_type=covariance_type, random_state=seed, n_init=3).fit(train_x)
        test_labels = model.predict(test_x)
        metrics = evaluate(y_test, test_labels, test_x)
        rows.append({
            "bic": float(model.bic(train_x)),
            "aic": float(model.aic(train_x)),
            **metrics,
        })
    row = {"k": k, "covariance_type": covariance_type}
    for metric in ["bic", "aic"]:
        row[metric] = float(np.mean([item[metric] for item in rows]))
    for metric in ["ari", "nmi", "ami", "macro_f1", "hungarian_accuracy", "majority_accuracy"]:
        row[f"test_{metric}"] = float(np.mean([item[metric] for item in rows]))
    return row


def criterion_selections(kmeans_df: pd.DataFrame, gmm_df: pd.DataFrame) -> list[dict[str, float | str | int]]:
    selections = []
    criteria = [
        ("kmeans_max_silhouette", kmeans_df["val_silhouette"].idxmax()),
        ("kmeans_max_calinski_harabasz", kmeans_df["val_calinski_harabasz"].idxmax()),
        ("kmeans_min_davies_bouldin", kmeans_df["val_davies_bouldin"].idxmin()),
        ("kmeans_max_stability", kmeans_df["stability_ari"].idxmax()),
    ]
    for name, index in criteria:
        row = kmeans_df.loc[index]
        selections.append({"criterion": name, "model": "kmeans", **row.to_dict()})
    for covariance_type in sorted(gmm_df["covariance_type"].unique()):
        subset = gmm_df[gmm_df["covariance_type"] == covariance_type]
        for criterion, index in [("gmm_min_bic", subset["bic"].idxmin()), ("gmm_min_aic", subset["aic"].idxmin())]:
            row = gmm_df.loc[index]
            selections.append({"criterion": f"{criterion}_{covariance_type}", "model": "gmm", **row.to_dict()})
    return selections


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="../benchmark/output/merged-7500")
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--feature-sets", default="F13_core_temporal,F0_core_temporal")
    parser.add_argument("--seeds", default="7,42,2026")
    parser.add_argument("--out-dir", default="artifacts/k-selection-diagnostics")
    args = parser.parse_args()

    here = os.path.dirname(__file__)
    out_dir = os.path.abspath(os.path.join(here, args.out_dir))
    os.makedirs(out_dir, exist_ok=True)
    seeds = [int(item) for item in args.seeds.split(",") if item.strip()]
    train_df, val_df, test_df = load_frames(args)
    y_test = test_df["persona_id"].to_numpy()

    all_selections = []
    for feature_set in [item.strip() for item in args.feature_sets.split(",") if item.strip()]:
        columns = feature_columns(feature_set)
        train_x, val_x, test_x = transform_standard_l2(train_df, val_df, test_df, columns)
        kmeans_rows = [evaluate_kmeans_for_k(train_x, val_x, test_x, y_test, k, seeds) for k in K_GRID]
        gmm_rows = [
            evaluate_gmm_for_k(train_x, test_x, y_test, k, seeds, covariance_type)
            for covariance_type in ("diag", "full")
            for k in K_GRID
        ]
        kmeans_df = pd.DataFrame(kmeans_rows)
        gmm_df = pd.DataFrame(gmm_rows)
        kmeans_df.insert(0, "feature_set", feature_set)
        gmm_df.insert(0, "feature_set", feature_set)
        kmeans_df.to_csv(os.path.join(out_dir, f"{feature_set}-kmeans-k-grid.csv"), index=False)
        gmm_df.to_csv(os.path.join(out_dir, f"{feature_set}-gmm-k-grid.csv"), index=False)
        selections = criterion_selections(kmeans_df, gmm_df)
        for selection in selections:
            selection["feature_set"] = feature_set
        all_selections.extend(selections)
        print(f"[k-select] {feature_set}")
        print(pd.DataFrame(selections)[["criterion", "model", "k", "test_majority_accuracy", "test_macro_f1", "test_ari"]].to_string(index=False))

    pd.DataFrame(all_selections).to_csv(os.path.join(out_dir, "criterion-selections.csv"), index=False)
    print(f"[k-select] wrote diagnostics -> {out_dir}")


if __name__ == "__main__":
    main()
