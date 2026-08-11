"""Label-free K diagnostics using gap, bootstrap consensus, and prediction strength."""

import argparse
import os
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score

from experiment_contract import FEATURE_SUBSETS, evaluate
from k_selection_diagnostics import load_frames
from sequence_transition_experiment import (
    CORE_TEMPORAL_FEATURES,
    FUNNEL_FEATURES,
    build_transition_frame,
    transform,
)
from temporal_feature_experiment import K_GRID


def fit_labels(values, k, seed):
    return KMeans(n_clusters=k, n_init=20, max_iter=300, random_state=seed).fit(values)


def prediction_strength(train_x, k, replicates, seed):
    scores = []
    rng = np.random.default_rng(seed)
    for _ in range(replicates):
        indices = rng.permutation(len(train_x))
        left, right = np.array_split(indices, 2)
        left_model = fit_labels(train_x[left], k, int(rng.integers(1_000_000)))
        right_model = fit_labels(train_x[right], k, int(rng.integers(1_000_000)))
        own_labels = right_model.labels_
        transferred_labels = left_model.predict(train_x[right])
        cluster_scores = []
        for label in range(k):
            assigned = transferred_labels[own_labels == label]
            size = len(assigned)
            if size < 2:
                cluster_scores.append(0.0)
                continue
            _, counts = np.unique(assigned, return_counts=True)
            same_pairs = np.sum(counts * (counts - 1))
            cluster_scores.append(float(same_pairs / (size * (size - 1))))
        scores.append(min(cluster_scores))
    return float(np.mean(scores))


def bootstrap_consensus(train_x, val_x, k, replicates, seed):
    rng = np.random.default_rng(seed)
    labels_by_bootstrap = []
    for _ in range(replicates):
        indices = rng.integers(0, len(train_x), size=len(train_x))
        model = fit_labels(train_x[indices], k, int(rng.integers(1_000_000)))
        labels_by_bootstrap.append(model.predict(val_x))
    scores = [adjusted_rand_score(left, right) for left, right in combinations(labels_by_bootstrap, 2)]
    return float(np.mean(scores))


def gap_statistic(train_x, k, references, seed):
    rng = np.random.default_rng(seed)
    observed = fit_labels(train_x, k, seed).inertia_
    mins, maxs = train_x.min(axis=0), train_x.max(axis=0)
    reference_logs = []
    for _ in range(references):
        reference = rng.uniform(mins, maxs, size=train_x.shape)
        inertia = fit_labels(reference, k, int(rng.integers(1_000_000))).inertia_
        reference_logs.append(np.log(inertia))
    return float(np.mean(reference_logs) - np.log(observed)), float(np.std(reference_logs, ddof=1))


def load_sequence_space(args):
    train_df, val_df, test_df = load_frames(args)
    dataset_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), args.dataset))
    all_ids = set(train_df["session_id"]) | set(val_df["session_id"]) | set(test_df["session_id"])
    transitions, vocabulary = build_transition_frame(dataset_dir, all_ids, set(train_df["session_id"]))
    train_df = train_df.merge(transitions, on="session_id", how="left").fillna(0.0)
    val_df = val_df.merge(transitions, on="session_id", how="left").fillna(0.0)
    test_df = test_df.merge(transitions, on="session_id", how="left").fillna(0.0)
    base = [column for column in FEATURE_SUBSETS["F0"] if column not in FUNNEL_FEATURES] + CORE_TEMPORAL_FEATURES
    ranked = sorted(vocabulary, key=lambda column: (-train_df[column].sum(), column))
    columns = base + ranked[:args.transition_features]
    transition_columns = set(ranked[:args.transition_features])
    train_x, val_x, test_x = transform(train_df, val_df, test_df, columns, transition_columns)
    return train_x, val_x, test_x, test_df["persona_id"].to_numpy(), columns


def test_metrics(train_x, test_x, y_test, k, seeds):
    metrics = []
    for seed in seeds:
        labels = fit_labels(train_x, k, seed).predict(test_x)
        metrics.append(evaluate(y_test, labels, test_x))
    return {f"test_{name}": float(np.mean([item[name] for item in metrics])) for name in [
        "ari", "nmi", "ami", "macro_f1", "hungarian_accuracy", "majority_accuracy"
    ]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="../benchmark/output/merged-7500")
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--transition-features", type=int, default=20)
    parser.add_argument("--bootstrap-replicates", type=int, default=8)
    parser.add_argument("--gap-references", type=int, default=8)
    parser.add_argument("--seeds", default="7,42,2026")
    parser.add_argument("--out-dir", default="artifacts/robust-k-selection")
    args = parser.parse_args()

    train_x, val_x, test_x, y_test, columns = load_sequence_space(args)
    seeds = [int(value) for value in args.seeds.split(",") if value.strip()]
    rows = []
    for k in K_GRID:
        val_models = [fit_labels(train_x, k, seed) for seed in seeds]
        val_labels = [model.predict(val_x) for model in val_models]
        gap, gap_std = gap_statistic(train_x, k, args.gap_references, 10_000 + k)
        row = {
            "k": k,
            "val_silhouette": float(np.mean([silhouette_score(val_x, labels) for labels in val_labels])),
            "consensus_stability_ari": bootstrap_consensus(train_x, val_x, k, args.bootstrap_replicates, 20_000 + k),
            "prediction_strength": prediction_strength(train_x, k, args.bootstrap_replicates, 30_000 + k),
            "gap": gap,
            "gap_std": gap_std,
            **test_metrics(train_x, test_x, y_test, k, seeds),
        }
        rows.append(row)
        print(f"[robust-k] k={k} silhouette={row['val_silhouette']:.3f} "
              f"consensus={row['consensus_stability_ari']:.3f} prediction={row['prediction_strength']:.3f} gap={gap:.3f}")

    results = pd.DataFrame(rows)
    gap_threshold = results["gap"].shift(-1) - results["gap_std"].shift(-1) * np.sqrt(1 + 1 / args.gap_references)
    valid_gap = results.loc[results["gap"] >= gap_threshold, "k"]
    selections = pd.DataFrame([
        {"criterion": "max_silhouette", "k": int(results.loc[results["val_silhouette"].idxmax(), "k"])},
        {"criterion": "max_consensus_stability", "k": int(results.loc[results["consensus_stability_ari"].idxmax(), "k"])},
        {"criterion": "max_prediction_strength", "k": int(results.loc[results["prediction_strength"].idxmax(), "k"])},
        {"criterion": "gap_first_within_error", "k": int(valid_gap.iloc[0]) if not valid_gap.empty else int(results.loc[results["gap"].idxmax(), "k"])},
    ])
    selections = selections.merge(results, on="k", how="left")

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), args.out_dir))
    os.makedirs(out_dir, exist_ok=True)
    results.to_csv(os.path.join(out_dir, "k-grid.csv"), index=False)
    selections.to_csv(os.path.join(out_dir, "criterion-selections.csv"), index=False)
    print("[robust-k] selections")
    print(selections[["criterion", "k", "test_majority_accuracy", "test_macro_f1", "test_ari"]].to_string(index=False))
    print(f"[robust-k] features={len(columns)} wrote -> {out_dir}")


if __name__ == "__main__":
    main()
