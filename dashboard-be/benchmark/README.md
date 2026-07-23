# Synthetic Benchmark Spec

This directory defines the canonical schema and dataset plan for the LLM-based ecommerce synthetic benchmark used by the Dashboard clustering experiments.

## Design Rules

- LLM output must be raw event sequences, not final feature values.
- Ground truth labels live at the session level.
- Benchmark storage is currently split into two JSON-based datasets:
  - `events.jsonl`: one line per raw event
  - `sessions.json`: one object per session with ground-truth persona and generation metadata
- Kafka ingestion can be added later by replaying rows from `events.jsonl` into the collector JSON shape.
- Derived features must always be recomputed from raw events so feature-set and preprocessing experiments stay comparable.
- Parquet export can be added later, but JSON/JSONL is the current source of truth while Kafka and Redis are not wired.

## Initial Benchmark Target

- Benchmark type: balanced
- Personas: 5
- Sessions per persona: 1,500
- Total sessions: 7,500
- Session-level split per persona:
  - `benchmark`: 1,050
  - `eval`: 300
  - `stress`: 150

## Persona Set

- `goal_oriented_buyer`
- `explorer`
- `price_comparison`
- `impulse_buyer`
- `cart_abandoner`

## Files

- `persona-cards.json`
- `few-shot-examples.json`
- `schemas/events.schema.json`
- `schemas/sessions.schema.json`
- `manifests/balanced-7500.template.json`

## Notes

- `props` and `experiments` are intentionally kept as nested structures because they map directly to the Dashboard collector schema.
- `persona_id` is stored only in session-level metadata and must not leak into downstream clustering features.
- Context variables such as device, traffic source, category, and promotion exposure should vary within every persona to reduce shortcut leakage.
- The current output plan is:
  - `benchmark/output/events.jsonl`
  - `benchmark/output/sessions.json`
  - `benchmark/output/manifest.json`
