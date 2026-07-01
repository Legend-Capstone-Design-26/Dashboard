const fs = require("node:fs")
const path = require("node:path")

const {
  selectSpreadRowIndexes,
  normalizeCompactMember,
  buildSegmentCounts,
  buildCoverageDiagnostics,
  buildCohortIdentity,
} = require("../personas/cohort-builder")

const DATASET = "nvidia/Nemotron-Personas-Korea"
const CONFIG = "default"
const SPLIT = "train"
const REQUESTED_POPULATION_SIZE = 7000000
const DEFAULT_SAMPLE_SIZE = 10000
const DEFAULT_PAGE_LENGTH = 100
const DEFAULT_DELAY_MS = 0
const DEFAULT_MAX_RETRIES = 5
const DEFAULT_RETRY_BASE_MS = 1000
const DEFAULT_OUTPUT = path.join(__dirname, "..", "personas", "cohorts", "nemotron-korea-fixed-10k.generated.json")
const SPLITS_URL = `https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(DATASET)}`
const PARQUET_URL = `https://huggingface.co/api/datasets/${DATASET}/parquet/${CONFIG}/${SPLIT}`

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
    "  node scripts/build-nemotron-cohort.js [--dry-run] [--sample-size N] [--out path] [--delay-ms N] [--max-retries N] [--retry-base-ms N]",
    "",
    "Options:",
    `  --sample-size <n>  Number of compact members to generate (default: ${DEFAULT_SAMPLE_SIZE})`,
    `  --out <path>       Output artifact path (default: ${DEFAULT_OUTPUT})`,
    `  --delay-ms <n>     Delay between rows page requests in ms (default: ${DEFAULT_DELAY_MS})`,
    `  --max-retries <n>  Retries for 429/5xx responses (default: ${DEFAULT_MAX_RETRIES})`,
    `  --retry-base-ms <n> Base delay for exponential backoff in ms (default: ${DEFAULT_RETRY_BASE_MS})`,
    "  --dry-run          Fetch metadata and a single rows page without writing an artifact",
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
        "user-agent": "dashboard-be-nemotron-cohort-builder",
      },
    })

    if (response.ok) return response.json()

    const shouldRetry = response.status === 429 || response.status >= 500
    if (shouldRetry && attempt < maxRetries) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"))
      const backoffMs = retryBaseMs * (2 ** attempt)
      const waitMs = Math.max(retryAfterMs || 0, backoffMs)
      await sleep(waitMs)
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

function buildChunkPlan(totalRows, sampleSize, pageLength) {
  const total = Math.max(0, Math.trunc(Number(totalRows) || 0))
  const requested = Math.max(0, Math.trunc(Number(sampleSize) || 0))
  const target = Math.min(total, requested)
  if (target === 0) return []

  const chunkCount = Math.ceil(target / pageLength)
  const baseLength = Math.floor(target / chunkCount)
  const remainder = target % chunkCount
  const lengths = Array.from({ length: chunkCount }, (_, index) => baseLength + (index < remainder ? 1 : 0))
  const maxLength = Math.max(...lengths)
  const startSpace = Math.max(1, total - maxLength + 1)
  const starts = selectSpreadRowIndexes(startSpace, chunkCount)

  return lengths.map((length, index) => ({
    offset: Math.min(starts[index], total - length),
    length,
  }))
}

function dedupeMembers(members, targetCount) {
  const byRow = new Map()
  for (const member of members) {
    if (!member || !Number.isFinite(member.row_idx)) continue
    if (!byRow.has(member.row_idx)) byRow.set(member.row_idx, member)
  }
  return Array.from(byRow.values())
    .sort((left, right) => left.row_idx - right.row_idx)
    .slice(0, targetCount)
}

