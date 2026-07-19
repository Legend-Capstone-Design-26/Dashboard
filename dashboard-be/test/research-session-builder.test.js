const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { mergeSessionState } = require("../services/analytics/session-state");
const { normalizeHistoricalSessionSummary } = require("../services/stores/redis-session-store");
const { extractRawVector, FEATURE_KEYS } = require("../analytics/clustering/featureExtractor");
const {
  buildHistoricalSummaryRecord,
  buildSessionSummariesFromFile,
  mergeResearchMetadata,
  readAndGroupEventsFromJsonl,
  resolveBuilderPath,
  sortSessionEvents,
  validateFeatureCompatibility,
  writeSessionSummariesJsonl,
} = require("../services/research/session-builder");

function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uxsdk-session-builder-"));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function writeJsonl(filePath, lines) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function event(record) {
  return JSON.stringify(record);
}

test("readAndGroupEventsFromJsonl ignores blank lines and groups by site_id plus session_id", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "events.jsonl");
  writeJsonl(input, [
    event({ site_id: "site_a", session_id: "s1", event_name: "page_view", ts: 1, path: "/" }),
    "",
    event({ site_id: "site_b", session_id: "s1", event_name: "page_view", ts: 2, path: "/" }),
    event({ site_id: "site_a", session_id: "s1", event_name: "click", ts: 3, path: "/product", props: { element_id: "buy" } }),
  ]);

  const result = await readAndGroupEventsFromJsonl(input);
  assert.equal(result.stats.input_lines, 4);
  assert.equal(result.stats.parsed_events, 3);
  assert.equal(result.sessions.length, 2);
  const siteA = result.sessions.find((item) => item.site_id === "site_a");
  assert.equal(siteA.input_event_count, 2);
});

test("readAndGroupEventsFromJsonl fails on malformed JSON with line number", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "events.jsonl");
  writeJsonl(input, [event({ site_id: "site_a", session_id: "s1", event_name: "page_view", ts: 1 }), "{bad json"]);
  await assert.rejects(() => readAndGroupEventsFromJsonl(input), /line 2: invalid JSON/);
});

test("readAndGroupEventsFromJsonl skips malformed and invalid events with skipInvalid", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "events.jsonl");
  writeJsonl(input, [
    event({ site_id: "site_a", session_id: "s1", event_name: "page_view", ts: 1 }),
    event({ site_id: "site_a", event_name: "page_view", ts: 2 }),
    "{bad json",
    event({ site_id: "site_a", session_id: "s1", event_name: "click", received_at: 3 }),
  ]);

  const result = await readAndGroupEventsFromJsonl(input, { skipInvalid: true });
  assert.equal(result.stats.parsed_events, 2);
  assert.equal(result.stats.invalid_lines, 2);
  assert.equal(result.stats.skipped_events, 2);
  assert.equal(result.sessions[0].events.length, 2);
});

test("sortSessionEvents orders by timestamp then received_at then original line number", () => {
  const ordered = sortSessionEvents([
    { event_name: "c", ts: 100, __received_at_sort: 200, __line_number: 3 },
    { event_name: "a", ts: 100, __received_at_sort: 100, __line_number: 2 },
    { event_name: "b", ts: 100, __received_at_sort: 100, __line_number: 1 },
  ]);
  assert.deepEqual(ordered.map((item) => item.event_name), ["b", "a", "c"]);
});

test("buildHistoricalSummaryRecord replays session state and preserves repeated path_sequence", () => {
  const summary = buildHistoricalSummaryRecord({
    site_id: "legend-ecommerce",
    session_id: "s1",
    input_event_count: 5,
    research_metadata: { source: "synthetic", ground_truth_type: "checkout_abandoner" },
    events: [
      { site_id: "legend-ecommerce", session_id: "s1", event_name: "page_view", path: "/", ts: 100, __received_at_sort: 100, __line_number: 1, props: {} },
      { site_id: "legend-ecommerce", session_id: "s1", event_name: "page_view", path: "/product/1", ts: 200, __received_at_sort: 200, __line_number: 2, props: {} },
      { site_id: "legend-ecommerce", session_id: "s1", event_name: "click", path: "/product/1", ts: 200, received_at: 205, __received_at_sort: 205, __line_number: 3, props: { element_id: "add_to_cart_btn" } },
      { site_id: "legend-ecommerce", session_id: "s1", event_name: "checkout_start", path: "/checkout", ts: 300, __received_at_sort: 300, __line_number: 4, props: {} },
      { site_id: "legend-ecommerce", session_id: "s1", event_name: "dwell_time", path: "/checkout", ts: 400, __received_at_sort: 400, __line_number: 5, props: { dwell_ms: 2500 } },
    ],
  });

  assert.equal(summary.site_id, "legend-ecommerce");
  assert.equal(summary.session_id, "s1");
  assert.equal(summary.input_event_count, 5);
  assert.equal(summary.event_count, 5);
  assert.equal(summary.page_view_count, 2);
  assert.equal(summary.cart_add_count, 1);
  assert.equal(summary.checkout_entered, true);
  assert.equal(summary.checkout_complete, false);
  assert.equal(summary.dwell_total_ms, 2500);
  assert.deepEqual(summary.path_sequence, ["/", "/product/1", "/product/1", "/checkout", "/checkout"]);
  assert.deepEqual(summary.research_metadata, { source: "synthetic", ground_truth_type: "checkout_abandoner" });
});

