# Offline Session Builder

Purpose:

- Read research raw events JSONL
- Group by `site_id + session_id`
- Order events deterministically
- Replay sessions with the existing `mergeSessionState()` logic
- Normalize historical summaries
- Write processed session summaries JSONL

Input and output:

- Input: `dashboard-be/data/research/raw/events.jsonl`
- Output: `dashboard-be/data/research/processed/sessions.jsonl`

Run:

```bash
cd dashboard-be

node scripts/build-session-summaries.js \
  --input data/research/raw/events.jsonl \
  --output data/research/processed/sessions.jsonl
```

Or:

```bash
cd dashboard-be

npm run research:build-sessions -- \
  --input data/research/raw/events.jsonl \
  --output data/research/processed/sessions.jsonl
```

Options:

- `--input <path>`
- `--output <path>`
- `--skip-invalid`

Behavior:

- Session boundary uses SDK `session_id`
- Grouping key is `site_id + session_id`
- Events are ordered by `ts`, then `received_at`, then original line order
- If `ts` is missing but `received_at` exists, builder reuses `received_at` as replay timestamp
- Invalid JSON or invalid events stop the run by default
- `--skip-invalid` skips invalid lines and reports counts

Research metadata:

- Preserved separately in `research_metadata`
- Supported keys: `source`, `generation_run_id`, `ground_truth_type`
- Metadata conflicts inside one session are treated as errors
- Metadata does not participate in replay, normalization, or feature extraction

Output properties:

- One normalized summary per line
- Deterministic ordering by `site_id`, then `session_id`
- Output file is replaced as a whole on each run
- Builder validates that each summary is compatible with the current 19-feature extractor

Out of scope:

- No Redis writes
- No clustering execution
- No taxonomy or norm persistence

Limits:

- Builder reads the raw file as a stream, but keeps grouped session events in memory
- Suitable for research-scale logs, not large operational archives
- Future large-scale handling may require partitioning, external sort, or DuckDB

Do not commit raw research data, processed summaries, or result artifacts into Git.
