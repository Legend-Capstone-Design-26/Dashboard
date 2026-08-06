"""Build a reproducible stratified session split manifest."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.model_selection import train_test_split

from .data_loader import SessionMeta


@dataclass(frozen=True)
class SplitManifest:
    train_ids: tuple[str, ...]
    validation_ids: tuple[str, ...]
    test_ids: tuple[str, ...]
    stratification: str
    seed: int


def _strata(metadata: list[SessionMeta], fields: tuple[str, ...]) -> list[str]:
    return ["|".join(getattr(item, field) for field in fields) for item in metadata]


def split_sessions(metadata: dict[str, SessionMeta], seed: int) -> SplitManifest:
    """Split sessions 70/15/15 using the most specific viable strata."""
    items = [metadata[key] for key in sorted(metadata)]
    ids = [item.session_id for item in items]
    for fields in (("persona_id", "difficulty", "source"), ("persona_id", "difficulty"), ("persona_id",)):
        labels = _strata(items, fields)
        if min(labels.count(label) for label in set(labels)) < 3:
            continue
        train_ids, held_ids, train_labels, held_labels = train_test_split(ids, labels, test_size=0.30, random_state=seed, stratify=labels)
        validation_ids, test_ids = train_test_split(held_ids, test_size=0.50, random_state=seed, stratify=held_labels)
        manifest = SplitManifest(tuple(sorted(train_ids)), tuple(sorted(validation_ids)), tuple(sorted(test_ids)), "+".join(fields), seed)
        validate_split_manifest(manifest, len(ids))
        return manifest
    raise RuntimeError("unable to build a valid stratified split: persona strata are too small")


def validate_split_manifest(manifest: SplitManifest, expected_count: int) -> None:
    """Reject overlap or count mismatch in a saved split manifest."""
    train, validation, test = set(manifest.train_ids), set(manifest.validation_ids), set(manifest.test_ids)
    if train & validation or train & test or validation & test:
        raise RuntimeError("split manifest contains overlapping session ids")
    if len(train | validation | test) != expected_count:
        raise RuntimeError("split manifest does not cover all sessions")
