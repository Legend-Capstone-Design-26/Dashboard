from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pandas as pd


def load_report() -> ModuleType:
    report_path = Path(__file__).resolve().parents[1] / "report.py"
    spec = importlib.util.spec_from_file_location("feature_pipeline_report", report_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


report = load_report()


def test_report_handles_results_without_pipeline_specific_columns() -> None:
    # Given: older A1-shaped results do not contain A2/A3 selected parameter columns.
    frame = pd.DataFrame(
        [
            {
                "feature_subset": "F2",
                "pipeline": "A1",
                "seed": 7,
                "n_features": 5,
                "distinct_train_vectors": 10,
                "runtime_sec": 0.1,
                "n_clusters": 2,
                "noise_ratio": 0.0,
                "ari": 0.5,
                "nmi": 0.6,
                "ami": 0.4,
                "macro_f1": 0.7,
                "silhouette": 0.3,
                "davies_bouldin": 1.2,
                "calinski_harabasz": 4.0,
                "selected_k": 2,
                "val_silhouette": 0.3,
            }
        ]
    )

    # When: the report aggregates and renders the main table.
    summary = report.aggregate(frame)
    table = report.main_table(summary)

    # Then: missing heterogeneous columns are treated as unavailable, not as report failures.
    assert "runtime(s)" in table
    assert "k=2.0" in table
    assert "UMAP" not in table


def test_report_renders_selected_params_noise_and_fallback_for_each_pipeline() -> None:
    # Given: final result rows include different selected parameter families per pipeline.
    frame = pd.DataFrame(
        [
            result_record("A1", selected_k=2, noise_ratio=0.0, umap_fallback_ratio=0.0),
            result_record(
                "A2",
                selected_n_neighbors=15,
                selected_min_cluster_size=50,
                selected_min_samples=5,
                noise_ratio=0.2,
                umap_fallback_ratio=0.25,
            ),
            result_record(
                "A3",
                selected_k=3,
                selected_latent_dim=2,
                noise_ratio=0.0,
                umap_fallback_ratio=0.0,
            ),
        ]
    )

    # When: the heterogeneous result rows are summarized.
    table = report.main_table(report.aggregate(frame))

    # Then: selected params, fallback, runtime, and noise notes are visible in REPORT.md content.
    assert "k=2.0" in table
    assert "n=15.0, min_cluster=50.0, min_samples=5.0" in table
    assert "latent=2.0, k=3.0" in table
    assert "UMAP 25.0%" in table
    assert "noise 20%" in table


def test_report_main_supports_single_seed_smoke_results(tmp_path: Path) -> None:
    # Given: an isolated smoke result has one seed per condition, so pandas std values are NaN.
    results_path = tmp_path / "results.csv"
    report_path = tmp_path / "REPORT.md"
    pd.DataFrame([result_record("A1", selected_k=2, noise_ratio=0.0, umap_fallback_ratio=0.0)]).to_csv(
        results_path,
        index=False,
    )

    # When: REPORT.md is generated from the smoke results.
    report.main(["--results", str(results_path), "--out", str(report_path)])

    # Then: the report renders instead of failing on all-NaN std aggregation.
    text = report_path.read_text(encoding="utf-8")
    assert "총 1 runs" in text
    assert "ARI std 0.000" in text


def result_record(
    pipeline: str,
    *,
    selected_k: float = float("nan"),
    selected_n_neighbors: float = float("nan"),
    selected_min_cluster_size: float = float("nan"),
    selected_min_samples: float = float("nan"),
    selected_latent_dim: float = float("nan"),
    noise_ratio: float,
    umap_fallback_ratio: float,
) -> dict[str, float | int | str]:
    return {
        "feature_subset": "F2",
        "pipeline": pipeline,
        "seed": 7,
        "n_features": 5,
        "distinct_train_vectors": 10,
        "runtime_sec": 0.1,
        "n_clusters": 2,
        "noise_ratio": noise_ratio,
        "ari": 0.5,
        "nmi": 0.6,
        "ami": 0.4,
        "macro_f1": 0.7,
        "silhouette": 0.3,
        "davies_bouldin": 1.2,
        "calinski_harabasz": 4.0,
        "selected_k": selected_k,
        "val_silhouette": 0.3,
        "selected_n_neighbors": selected_n_neighbors,
        "selected_min_cluster_size": selected_min_cluster_size,
        "selected_min_samples": selected_min_samples,
        "umap_fallback_ratio": umap_fallback_ratio,
        "selected_latent_dim": selected_latent_dim,
    }
