from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parents[1]
MAKE_SPLIT = PROJECT_DIR / "make_split.py"
SPLIT_SEED = 20260803
SplitManifest = dict[str, list[str]]


def write_features(path: Path, rows: list[dict[str, str]]) -> None:
    frame = pd.DataFrame(rows)
    frame.to_csv(path, index=False)


def run_make_split(features_path: Path, out_path: Path) -> SplitManifest:
    subprocess.run(
        [
            sys.executable,
            str(MAKE_SPLIT),
            "--features",
            str(features_path),
            "--out",
            str(out_path),
        ],
        cwd=PROJECT_DIR,
        check=True,
    )
    with out_path.open(encoding="utf-8") as handle:
        return json.load(handle)


def assert_complete_disjoint_split(manifest: SplitManifest, expected_ids: set[str]) -> None:
    train = set(manifest["train"])
    val = set(manifest["val"])
    test = set(manifest["test"])

    assert train.isdisjoint(val)
    assert train.isdisjoint(test)
    assert val.isdisjoint(test)
    assert train | val | test == expected_ids
    assert len(train) == int(len(expected_ids) * 0.70)
    assert len(val) + len(test) == len(expected_ids) - len(train)
    assert abs(len(val) - len(test)) <= 1


def balanced_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for persona in ("buyer", "browser"):
        for difficulty in ("normal", "hard"):
            for split_source in ("benchmark", "stress"):
                for offset in range(20):
                    rows.append(
                        {
                            "session_id": f"{persona}-{difficulty}-{split_source}-{offset:02d}",
                            "persona_id": persona,
                            "ground_truth_label": persona,
                            "difficulty": difficulty,
                            "split_source": split_source,
                        }
                    )
    return rows


def persona_viable_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for persona in ("buyer", "browser"):
        for offset in range(20):
            rows.append(
                {
                    "session_id": f"{persona}-normal-{offset:02d}",
                    "persona_id": persona,
                    "ground_truth_label": persona,
                    "difficulty": "normal",
                    "split_source": "benchmark",
                }
            )
        rows.append(
            {
                "session_id": f"{persona}-rare",
                "persona_id": persona,
                "ground_truth_label": persona,
                "difficulty": "rare",
                "split_source": "stress",
            }
        )
    return rows


def difficulty_viable_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for persona in ("buyer", "browser"):
        for difficulty in ("normal", "hard"):
            for offset in range(20):
                rows.append(
                    {
                        "session_id": f"{persona}-{difficulty}-benchmark-{offset:02d}",
                        "persona_id": persona,
                        "ground_truth_label": persona,
                        "difficulty": difficulty,
                        "split_source": "benchmark",
                    }
                )
            rows.append(
                {
                    "session_id": f"{persona}-{difficulty}-rare-source",
                    "persona_id": persona,
                    "ground_truth_label": persona,
                    "difficulty": difficulty,
                    "split_source": "stress",
                }
            )
    return rows


def test_split_uses_split_source_when_full_stratum_is_viable(tmp_path: Path) -> None:
    rows = balanced_rows()
    features_path = tmp_path / "features.csv"
    out_path = tmp_path / "split.json"
    write_features(features_path, rows)

    manifest = run_make_split(features_path, out_path)

    assert manifest["split_seed"] == SPLIT_SEED
    assert manifest["stratified_by"] == ["persona_id", "difficulty", "split_source"]
    assert_complete_disjoint_split(manifest, {row["session_id"] for row in rows})


def test_split_falls_back_to_difficulty_when_split_source_breaks_viability(
    tmp_path: Path,
) -> None:
    rows = difficulty_viable_rows()
    features_path = tmp_path / "features.csv"
    out_path = tmp_path / "split.json"
    write_features(features_path, rows)

    manifest = run_make_split(features_path, out_path)

    assert manifest["stratified_by"] == ["persona_id", "difficulty"]
    assert_complete_disjoint_split(manifest, {row["session_id"] for row in rows})


def test_split_falls_back_to_persona_when_rare_difficulty_breaks_viability(tmp_path: Path) -> None:
    rows = persona_viable_rows()
    features_path = tmp_path / "features.csv"
    first_out = tmp_path / "split-first.json"
    second_out = tmp_path / "split-second.json"
    write_features(features_path, rows)

    first_manifest = run_make_split(features_path, first_out)
    second_manifest = run_make_split(features_path, second_out)

    assert first_manifest["stratified_by"] == ["persona_id"]
    assert first_manifest == second_manifest
    assert_complete_disjoint_split(first_manifest, {row["session_id"] for row in rows})
