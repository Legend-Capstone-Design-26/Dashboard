import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.preprocessing import StandardScaler


COUNT_DURATION_FEATURES = {
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

RATIO_FEATURES = {
    "unique_page_ratio",
    "revisit_rate",
    "loop_rate",
}

BINARY_FEATURES = {
    "checkout_entered",
    "purchase_completed",
}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, payload: Any) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def matrix_from_rows(rows: list[dict[str, Any]], columns: list[str]) -> np.ndarray:
    data = np.array([[float(row[column]) for column in columns] for row in rows], dtype=np.float32)
    return data


def build_label_mapping(rows: list[dict[str, Any]]) -> tuple[list[str], dict[str, int]]:
    labels = sorted({row["persona_id"] for row in rows})
    to_id = {label: index for index, label in enumerate(labels)}
    return labels, to_id


def _as_column(array: np.ndarray) -> np.ndarray:
    return np.asarray(array, dtype=np.float32).reshape(-1, 1)


def _scaler_stat(values: Any) -> float:
    return float(np.ravel(np.asarray(values, dtype=np.float32))[0])


def transform_matrix(train_x: np.ndarray, other_x: np.ndarray, columns: list[str]) -> tuple[np.ndarray, np.ndarray, dict[str, dict[str, float | str]]]:
    train_out = np.zeros_like(train_x, dtype=np.float32)
    other_out = np.zeros_like(other_x, dtype=np.float32)
    scaler_specs: dict[str, dict[str, float | str]] = {}

    for index, column in enumerate(columns):
        train_col = train_x[:, index].astype(np.float32)
        other_col = other_x[:, index].astype(np.float32)

        if column in COUNT_DURATION_FEATURES:
            train_col = np.log1p(train_col)
            other_col = np.log1p(other_col)
            scaler = StandardScaler()
            scaler.fit(_as_column(train_col))
            train_scaled = np.asarray(scaler.transform(_as_column(train_col)), dtype=np.float32).reshape(-1)
            other_scaled = np.asarray(scaler.transform(_as_column(other_col)), dtype=np.float32).reshape(-1)
            train_out[:, index] = train_scaled
            other_out[:, index] = other_scaled
            scaler_specs[column] = {
                "type": "log1p+standard",
                "mean": _scaler_stat(getattr(scaler, "mean_", [0.0])),
                "scale": _scaler_stat(getattr(scaler, "scale_", [1.0])),
            }
        elif column in RATIO_FEATURES:
            scaler = StandardScaler()
            scaler.fit(_as_column(train_col))
            train_scaled = np.asarray(scaler.transform(_as_column(train_col)), dtype=np.float32).reshape(-1)
            other_scaled = np.asarray(scaler.transform(_as_column(other_col)), dtype=np.float32).reshape(-1)
            train_out[:, index] = train_scaled
            other_out[:, index] = other_scaled
            scaler_specs[column] = {
                "type": "standard",
                "mean": _scaler_stat(getattr(scaler, "mean_", [0.0])),
                "scale": _scaler_stat(getattr(scaler, "scale_", [1.0])),
            }
        elif column in BINARY_FEATURES:
            train_out[:, index] = train_col
            other_out[:, index] = other_col
            scaler_specs[column] = {
                "type": "binary_passthrough",
            }
        else:
            scaler = StandardScaler()
            scaler.fit(_as_column(train_col))
            train_scaled = np.asarray(scaler.transform(_as_column(train_col)), dtype=np.float32).reshape(-1)
            other_scaled = np.asarray(scaler.transform(_as_column(other_col)), dtype=np.float32).reshape(-1)
            train_out[:, index] = train_scaled
            other_out[:, index] = other_scaled
            scaler_specs[column] = {
                "type": "standard_fallback",
                "mean": _scaler_stat(getattr(scaler, "mean_", [0.0])),
                "scale": _scaler_stat(getattr(scaler, "scale_", [1.0])),
            }

    return train_out, other_out, scaler_specs


def prepare_subset(input_path: Path, output_dir: Path) -> dict[str, Any]:
    payload = load_json(input_path)
    subset_id = payload["feature_subset"]
    feature_order = payload["feature_order"]
    rows = payload["rows"]

    train_rows = [row for row in rows if row["data_split"] == "train"]
    val_rows = [row for row in rows if row["data_split"] == "val"]
    test_rows = [row for row in rows if row["data_split"] == "test"]

    labels, label_to_id = build_label_mapping(rows)

    train_x_raw = matrix_from_rows(train_rows, feature_order)
    val_x_raw = matrix_from_rows(val_rows, feature_order)
    test_x_raw = matrix_from_rows(test_rows, feature_order)

    train_x, val_x, scaler_specs = transform_matrix(train_x_raw, val_x_raw, feature_order)
    train_x_again, test_x, _ = transform_matrix(train_x_raw, test_x_raw, feature_order)

    # train_x and train_x_again are derived from the same fitted train statistics.
    # Keep the first train matrix and discard the duplicate copy.
    _ = train_x_again

    train_y = np.array([label_to_id[row["persona_id"]] for row in train_rows], dtype=np.int64)
    val_y = np.array([label_to_id[row["persona_id"]] for row in val_rows], dtype=np.int64)
    test_y = np.array([label_to_id[row["persona_id"]] for row in test_rows], dtype=np.int64)

    dataset_path = output_dir / f"{subset_id.lower()}_dataset.npz"
    metadata_path = output_dir / f"{subset_id.lower()}_metadata.json"

    np.savez_compressed(
        dataset_path,
        X_train=train_x,
        X_val=val_x,
        X_test=test_x,
        y_train=train_y,
        y_val=val_y,
        y_test=test_y,
    )

    save_json(
        metadata_path,
        {
            "benchmark_id": payload["benchmark_id"],
            "feature_subset": subset_id,
            "feature_order": feature_order,
            "label_order": labels,
            "split_counts": {
                "train": len(train_rows),
                "val": len(val_rows),
                "test": len(test_rows),
            },
            "preprocessing": scaler_specs,
        },
    )

    return {
        "subset": subset_id,
        "dataset_path": str(dataset_path),
        "metadata_path": str(metadata_path),
        "split_counts": {
            "train": len(train_rows),
            "val": len(val_rows),
            "test": len(test_rows),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--subsets", default="F0,F2,F3")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    subset_ids = [item.strip() for item in str(args.subsets).split(",") if item.strip()]
    summaries = []
    for subset_id in subset_ids:
        subset_file = f"{subset_id.lower()}-features.json"
        summaries.append(prepare_subset(input_dir / subset_file, output_dir))

    save_json(output_dir / "preparation-summary.json", {"subsets": summaries})
    print(f"Prepared runner inputs in {output_dir}")


if __name__ == "__main__":
    main()
