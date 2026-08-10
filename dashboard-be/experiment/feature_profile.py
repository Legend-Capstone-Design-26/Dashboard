"""Write deterministic whole-benchmark feature distribution statistics."""
from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np

from .data_loader import load_events_by_session, load_session_metadata, validate_session_join
from .feature_extractor import extract_features
from .feature_sets import FEATURES


def profile(data_dir: Path, output_path: Path) -> None:
    """Extract all session features and save required feature distribution statistics."""
    metadata = load_session_metadata(data_dir / "sessions.json")
    events = load_events_by_session(data_dir / "events.jsonl")
    validate_session_join(metadata, events)
    rows = [extract_features(events[session_id]) for session_id in sorted(metadata)]
    result: dict[str, dict[str, float | int]] = {}
    for feature in FEATURES:
        values = np.asarray([row[feature] for row in rows], dtype=float)
        result[feature] = {
            "count": int(values.size), "min": float(values.min()), "max": float(values.max()),
            "mean": float(values.mean()), "standard_deviation": float(values.std()), "median": float(np.median(values)),
            "zero_count": int((values == 0).sum()), "zero_ratio": float((values == 0).mean()),
            "unique_value_count": int(np.unique(values).size), "nan_count": int(np.isnan(values).sum()),
            "infinite_count": int(np.isinf(values).sum()),
        }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, sort_keys=True), encoding="utf-8")
    with output_path.with_suffix(".csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["feature", *next(iter(result.values())).keys()])
        writer.writeheader(); writer.writerows([{"feature": name, **values} for name, values in result.items()])


if __name__ == "__main__":
    profile(Path("benchmark/output/merged-7500"), Path("experiment/output/feature-distribution.json"))
