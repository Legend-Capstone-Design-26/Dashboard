# Feature dataset export

Purpose:

- Read processed session summaries JSONL
- Reuse the existing raw 19-feature extractor
- Combine research metadata with feature rows
- Export deterministic CSV, JSONL, and manifest snapshots

Input and output:

- Input: `dashboard-be/data/research/processed/sessions.jsonl`
- Output directory: `dashboard-be/data/research/features`
- Files:
  - `session-features.csv`
  - `session-features.jsonl`
  - `session-features.manifest.json`

Run:

```bash
cd dashboard-be

node scripts/export-session-features.js \
  --input data/research/processed/sessions.jsonl \
  --output-dir data/research/features
```

Or:

```bash
cd dashboard-be

npm run research:export-features -- \
  --input data/research/processed/sessions.jsonl \
  --output-dir data/research/features
```

Options:

- `--input <path>`
- `--output-dir <path>`
- `--format <csv|jsonl|both>`
- `--skip-invalid`

Schema:

- `feature_schema_version`: `2`
- Feature order follows the extractor `FEATURE_KEYS`
- Current 19 features:
  - `path_depth`
  - `path_diversity`
  - `oscillation_rate`
  - `backtrack_rate`
  - `transition_count`
  - `page_view_intensity`
  - `click_intensity`
  - `event_intensity`
  - `dwell_per_page`
  - `error_friction`
  - `search_count`
  - `filter_count`
  - `price_interaction_count`
  - `cart_add_count`
  - `cart_remove_count`
  - `payment_attempt_count`
  - `checkout_entered`
  - `checkout_complete`
  - `max_step_index`

Metadata handling:

- Export columns include `source`, `generation_run_id`, and `ground_truth_type`
- Metadata is read from `research_metadata` first
- Metadata is never part of `FEATURE_KEYS`
- Metadata is never part of the numeric feature vector

Leakage guard:

- `ground_truth_type`, `source`, and `generation_run_id` are excluded from feature columns
- Exported numeric feature columns are exactly the extractor's 19 raw features

Manifest:

- Includes feature schema version, feature keys, row count, invalid row count, source counts, label counts, input file name, input SHA-256, and output file names
- Does not store absolute local paths

Determinism:

- Rows are sorted by `site_id`, then `session_id`
- JSONL key order is fixed by row construction
- CSV header order is fixed
- Manifest content is deterministic for the same input file
- Snapshot files are rewritten, not appended

Limits:

- Raw features only. No scaling, PCA, UMAP, or clustering in this step
- Large inputs still require in-memory row accumulation after parsing
- Parquet export is not included

Do not commit generated research feature outputs into Git.
