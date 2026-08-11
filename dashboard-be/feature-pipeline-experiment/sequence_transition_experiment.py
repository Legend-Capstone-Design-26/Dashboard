"""Evaluate label-free session state-transition features with fixed K=5 K-Means."""

import argparse
import json
import os
from collections import Counter
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import Normalizer, StandardScaler

from experiment_contract import FEATURE_SUBSETS, evaluate
from k_selection_diagnostics import load_frames
from temporal_feature_experiment import CORE_TEMPORAL_FEATURES, COUNT_OR_TIME_FEATURES, K_GRID, load_events_by_session


FUNNEL_FEATURES = {"cart_add_count", "cart_remove_count", "checkout_entered", "payment_attempt_count", "purchase_completed"}
BINARY_FEATURES = {"checkout_entered", "purchase_completed"}


def state_token(event: dict) -> str | None:
    name = str(event.get("event_name") or "")
    path = str(event.get("path") or "")
    if name == "search":
        return "search"
    if name == "filter_change":
        return "filter"
    if name == "add_to_cart":
        return "add_cart"
    if name == "remove_from_cart":
        return "remove_cart"
    if name == "checkout_start":
        return "checkout_start"
    if name == "checkout_complete":
        return "purchase"
    if name != "page_view":
        return None
    if path == "/":
        return "home"
    if path.startswith("/category/"):
        return "category"
    if path.startswith("/product/"):
        return "product"
    if path.startswith("/review/"):
        return "review"
    if path.startswith("/cart"):
        return "cart"
    if path.startswith("/checkout"):
        return "checkout"
    if path.startswith("/order-complete"):
        return "purchase"
    return None


def transition_counts(events: list[dict]) -> Counter:
    states = [state_token(event) for event in events]
    states = [state for state in states if state]
    # Preserve order while removing only consecutive duplicate state observations.
    compact = []
    for state in states:
        if not compact or compact[-1] != state:
            compact.append(state)
    return Counter(f"transition__{left}__{right}" for left, right in zip(compact, compact[1:]))


def build_transition_frame(dataset_dir: str, session_ids: set[str], train_ids: set[str]) -> tuple[pd.DataFrame, list[str]]:
    events_by_session = load_events_by_session(os.path.join(dataset_dir, "events.jsonl"))
    counts_by_session = {session_id: transition_counts(events_by_session.get(session_id, [])) for session_id in session_ids}
    vocabulary_counts = Counter()
    for session_id in train_ids:
        vocabulary_counts.update(counts_by_session[session_id])
    vocabulary = [token for token, count in vocabulary_counts.items() if count >= 20]

    rows = []
    for session_id in session_ids:
        row = {"session_id": session_id}
        row.update({token: float(counts_by_session[session_id][token]) for token in vocabulary})
        rows.append(row)
    return pd.DataFrame(rows), vocabulary


def transform(train_df, val_df, test_df, columns, transition_columns):
    def matrix(frame):
        values = frame[columns].astype(float).to_numpy()
        for index, column in enumerate(columns):
            if column in COUNT_OR_TIME_FEATURES or column in transition_columns:
                values[:, index] = np.log1p(values[:, index])
        return values

    train_x, val_x, test_x = matrix(train_df), matrix(val_df), matrix(test_df)
    scale_mask = np.array([column not in BINARY_FEATURES for column in columns])
    scaler = StandardScaler().fit(train_x[:, scale_mask])
    for values in (train_x, val_x, test_x):
        values[:, scale_mask] = scaler.transform(values[:, scale_mask])
    normalizer = Normalizer(norm="l2")
    return normalizer.transform(train_x), normalizer.transform(val_x), normalizer.transform(test_x)


def run_variant(name, columns, train_df, val_df, test_df, y_test, seeds, mode):
    transition_columns = {column for column in columns if column.startswith("transition__")}
    train_x, val_x, test_x = transform(train_df, val_df, test_df, columns, transition_columns)
    rows = []
    val_labels_by_seed = []
    for seed in seeds:
        candidates = [5] if mode == "forced_k5" else K_GRID
        scored_models = []
        for k in candidates:
            model = KMeans(n_clusters=k, n_init=20, max_iter=300, random_state=seed).fit(train_x)
            val_labels = model.predict(val_x)
            scored_models.append((silhouette_score(val_x, val_labels), k, model, val_labels))
        _, selected_k, model, val_labels = max(scored_models, key=lambda item: item[0])
        test_labels = model.predict(test_x)
        val_labels_by_seed.append(val_labels)
        rows.append({"seed": seed, "selected_k": selected_k, "val_silhouette": silhouette_score(val_x, val_labels), **evaluate(y_test, test_labels, test_x)})
    summary = {"variant": name, "mode": mode, "n_features": len(columns)}
    stability_scores = [adjusted_rand_score(left, right) for left, right in combinations(val_labels_by_seed, 2)]
    summary["val_stability_ari"] = float(np.mean(stability_scores))
    for column in ["val_silhouette", "ari", "nmi", "ami", "macro_f1", "hungarian_accuracy", "majority_accuracy"]:
        summary[f"test_{column}" if column != "val_silhouette" else column] = float(np.mean([row[column] for row in rows]))
    summary["selected_k"] = float(np.mean([row["selected_k"] for row in rows]))
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="../benchmark/output/merged-7500")
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--seeds", default="7,42,2026")
    parser.add_argument("--mode", choices=("forced_k5", "natural"), default="forced_k5")
    parser.add_argument("--out-dir", default="artifacts/sequence-transition-experiment")
    args = parser.parse_args()

    train_df, val_df, test_df = load_frames(args)
    dataset_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), args.dataset))
    all_ids = set(train_df["session_id"]) | set(val_df["session_id"]) | set(test_df["session_id"])
    transitions, vocabulary = build_transition_frame(dataset_dir, all_ids, set(train_df["session_id"]))
    train_df = train_df.merge(transitions, on="session_id", how="left").fillna(0.0)
    val_df = val_df.merge(transitions, on="session_id", how="left").fillna(0.0)
    test_df = test_df.merge(transitions, on="session_id", how="left").fillna(0.0)

    base = [column for column in FEATURE_SUBSETS["F0"] if column not in FUNNEL_FEATURES] + CORE_TEMPORAL_FEATURES
    ranked = sorted(vocabulary, key=lambda column: (-train_df[column].sum(), column))
    variants = [("F13_core_temporal_baseline", base)]
    variants.extend((f"F13_core_temporal_transition_top{limit}", base + ranked[:limit]) for limit in (10, 20, 40))
    seeds = [int(value) for value in args.seeds.split(",") if value.strip()]
    y_test = test_df["persona_id"].to_numpy()
    results = pd.DataFrame([run_variant(name, columns, train_df, val_df, test_df, y_test, seeds, args.mode) for name, columns in variants])
    results = results.sort_values(["val_stability_ari", "n_features"], ascending=[False, True])

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), args.out_dir))
    os.makedirs(out_dir, exist_ok=True)
    results.to_csv(os.path.join(out_dir, "results.csv"), index=False)
    results.iloc[[0]].to_csv(os.path.join(out_dir, "selected.csv"), index=False)
    pd.DataFrame({"transition_feature": ranked}).to_csv(os.path.join(out_dir, "vocabulary.csv"), index=False)
    print(results.to_string(index=False))
    print(f"[sequence] wrote results -> {out_dir}")


if __name__ == "__main__":
    main()
