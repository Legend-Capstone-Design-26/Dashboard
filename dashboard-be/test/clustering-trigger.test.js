const test = require("node:test");
const assert = require("node:assert/strict");

const { COLD_START_THRESHOLD, isEligibleSessionSummary } = require("../analytics/clustering/clusteringOrchestrator");
const { triggerHistoricalClustering } = require("../workers/clustering-trigger");
const { makeSummary } = require("./clustering-test-helpers");

test("historical clustering trigger does not call listSessionStates", async () => {
  const summaries = Array.from({ length: COLD_START_THRESHOLD }, (_, index) => makeSummary({ session_id: `s${index}` }));
  let clustered = false;
  const result = await triggerHistoricalClustering({
    siteId: "site_a",
    redisRuntime: {},
    redisSessionStore: {
      async listHistoricalSessionSummaries() { return summaries; },
      async listSessionStates() { throw new Error("listSessionStates must not be called"); },
    },
    incrementSessionCount: async () => 1,
    getLastClusteredCount: async () => 0,
    shouldRecluster: () => true,
    isEligibleSessionSummary,
    runClustering: (loaded) => {
      clustered = true;
      assert.equal(loaded, summaries);
      return Promise.resolve({ skipped: false, k: 2, taxonomy: { "반복 탐색형": {} } });
    },
    makeLlmAdapter: () => async () => ({ content: "{}" }),
    logger: { log() {}, warn(error) { throw error; } },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.triggered, true);
  assert.equal(result.current, COLD_START_THRESHOLD);
  assert.equal(clustered, true);
});
