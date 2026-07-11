const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FEATURE_SCHEMA_VERSION,
  FEATURE_KEYS,
  FEATURE_LABELS,
  extractRawVector,
  normalizeAll,
  applyNorm,
  getPathSequence,
} = require("../analytics/clustering/featureExtractor");

test("feature extractor exposes stable v2 schema metadata", () => {
  assert.equal(FEATURE_SCHEMA_VERSION, 2);
  assert.deepEqual(FEATURE_KEYS, [
    "path_depth",
    "path_diversity",
    "oscillation_rate",
    "backtrack_rate",
    "transition_count",
    "page_view_intensity",
    "click_intensity",
    "event_intensity",
    "dwell_per_page",
    "error_friction",
    "search_count",
    "filter_count",
    "price_interaction_count",
    "cart_add_count",
    "cart_remove_count",
    "payment_attempt_count",
    "checkout_entered",
    "checkout_complete",
    "max_step_index",
  ]);
  assert.equal(FEATURE_LABELS.path_depth, "방문 경로 깊이");
});

test("feature extractor prefers path_sequence and falls back to paths", () => {
  const withSequence = { path_sequence: ["/p", "/c", "/p"], paths: ["/p", "/c"] };
  assert.deepEqual(getPathSequence(withSequence), ["/p", "/c", "/p"]);
  assert.deepEqual(getPathSequence({ paths: ["/old"] }), ["/old"]);

  const vector = extractRawVector({
    ...withSequence,
    page_view_count: 3,
    click_count: 4,
    event_count: 8,
    dwell_total_ms: 90000,
    error_count: 1,
    search_count: 2,
    filter_count: 1,
    price_interaction_count: 3,
    cart_add_count: 1,
    payment_attempt_count: 1,
    checkout_started: true,
    max_step: "checkout",
  });
  assert.equal(vector.length, FEATURE_KEYS.length);
  assert.equal(vector.every(Number.isFinite), true);
  assert.equal(vector[FEATURE_KEYS.indexOf("oscillation_rate")], 1);
});

test("normalizeAll and applyNorm keep v2 length and clamp values", () => {
  const { vectors, normParams } = normalizeAll([
    { paths: ["/"], event_count: 1 },
    { paths: ["/", "/p", "/c"], event_count: 10, checkout_completed: true, max_step: "payment" },
  ]);
  assert.equal(normParams.schemaVersion, 2);
  assert.equal(vectors.every((vector) => vector.length === FEATURE_KEYS.length), true);
  const normalized = applyNorm(extractRawVector({ paths: ["/", "/x"], event_count: 9999 }), normParams);
  assert.equal(normalized.every((value) => value >= 0 && value <= 1), true);
});

test("feature extractor returns finite defaults for empty input", () => {
  const vector = extractRawVector({});
  assert.equal(vector.length, FEATURE_KEYS.length);
  assert.equal(vector.every((value) => Number.isFinite(value) && value === 0), true);
});