async function main() {
  if (hasFlag("help")) {
    console.log(usage())
    return
  }

  const dryRun = hasFlag("dry-run")
  const requestedSampleSize = intArg("sample-size", DEFAULT_SAMPLE_SIZE)
  const outputPath = path.resolve(arg("out", DEFAULT_OUTPUT))
  const delayMs = nonNegativeIntArg("delay-ms", DEFAULT_DELAY_MS)
  const maxRetries = intArg("max-retries", DEFAULT_MAX_RETRIES)
  const retryBaseMs = intArg("retry-base-ms", DEFAULT_RETRY_BASE_MS)

  const requestOptions = {
    maxRetries,
    retryBaseMs,
  }

  const splits = await fetchJson(SPLITS_URL, requestOptions)
  const availableSplits = Array.isArray(splits?.splits) ? splits.splits : []
  const targetSplit = availableSplits.find((item) => item?.dataset === DATASET && item?.config === CONFIG && item?.split === SPLIT)
  if (!targetSplit) {
    throw new Error(`missing expected split ${DATASET}/${CONFIG}/${SPLIT}`)
  }

  const parquetFiles = await fetchJson(PARQUET_URL, requestOptions)
  const previewLength = Math.min(DEFAULT_PAGE_LENGTH, requestedSampleSize)
  const firstRowsPage = await fetchJson(rowsUrl(0, previewLength), requestOptions)
  const observedNumRowsTotal = Math.max(0, Math.trunc(Number(firstRowsPage?.num_rows_total) || 0))
  const features = summarizeFeatures(firstRowsPage?.features)

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      mode: "dry-run",
      dataset: DATASET,
      config: CONFIG,
      split: SPLIT,
      observed_num_rows_total: observedNumRowsTotal,
      parquet_files: Array.isArray(parquetFiles) ? parquetFiles.length : 0,
      preview_rows: Array.isArray(firstRowsPage?.rows) ? firstRowsPage.rows.length : 0,
      features,
    }, null, 2))
    return
  }

  const actualSampleSize = Math.min(requestedSampleSize, observedNumRowsTotal)
  const plan = buildChunkPlan(observedNumRowsTotal, actualSampleSize, DEFAULT_PAGE_LENGTH)
  const rowsPages = []
  for (const chunk of plan) {
    if (chunk.offset === 0 && chunk.length === previewLength) {
      rowsPages.push(firstRowsPage)
      continue
    }
    await sleep(delayMs)
    rowsPages.push(await fetchJson(rowsUrl(chunk.offset, chunk.length), requestOptions))
  }

  const members = dedupeMembers(
    rowsPages.flatMap((page) => Array.isArray(page?.rows) ? page.rows : []).map((rowObject) => normalizeCompactMember(rowObject, {
      sampleSize: actualSampleSize,
      requestedPopulationSize: REQUESTED_POPULATION_SIZE,
    })),
    actualSampleSize,
  )

  const selectionRule = `deterministic spread contiguous row windows using selectSpreadRowIndexes(totalRows - windowLength + 1, chunkCount) with max window length ${DEFAULT_PAGE_LENGTH}`
  const generatedAt = new Date().toISOString()
  const segmentCounts = buildSegmentCounts(members)
  const coverageDiagnostics = buildCoverageDiagnostics(members, { observedNumRowsTotal })
  const identity = buildCohortIdentity({
    dataset: DATASET,
    config: CONFIG,
    split: SPLIT,
    requestedPopulationSize: REQUESTED_POPULATION_SIZE,
    observedNumRowsTotal,
    parquetFiles,
    features,
    generatedAt,
    selectionRule,
    members,
  })

  const artifact = {
    cohort_id: identity.cohort_id,
    metadata: identity.metadata,
    members,
    segment_counts: segmentCounts,
    coverage_diagnostics: coverageDiagnostics,
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8")

  console.log(JSON.stringify({
    ok: true,
    cohort_id: artifact.cohort_id,
    output_path: outputPath,
    member_count: artifact.members.length,
    unique_group_count: artifact.coverage_diagnostics.unique_group_count,
    observed_num_rows_total: observedNumRowsTotal,
  }, null, 2))
}

main().catch((error) => {
  console.error(String(error && error.stack || error))
  process.exitCode = 1
})
