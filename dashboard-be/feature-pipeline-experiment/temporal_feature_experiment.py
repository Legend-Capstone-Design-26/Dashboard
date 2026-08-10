"""
Temporal feature experiment for persona clustering.

Builds label-free temporal/sequence features from events.jsonl, merges them
with the existing 19 session features, and compares F0 vs F0+temporal under
the same standard_l2 + K-Means(k=5) setup.
"""

import argparse
import json
import os
import time
from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import Normalizer, StandardScaler

from experiment_contract import FEATURE_SUBSETS, evaluate


TEMPORAL_FEATURES = [
    "avg_time_per_page",
    "avg_time_per_product",
    "avg_time_per_review",
    "time_to_first_product",
    "time_to_first_cart",
    "time_to_checkout",
    "time_to_purchase",
    "cart_to_purchase_time",
    "product_views_before_cart",
    "searches_before_cart",
    "reviews_before_purchase",
    "filters_before_purchase",
]

CORE_TEMPORAL_FEATURES = [
    "avg_time_per_page",
    "avg_time_per_product",
    "time_to_first_cart",
    "time_to_checkout",
    "time_to_purchase",
    "cart_to_purchase_time",
]

BINARY_FEATURES = {"checkout_entered", "purchase_completed"}
BASE_COUNT_FEATURES = {
    "session_duration_ms",
    "event_count",
    "page_view_count",
    "click_count",
    "backtrack_count",
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
    "cart_add_count",
    "cart_remove_count",
    "payment_attempt_count",
    "error_count",
}
COUNT_OR_TIME_FEATURES = BASE_COUNT_FEATURES | set(TEMPORAL_FEATURES)
K_GRID = list(range(2, 11))


def load_events_by_session(path: str) -> dict[str, list[dict[str, Any]]]:
    sessions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            event = json.loads(line)
            sessions[event["session_id"]].append(event)
    for events in sessions.values():
        events.sort(key=lambda event: event.get("ts", 0))
    return dict(sessions)


def event_ts(event: dict[str, Any]) -> int:
    return int(event.get("ts") or 0)


def event_name(event: dict[str, Any]) -> str:
    return str(event.get("event_name") or "")


def event_path(event: dict[str, Any]) -> str:
    return str(event.get("path") or "")


def dwell_ms(event: dict[str, Any]) -> float:
    props = event.get("props") if isinstance(event.get("props"), dict) else {}
    value = props.get("dwell_ms", 0) if isinstance(props, dict) else 0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def first_ts(events: list[dict[str, Any]], predicate) -> int | None:
    for event in events:
        if predicate(event):
            return event_ts(event)
    return None


def count_before(events: list[dict[str, Any]], cutoff: int | None, predicate) -> int:
    if cutoff is None:
        return 0
    return sum(1 for event in events if event_ts(event) < cutoff and predicate(event))


def delta_or_zero(start: int, end: int | None) -> float:
    if end is None:
        return 0.0
    return float(max(0, end - start))


