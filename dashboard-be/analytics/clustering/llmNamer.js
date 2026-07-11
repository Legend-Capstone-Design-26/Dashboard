const { FEATURE_KEYS, FEATURE_LABELS } = require("./featureExtractor");

// ─── Feature Label Map ────────────────────────────────────────────────────────

const INTERNAL_NAME_RE = /[A-Za-z_]|path|depth|count|rate|step|feature|cluster/i;
const KOREAN_NAME_RE = /^[가-힣0-9\s]+$/;

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
      "규칙: 2~10글자의 명사 또는 명사구, 마케팅에서 사용할 수 있는 자연스러운 한국어.",
      "내부 피처명, 영문명, 중복명, 설명문 형태의 이름은 금지합니다.",
      "",
      '반드시 JSON 객체로만 응답하세요: {"name": "명칭", "reason": "선택 이유 한 줄", "dominant_signals": ["신호"]}',
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
      '반드시 JSON 객체로만 응답하세요: {"keep_existing": true/false, "name": "최종 명칭", "reason": "판단 이유", "dominant_signals": ["신호"]}',
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
    const parsed = parseJsonObject(result.content);
    return validateNamingPayload(parsed, existingNames, featureProfile);
  } catch {
    return { name: fallbackName(featureProfile, existingNames), reason: "LLM 응답 검증 실패" };
  }
}

async function resolveMappingDecision({ featureProfile, candidateName, sim, callLlm }) {
  const prompt = buildMappingPrompt(featureProfile, candidateName, sim);
  try {
    const result = await callLlm(prompt);
    const parsed = parseJsonObject(result.content);
    if (parsed.keep_existing === true && isValidClusterName(candidateName, [])) {
      return { keepExisting: true, name: candidateName, reason: String(parsed.reason || "기존 유형 유지") };
    }
    const validated = validateNamingPayload(parsed, [candidateName], featureProfile);
    return {
      keepExisting: false,
      name:         validated.name,
      reason:       validated.reason,
    };
  } catch {
    // 파싱 실패 시 안전하게 기존 이름 유지
    return { keepExisting: true, name: candidateName, reason: "LLM 응답 검증 실패" };
  }
}

function parseJsonObject(content) {
  const parsed = JSON.parse(String(content || ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json_shape");
  return parsed;
}

function normalizeName(name) {
  return String(name || "").replace(/\s+/g, "").trim();
}

function isValidClusterName(name, existingNames = []) {
  const trimmed = String(name || "").trim();
  const normalized = normalizeName(trimmed);
  if (normalized.length < 2 || normalized.length > 10) return false;
  if (!KOREAN_NAME_RE.test(trimmed)) return false;
  if (INTERNAL_NAME_RE.test(trimmed)) return false;
  const existing = new Set(existingNames.map(normalizeName));
  return !existing.has(normalized);
}

function validateNamingPayload(parsed, existingNames, featureProfile) {
  if (!String(parsed.reason || "").trim()) throw new Error("missing_reason");
  if (!Array.isArray(parsed.dominant_signals) && !featureProfile) throw new Error("missing_signals");
  const name = String(parsed.name || "").trim();
  if (!isValidClusterName(name, existingNames)) throw new Error("invalid_name");
  return { name, reason: String(parsed.reason || "").trim() };
}

function fallbackName(featureProfile, existingNames = []) {
  const profile = String(featureProfile || "");
  const candidates = [
    [/(결제|체크아웃|payment|checkout)/i, "결제 이탈형"],
    [/(가격|price|쿠폰|할인)/i, "가격 탐색형"],
    [/(왕복|반복|oscillation|backtrack)/i, "반복 탐색형"],
    [/(오류|마찰|error|friction)/i, "오류 마찰형"],
    [/(검색|필터|search|filter)/i, "조건 탐색형"],
    [/(장바구니|cart)/i, "장바구니형"],
  ];
  for (const [pattern, name] of candidates) {
    if (pattern.test(profile) && isValidClusterName(name, existingNames)) return name;
  }
  return isValidClusterName("탐색 유형", existingNames) ? "탐색 유형" : "사용자 유형";
}

module.exports = {
  buildFeatureProfile,
  nameCluster,
  resolveMappingDecision,
  isValidClusterName,
  fallbackName,
};
