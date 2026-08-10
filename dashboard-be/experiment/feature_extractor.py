"""Compute the plan's 19 leakage-free features from raw benchmark events."""
from __future__ import annotations

from collections import Counter
from typing import Iterable

from .feature_sets import BINARY, FEATURES, RATIOS


class FeatureIntegrityError(RuntimeError):
    """Raised when a feature matrix violates the experiment contract."""


def _path(event: dict[str, object]) -> str:
    return str(event.get("path", "")).strip()


def _name(event: dict[str, object]) -> str:
    return str(event.get("event_name", "")).strip()


def extract_features(events: list[dict[str, object]]) -> dict[str, float]:
    """Derive conservative feature values from one timestamp-ordered session."""
    if not events:
        raise FeatureIntegrityError("cannot extract features from an empty session")
    paths = [_path(event) for event in events if _path(event)]
    names = [_name(event) for event in events]
    unique_paths = set(paths)
    revisits = sum(1 for index, path in enumerate(paths) if path in paths[:index])
    loops = sum(1 for index in range(2, len(paths)) if paths[index] == paths[index - 2] and paths[index] != paths[index - 1])
    backtracks = loops
    first_ts = int(events[0].get("ts", 0))
    last_ts = int(events[-1].get("ts", 0))
    values = {
        "session_duration_ms": float(max(0, last_ts - first_ts)),
        "event_count": float(len(events)),
        "page_view_count": float(names.count("page_view")),
        "click_count": float(names.count("click")),
        "depth": float(len(unique_paths)),
        "unique_page_ratio": float(len(unique_paths) / len(paths)) if paths else 0.0,
        "revisit_rate": float(revisits / len(paths)) if paths else 0.0,
        "backtrack_count": float(backtracks),
        "loop_rate": float(loops / max(len(paths) - 2, 1)) if len(paths) >= 3 else 0.0,
        "search_count": float(names.count("search")),
        "filter_count": float(names.count("filter_change")),
        "product_detail_count": float(sum(name == "page_view" and path.startswith("/product") for name, path in zip(names, [_path(event) for event in events]))),
        "review_view_count": float(sum(name == "page_view" and path.startswith("/review") for name, path in zip(names, [_path(event) for event in events]))),
        "cart_add_count": float(names.count("add_to_cart")),
        "cart_remove_count": float(names.count("remove_from_cart")),
        "checkout_entered": float(any(name == "checkout_start" or path.startswith("/checkout") for name, path in zip(names, [_path(event) for event in events]))),
        "payment_attempt_count": float(names.count("payment_attempt")),
        "purchase_completed": float(any(name == "checkout_complete" or path.startswith("/order-complete") for name, path in zip(names, [_path(event) for event in events]))),
        "error_count": float(names.count("error")),
    }
    validate_feature_row(values)
    return values


def validate_feature_row(row: dict[str, float]) -> None:
    """Enforce finite nonnegative, bounded ratio, and binary feature invariants."""
    if tuple(row) != FEATURES:
        raise FeatureIntegrityError("feature keys do not match the canonical ordered schema")
    for name, value in row.items():
        if value < 0 or value == float("inf") or value != value:
            raise FeatureIntegrityError(f"invalid nonnegative feature {name}")
    for name in RATIOS:
        if not 0.0 <= row[name] <= 1.0:
            raise FeatureIntegrityError(f"ratio feature {name} is outside [0, 1]")
    for name in BINARY:
        if row[name] not in (0.0, 1.0):
            raise FeatureIntegrityError(f"binary feature {name} is not 0 or 1")
