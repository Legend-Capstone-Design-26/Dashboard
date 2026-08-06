"""Load benchmark events and session metadata without labels entering feature inputs."""
from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import DefaultDict, Iterable


class DataIntegrityError(RuntimeError):
    """Raised when benchmark files cannot form a one-to-one session dataset."""


@dataclass(frozen=True)
class SessionMeta:
    session_id: str
    persona_id: str
    ground_truth_label: str
    difficulty: str
    source: str


def source_from_session_id(session_id: str) -> str:
    """Return the merge namespace used as a stable benchmark source marker."""
    return session_id.split("__", 1)[0] if "__" in session_id else "unknown"


def load_session_metadata(path: Path) -> dict[str, SessionMeta]:
    """Parse sessions.json into the evaluation-only metadata map."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("sessions")
    if not isinstance(rows, list):
        raise DataIntegrityError("sessions.json must contain a sessions list")
    metadata: dict[str, SessionMeta] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise DataIntegrityError("sessions.json contains a non-object row")
        session_id = str(row.get("session_id", "")).strip()
        if not session_id or session_id in metadata:
            raise DataIntegrityError("sessions.json contains a missing or duplicate session_id")
        persona = str(row.get("persona_id", "")).strip()
        difficulty = str(row.get("difficulty", "")).strip()
        label = str(row.get("ground_truth_label", "")).strip()
        if not persona or not difficulty or not label:
            raise DataIntegrityError(f"session {session_id} is missing evaluation metadata")
        metadata[session_id] = SessionMeta(session_id, persona, label, difficulty, source_from_session_id(session_id))
    return metadata


def load_events_by_session(path: Path) -> dict[str, list[dict[str, object]]]:
    """Stream JSONL events and return timestamp-ordered events keyed by session_id."""
    groups: DefaultDict[str, list[dict[str, object]]] = defaultdict(list)
    with path.open(encoding="utf-8") as handle:
        for number, raw_line in enumerate(handle, start=1):
            if not raw_line.strip():
                continue
            try:
                event = json.loads(raw_line)
            except json.JSONDecodeError as error:
                raise DataIntegrityError(f"events.jsonl line {number}: invalid JSON") from error
            if not isinstance(event, dict):
                raise DataIntegrityError(f"events.jsonl line {number}: event must be an object")
            session_id = str(event.get("session_id", "")).strip()
            if not session_id:
                raise DataIntegrityError(f"events.jsonl line {number}: missing session_id")
            event["_line_number"] = number
            groups[session_id].append(event)
    for events in groups.values():
        events.sort(key=lambda event: (int(event.get("ts", 0)), int(event.get("received_at", 0)), int(event["_line_number"])))
    return dict(groups)


def validate_session_join(metadata: dict[str, SessionMeta], events: dict[str, list[dict[str, object]]]) -> None:
    """Reject benchmark sources that do not have exactly one event group per session."""
    metadata_ids = set(metadata)
    event_ids = set(events)
    missing_events = metadata_ids - event_ids
    orphan_events = event_ids - metadata_ids
    if missing_events or orphan_events:
        raise DataIntegrityError(f"session join mismatch: missing_events={len(missing_events)} orphan_events={len(orphan_events)}")
