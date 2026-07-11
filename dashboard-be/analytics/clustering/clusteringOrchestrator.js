const { normalizeAll, extractRawVector, FEATURE_KEYS, applyNorm, computeRawMean } = require("./featureExtractor");
const { stableKMeans, findOptimalK, nearestCentroidIdx }                         = require("./kmeans");
const { mapClustersToTaxonomy, findDeprecated }                                   = require("./taxonomyMapper");
const { buildFeatureProfile, nameCluster, resolveMappingDecision }                = require("./llmNamer");
const {
  saveTaxonomy, loadTaxonomy,
  saveNormParams,
  getLastClusteredCount, saveLastClusteredCount,
} = require("./clusterStore");

// ─── Constants ────────────────────────────────────────────────────────────────

const COLD_START_THRESHOLD = 100; // 최초 클러스터링에 필요한 최소 세션 수
const INITIAL_K            = 4;   // cold start 시 사용할 K (탐색범위 x 몰입강도, 4개 피처 기준)
const RECLUSTER_RATIO      = 2.0; // 마지막 클러스터링 이후 세션 수가 N배 되면 재실행
const RECLUSTER_MIN_K      = 3;
const RECLUSTER_MAX_K      = 5;   // 피처가 4개뿐이라 과도하게 쪼개지 않도록 상한을 낮춘다

// ─── Trigger Logic ────────────────────────────────────────────────────────────

function shouldRecluster(lastCount, currentCount) {
  if (lastCount === 0) return currentCount >= COLD_START_THRESHOLD;
  return currentCount >= lastCount * RECLUSTER_RATIO;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// normalized centroid → raw centroid (LLM 프롬프트용)
function denormalizeCentroid(centroid, normParams) {
  return centroid.map((v, i) => v * normParams.ranges[i] + normParams.mins[i]);
}

// 이미 사용된 이름과 충돌하지 않도록 suffix 를 붙인다
function deduplicateName(name, usedNames) {
  let unique = name;
  let suffix = 2;
  while (usedNames.has(unique)) unique = `${name} ${suffix++}`;
  return unique;
}

// ─── Main Orchestration ───────────────────────────────────────────────────────
// sessionStates: Redis 에서 로드한 session state 객체 배열
// callLlm: async ({ system, user }) => { content: string }

async function runClustering(sessionStates, siteId, redisRuntime, callLlm, opts = {}) {
  if (sessionStates.length < COLD_START_THRESHOLD) {
    return { skipped: true, reason: "insufficient_data", count: sessionStates.length };
  }

  const { vectors, normParams } = normalizeAll(sessionStates);
  const globalRawMean           = computeRawMean(sessionStates);
  const existingTaxonomy        = (await loadTaxonomy(redisRuntime, siteId)) || {};
  const isFirstRun              = Object.keys(existingTaxonomy).length === 0;

  // K 결정: 첫 실행은 INITIAL_K 고정, 재클러스터링은 Elbow+Silhouette 로 탐색
  const chosenK = opts.forceK
    || (isFirstRun ? INITIAL_K : findOptimalK(vectors, RECLUSTER_MIN_K, RECLUSTER_MAX_K).chosenK);

  const clusterResult = stableKMeans(vectors, chosenK);
  const newCentroids  = clusterResult.centroids;
  const mappings      = mapClustersToTaxonomy(newCentroids, existingTaxonomy);

  const nextTaxonomy = {};
  const assignedNames = new Set();

  for (let ci = 0; ci < newCentroids.length; ci++) {
    const centroid     = newCentroids[ci];
    const rawCentroid  = denormalizeCentroid(centroid, normParams);
    const featureProfile = buildFeatureProfile(rawCentroid, globalRawMean);
    const mapping      = mappings[ci];
    let   finalName;

    if (mapping.type === "existing") {
      finalName = mapping.matchedName;
    } else if (mapping.type === "ambiguous") {
      const decision = await resolveMappingDecision({
        featureProfile,
        candidateName: mapping.matchedName,
        sim: mapping.sim,
        callLlm,
      });
      finalName = decision.name;
    } else {
      // 완전히 새로운 클러스터
      const existingNames = [...Object.keys(nextTaxonomy), ...Object.keys(existingTaxonomy)];
      const { name } = await nameCluster({ featureProfile, existingNames, callLlm });
      finalName = name;
    }

    const uniqueName = deduplicateName(finalName, assignedNames);
    assignedNames.add(uniqueName);

    nextTaxonomy[uniqueName] = {
      centroid,
      rawCentroid,
      status:       "active",
      clusterIndex: ci,
      updatedAt:    Date.now(),
    };
  }

  // 아무 새 클러스터도 매핑하지 못한 기존 유형을 deprecated 로 마킹
  const deprecated = findDeprecated(existingTaxonomy, mappings);
  for (const name of deprecated) {
    nextTaxonomy[name] = {
      ...existingTaxonomy[name],
      status:       "deprecated",
      deprecatedAt: Date.now(),
    };
  }

  await saveTaxonomy(redisRuntime, siteId, nextTaxonomy);
  await saveNormParams(redisRuntime, siteId, normParams);
  await saveLastClusteredCount(redisRuntime, siteId, sessionStates.length);

  return {
    skipped:    false,
    k:          chosenK,
    taxonomy:   nextTaxonomy,
    deprecated,
  };
}

module.exports = {
  runClustering,
  shouldRecluster,
  COLD_START_THRESHOLD,
  INITIAL_K,
};
