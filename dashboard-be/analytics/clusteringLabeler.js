const { labelSessionSummary }          = require("./labeler");
const { extractRawVector, applyNorm }  = require("./clustering/featureExtractor");
const { nearestCentroidIdx }           = require("./clustering/kmeans");
const { loadTaxonomy, loadNormParams } = require("./clustering/clusterStore");

// ─── Session State → Summary Adapter ─────────────────────────────────────────
// rule-base fallback 을 위해 Redis session state 를 labeler.js 가
// 요구하는 sessionSummary 형태로 변환한다.

function toSummaryLike(state) {
  const duration_ms = (typeof state.last_ts === "number" && typeof state.started_at === "number")
    ? Math.max(0, state.last_ts - state.started_at)
    : 0;

  return {
    duration_ms,
    page_views:              state.page_view_count         || 0,
    clicks:                  state.click_count             || 0,
    depth:                   Array.isArray(state.paths) ? state.paths.length : 0,
    dwell_total_ms:          state.dwell_total_ms          || 0,
    error_count:             state.error_count             || 0,
    rage_clicks_count:       0,
    price_interaction_count: state.price_interaction_count || 0,
    filter_count:            state.filter_count            || 0,
    search_count:            state.search_count            || 0,
    cart_add_count:          state.cart_add_count          || 0,
    cart_remove_count:       state.cart_remove_count       || 0,
    payment_attempt_count:   state.payment_attempt_count   || 0,
    checkout_entered:        Boolean(state.checkout_started),
    checkout_complete:       Boolean(state.checkout_completed),
    max_step:                state.max_step || "home",
    evidence:                [],
  };
}

// ─── Cluster Assignment (Phase 3) ─────────────────────────────────────────────
// 정규화된 피처 벡터와 taxonomy centroid 간 유클리디안 거리로 클러스터를 배정한다.
// 이 연산은 단순 수식이므로 Node.js 에서 직접 수행해 Python 호출 오버헤드를 없앤다.

function assignToCluster(sessionState, taxonomy, normParams) {
  const activeEntries = Object.entries(taxonomy)
    .filter(([, entry]) => entry.status === "active" && Array.isArray(entry.centroid));

  if (activeEntries.length === 0) return null;

  const rawVector  = extractRawVector(sessionState);
  const normVector = applyNorm(rawVector, normParams);
  const centroids  = activeEntries.map(([, e]) => e.centroid);
  const idx        = nearestCentroidIdx(normVector, centroids);
  const [name]     = activeEntries[idx];
  return name;
}

// ─── Factory ──────────────────────────────────────────────────────────────────
// redisRuntime 을 주입받아 taxonomy / normParams 를 조회한다.
// taxonomy 가 없으면 Phase 1(rule-base fallback), 있으면 Phase 3(클러스터 배정).

function createClusteringLabeler({ redisRuntime }) {
  // 매 이벤트마다 Redis 를 조회하지 않도록 5분 캐시
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const cache = new Map(); // siteId → { taxonomy, normParams, ts }

  async function getClusteringState(siteId) {
    const cached = cache.get(siteId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { taxonomy: cached.taxonomy, normParams: cached.normParams };
    }

    const [taxonomy, normParams] = await Promise.all([
      loadTaxonomy(redisRuntime, siteId),
      loadNormParams(redisRuntime, siteId),
    ]);

    cache.set(siteId, { taxonomy, normParams, ts: Date.now() });
    return { taxonomy, normParams };
  }

  async function labelSession(sessionState) {
    const siteId = sessionState?.site_id;
    if (!siteId) return { label: "unknown", source: "no_site_id" };

    const { taxonomy, normParams } = await getClusteringState(siteId);

    // Phase 3: taxonomy 가 준비된 경우 클러스터 배정
    if (taxonomy && normParams) {
      const clusterName = assignToCluster(sessionState, taxonomy, normParams);
      if (clusterName) return { label: clusterName, source: "clustering" };
    }

    // Phase 1 fallback: rule-base labeler
    const summary    = toSummaryLike(sessionState);
    const ruleResult = labelSessionSummary(summary);
    return {
      label:      ruleResult.label,
      confidence: ruleResult.confidence,
      source:     "rule_base",
    };
  }

  // 외부에서 캐시를 강제 무효화할 수 있도록 노출한다 (재클러스터링 후 즉시 반영용)
  function invalidateCache(siteId) {
    if (siteId) cache.delete(siteId);
    else cache.clear();
  }

  return { labelSession, invalidateCache };
}

module.exports = { createClusteringLabeler };