test("mergeResearchMetadata preserves matching metadata and rejects conflicts", () => {
  assert.deepEqual(
    mergeResearchMetadata({ source: "synthetic" }, { source: "synthetic", generation_run_id: "run_1" }, 3),
    { source: "synthetic", generation_run_id: "run_1" }
  );
  assert.throws(() => mergeResearchMetadata({ source: "synthetic" }, { source: "browser" }, 4), /line 4: conflicting research metadata for source/);
});

test("buildSessionSummariesFromFile produces deterministic summaries and validates feature parity", async (t) => {
  const dir = makeTempDir(t);
  const input = path.join(dir, "events.jsonl");
  writeJsonl(input, [
    event({ site_id: "site_b", session_id: "s2", event_name: "page_view", ts: 50, path: "/", source: "synthetic", generation_run_id: "run_2" }),
    event({ site_id: "site_a", session_id: "s1", event_name: "click", path: "/product/1", ts: 200, received_at: 205, props: { element_id: "add_to_cart_btn" }, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" }),
    event({ site_id: "site_a", session_id: "s1", event_name: "page_view", path: "/", ts: 100, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" }),
    event({ site_id: "site_a", session_id: "s1", event_name: "checkout_start", path: "/checkout", ts: 300, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" }),
    event({ site_id: "site_a", session_id: "s1", event_name: "checkout_complete", path: "/order-complete", ts: 500, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" }),
    event({ site_id: "site_a", session_id: "s1", event_name: "dwell_time", path: "/checkout", ts: 400, props: { dwell_ms: 1200 }, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" }),
  ]);

  const result = await buildSessionSummariesFromFile(input);
  assert.equal(result.stats.session_count, 2);
  assert.equal(result.stats.feature_compatible_sessions, 2);
  assert.equal(result.stats.feature_failed_sessions, 0);
  assert.deepEqual(result.summaries.map((item) => `${item.site_id}:${item.session_id}`), ["site_a:s1", "site_b:s2"]);

  const summary = result.summaries[0];
  const replayState = sortSessionEvents([
    { site_id: "site_a", session_id: "s1", event_name: "page_view", path: "/", ts: 100, __received_at_sort: 100, __line_number: 3, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" },
    { site_id: "site_a", session_id: "s1", event_name: "click", path: "/product/1", ts: 200, received_at: 205, __received_at_sort: 205, __line_number: 2, props: { element_id: "add_to_cart_btn" }, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" },
    { site_id: "site_a", session_id: "s1", event_name: "checkout_start", path: "/checkout", ts: 300, __received_at_sort: 300, __line_number: 4, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" },
    { site_id: "site_a", session_id: "s1", event_name: "dwell_time", path: "/checkout", ts: 400, __received_at_sort: 400, __line_number: 6, props: { dwell_ms: 1200 }, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" },
    { site_id: "site_a", session_id: "s1", event_name: "checkout_complete", path: "/order-complete", ts: 500, __received_at_sort: 500, __line_number: 5, source: "synthetic", generation_run_id: "run_1", ground_truth_type: "checkout_abandoner" },
  ]).reduce((state, current) => mergeSessionState(state, current), null);
  const normalizedReplay = normalizeHistoricalSessionSummary(replayState);
  assert.equal(summary.page_view_count, normalizedReplay.page_view_count);
  assert.equal(summary.cart_add_count, normalizedReplay.cart_add_count);
  assert.equal(summary.checkout_complete, normalizedReplay.checkout_complete);
  assert.deepEqual(summary.path_sequence, normalizedReplay.path_sequence);

  const vectorWithMetadata = validateFeatureCompatibility(summary);
  const { research_metadata, ...withoutMetadata } = summary;
  const vectorWithoutMetadata = extractRawVector(withoutMetadata);
  assert.equal(vectorWithMetadata.length, FEATURE_KEYS.length);
  assert.deepEqual(vectorWithMetadata, vectorWithoutMetadata);
});

test("writeSessionSummariesJsonl replaces output deterministically", (t) => {
  const dir = makeTempDir(t);
  const output = path.join(dir, "processed", "sessions.jsonl");
  const summaries = [
    { site_id: "site_a", session_id: "s1", input_event_count: 1 },
    { site_id: "site_b", session_id: "s2", input_event_count: 2 },
  ];

  writeSessionSummariesJsonl(output, summaries);
  const first = fs.readFileSync(output, "utf8");
  writeSessionSummariesJsonl(output, summaries);
  const second = fs.readFileSync(output, "utf8");
  assert.equal(first, second);
  assert.equal(second.trim().split("\n").length, 2);
});

test("resolveBuilderPath anchors defaults to dashboard-be", () => {
  const resolved = resolveBuilderPath(undefined, "data/research/processed/sessions.jsonl");
  assert.equal(resolved.endsWith(path.join("dashboard-be", "data", "research", "processed", "sessions.jsonl")), true);
});
