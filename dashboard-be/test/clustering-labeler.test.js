const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeRedisRuntime, makeSummary } = require("./clustering-test-helpers");
const { FEATURE_SCHEMA_VERSION, FEATURE_KEYS, buildNormParams, extractRawVector } = require("../analytics/clustering/featureExtractor");
const { saveTaxonomy, saveNormParams, keys } = require("../analytics/clustering/clusterStore");
const { createClusteringLabeler } = require("../analytics/clusteringLabeler");

test("labeler assigns with matching v2 taxonomy and falls back on mismatched v1", async () => {
  const session = makeSummary({ path_sequence: ["/", "/product", "/cart", "/checkout"], checkout_started: true, max_step: "checkout" });
  const runtime = createFakeRedisRuntime();
  const rawVector = extractRawVector(session);
  const normParams = buildNormParams([rawVector]);
  const taxonomy = { schemaVersion: FEATURE_SCHEMA_VERSION, featureKeys: [...FEATURE_KEYS], "결제 이탈형": { status: "active", centroid: new Array(FEATURE_KEYS.length).fill(0), clusterIndex: 0 } };

  await saveTaxonomy(runtime, "site_a", taxonomy);
  await saveNormParams(runtime, "site_a", normParams);
  const labeler = createClusteringLabeler({ redisRuntime: runtime });
  assert.deepEqual(await labeler.labelSession(session), { label: "결제 이탈형", source: "clustering" });

  const legacyRuntime = createFakeRedisRuntime({
    [keys.taxonomy("site_a")]: JSON.stringify({ legacy: { status: "active", centroid: [0, 0, 0, 0], clusterIndex: 0 } }),
    [keys.normParams("site_a")]: JSON.stringify({ mins: [0, 0, 0, 0], ranges: [1, 1, 1, 1] }),
  });
  const fallback = await createClusteringLabeler({ redisRuntime: legacyRuntime }).labelSession(session);
  assert.equal(fallback.source, "rule_base");
});

test("labeler falls back when v2 taxonomy has wrong-length active centroid", async () => {
  const session = makeSummary({ path_sequence: ["/", "/product", "/cart", "/checkout"], checkout_started: true, max_step: "checkout" });
  const runtime = createFakeRedisRuntime();
  const normParams = buildNormParams([extractRawVector(session)]);
  const taxonomy = {
    schemaVersion: FEATURE_SCHEMA_VERSION,
    featureKeys: [...FEATURE_KEYS],
    "깨진 유형": { status: "active", centroid: [0, 0, 0], clusterIndex: 0 },
  };

  await saveTaxonomy(runtime, "site_a", taxonomy);
  await saveNormParams(runtime, "site_a", normParams);
  const fallback = await createClusteringLabeler({ redisRuntime: runtime }).labelSession(session);
  assert.equal(fallback.source, "rule_base");
});
