const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeRedisRuntime, makeSummary } = require("./clustering-test-helpers");
const { runClustering, shouldRecluster, COLD_START_THRESHOLD, isEligibleSessionSummary } = require("../analytics/clustering/clusteringOrchestrator");
const { loadTaxonomy, loadNormParams, getLastClusteredCount, v2Keys } = require("../analytics/clustering/clusterStore");

function makeTrainingSet(count) {
  return Array.from({ length: count }, (_, index) => makeSummary({
    session_id: `s${index}`,
    path_sequence: index % 2 === 0 ? ["/", "/product", "/cart", "/checkout"] : ["/", "/search", "/product", "/search"],
    paths: index % 2 === 0 ? ["/", "/product", "/cart", "/checkout"] : ["/", "/search", "/product"],
    event_count: 5 + index,
    page_view_count: 3 + (index % 4),
    click_count: 2 + (index % 8),
    price_interaction_count: index % 2,
    checkout_started: index % 2 === 0,
    max_step: index % 2 === 0 ? "checkout" : "product",
  }));
}

test("runClustering trains from historical-style summaries and persists v2 taxonomy", async () => {
  const runtime = createFakeRedisRuntime();
  const result = await runClustering(makeTrainingSet(COLD_START_THRESHOLD), "site_a", runtime, async () => ({
    content: JSON.stringify({ name: "반복 탐색형", reason: "반복 탐색", dominant_signals: ["반복"] }),
  }), { forceK: 2, seed: 11 });

  assert.equal(result.skipped, false);
  assert.equal(result.count, COLD_START_THRESHOLD);
  assert.equal((await loadTaxonomy(runtime, "site_a")).schemaVersion, 2);
  assert.equal((await loadNormParams(runtime, "site_a")).schemaVersion, 2);
  assert.equal(await getLastClusteredCount(runtime, "site_a"), COLD_START_THRESHOLD);
  assert.equal(Boolean(runtime.data.get(v2Keys.taxonomy("site_a"))), true);
});

test("shouldRecluster uses eligible historical count semantics", () => {
  assert.equal(shouldRecluster(0, COLD_START_THRESHOLD - 1), false);
  assert.equal(shouldRecluster(0, COLD_START_THRESHOLD), true);
  assert.equal(shouldRecluster(100, 199), false);
  assert.equal(shouldRecluster(100, 200), true);
});

test("empty historical summaries are not v2-eligible and do not train", async () => {
  assert.equal(isEligibleSessionSummary({}), false);
  assert.equal(isEligibleSessionSummary({ session_id: "empty", started_at: 1000 }), false);
  assert.equal(isEligibleSessionSummary(makeSummary({ session_id: "real", started_at: 1000 })), true);

  const runtime = createFakeRedisRuntime();
  const summaries = [
    ...Array.from({ length: COLD_START_THRESHOLD }, (_, index) => ({ session_id: `empty${index}`, started_at: 1000 + index })),
    ...makeTrainingSet(COLD_START_THRESHOLD - 1),
  ];
  const result = await runClustering(summaries, "site_a", runtime, async () => ({
    content: JSON.stringify({ name: "반복 탐색형", reason: "반복 탐색", dominant_signals: ["반복"] }),
  }), { forceK: 2, seed: 11 });

  assert.equal(result.skipped, true);
  assert.equal(result.count, COLD_START_THRESHOLD - 1);
  assert.equal(await getLastClusteredCount(runtime, "site_a"), 0);
});
