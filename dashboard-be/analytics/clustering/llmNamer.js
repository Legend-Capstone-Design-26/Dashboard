const { FEATURE_KEYS } = require("./featureExtractor");

// ─── Feature Label Map ────────────────────────────────────────────────────────

const FEATURE_LABELS = {
  depth:             "방문한 경로 수 (탐색 범위)",
  path_diversity:    "고유 경로 비율 (0~1, 낮을수록 같은 곳 반복)",
  dwell_per_page:    "페이지당 체류 시간(ms) (몰입도)",
  oscillation_rate:  "왕복 이동 비율 (0~1, 높을수록 배회)",
};

// ─── Profile Builder ──────────────────────────────────────────────────────────
// 클러스터의 raw centroid 와 전체 평균을 비교해 "전체 평균 대비 N%" 형태의
// 사람이 읽기 쉬운 프로파일 문자열을 만든다.

function buildFeatureProfile(rawCentroid, globalRawMean) {
  const lines = [];
  for (let i = 0; i < FEATURE_KEYS.length; i++) {
    const key   = FEATURE_KEYS[i];
    const value = Number(rawCentroid[i] || 0);
    const mean  = Number(globalRawMean?.[i] || 0);
    const label = FEATURE_LABELS[key] || key;

    if (mean > 0) {
      const pct = Math.round((value / mean) * 100);
      lines.push(`- ${label}: ${value.toFixed(1)} (전체 평균 대비 ${pct}%)`);
    } else {
      lines.push(`- ${label}: ${value.toFixed(1)}`);
    }
  }
  return lines.join("\n");
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

function buildNamingPrompt(featureProfile, existingNames) {
  const exclusion = existingNames.length > 0
    ? `\n이미 사용된 유형명(중복 금지): ${existingNames.join(", ")}`
    : "";

  return {
    system: "당신은 UX 분석 전문가입니다. 사용자 행동 데이터를 보고 간결하고 직관적인 유형 명칭을 한국어로 부여합니다.",
    user: [
      "다음은 클러스터의 평균 사용자 행동 프로파일입니다.",
      "",
      featureProfile,
      exclusion,
      "",
      "이 사용자 유형에 가장 적합한 명칭을 하나만 부여해주세요.",
      "규칙: 2~6글자의 명사 또는 명사구, 마케팅에서 사용할 수 있는 자연스러운 한국어.",
      "",
      '반드시 JSON으로만 응답하세요: {"name": "명칭", "reason": "선택 이유 한 줄"}',
    ].join("\n"),
  };
}

function buildMappingPrompt(featureProfile, candidateName, sim) {
  return {
    system: "당신은 UX 분석 전문가입니다.",
    user: [
      "새로운 사용자 클러스터가 발견되었습니다.",
      "",
      featureProfile,
      "",
      `기존 유형 '${candidateName}'과의 유사도: ${(sim * 100).toFixed(0)}%`,
      "이 클러스터를 기존 유형과 동일하게 분류할 수 있습니까?",
      "같다면 기존 이름을 유지하고, 다르다면 새 이름을 부여해주세요.",
      "",
      '반드시 JSON으로만 응답하세요: {"keep_existing": true/false, "name": "최종 명칭", "reason": "판단 이유"}',
    ].join("\n"),
  };
}

// ─── LLM Callers ─────────────────────────────────────────────────────────────
// callLlm: async (prompt: { system, user }) => { content: string }
// 의존성 주입으로 받아 테스트와 모킹이 쉽도록 한다.

async function nameCluster({ featureProfile, existingNames, callLlm }) {
  const prompt = buildNamingPrompt(featureProfile, existingNames);
  try {
    const result = await callLlm(prompt);
    const parsed = JSON.parse(result.content);
    return {
      name:   String(parsed.name   || "알 수 없는 유형"),
      reason: String(parsed.reason || ""),
    };
  } catch {
    return { name: "알 수 없는 유형", reason: "LLM 응답 파싱 실패" };
  }
}

async function resolveMappingDecision({ featureProfile, candidateName, sim, callLlm }) {
  const prompt = buildMappingPrompt(featureProfile, candidateName, sim);
  try {
    const result = await callLlm(prompt);
    const parsed = JSON.parse(result.content);
    return {
      keepExisting: Boolean(parsed.keep_existing),
      name:         String(parsed.name || candidateName),
    };
  } catch {
    // 파싱 실패 시 안전하게 기존 이름 유지
    return { keepExisting: true, name: candidateName };
  }
}

module.exports = {
  buildFeatureProfile,
  nameCluster,
  resolveMappingDecision,
};
