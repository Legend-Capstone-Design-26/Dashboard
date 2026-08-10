from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


MODULE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE_DIR))

import extract_features  # noqa: E402


def write_dataset(base: Path) -> None:
    base.mkdir(parents=True, exist_ok=True)
    sessions = {
        "sessions": [
            {
                "session_id": "s1",
                "persona_id": "buyer",
                "ground_truth_label": "buyer",
                "difficulty": "normal",
                "split": "benchmark",
            }
        ]
    }
    (base / "sessions.json").write_text(json.dumps(sessions), encoding="utf-8")
    (base / "events.jsonl").write_text(
        "\n".join(
            [
                json.dumps({"session_id": "s1", "ts": 1, "event_name": "page_view", "path": "/"}),
            ]
        )
        + "\n",
        encoding="utf-8",
    )


@pytest.mark.parametrize("bad_value", [float("inf"), float("nan")])
def test_main_rejects_non_finite_features_before_writing_csv(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    bad_value: float,
) -> None:
    # Given: a dataset whose extracted features contain a non-finite value.
    dataset_dir = tmp_path / "dataset"
    out_path = tmp_path / "features.csv"
    write_dataset(dataset_dir)

    def fake_compute_features(events: list[dict[str, object]]) -> dict[str, float]:
        return {
            column: (bad_value if index == 0 else 1.0)
            for index, column in enumerate(extract_features.FEATURE_COLUMNS)
        }

    monkeypatch.setattr(extract_features, "compute_features", fake_compute_features)
    monkeypatch.setattr(
        sys,
        "argv",
        ["extract_features.py", "--dataset", str(dataset_dir), "--out", str(out_path)],
    )

    # When: the extraction CLI runs.
    with pytest.raises(SystemExit, match="non-finite"):
        extract_features.main()

    # Then: the CSV write is aborted.
    assert not out_path.exists()
