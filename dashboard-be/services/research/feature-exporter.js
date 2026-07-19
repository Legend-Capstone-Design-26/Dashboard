const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  FEATURE_KEYS,
  FEATURE_SCHEMA_VERSION,
  extractRawVector,
} = require("../../analytics/clustering/featureExtractor");
const { createLineError, resolveBuilderPath, streamJsonlRecords } = require("./jsonl-stream");

const DATASET_SCHEMA_VERSION = 1;
const DEFAULT_INPUT_PATH = "data/research/processed/sessions.jsonl";
const DEFAULT_OUTPUT_DIR = "data/research/features";
const EXPORT_FORMATS = new Set(["csv", "jsonl", "both"]);
const METADATA_KEYS = ["source", "generation_run_id", "ground_truth_type"];

function parseExportFormat(value) {
  const normalized = String(value || "both").trim().toLowerCase();
  if (!EXPORT_FORMATS.has(normalized)) throw new Error(`invalid format: ${normalized}. Allowed values: csv, jsonl, both`);
  return normalized;
}

function assertNoFeatureLeakage() {
  for (const key of METADATA_KEYS) {
    if (FEATURE_KEYS.includes(key)) throw new Error(`feature key leakage detected: ${key}`);
  }
}

function extractSummaryMetadata(summary) {
  const nested = summary?.research_metadata && typeof summary.research_metadata === "object" ? summary.research_metadata : {};
  return {
    source: nested.source ?? summary?.source ?? null,
    generation_run_id: nested.generation_run_id ?? summary?.generation_run_id ?? null,
    ground_truth_type: nested.ground_truth_type ?? summary?.ground_truth_type ?? null,
  };
}

function normalizeSummaryRecord(summary, lineNumber) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw createLineError(lineNumber, "summary must be a JSON object");
  }
  const siteId = String(summary.site_id || "").trim();
  if (!siteId) throw createLineError(lineNumber, "missing site_id");
  const sessionId = String(summary.session_id || "").trim();
  if (!sessionId) throw createLineError(lineNumber, "missing session_id");
  return { ...summary, site_id: siteId, session_id: sessionId, __line_number: lineNumber };
}

function buildFeatureRow(summary, lineNumber) {
  assertNoFeatureLeakage();
  const vector = extractRawVector(summary);
  if (!Array.isArray(vector) || vector.length !== FEATURE_KEYS.length) {
    throw createLineError(lineNumber, `feature vector length ${Array.isArray(vector) ? vector.length : "invalid"} does not match 19`);
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw createLineError(lineNumber, "feature vector contains non-finite value");
  }

  const metadata = extractSummaryMetadata(summary);
  const row = {
    site_id: summary.site_id,
    session_id: summary.session_id,
    source: metadata.source,
    generation_run_id: metadata.generation_run_id,
    ground_truth_type: metadata.ground_truth_type,
    feature_schema_version: FEATURE_SCHEMA_VERSION,
  };

  FEATURE_KEYS.forEach((key, index) => {
    row[key] = vector[index];
  });
  return row;
}

