// ─── Feature Definition ───────────────────────────────────────────────────────
// session-state.js 가 Redis 에 저장하는 필드를 클러스터링 피처 벡터로 변환한다.
// 필드 순서가 centroid 벡터 인덱스와 1:1 대응되므로 변경 시 저장된 taxonomy 를 무효화해야 한다.

const FEATURE_KEYS = [
  "duration_ms",            // last_ts - started_at
  "page_view_count",
  "click_count",
  "depth",                  // paths 배열 길이
  "dwell_total_ms",
  "error_count",
  "price_interaction_count",
  "filter_count",
  "search_count",
  "cart_add_count",
  "cart_remove_count",
  "wishlist_count",
  "payment_attempt_count",
  "checkout_started",       // boolean → 0 / 1
  "checkout_completed",     // boolean → 0 / 1
];


// ─── Vector Extraction ────────────────────────────────────────────────────────

function extractRawVector(state) {
  const duration = (typeof state.last_ts    === "number" && typeof state.started_at === "number")
    ? Math.max(0, state.last_ts - state.started_at)
    : 0;

  const depth = Array.isArray(state.paths) ? state.paths.length : 0;

  return FEATURE_KEYS.map((key) => {
    if (key === "duration_ms")      return duration;
    if (key === "depth")            return depth;
    if (key === "checkout_started")  return state.checkout_started  ? 1 : 0;
    if (key === "checkout_completed") return state.checkout_completed ? 1 : 0;
    return Number(state[key]) || 0;
  });
}

// ─── Normalization ────────────────────────────────────────────────────────────

function buildNormParams(rawVectors) {
  const dim  = FEATURE_KEYS.length;
  const mins = new Array(dim).fill(Infinity);
  const maxs = new Array(dim).fill(-Infinity);

  for (const vec of rawVectors) {
    for (let i = 0; i < dim; i++) {
      if (vec[i] < mins[i]) mins[i] = vec[i];
      if (vec[i] > maxs[i]) maxs[i] = vec[i];
    }
  }

  // min === max 일 때 범위를 1로 보정해 0 나누기를 방지한다
  const ranges = maxs.map((max, i) => (max - mins[i]) || 1);
  return { mins, ranges };
}

function applyNorm(rawVector, normParams) {
  return rawVector.map((value, i) => {
    const normalized = (value - normParams.mins[i]) / normParams.ranges[i];
    return Math.max(0, Math.min(1, normalized));
  });
}

// 세션 상태 배열을 받아 정규화된 벡터 배열과 normParams 를 반환한다
function normalizeAll(sessionStates) {
  const rawVectors = sessionStates.map(extractRawVector);
  const normParams = buildNormParams(rawVectors);
  const vectors    = rawVectors.map((v) => applyNorm(v, normParams));
  return { vectors, normParams };
}

// normParams 없이 raw 평균 벡터를 계산한다 (LLM 프롬프트용)
function computeRawMean(sessionStates) {
  if (sessionStates.length === 0) return new Array(FEATURE_KEYS.length).fill(0);
  const rawVectors = sessionStates.map(extractRawVector);
  const dim        = FEATURE_KEYS.length;
  const sum        = new Array(dim).fill(0);
  for (const v of rawVectors) for (let i = 0; i < dim; i++) sum[i] += v[i];
  return sum.map((s) => s / rawVectors.length);
}

module.exports = {
  FEATURE_KEYS,
  extractRawVector,
  buildNormParams,
  applyNorm,
  normalizeAll,
  computeRawMean,
};
