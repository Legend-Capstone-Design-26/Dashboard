const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildSessionSummariesFromFile, writeSessionSummariesJsonl } = require("../services/research/session-builder");
const {
  FEATURE_KEYS,
  FEATURE_SCHEMA_VERSION,
  assertNoFeatureLeakage,
  buildDatasetManifest,
  buildFeatureRow,
  escapeCsvField,
  exportFeatureDataset,
  hashFileSha256,
  parseExportFormat,
  readFeatureRowsFromJsonl,
  serializeFeatureRowsCsv,
  serializeFeatureRowsJsonl,
} = require("../services/research/feature-exporter");

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uxsdk-feature-exporter-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function writeJsonl(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, rows.join("\n") + "\n", "utf8");
}

function createSummary(overrides = {}) {
  return {
    site_id: "site_a",
    session_id: "s1",
    path_sequence: ["/", "/product/1", "/checkout"],
    paths: ["/", "/product/1", "/checkout"],
    page_view_count: 2,
    click_count: 1,
    event_count: 3,
    dwell_total_ms: 1200,
    error_count: 0,
    search_count: 0,
    filter_count: 0,
    price_interaction_count: 1,
    cart_add_count: 1,
    cart_remove_count: 0,
    payment_attempt_count: 0,
    checkout_entered: true,
    checkout_complete: false,
    max_step: "checkout",
    research_metadata: {
      source: "synthetic",
      generation_run_id: "gen_1",
      ground_truth_type: "price_sensitive",
    },
    ...overrides,
  };
}

test("parseExportFormat accepts supported values and rejects unknown ones", () => {
  assert.equal(parseExportFormat("csv"), "csv");
  assert.equal(parseExportFormat(" JSONL "), "jsonl");
  assert.equal(parseExportFormat(undefined), "both");
  assert.throws(() => parseExportFormat("bad"), /Allowed values: csv, jsonl, both/);
});

test("buildFeatureRow creates metadata plus 19-feature row without leakage", () => {
  const row = buildFeatureRow(createSummary(), 1);
  assert.equal(row.feature_schema_version, FEATURE_SCHEMA_VERSION);
  assert.equal(Object.keys(row).slice(0, 6).join(","), "site_id,session_id,source,generation_run_id,ground_truth_type,feature_schema_version");
  assert.equal(FEATURE_KEYS.length, 19);
  assert.equal(FEATURE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(row, key)), true);
  assert.equal(FEATURE_KEYS.includes("source"), false);
  assert.equal(FEATURE_KEYS.includes("generation_run_id"), false);
  assert.equal(FEATURE_KEYS.includes("ground_truth_type"), false);
});

test("buildFeatureRow supports missing nested metadata and top-level fallback", () => {
  const nestedMissing = buildFeatureRow(createSummary({ research_metadata: undefined, source: "real" }), 1);
  assert.equal(nestedMissing.source, "real");
  assert.equal(nestedMissing.generation_run_id, null);
  assert.equal(nestedMissing.ground_truth_type, null);
});

test("readFeatureRowsFromJsonl fails on malformed json and invalid summaries with line numbers", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "sessions.jsonl");
  writeJsonl(input, [JSON.stringify(createSummary()), "{bad json"]);
  await assert.rejects(() => readFeatureRowsFromJsonl(input), /line 2: invalid JSON/);

  writeJsonl(input, [JSON.stringify(createSummary({ site_id: "" }))]);
  await assert.rejects(() => readFeatureRowsFromJsonl(input), /line 1: missing site_id/);
});

test("readFeatureRowsFromJsonl skips invalid summaries and duplicate keys with skipInvalid", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "sessions.jsonl");
  writeJsonl(input, [
    JSON.stringify(createSummary({ session_id: "s1" })),
    JSON.stringify(createSummary({ session_id: "s1" })),
    JSON.stringify(createSummary({ session_id: "s2", site_id: "" })),
    JSON.stringify(createSummary({ session_id: "s3", site_id: "site_b" })),
  ]);

  const result = await readFeatureRowsFromJsonl(input, { skipInvalid: true });
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows.map((row) => `${row.site_id}:${row.session_id}`), ["site_a:s1", "site_b:s3"]);
  assert.equal(result.stats.invalid_sessions, 2);
  assert.equal(result.stats.skipped_sessions, 2);
});

test("CSV serializer keeps header order and escapes commas quotes and newlines", () => {
  const csv = serializeFeatureRowsCsv([
    buildFeatureRow(createSummary({ research_metadata: { source: 'syn,thetic"x\n', generation_run_id: null, ground_truth_type: null } }), 1),
  ]);
  const [header, line] = csv.trimEnd().split("\n");
  assert.equal(header, ["site_id", "session_id", "source", "generation_run_id", "ground_truth_type", "feature_schema_version", ...FEATURE_KEYS].join(","));
  assert.equal(line.includes('"syn,thetic""x'), true);
  assert.equal(escapeCsvField(null), "");
});