async function hashFileSha256(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

async function readFeatureRowsFromJsonl(filePath, options = {}) {
  const rows = [];
  const seenKeys = new Set();
  const stats = await streamJsonlRecords(filePath, {
    skipInvalid: options.skipInvalid === true,
    parseRecord: normalizeSummaryRecord,
    onRecord: async (summary, lineNumber) => {
      const key = `${summary.site_id}::${summary.session_id}`;
      if (seenKeys.has(key)) throw createLineError(lineNumber, `duplicate session summary key ${summary.site_id}/${summary.session_id}`);
      const row = buildFeatureRow(summary, lineNumber);
      seenKeys.add(key);
      rows.push(row);
    },
  });

  rows.sort((left, right) => {
    if (left.site_id !== right.site_id) return left.site_id.localeCompare(right.site_id);
    return left.session_id.localeCompare(right.session_id);
  });

  return {
    rows,
    stats: {
      input_lines: stats.input_lines,
      parsed_sessions: stats.parsed_rows,
      invalid_sessions: stats.invalid_lines,
      skipped_sessions: stats.skipped_rows,
    },
  };
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function serializeFeatureRowsCsv(rows) {
  const header = ["site_id", "session_id", "source", "generation_run_id", "ground_truth_type", "feature_schema_version", ...FEATURE_KEYS];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => escapeCsvField(row[key] ?? null)).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function serializeFeatureRowsJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const rawValue = row[key];
    const value = rawValue === null || rawValue === undefined || rawValue === "" ? "unknown" : String(rawValue);
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function buildDatasetManifest(inputPath, inputSha256, rows, invalidCount, format) {
  return {
    dataset_schema_version: DATASET_SCHEMA_VERSION,
    feature_schema_version: FEATURE_SCHEMA_VERSION,
    feature_keys: [...FEATURE_KEYS],
    row_count: rows.length,
    invalid_row_count: invalidCount,
    source_counts: countBy(rows, "source"),
    label_counts: countBy(rows, "ground_truth_type"),
    input_file: path.basename(inputPath),
    input_sha256: inputSha256,
    outputs: {
      csv: format === "jsonl" ? null : "session-features.csv",
      jsonl: format === "csv" ? null : "session-features.jsonl",
      manifest: "session-features.manifest.json",
    },
  };
}

function writeSnapshotFiles(outputDir, payloads) {
  fs.mkdirSync(outputDir, { recursive: true });
  const pending = payloads.map(({ fileName, content }) => ({
    tempPath: path.join(outputDir, `${fileName}.tmp`),
    finalPath: path.join(outputDir, fileName),
    content,
  }));

  try {
    pending.forEach(({ tempPath, content }) => fs.writeFileSync(tempPath, content, "utf8"));
    pending.forEach(({ tempPath, finalPath }) => fs.renameSync(tempPath, finalPath));
  } catch (error) {
    pending.forEach(({ tempPath }) => {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
    });
    throw new Error(`failed to write feature dataset snapshot: ${error.message}`);
  }
}

async function exportFeatureDataset(inputPath, outputDir, options = {}) {
  const format = parseExportFormat(options.format);
  const { rows, stats } = await readFeatureRowsFromJsonl(inputPath, options);
  const inputSha256 = await hashFileSha256(inputPath);
  const manifest = buildDatasetManifest(inputPath, inputSha256, rows, stats.invalid_sessions, format);
  const payloads = [];
  if (format !== "jsonl") payloads.push({ fileName: "session-features.csv", content: serializeFeatureRowsCsv(rows) });
  if (format !== "csv") payloads.push({ fileName: "session-features.jsonl", content: serializeFeatureRowsJsonl(rows) });
  payloads.push({ fileName: "session-features.manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` });
  writeSnapshotFiles(outputDir, payloads);

  return {
    rows,
    manifest,
    stats: {
      ...stats,
      exported_rows: rows.length,
      feature_schema_version: FEATURE_SCHEMA_VERSION,
      feature_count: FEATURE_KEYS.length,
      csv_output: format === "jsonl" ? null : path.join(outputDir, "session-features.csv"),
      jsonl_output: format === "csv" ? null : path.join(outputDir, "session-features.jsonl"),
      manifest_output: path.join(outputDir, "session-features.manifest.json"),
      input_sha256: inputSha256,
    },
  };
}

module.exports = {
  DATASET_SCHEMA_VERSION,
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_DIR,
  FEATURE_KEYS,
  FEATURE_SCHEMA_VERSION,
  METADATA_KEYS,
  assertNoFeatureLeakage,
  buildDatasetManifest,
  buildFeatureRow,
  escapeCsvField,
  exportFeatureDataset,
  extractSummaryMetadata,
  hashFileSha256,
  normalizeSummaryRecord,
  parseExportFormat,
  readFeatureRowsFromJsonl,
  resolveBuilderPath,
  serializeFeatureRowsCsv,
  serializeFeatureRowsJsonl,
  writeSnapshotFiles,
};
