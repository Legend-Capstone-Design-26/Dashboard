// ─── Feature Definition ───────────────────────────────────────────────────────
// session-state.js 가 Redis 에 저장하는 필드를 클러스터링 피처 벡터로 변환한다.
// 필드 순서가 centroid 벡터 인덱스와 1:1 대응되므로 변경 시 저장된 taxonomy 를 무효화해야 한다.
// v2는 historical summary의 ordered path sequence와 commerce/friction counters를
// 함께 쓰므로 v1 centroid와 호환되지 않는다. Redis taxonomy/norm key를 v2로 분리한다.

const { stepIndex } = require("../funnel");

const FEATURE_SCHEMA_VERSION = 2;

const FEATURE_KEYS = Object.freeze([
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

const FEATURE_LABELS = Object.freeze({
  path_depth: "방문 경로 깊이",
  path_diversity: "고유 경로 비율",
  oscillation_rate: "왕복 이동 비율",
  backtrack_rate: "직전 경로 회귀 비율",
  transition_count: "경로 전환 수",
  page_view_intensity: "페이지뷰 강도",
  click_intensity: "클릭 강도",
  event_intensity: "이벤트 강도",
  dwell_per_page: "페이지당 체류 시간",
  error_friction: "오류/마찰 강도",
  search_count: "검색 수",
  filter_count: "필터 수",
  price_interaction_count: "가격 탐색 수",
  cart_add_count: "장바구니 추가 수",
  cart_remove_count: "장바구니 제거 수",
  payment_attempt_count: "결제 시도 수",
  checkout_entered: "체크아웃 진입",
  checkout_complete: "구매 완료",
  max_step_index: "최대 퍼널 단계",
});

// ─── Vector Extraction ────────────────────────────────────────────────────────

function extractRawVector(state) {
  const paths = getPathSequence(state);
  const depth = paths.length;
  const uniqueCount = new Set(paths).size;
  const transitions = Math.max(0, paths.length - 1);
  const dwellTotal = Number(state.dwell_total_ms) || 0;

  const pathDiversity = depth > 0 ? uniqueCount / depth : 0;
  const dwellPerPage  = capLog(dwellTotal / Math.max(depth, 1), 600000);

  let oscillation = 0;
  for (let i = 2; i < paths.length; i++) if (paths[i] === paths[i - 2]) oscillation++;
  const oscillationRate = paths.length > 2 ? oscillation / (paths.length - 2) : 0;

  let backtracks = 0;
  for (let i = 1; i < paths.length; i++) if (paths[i] === paths[i - 1]) backtracks++;
  const backtrackRate = transitions > 0 ? backtracks / transitions : 0;

  const values = {
    path_depth: capLog(depth, 100),
    path_diversity: pathDiversity,
    oscillation_rate: oscillationRate,
    backtrack_rate: backtrackRate,
    transition_count: capLog(transitions, 100),
    page_view_intensity: capLog(numberField(state, "page_view_count", "page_views", "pageviews"), 200),
    click_intensity: capLog(numberField(state, "click_count", "clicks"), 500),
    event_intensity: capLog(numberField(state, "event_count"), 1000),
    dwell_per_page: dwellPerPage,
    error_friction: capLog(numberField(state, "error_count") + numberField(state, "rage_clicks_count"), 100),
    search_count: capLog(numberField(state, "search_count"), 100),
    filter_count: capLog(numberField(state, "filter_count", "filter_change_count"), 100),
    price_interaction_count: capLog(numberField(state, "price_interaction_count"), 100),
    cart_add_count: capLog(numberField(state, "cart_add_count", "add_to_cart_count"), 100),
    cart_remove_count: capLog(numberField(state, "cart_remove_count"), 100),
    payment_attempt_count: capLog(numberField(state, "payment_attempt_count"), 100),
    checkout_entered: state?.checkout_entered || state?.checkout_started ? 1 : 0,
    checkout_complete: state?.checkout_complete || state?.checkout_completed ? 1 : 0,
    max_step_index: stepIndex(state?.max_step) / Math.max(stepIndex("payment"), 1),
  };

  return ensureVectorLength(FEATURE_KEYS.map((key) => finiteNumber(values[key])), "extractRawVector");
}

function getPathSequence(state) {
  const preferred = Array.isArray(state?.path_sequence) ? state.path_sequence : [];
  const fallback = Array.isArray(state?.paths) ? state.paths : [];
  return (preferred.length > 0 ? preferred : fallback).map((path) => String(path || "").trim()).filter(Boolean);
}

function numberField(state, ...keys) {
  for (const key of keys) {
    const value = Number(state?.[key]);
    if (Number.isFinite(value)) return Math.max(0, value);
  }
  return 0;
}

function capLog(value, cap) {
  const bounded = Math.max(0, Math.min(Number(value) || 0, cap));
  return Math.log1p(bounded);
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function ensureVectorLength(vector, label = "vector") {
  if (!Array.isArray(vector) || vector.length !== FEATURE_KEYS.length) {
    throw new Error(`${label} length ${Array.isArray(vector) ? vector.length : "invalid"} does not match feature schema ${FEATURE_SCHEMA_VERSION}`);
  }
  return vector;
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
  return { schemaVersion: FEATURE_SCHEMA_VERSION, featureKeys: [...FEATURE_KEYS], mins, ranges };
}

function applyNorm(rawVector, normParams) {
  ensureVectorLength(rawVector, "rawVector");
  if (!isCompatibleNormParams(normParams)) throw new Error("incompatible norm params for clustering feature schema");
  return rawVector.map((value, i) => {
    const normalized = (value - normParams.mins[i]) / normParams.ranges[i];
    return Math.max(0, Math.min(1, normalized));
  });
}

function isCompatibleNormParams(normParams) {
  return Boolean(normParams)
    && normParams.schemaVersion === FEATURE_SCHEMA_VERSION
    && arraysEqual(normParams.featureKeys, FEATURE_KEYS)
    && Array.isArray(normParams.mins)
    && Array.isArray(normParams.ranges)
    && normParams.mins.length === FEATURE_KEYS.length
    && normParams.ranges.length === FEATURE_KEYS.length;
}

function arraysEqual(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, i) => value === right[i]);
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
  FEATURE_SCHEMA_VERSION,
  FEATURE_KEYS,
  FEATURE_LABELS,
  extractRawVector,
  buildNormParams,
  applyNorm,
  normalizeAll,
  computeRawMean,
  getPathSequence,
  ensureVectorLength,
  isCompatibleNormParams,
};
