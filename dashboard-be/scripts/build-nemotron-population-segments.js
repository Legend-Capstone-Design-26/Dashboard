const fs = require("node:fs")
const path = require("node:path")

const {
  updatePopulationSegmentCounts,
  finalizePopulationSegmentsArtifact,
} = require("../personas/cohort-builder")

const DATASET = "nvidia/Nemotron-Personas-Korea"
const CONFIG = "default"
const SPLIT = "train"
const DEFAULT_PAGE_LENGTH = 100
const DEFAULT_DELAY_MS = 0
const DEFAULT_MAX_RETRIES = 5
const DEFAULT_RETRY_BASE_MS = 1000
const DEFAULT_OUTPUT = path.join(__dirname, "..", "personas", "cohorts", "nemotron-korea-population-segments.generated.json")
const DEFAULT_CHECKPOINT = `${DEFAULT_OUTPUT}.checkpoint.json`
const SPLITS_URL = `https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(DATASET)}`

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function intArg(name, fallback) {
  const value = Number(arg(name, fallback))
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.trunc(value))
}

function nonNegativeIntArg(name, fallback) {
  const value = Number(arg(name, fallback))
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.trunc(value))
}

function usage() {
  return [
    "Usage:",
    "  node scripts/build-nemotron-population-segments.js [--dry-run] [--out path] [--checkpoint path] [--page-length N] [--delay-ms N] [--max-retries N] [--retry-base-ms N] [--max-pages N] [--resume]",
    "",
    "Options:",
    `  --out <path>          Output artifact path (default: ${DEFAULT_OUTPUT})`,
    `  --checkpoint <path>   Checkpoint path (default: ${DEFAULT_CHECKPOINT})`,
    `  --page-length <n>     Rows API page length (default: ${DEFAULT_PAGE_LENGTH})`,
    `  --delay-ms <n>        Delay between rows page requests in ms (default: ${DEFAULT_DELAY_MS})`,
    `  --max-retries <n>     Retries for 429/5xx responses (default: ${DEFAULT_MAX_RETRIES})`,
    `  --retry-base-ms <n>   Base delay for exponential backoff in ms (default: ${DEFAULT_RETRY_BASE_MS})`,
    "  --max-pages <n>       Stop after aggregating at most N pages and write a partial artifact",
    "  --resume              Resume from an existing checkpoint",
    "  --dry-run             Fetch metadata and a single rows page without writing outputs",
  ].join("\n")
}

function rowsUrl(offset, length) {
  const params = new URLSearchParams({
    dataset: DATASET,
    config: CONFIG,
    split: SPLIT,
    offset: String(offset),
    length: String(length),
  })
  return `https://datasets-server.huggingface.co/rows?${params.toString()}`
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return null
  const trimmed = String(headerValue).trim()
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.trunc(seconds * 1000)
  const timestamp = Date.parse(trimmed)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, timestamp - Date.now())
}

async function fetchJson(url, { maxRetries = DEFAULT_MAX_RETRIES, retryBaseMs = DEFAULT_RETRY_BASE_MS } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "dashboard-be-nemotron-population-segments-builder",
      },
    })

    if (response.ok) return response.json()

    const shouldRetry = response.status === 429 || response.status >= 500
    if (shouldRetry && attempt < maxRetries) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"))
      const backoffMs = retryBaseMs * (2 ** attempt)
      await sleep(Math.max(retryAfterMs || 0, backoffMs))
      continue
    }

    const text = await response.text().catch(() => "")
    throw new Error(`request failed ${response.status} ${response.statusText}: ${url}${text ? ` :: ${text.slice(0, 300)}` : ""}`)
  }
}

function summarizeFeatures(features) {
  return Array.isArray(features)
    ? features.map((feature) => ({
      name: feature?.name || null,
      dtype: feature?.type?.dtype || feature?.type?._type || null,
    }))
    : []
}

function checkpointToSerializable(checkpoint) {
  const segmentCounts = checkpoint.segment_counts instanceof Map
    ? Object.fromEntries(Array.from(checkpoint.segment_counts.entries()).map(([groupId, segment]) => [groupId, segment]))
    : checkpoint.segment_counts && typeof checkpoint.segment_counts === "object"
      ? checkpoint.segment_counts
      : {}
  return {
    next_offset: Math.max(0, Math.trunc(Number(checkpoint.next_offset) || 0)),
    scanned_row_count: Math.max(0, Math.trunc(Number(checkpoint.scanned_row_count) || 0)),
    observed_num_rows_total: Math.max(0, Math.trunc(Number(checkpoint.observed_num_rows_total) || 0)),
    aggregate_segment_counts: segmentCounts,
    scan_complete: Boolean(checkpoint.scan_complete),
  }
}

function loadCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) return null
  return JSON.parse(fs.readFileSync(checkpointPath, "utf8"))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function main() {
  if (hasFlag("help")) {
    console.log(usage())
    return
  }

  const outputPath = path.resolve(arg("out", DEFAULT_OUTPUT))
  const checkpointPath = path.resolve(arg("checkpoint", outputPath === path.resolve(DEFAULT_OUTPUT) ? DEFAULT_CHECKPOINT : `${outputPath}.checkpoint.json`))
  const pageLength = intArg("page-length", DEFAULT_PAGE_LENGTH)
  const delayMs = nonNegativeIntArg("delay-ms", DEFAULT_DELAY_MS)
  const maxRetries = intArg("max-retries", DEFAULT_MAX_RETRIES)
  const retryBaseMs = intArg("retry-base-ms", DEFAULT_RETRY_BASE_MS)
  const maxPages = hasFlag("max-pages") ? intArg("max-pages", 1) : null
  const resume = hasFlag("resume")
  const dryRun = hasFlag("dry-run")
  const requestOptions = { maxRetries, retryBaseMs }

  const splits = await fetchJson(SPLITS_URL, requestOptions)
  const availableSplits = Array.isArray(splits?.splits) ? splits.splits : []
  const targetSplit = availableSplits.find((item) => item?.dataset === DATASET && item?.config === CONFIG && item?.split === SPLIT)
  if (!targetSplit) {
    throw new Error(`missing expected split ${DATASET}/${CONFIG}/${SPLIT}`)
  }

  const firstPage = await fetchJson(rowsUrl(0, pageLength), requestOptions)
  const observedNumRowsTotal = Math.max(0, Math.trunc(Number(firstPage?.num_rows_total) || 0))
  const features = summarizeFeatures(firstPage?.features)

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      mode: "dry-run",
      dataset: DATASET,
      config: CONFIG,
      split: SPLIT,
      observed_num_rows_total: observedNumRowsTotal,
      preview_rows: Array.isArray(firstPage?.rows) ? firstPage.rows.length : 0,
      features,
      output_path: outputPath,
      checkpoint_path: checkpointPath,
    }, null, 2))
    return
  }

  const loadedCheckpoint = resume ? loadCheckpoint(checkpointPath) : null
  const checkpoint = {
    next_offset: Math.max(0, Math.trunc(Number(loadedCheckpoint?.next_offset) || 0)),
    scanned_row_count: Math.max(0, Math.trunc(Number(loadedCheckpoint?.scanned_row_count) || 0)),
    observed_num_rows_total: Math.max(0, Math.trunc(Number(loadedCheckpoint?.observed_num_rows_total) || observedNumRowsTotal)),
    segment_counts: loadedCheckpoint?.aggregate_segment_counts || {},
    scan_complete: Boolean(loadedCheckpoint?.scan_complete),
  }

  let pagesProcessed = 0
  while (checkpoint.next_offset < checkpoint.observed_num_rows_total) {
    if (maxPages != null && pagesProcessed >= maxPages) break
    const offset = checkpoint.next_offset
    const remaining = checkpoint.observed_num_rows_total - offset
    const length = Math.max(1, Math.min(pageLength, remaining))
    const page = offset === 0 ? firstPage : await fetchJson(rowsUrl(offset, length), requestOptions)
    const rows = Array.isArray(page?.rows) ? page.rows : []
    if (rows.length === 0) break

    const nextSegmentCounts = updatePopulationSegmentCounts(checkpoint.segment_counts, rows)
    const nextOffset = offset + rows.length
    const nextCheckpoint = {
      next_offset: nextOffset,
      scanned_row_count: checkpoint.scanned_row_count + rows.length,
      observed_num_rows_total: Math.max(checkpoint.observed_num_rows_total, Math.trunc(Number(page?.num_rows_total) || 0)),
      segment_counts: nextSegmentCounts,
      scan_complete: nextOffset >= checkpoint.observed_num_rows_total,
    }
    writeJson(checkpointPath, checkpointToSerializable(nextCheckpoint))
    checkpoint.next_offset = nextCheckpoint.next_offset
    checkpoint.scanned_row_count = nextCheckpoint.scanned_row_count
    checkpoint.observed_num_rows_total = nextCheckpoint.observed_num_rows_total
    checkpoint.segment_counts = nextCheckpoint.segment_counts
    checkpoint.scan_complete = nextCheckpoint.scan_complete
    pagesProcessed += 1

    if (delayMs > 0 && checkpoint.next_offset < checkpoint.observed_num_rows_total) {
      await sleep(delayMs)
    }
  }

  const artifact = finalizePopulationSegmentsArtifact({
    dataset: DATASET,
    config: CONFIG,
    split: SPLIT,
    generatedAt: new Date().toISOString(),
    scannedRowCount: checkpoint.scanned_row_count,
    observedNumRowsTotal: checkpoint.observed_num_rows_total,
    scanComplete: checkpoint.scan_complete && checkpoint.next_offset >= checkpoint.observed_num_rows_total,
    pageLength,
    nextOffset: checkpoint.next_offset,
    segmentCounts: checkpoint.segment_counts,
    features,
  })
  writeJson(outputPath, artifact)

  console.log(JSON.stringify({
    ok: true,
    output_path: outputPath,
    checkpoint_path: checkpointPath,
    scanned_row_count: artifact.metadata.scanned_row_count,
    observed_num_rows_total: artifact.metadata.observed_num_rows_total,
    scan_complete: artifact.metadata.scan_complete,
    segment_count: artifact.segments.length,
    pages_processed: pagesProcessed,
  }, null, 2))
}

main().catch((error) => {
  console.error(String(error && error.stack || error))
  process.exitCode = 1
})
