from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import numpy as np
import pandas as pd


def load_module(module_name: str, file_name: str) -> ModuleType:
    module_path = Path(__file__).resolve().parents[1] / file_name
    sys.path.insert(0, str(module_path.parent))
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load_module("feature_pipeline_runner_defaults", "run_experiments.py")
run_all = load_module("feature_pipeline_run_all_defaults", "run_all.py")


def test_run_experiments_defaults_to_approved_seed_triplet(tmp_path: Path, monkeypatch) -> None:
    # Given: a smoke run that relies on run_experiments.py's default --seeds value.
    features_path = tmp_path / "features.csv"
    split_path = tmp_path / "split.json"
    out_path = tmp_path / "results.csv"
    pd.DataFrame(
        {
            "session_id": ["train", "val", "test"],
            "persona_id": ["p0", "p1", "p2"],
        }
    ).to_csv(features_path, index=False)
    split_path.write_text(
        json.dumps({"train": ["train"], "val": ["val"], "test": ["test"]}),
        encoding="utf-8",
    )
    seen_seeds: list[int] = []

    def fake_preprocess(train_df, other_dfs, columns):
        return np.array([[0.0]]), (np.array([[1.0]]), np.array([[2.0]]))

    def fake_pipeline(train_x, val_x, test_x, seed):
        seen_seeds.append(seed)
        return np.array([0]), test_x, {"selected_k": 2, "val_silhouette": 0.0}

    def fake_evaluate(y_true, y_pred, space):
        return {
            "n_clusters": 1,
            "noise_ratio": 0.0,
            "ari": 0.0,
            "nmi": 0.0,
            "ami": 0.0,
            "macro_f1": 0.0,
            "silhouette": float("nan"),
            "davies_bouldin": float("nan"),
            "calinski_harabasz": float("nan"),
        }

    monkeypatch.setattr(runner, "preprocess", fake_preprocess)
    monkeypatch.setattr(runner, "PIPELINES", {"A1": fake_pipeline})
    monkeypatch.setattr(runner, "evaluate", fake_evaluate)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "run_experiments.py",
            "--subsets",
            "F4",
            "--pipelines",
            "A1",
            "--features",
            str(features_path),
            "--split",
            str(split_path),
            "--out",
            str(out_path),
        ],
    )

    # When: the runner parses CLI defaults and executes the target seam.
    runner.main()

    # Then: the approved plan seed triplet is used exactly.
    assert seen_seeds == [42, 43, 44]


def test_run_all_defaults_to_approved_seed_triplet(monkeypatch) -> None:
    # Given: run_all.py is invoked without an explicit --seeds override.
    calls: list[tuple[str, list[str] | None]] = []

    def fake_step(title, script, extra=None):
        calls.append((script, extra))

    monkeypatch.setattr(run_all, "step", fake_step)
    monkeypatch.setattr(sys, "argv", ["run_all.py", "--skip-extract"])

    # When: run_all forwards defaults to the experiment runner.
    run_all.main()

    # Then: the forwarded run_experiments.py arguments preserve the approved seed triplet.
    assert calls == [
        ("run_experiments.py", ["--subsets", "F4,F6,F7", "--seeds", "42,43,44"]),
        ("report.py", None),
    ]
