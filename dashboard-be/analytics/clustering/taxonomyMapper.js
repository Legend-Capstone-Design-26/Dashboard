// ─── Similarity ───────────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────
// 실제 데이터 관찰 후 조정 가능하도록 상수로 분리한다.

const KEEP_THRESHOLD = 0.85; // 이상: 기존 이름 유지
const LLM_THRESHOLD  = 0.60; // 이상 ~ KEEP 미만: LLM 판단 위임

// ─── Mapping ──────────────────────────────────────────────────────────────────

function classifyMatch(sim) {
  if (sim >= KEEP_THRESHOLD) return "existing";
  if (sim >= LLM_THRESHOLD)  return "ambiguous";
  return "new";
}

// 새 클러스터 centroid 배열을 기존 taxonomy 와 비교해 매핑 결정을 반환한다.
// taxonomy: { [name]: { centroid: number[], status: string, ... } }
function mapClustersToTaxonomy(newCentroids, taxonomy) {
  const activeEntries = Object.entries(taxonomy)
    .filter(([, e]) => e.status === "active" && Array.isArray(e.centroid));

  return newCentroids.map((centroid) => {
    if (activeEntries.length === 0) return { type: "new", sim: 0, matchedName: null };

    let bestSim  = -1;
    let bestName = null;
    for (const [name, entry] of activeEntries) {
      const sim = cosineSimilarity(centroid, entry.centroid);
      if (sim > bestSim) { bestSim = sim; bestName = name; }
    }

    return { type: classifyMatch(bestSim), sim: bestSim, matchedName: bestName };
  });
}

// 기존 taxonomy 에서 아무 새 클러스터도 매핑되지 않은 항목의 이름 목록을 반환한다.
function findDeprecated(taxonomy, mappingResults) {
  const assigned = new Set(
    mappingResults
      .filter((m) => m.type === "existing" || m.type === "ambiguous")
      .map((m) => m.matchedName)
      .filter(Boolean)
  );
  return Object.keys(taxonomy).filter((name) => !assigned.has(name));
}

module.exports = {
  cosineSimilarity,
  mapClustersToTaxonomy,
  findDeprecated,
  KEEP_THRESHOLD,
  LLM_THRESHOLD,
};
