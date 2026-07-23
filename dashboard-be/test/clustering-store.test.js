const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeRedisRuntime } = require("./clustering-test-helpers");
const { FEATURE_SCHEMA_VERSION, FEATURE_KEYS, buildNormParams } = require("../analytics/clustering/featureExtractor");
const { saveTaxonomy, loadTaxonomy, saveNormParams, loadNormParams, saveLastClusteredCount, getLastClusteredCount, keys, v2Keys } = require("../analytics/clustering/clusterStore");

test("clusterStore writes v2 keys without overwriting v1 keys", async () => {
  const runtime = createFakeRedisRuntime({
    [keys.taxonomy("site_a")]: JSON.stringify({ legacy: { status: "active", centroid: [0, 1, 2, 3] } }),
  });
  const taxonomy = { schemaVersion: FEATURE_SCHEMA_VERSION, featureKeys: [...FEATURE_KEYS], "반복 탐색형": { status: "active", centroid: new Array(FEATURE_KEYS.length).fill(0), clusterIndex: 0 } };
  await saveTaxonomy(runtime, "site_a", taxonomy);
  await saveNormParams(runtime, "site_a", buildNormParams([new Array(FEATURE_KEYS.length).fill(0)]));
  await saveLastClusteredCount(runtime, "site_a", 101);

  assert.deepEqual(await loadTaxonomy(runtime, "site_a"), taxonomy);
  assert.equal(Boolean(runtime.data.get(keys.taxonomy("site_a"))), true);
  assert.equal(Boolean(runtime.data.get(v2Keys.taxonomy("site_a"))), true);
  assert.equal((await loadNormParams(runtime, "site_a")).schemaVersion, 2);
  assert.equal(await getLastClusteredCount(runtime, "site_a"), 101);
});