def compute_temporal_features(events: list[dict[str, Any]]) -> dict[str, float]:
    if not events:
        return {feature: 0.0 for feature in TEMPORAL_FEATURES}

    start = event_ts(events[0])
    first_product = first_ts(events, lambda event: event_name(event) == "page_view" and event_path(event).startswith("/product/"))
    first_cart = first_ts(events, lambda event: event_name(event) == "add_to_cart")
    first_checkout = first_ts(events, lambda event: event_name(event) == "checkout_start" or event_path(event).startswith("/checkout"))
    first_purchase = first_ts(events, lambda event: event_name(event) == "checkout_complete" or event_path(event).startswith("/order-complete"))

    page_views = [event for event in events if event_name(event) == "page_view"]
    product_views = [event for event in page_views if event_path(event).startswith("/product/")]
    review_views = [event for event in page_views if event_path(event).startswith("/review/")]
    dwell_events = [event for event in events if event_name(event) == "dwell_time"]
    product_dwell = [event for event in dwell_events if event_path(event).startswith("/product/")]
    review_dwell = [event for event in dwell_events if event_path(event).startswith("/review/")]
    total_dwell = sum(dwell_ms(event) for event in dwell_events)

    return {
        "avg_time_per_page": float(total_dwell / len(page_views)) if page_views else 0.0,
        "avg_time_per_product": float(sum(dwell_ms(event) for event in product_dwell) / len(product_views)) if product_views else 0.0,
        "avg_time_per_review": float(sum(dwell_ms(event) for event in review_dwell) / len(review_views)) if review_views else 0.0,
        "time_to_first_product": delta_or_zero(start, first_product),
        "time_to_first_cart": delta_or_zero(start, first_cart),
        "time_to_checkout": delta_or_zero(start, first_checkout),
        "time_to_purchase": delta_or_zero(start, first_purchase),
        "cart_to_purchase_time": delta_or_zero(first_cart, first_purchase) if first_cart is not None else 0.0,
        "product_views_before_cart": float(count_before(events, first_cart, lambda event: event_name(event) == "page_view" and event_path(event).startswith("/product/"))),
        "searches_before_cart": float(count_before(events, first_cart, lambda event: event_name(event) == "search")),
        "reviews_before_purchase": float(count_before(events, first_purchase, lambda event: event_name(event) == "page_view" and event_path(event).startswith("/review/"))),
        "filters_before_purchase": float(count_before(events, first_purchase, lambda event: event_name(event) == "filter_change")),
    }


def build_temporal_frame(dataset_dir: str, session_ids: set[str]) -> pd.DataFrame:
    events_by_session = load_events_by_session(os.path.join(dataset_dir, "events.jsonl"))
    rows = []
    for session_id in sorted(session_ids):
        row = {"session_id": session_id}
        row.update(compute_temporal_features(events_by_session.get(session_id, [])))
        rows.append(row)
    return pd.DataFrame(rows)


def transform_standard_l2(train_df: pd.DataFrame, val_df: pd.DataFrame, test_df: pd.DataFrame, columns: list[str]):
    def matrix(frame: pd.DataFrame) -> np.ndarray:
        values = frame[columns].astype(float).to_numpy()
        for index, column in enumerate(columns):
            if column in COUNT_OR_TIME_FEATURES:
                values[:, index] = np.log1p(values[:, index])
        return values

    train_x = matrix(train_df)
    val_x = matrix(val_df)
    test_x = matrix(test_df)
    scale_mask = np.array([column not in BINARY_FEATURES for column in columns])
    scaler = StandardScaler().fit(train_x[:, scale_mask])
    train_x[:, scale_mask] = scaler.transform(train_x[:, scale_mask])
    val_x[:, scale_mask] = scaler.transform(val_x[:, scale_mask])
    test_x[:, scale_mask] = scaler.transform(test_x[:, scale_mask])
    normalizer = Normalizer(norm="l2")
    return normalizer.transform(train_x), normalizer.transform(val_x), normalizer.transform(test_x)


def val_score(values: np.ndarray, labels: np.ndarray) -> float:
    unique = np.unique(labels)
    if len(unique) < 2 or len(unique) >= len(labels):
        return float("-inf")
    return float(silhouette_score(values, labels))


def run_kmeans(train_x: np.ndarray, val_x: np.ndarray, test_x: np.ndarray, seed: int, mode: str):
    candidates = [5] if mode == "forced_k5" else K_GRID
    best = None
    for k in candidates:
        model = KMeans(n_clusters=k, n_init=20, max_iter=300, random_state=seed).fit(train_x)
        score = val_score(val_x, model.predict(val_x))
        if best is None or score > best[0]:
            best = (score, k, model)
    score, k, model = best
    return model.predict(test_x), {"selected_k": k, "val_silhouette": score}


