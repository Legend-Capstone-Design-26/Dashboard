# JSONL ingestion mode

`EVENT_INGEST_MODE` selects the `/collect` backend explicitly.

- `kafka`: SDK → `/collect` → Kafka
- `jsonl`: SDK → `/collect` → `dashboard-be/data/research/raw/events.jsonl`

Environment variables:

```env
EVENT_INGEST_MODE=kafka
EVENT_JSONL_DIR=./data/research/raw
EVENT_JSONL_FILENAME=events.jsonl
```

Key points:

- `jsonl` mode is not a Kafka failure fallback. Backend selection is explicit.
- `jsonl` mode works without Redis for `/collect` ingestion.
- Research JSONL does not automatically feed the existing dashboard file read model.
- Offline Session Builder is a separate step. See `docs/research/offline-session-builder.md`.
- JSONL writes are append-only and intended for a single Node process or research runs.
- PM2 cluster or other multi-process writers targeting the same file can interleave appends.
- Do not commit research JSONL, processed outputs, or results into Git.

Example:

```bash
cd dashboard-be
EVENT_INGEST_MODE=jsonl npm run dev
```