test("JSONL serializer is deterministic and keeps one object per line", () => {
  const rows = [
    buildFeatureRow(createSummary({ site_id: "site_a", session_id: "s1" }), 1),
    buildFeatureRow(createSummary({ site_id: "site_b", session_id: "s2" }), 2),
  ];
  const first = serializeFeatureRowsJsonl(rows);
  const second = serializeFeatureRowsJsonl(rows);
  assert.equal(first, second);
  assert.equal(first.trim().split("\n").length, 2);
});

test("buildDatasetManifest is deterministic and omits absolute paths", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "sessions.jsonl");
  writeJsonl(input, [JSON.stringify(createSummary())]);
  const sha = await hashFileSha256(input);
  const manifest = buildDatasetManifest(input, sha, [buildFeatureRow(createSummary(), 1)], 0, "both");
  assert.equal(manifest.dataset_schema_version, 1);
  assert.equal(manifest.feature_schema_version, FEATURE_SCHEMA_VERSION);
  assert.deepEqual(manifest.feature_keys, FEATURE_KEYS);
  assert.equal(manifest.input_file, "sessions.jsonl");
  assert.equal(manifest.input_file.includes(dir), false);
  assert.equal(typeof manifest.source_counts.synthetic, "number");
  assert.equal(typeof manifest.label_counts.price_sensitive, "number");
});

test("exportFeatureDataset writes csv jsonl and manifest deterministically", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "sessions.jsonl");
  const outputDir = path.join(dir, "features");
  writeJsonl(input, [JSON.stringify(createSummary({ session_id: "s2", site_id: "site_b" })), JSON.stringify(createSummary({ session_id: "s1", site_id: "site_a" }))]);

  const first = await exportFeatureDataset(input, outputDir, { format: "both" });
  const csvPath = path.join(outputDir, "session-features.csv");
  const jsonlPath = path.join(outputDir, "session-features.jsonl");
  const manifestPath = path.join(outputDir, "session-features.manifest.json");
  const firstCsv = fs.readFileSync(csvPath, "utf8");
  const firstJsonl = fs.readFileSync(jsonlPath, "utf8");
  const firstManifest = fs.readFileSync(manifestPath, "utf8");

  const second = await exportFeatureDataset(input, outputDir, { format: "both" });
  assert.equal(fs.readFileSync(csvPath, "utf8"), firstCsv);
  assert.equal(fs.readFileSync(jsonlPath, "utf8"), firstJsonl);
  assert.equal(fs.readFileSync(manifestPath, "utf8"), firstManifest);
  assert.equal(first.rows.length, 2);
  assert.equal(second.stats.exported_rows, 2);
});

test("end-to-end raw events to feature dataset keeps metadata and 19 features", async (t) => {
  const dir = makeTempDir(t);
  const rawInput = path.join(dir, "raw", "events.jsonl");
  const sessionsOutput = path.join(dir, "processed", "sessions.jsonl");
  const featureOutput = path.join(dir, "features");
  writeJsonl(rawInput, [
    JSON.stringify({ site_id: "site_a", session_id: "s1", event_name: "page_view", ts: 100, path: "/", source: "synthetic", generation_run_id: "gen_1", ground_truth_type: "price_sensitive" }),
    JSON.stringify({ site_id: "site_a", session_id: "s1", event_name: "filter_change", ts: 150, path: "/collection", source: "synthetic", generation_run_id: "gen_1", ground_truth_type: "price_sensitive" }),
    JSON.stringify({ site_id: "site_b", session_id: "s2", event_name: "page_view", ts: 200, path: "/", source: "real" }),
  ]);

  const built = await buildSessionSummariesFromFile(rawInput);
  writeSessionSummariesJsonl(sessionsOutput, built.summaries);
  const exported = await exportFeatureDataset(sessionsOutput, featureOutput, { format: "both" });
  const rows = exported.rows;
  assert.equal(rows.length, built.summaries.length);
  assert.equal(FEATURE_KEYS.every((key) => Object.prototype.hasOwnProperty.call(rows[0], key)), true);
  assert.equal(rows[0].ground_truth_type !== undefined, true);
  assert.equal(FEATURE_KEYS.includes("ground_truth_type"), false);
  assert.equal(exported.manifest.input_sha256.length, 64);
});

test("assertNoFeatureLeakage passes for current schema", () => {
  assert.equal(assertNoFeatureLeakage(), undefined);
});
