// ─── Feature Definition ───────────────────────────────────────────────────────
// session-state.js 가 Redis 에 저장하는 필드를 클러스터링 피처 벡터로 변환한다.
// 필드 순서가 centroid 벡터 인덱스와 1:1 대응되므로 변경 시 저장된 taxonomy 를 무효화해야 한다.
//
// 결제 관련 필드(checkout_started/completed, payment_attempt_count)는 클러스터링
// 입력에서 제외한다. 이진값이라 Min-Max 정규화 후에도 완벽히 두 덩어리로 갈려
// 가중치 없이도 클러스터링을 지배해버리기 때문. 대신 클러스터별 사후 지표로만 쓴다.
// 순수 행동(탐색 범위 x 몰입 강도) 신호만 남긴다.

const FEATURE_KEYS = [
  "depth",             // 방문한 경로 수 (탐색 범위)
  "path_diversity",    // 고유 경로 수 / 전체 경로 수 (넓게 탐색 vs 같은 곳 반복)
  "dwell_per_page",    // 총 체류시간 / depth (페이지당 몰입도)
  "oscillation_rate",  // 두 칸 전 경로로 돌아온 비율 (왕복/배회 신호)
];

// ─── Vector Extraction ────────────────────────────────────────────────────────

function extractRawVector(state) {
  const paths = Array.isArray(state.paths) ? state.paths : [];
  const depth = paths.length;
  const dwellTotal = Number(state.dwell_total_ms) || 0;

  const pathDiversity = depth > 0 ? new Set(paths).size / depth : 0;
  const dwellPerPage  = dwellTotal / Math.max(depth, 1);

  let oscillation = 0;
  for (let i = 2; i < paths.length; i++) if (paths[i] === paths[i - 2]) oscillation++;
  const oscillationRate = paths.length > 2 ? oscillation / (paths.length - 2) : 0;

  return FEATURE_KEYS.map((key) => {
    if (key === "depth")             return depth;
    if (key === "path_diversity")    return pathDiversity;
    if (key === "dwell_per_page")    return dwellPerPage;
    if (key === "oscillation_rate")  return oscillationRate;
    return 0;
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
