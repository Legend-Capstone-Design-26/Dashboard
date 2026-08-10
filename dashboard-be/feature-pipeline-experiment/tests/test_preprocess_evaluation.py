from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import numpy as np
import pandas as pd
from sklearn.metrics import (
    adjusted_mutual_info_score,
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    f1_score,
    normalized_mutual_info_score,
    silhouette_score,
)
from sklearn.preprocessing import StandardScaler


def load_runner() -> ModuleType:
    runner_path = Path(__file__).resolve().parents[1] / "run_experiments.py"
    sys.path.insert(0, str(runner_path.parent))
    spec = importlib.util.spec_from_file_location("feature_pipeline_runner", runner_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load_runner()


def test_labels_are_isolated_from_preprocessing_pipeline_and_validation_selection(monkeypatch) -> None:
    # Given: label columns change drastically while the selected feature columns stay fixed.
    base = pd.DataFrame(
        {
            "session_id": ["s0", "s1", "s2", "s3", "s4", "s5"],
            "persona_id": ["buyer", "buyer", "buyer", "browser", "browser", "browser"],
            "ground_truth_label": ["0", "0", "0", "1", "1", "1"],
            "cart_add_count": [0, 0, 0, 8, 8, 8],
            "cart_remove_count": [0, 0, 1, 8, 8, 9],
            "checkout_entered": [0, 0, 0, 1, 1, 1],
            "payment_attempt_count": [0, 1, 0, 8, 9, 8],
            "purchase_completed": [0, 0, 0, 1, 1, 1],
        }
    )
    relabeled = base.assign(
        persona_id=["x", "y", "z", "x", "y", "z"],
        ground_truth_label=["9", "8", "7", "6", "5", "4"],
    )
    columns = runner.FEATURE_SUBSETS["F4"]
    validation_inputs: list[np.ndarray] = []

    def capture_val_score(space, labels):
        validation_inputs.append(space.copy())
        return 0.0

    monkeypatch.setattr(runner, "K_GRID", [2])
    monkeypatch.setattr(runner, "val_score", capture_val_score)

    # When: preprocessing and A1 validation selection run with only the target feature subset.
    train_x, (val_x,) = runner.preprocess(base.iloc[:4], [base.iloc[4:]], columns)
    relabeled_train_x, (relabeled_val_x,) = runner.preprocess(relabeled.iloc[:4], [relabeled.iloc[4:]], columns)
    labels, _, info = runner.pipeline_a1(train_x, val_x, val_x, 42)

    # Then: labels cannot affect preprocessing or the pipeline's validation-selection inputs.
    assert "persona_id" not in columns
    assert "ground_truth_label" not in columns
    np.testing.assert_allclose(train_x, relabeled_train_x)
    np.testing.assert_allclose(val_x, relabeled_val_x)
    np.testing.assert_allclose(validation_inputs, [val_x])
    assert labels.shape == (2,)
    assert info["selected_k"] == 2


def test_preprocess_applies_feature_specific_transforms_when_train_fit_only() -> None:
    # Given: train and validation rows where validation values would change the scaler if leaked.
    train_df = pd.DataFrame(
        {
            "event_count": [0.0, 3.0, 8.0],
            "unique_page_ratio": [0.0, 0.5, 1.0],
            "checkout_entered": [0.0, 1.0, 0.0],
        }
    )
    val_df = pd.DataFrame(
        {
            "event_count": [80.0, 120.0],
            "unique_page_ratio": [0.25, 0.75],
            "checkout_entered": [1.0, 0.0],
        }
    )
    columns = ["event_count", "unique_page_ratio", "checkout_entered"]
    expected_train_input = np.column_stack(
        [
            np.log1p(train_df["event_count"].to_numpy()),
            train_df["unique_page_ratio"].to_numpy(),
        ]
    )
    expected_scaler = StandardScaler().fit(expected_train_input)
    expected_train_scaled = expected_scaler.transform(expected_train_input)
    expected_val_scaled = expected_scaler.transform(
        np.column_stack(
            [
                np.log1p(val_df["event_count"].to_numpy()),
                val_df["unique_page_ratio"].to_numpy(),
            ]
        )
    )

    # When: preprocessing is applied to train and validation data.
    train_x, (val_x,) = runner.preprocess(train_df, [val_df], columns)

    # Then: counts are log1p-scaled, ratios are scaled raw, binaries stay unchanged, and only train fits.
    np.testing.assert_allclose(train_x[:, :2], expected_train_scaled)
    np.testing.assert_allclose(val_x[:, :2], expected_val_scaled)
    np.testing.assert_array_equal(train_x[:, 2], train_df["checkout_entered"].to_numpy())
    np.testing.assert_array_equal(val_x[:, 2], val_df["checkout_entered"].to_numpy())


def test_macro_f1_hungarian_does_not_assign_noise_to_persona_when_noise_is_dominant() -> None:
    # Given: noise is the largest group for persona 0, while two non-noise clusters map cleanly.
    y_true = np.array([0, 0, 0, 1, 1, 2, 2])
    y_pred = np.array([-1, -1, -1, 10, 10, 11, 11])
    expected_mapped = np.array([-999, -999, -999, 1, 1, 2, 2])

    # When: Macro-F1 is computed through the Hungarian mapping contract.
    macro_f1 = runner.macro_f1_hungarian(y_true, y_pred)

    # Then: cluster -1 is not eligible for persona mapping and remains an unmapped prediction.
    assert macro_f1 == f1_score(
        y_true,
        expected_mapped,
        average="macro",
        labels=np.unique(y_true),
        zero_division=0,
    )


def test_macro_f1_hungarian_returns_zero_when_every_prediction_is_noise() -> None:
    # Given: HDBSCAN marks every test row as noise.
    y_true = np.array([0, 0, 1, 1, 2, 2])
    y_pred = np.array([-1, -1, -1, -1, -1, -1])

    # When: Macro-F1 is computed through the noise-aware mapping contract.
    macro_f1 = runner.macro_f1_hungarian(y_true, y_pred)

    # Then: no cluster is mapped to a persona, and sklearn's zero-division behavior is explicit.
    assert macro_f1 == 0.0


def test_evaluate_keeps_external_noise_semantics_but_internal_metrics_drop_noise() -> None:
    # Given: external labels include noise, while clean clusters have enough geometry for internal metrics.
    y_true = np.array([0, 0, 1, 1, 2, 2, 2, 2])
    y_pred = np.array([-1, -1, 10, 10, 11, 11, 12, 12])
    space = np.array(
        [
            [50.0, 50.0],
            [51.0, 50.0],
            [0.0, 0.0],
            [0.1, 0.0],
            [10.0, 10.0],
            [10.1, 10.0],
            [20.0, 20.0],
            [20.1, 20.0],
        ]
    )
    clean_mask = y_pred != -1

    # When: the full evaluation bundle is computed.
    metrics = runner.evaluate(y_true, y_pred, space)

    # Then: ARI/NMI/AMI keep sklearn's original handling of -1, and internal metrics exclude noise.
    assert metrics["ari"] == adjusted_rand_score(y_true, y_pred)
    assert metrics["nmi"] == normalized_mutual_info_score(y_true, y_pred)
    assert metrics["ami"] == adjusted_mutual_info_score(y_true, y_pred)
    assert metrics["n_clusters"] == 3
    assert metrics["noise_ratio"] == 0.25
    assert metrics["silhouette"] == silhouette_score(space[clean_mask], y_pred[clean_mask])
    assert metrics["davies_bouldin"] == davies_bouldin_score(space[clean_mask], y_pred[clean_mask])
    assert metrics["calinski_harabasz"] == calinski_harabasz_score(space[clean_mask], y_pred[clean_mask])


def test_evaluate_returns_nan_internal_metrics_when_all_predictions_are_noise() -> None:
    # Given: external metrics should still see all predictions, including the all-noise label vector.
    y_true = np.array([0, 0, 1, 1, 2, 2])
    y_pred = np.array([-1, -1, -1, -1, -1, -1])
    space = np.array([[0.0], [0.1], [1.0], [1.1], [2.0], [2.1]])

    # When: metrics are computed for the all-noise run.
    metrics = runner.evaluate(y_true, y_pred, space)

    # Then: ARI/NMI/AMI keep full-prediction semantics while noise-excluded metrics are unavailable.
    assert metrics["ari"] == adjusted_rand_score(y_true, y_pred)
    assert metrics["nmi"] == normalized_mutual_info_score(y_true, y_pred)
    assert metrics["ami"] == adjusted_mutual_info_score(y_true, y_pred)
    assert metrics["macro_f1"] == 0.0
    assert metrics["n_clusters"] == 0
    assert metrics["noise_ratio"] == 1.0
    assert np.isnan(metrics["silhouette"])
    assert np.isnan(metrics["davies_bouldin"])
    assert np.isnan(metrics["calinski_harabasz"])


def test_result_row_adds_required_metadata_for_heterogeneous_pipeline_columns() -> None:
    # Given: A1 returns only selected_k while the result schema must still include A2/A3 columns.
    metrics = {
        "n_clusters": 2,
        "noise_ratio": 0.0,
        "ari": 1.0,
        "nmi": 1.0,
        "ami": 1.0,
        "macro_f1": 1.0,
        "silhouette": 0.5,
        "davies_bouldin": 0.2,
        "calinski_harabasz": 10.0,
    }
    info = {"selected_k": 2, "val_silhouette": 0.5}

    # When: the runner builds the persisted result row.
    row = runner.result_row("F2", "A1", 42, 5, 12, 0.04, metrics, info)

    # Then: runtime, selection, noise, and fallback columns are always present for report compatibility.
    assert row["feature_subset"] == "F2"
    assert row["pipeline"] == "A1"
    assert row["runtime_sec"] == 0.04
    assert row["selected_k"] == 2
    assert row["selected_n_neighbors"] is np.nan
    assert row["selected_min_cluster_size"] is np.nan
    assert row["selected_min_samples"] is np.nan
    assert row["selected_latent_dim"] is np.nan
    assert row["umap_fallback_ratio"] == 0.0