def write_contingency(path: str, y_true: np.ndarray, y_pred: np.ndarray) -> None:
    pd.crosstab(pd.Series(y_true, name="persona"), pd.Series(y_pred, name="cluster")).to_csv(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="../benchmark/output/merged-7500")
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--seeds", default="7,42,2026")
    parser.add_argument("--modes", default="forced_k5,natural")
    parser.add_argument("--out", default="artifacts/temporal-feature-results.csv")
    args = parser.parse_args()

    here = os.path.dirname(__file__)
    dataset_dir = os.path.abspath(os.path.join(here, args.dataset))
    feature_path = os.path.abspath(os.path.join(here, args.features))
    split_path = os.path.abspath(os.path.join(here, args.split))
    out_path = os.path.abspath(os.path.join(here, args.out))
    contingency_dir = os.path.join(os.path.dirname(out_path), "temporal-contingency")
    os.makedirs(contingency_dir, exist_ok=True)

    frame = pd.read_csv(feature_path)
    with open(split_path, "r", encoding="utf-8") as handle:
        split = json.load(handle)
    temporal = build_temporal_frame(dataset_dir, set(frame["session_id"]))
    merged = frame.merge(temporal, on="session_id", how="left")
    merged[TEMPORAL_FEATURES] = merged[TEMPORAL_FEATURES].fillna(0.0)
    temporal.to_csv(os.path.join(os.path.dirname(out_path), "temporal-features.csv"), index=False)

    train_df = merged[merged["session_id"].isin(split["train"])].reset_index(drop=True)
    val_df = merged[merged["session_id"].isin(split["val"])].reset_index(drop=True)
    test_df = merged[merged["session_id"].isin(split["test"])].reset_index(drop=True)
    y_true = test_df["persona_id"].to_numpy()
    seeds = [int(item) for item in args.seeds.split(",") if item.strip()]
    modes = [item.strip() for item in args.modes.split(",") if item.strip()]

    feature_sets = {
        "F0_standard_l2": FEATURE_SUBSETS["F0"],
        "F0T_core_standard_l2": FEATURE_SUBSETS["F0"] + CORE_TEMPORAL_FEATURES,
        "F0T_standard_l2": FEATURE_SUBSETS["F0"] + TEMPORAL_FEATURES,
        "F13T_core_standard_l2": [column for column in FEATURE_SUBSETS["F0"] if column not in {"cart_add_count", "cart_remove_count", "checkout_entered", "payment_attempt_count", "purchase_completed"}] + CORE_TEMPORAL_FEATURES,
        "F13T_standard_l2": [column for column in FEATURE_SUBSETS["F0"] if column not in {"cart_add_count", "cart_remove_count", "checkout_entered", "payment_attempt_count", "purchase_completed"}] + TEMPORAL_FEATURES,
    }

    rows = []
    for feature_set, columns in feature_sets.items():
        train_x, val_x, test_x = transform_standard_l2(train_df, val_df, test_df, columns)
        distinct = len(np.unique(train_x, axis=0))
        for mode in modes:
            for seed in seeds:
                started = time.time()
                pred, info = run_kmeans(train_x, val_x, test_x, seed, mode)
                metrics = evaluate(y_true, pred, test_x)
                rows.append({
                    "feature_set": feature_set,
                    "mode": mode,
                    "seed": seed,
                    "n_features": len(columns),
                    "distinct_train_vectors": distinct,
                    "runtime_sec": round(time.time() - started, 2),
                    **info,
                    **metrics,
                })
                stem = f"{feature_set}-{mode}-seed{seed}.csv".lower()
                write_contingency(os.path.join(contingency_dir, stem), y_true, pred)
                print(
                    f"[temporal] {feature_set} {mode} seed={seed} "
                    f"k={info['selected_k']} ARI={metrics['ari']:.3f} "
                    f"F1={metrics['macro_f1']:.3f} Acc={metrics['hungarian_accuracy']:.3f}"
                )

    pd.DataFrame(rows).to_csv(out_path, index=False)
    print(f"[temporal] wrote {len(rows)} rows -> {out_path}")


if __name__ == "__main__":
    main()
