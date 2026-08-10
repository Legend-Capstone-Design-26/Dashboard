"""
Label-free preprocessing ablation for persona clustering.

The goal is to test whether unsupervised preprocessing can amplify subtle
persona differences without using ground-truth labels for fitting, weighting,
or model selection. Labels are used only for final test-set evaluation.
"""

import argparse
import json
import os
import time

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import Normalizer, PowerTransformer, QuantileTransformer, RobustScaler, StandardScaler

from experiment_contract import BINARY_FEATURES, FEATURE_SUBSETS, RATIO_FEATURES, evaluate


COUNT_FEATURES = {
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

FEATURE_GROUPS = {
    "intensity": ["session_duration_ms", "event_count", "page_view_count", "click_count"],
    "path": ["depth", "unique_page_ratio", "revisit_rate", "backtrack_count", "loop_rate"],
    "explore": ["search_count", "filter_count", "product_detail_count", "review_view_count"],
    "funnel": ["cart_add_count", "cart_remove_count", "checkout_entered", "payment_attempt_count", "purchase_completed"],
    "friction": ["error_count"],
}

K_GRID = list(range(2, 11))


def raw_matrix(frame: pd.DataFrame, columns: list[str]) -> np.ndarray:
    matrix = frame[columns].astype(float).to_numpy()
    for index, column in enumerate(columns):
        if column in COUNT_FEATURES:
            matrix[:, index] = np.log1p(matrix[:, index])
    return matrix


def scale_mask(columns: list[str]) -> np.ndarray:
    return np.array([column not in BINARY_FEATURES for column in columns])


def fit_transform_scaler(train: np.ndarray, others: list[np.ndarray], columns: list[str], scaler) -> tuple[np.ndarray, list[np.ndarray]]:
    mask = scale_mask(columns)
    train_out = train.copy()
    other_outs = [other.copy() for other in others]
    scaler.fit(train_out[:, mask])
    train_out[:, mask] = scaler.transform(train_out[:, mask])
    for other_out in other_outs:
        other_out[:, mask] = scaler.transform(other_out[:, mask])
    return train_out, other_outs


def group_balance(matrices: list[np.ndarray], columns: list[str]) -> list[np.ndarray]:
    balanced = [matrix.copy() for matrix in matrices]
    for group_columns in FEATURE_GROUPS.values():
        indices = [columns.index(column) for column in group_columns if column in columns]
        if not indices:
            continue
        factor = np.sqrt(len(indices))
        for matrix in balanced:
            matrix[:, indices] = matrix[:, indices] / factor
    return balanced


def apply_variant(train_df: pd.DataFrame, val_df: pd.DataFrame, test_df: pd.DataFrame, columns: list[str], variant: str):
    train_raw = raw_matrix(train_df, columns)
    val_raw = raw_matrix(val_df, columns)
    test_raw = raw_matrix(test_df, columns)

    if variant in {"standard", "standard_l2", "group_balanced", "group_balanced_l2"}:
        train_x, (val_x, test_x) = fit_transform_scaler(train_raw, [val_raw, test_raw], columns, StandardScaler())
    elif variant == "robust":
        train_x, (val_x, test_x) = fit_transform_scaler(train_raw, [val_raw, test_raw], columns, RobustScaler())
    elif variant == "quantile_normal":
        n_quantiles = min(1000, train_raw.shape[0])
        scaler = QuantileTransformer(n_quantiles=n_quantiles, output_distribution="normal", random_state=0)
        train_x, (val_x, test_x) = fit_transform_scaler(train_raw, [val_raw, test_raw], columns, scaler)
    elif variant == "power_yeo_johnson":
        train_x, (val_x, test_x) = fit_transform_scaler(train_raw, [val_raw, test_raw], columns, PowerTransformer(method="yeo-johnson"))
    else:
        raise ValueError(f"Unsupported preprocessing variant: {variant}")

    if variant in {"group_balanced", "group_balanced_l2"}:
        train_x, val_x, test_x = group_balance([train_x, val_x, test_x], columns)

    if variant in {"standard_l2", "group_balanced_l2"}:
        normalizer = Normalizer(norm="l2")
        train_x = normalizer.transform(train_x)
        val_x = normalizer.transform(val_x)
        test_x = normalizer.transform(test_x)

    return train_x, val_x, test_x


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
    pred = model.predict(test_x)
    return pred, {"selected_k": k, "val_silhouette": score}


def write_contingency(path: str, y_true: np.ndarray, y_pred: np.ndarray) -> None:
    table = pd.crosstab(pd.Series(y_true, name="persona"), pd.Series(y_pred, name="cluster"))
    table.to_csv(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="artifacts/features.csv")
    parser.add_argument("--split", default="artifacts/split.json")
    parser.add_argument("--subsets", default="F0")
    parser.add_argument("--variants", default="standard,standard_l2,group_balanced,group_balanced_l2,robust,quantile_normal,power_yeo_johnson")
    parser.add_argument("--modes", default="natural,forced_k5")
    parser.add_argument("--seeds", default="7,42,2026")
    parser.add_argument("--out", default="artifacts/preprocessing-ablation-results.csv")
    args = parser.parse_args()

    here = os.path.dirname(__file__)
    frame = pd.read_csv(os.path.abspath(os.path.join(here, args.features)))
    with open(os.path.abspath(os.path.join(here, args.split)), "r", encoding="utf-8") as handle:
        split = json.load(handle)

    train_df = frame[frame["session_id"].isin(split["train"])].reset_index(drop=True)
    val_df = frame[frame["session_id"].isin(split["val"])].reset_index(drop=True)
    test_df = frame[frame["session_id"].isin(split["test"])].reset_index(drop=True)
    y_true = test_df["persona_id"].to_numpy()

    subsets = [item.strip() for item in args.subsets.split(",") if item.strip()]
    variants = [item.strip() for item in args.variants.split(",") if item.strip()]
    modes = [item.strip() for item in args.modes.split(",") if item.strip()]
    seeds = [int(item) for item in args.seeds.split(",") if item.strip()]

    records = []
    out_path = os.path.abspath(os.path.join(here, args.out))
    contingency_dir = os.path.join(os.path.dirname(out_path), "preprocessing-contingency")
    os.makedirs(contingency_dir, exist_ok=True)

    for subset in subsets:
        columns = FEATURE_SUBSETS[subset]
        for variant in variants:
            train_x, val_x, test_x = apply_variant(train_df, val_df, test_df, columns, variant)
            distinct = len(np.unique(train_x, axis=0))
            for mode in modes:
                for seed in seeds:
                    started = time.time()
                    pred, info = run_kmeans(train_x, val_x, test_x, seed, mode)
                    metrics = evaluate(y_true, pred, test_x)
                    runtime = time.time() - started
                    records.append({
                        "feature_subset": subset,
                        "preprocessing": variant,
                        "mode": mode,
                        "seed": seed,
                        "n_features": len(columns),
                        "distinct_train_vectors": distinct,
                        "runtime_sec": round(runtime, 2),
                        **info,
                        **metrics,
                    })
                    stem = f"{subset.lower()}-{variant}-{mode}-seed{seed}.csv"
                    write_contingency(os.path.join(contingency_dir, stem), y_true, pred)
                    print(
                        f"[preprocess] {subset} {variant} {mode} seed={seed} "
                        f"k={info['selected_k']} ARI={metrics['ari']:.3f} "
                        f"F1={metrics['macro_f1']:.3f} Acc={metrics['hungarian_accuracy']:.3f}"
                    )

    pd.DataFrame(records).to_csv(out_path, index=False)
    print(f"[preprocess] wrote {len(records)} rows -> {out_path}")


if __name__ == "__main__":
    main()
