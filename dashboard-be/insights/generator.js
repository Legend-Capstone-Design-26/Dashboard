const { buildInsightsPrompt } = require("./promptBuilder");
const { callOpenAIChat } = require("./openaiProvider");
const { loadEnvFromFile } = require("../services/llm/config");

const ALLOWED_PRIMARY_METRICS = new Set([
  "checkout_complete / sessions",
  "checkout_entered / sessions",
  "page_view_to_click_rate",
  "error_count / sessions",
  "price_interaction_count",
]);

function normalizeString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice();
  const list = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  return list.length ? list : fallback.slice();
}

function labelDisplayName(label) {
  const names = {
    window_shopper: "가볍게 둘러보고 나간 사용자",
    over_explorer: "여러 화면을 오래 둘러본 사용자",
    checkout_abandoner: "결제 단계에서 멈춘 사용자",
    ux_friction_dropper: "불편을 겪고 이탈한 사용자",
    price_sensitive_dropper: "가격이나 혜택을 비교하다 나간 사용자",
  };
  return names[label] || "확인 필요한 사용자 흐름";
}

function metricDisplayName(metric) {
  const names = {
    "checkout_complete / sessions": "결제 완료 비율",
    "checkout_entered / sessions": "결제 단계 진입 비율",
    page_view_to_click_rate: "화면 조회 후 클릭 비율",
    "error_count / sessions": "세션당 오류 발생 정도",
    price_interaction_count: "가격/혜택 관련 상호작용 수",
  };
  return names[metric] || metric || "확인할 지표";
}

function normalizePriority(value, fallback) {
  return value === "high" || value === "medium" || value === "low" ? value : fallback;
}

function normalizeEvidenceLevel(value, fallback) {
  return value === "strong" || value === "moderate" || value === "weak" ? value : fallback;
}

function normalizeImpact(value, fallback) {
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const source = value && typeof value === "object" ? value : {};
  return {
    affected_sessions: Number(base.affected_sessions) || 0,
    share: Number(base.share) || 0,
    primary_metric: normalizePrimaryMetric(source.primary_metric, base.primary_metric || "checkout_complete / sessions"),
  };
}

function normalizeExperiments(value, fallback) {
  if (!Array.isArray(value)) return fallback.slice();

  const normalized = value
    .map((item) => ({
      hypothesis: normalizeString(item?.hypothesis, "사용자 마찰 지점을 줄이면 전환이 개선된다"),
      change: normalizeString(item?.change, "핵심 단계의 정보 구조와 CTA를 더 명확히 조정한다"),
      primary_metric: normalizePrimaryMetric(item?.primary_metric, "checkout_complete / sessions")
    }))
    .filter((item) => item.hypothesis && item.change && item.primary_metric);

  return normalized.length ? normalized : fallback.slice();
}

function hasInsightData(input) {
  const labels = Array.isArray(input?.labels) ? input.labels : [];
  return labels.some((label) => Number(label?.sessions || 0) > 0 || (Array.isArray(label?.representatives) && label.representatives.length > 0));
}

function buildStatusOutput(input, status, reason) {
  const reasonText = normalizeString(reason, "insufficient_data");
  const hasLabels = Array.isArray(input?.labels) && input.labels.length > 0;
  const plain = hasLabels
    ? "이벤트나 세션 신호는 일부 있지만, 신뢰할 만한 문제 카드나 실험 제안을 만들 만큼 근거가 충분하지 않습니다."
    : "아직 라벨링된 세션 흐름이 없어 사용자 행동 패턴을 판단하기 어렵습니다.";
  return {
    site_id: input?.site_id || "",
    generated_at: Date.now(),
    status,
    fallbackReason: reasonText,
    summary: {
      headline: status === "generation_failed"
        ? "AI 인사이트 생성에 실패했습니다."
        : "아직 신뢰할 만한 AI 인사이트를 만들기에는 데이터가 부족합니다.",
      plain_explanation: status === "generation_failed"
        ? "데이터 조회는 시도했지만 AI 응답 생성 과정에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
        : plain,
      top_priority_reason: "먼저 SDK 이벤트 수집, CTA 클릭 이벤트, 결제 완료 이벤트, 세션 집계가 정상인지 확인하는 것이 좋습니다.",
    },
    insights: [],
    next_steps: [
      "SDK 이벤트 수집 상태 확인",
      "CTA 클릭 이벤트가 정상적으로 기록되는지 확인",
      "결제 완료 이벤트가 정상적으로 기록되는지 확인",
      "데이터를 더 모은 뒤 다시 인사이트 도출",
    ],
  };
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractPathTokens(text) {
  const matches = String(text || "").match(/(^|[\s("'`])\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+/g) || [];
  return Array.from(new Set(matches.map((item) => item.trim().replace(/^["'`(]/, "").replace(/[),.;:]+$/, ""))));
}

function normalizePrimaryMetric(value, fallback) {
  const metric = normalizeString(value, fallback);
  return ALLOWED_PRIMARY_METRICS.has(metric) ? metric : fallback;
}

function buildLabelContext(input) {
  const map = new Map();
  for (const label of Array.isArray(input?.labels) ? input.labels : []) {
    const representativeSteps = Array.isArray(label?.representative_steps)
      ? label.representative_steps.filter((step) => typeof step === "string" && step.trim()).map((step) => step.trim())
      : [];
    map.set(label?.label, {
      allowedPaths: Array.isArray(label?.allowed_paths)
        ? label.allowed_paths.filter((path) => typeof path === "string" && path)
        : [],
      pathSummary: typeof label?.path_summary === "string" ? label.path_summary : "",
      representativeSteps,
      metricKeys: Object.keys(label?.metrics && typeof label.metrics === "object" ? label.metrics : {}),
    });
  }
  return map;
}

function normalizeWhere(value, fallback, ctx) {
  const candidate = normalizeString(value, fallback);
  const lower = candidate.toLowerCase();
  if (lower.includes("/login") || lower.includes("/logout")) return fallback;

  const allowedPaths = Array.isArray(ctx?.allowedPaths) ? ctx.allowedPaths : [];
  const candidatePaths = extractPathTokens(candidate);
  if (!candidatePaths.length) return fallback;
  return candidatePaths.every((path) => allowedPaths.includes(path)) ? candidate : fallback;
}

function normalizeGroundedStringList(value, fallback, ctx) {
  const list = normalizeStringList(value, fallback);
  const allowedPaths = Array.isArray(ctx?.allowedPaths) ? ctx.allowedPaths : [];
  const representativeSteps = Array.isArray(ctx?.representativeSteps) ? ctx.representativeSteps : [];
  const metricKeys = Array.isArray(ctx?.metricKeys) ? ctx.metricKeys : [];
  const grounded = list.filter((item) => {
    const lower = item.toLowerCase();
    if (lower.includes("/login") || lower.includes("/logout")) return false;
    const paths = extractPathTokens(item);
    if (paths.length) return paths.every((path) => allowedPaths.includes(path));
    if (representativeSteps.some((step) => step && item.includes(step))) return true;
    return metricKeys.some((key) => key && item.includes(key));
  });
  return grounded.length ? grounded : fallback.slice();
}

function normalizeSummary(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    headline: normalizeString(source.headline, base.headline || "주요 UX 인사이트를 확인해 주세요."),
    plain_explanation: normalizeString(source.plain_explanation, base.plain_explanation || "수집된 행동 데이터를 바탕으로 먼저 확인할 UX 흐름을 요약했습니다."),
    top_priority_reason: normalizeString(source.top_priority_reason, base.top_priority_reason || "우선순위 근거를 추가로 확인해야 합니다."),
  };
}

function buildBaseInsight(labelBucket) {
  const label = labelBucket?.label || "unknown";
  const displayName = labelDisplayName(label);
  const affectedSessions = Number(labelBucket?.sessions || 0);
  const share = Number(labelBucket?.share || 0);
  const allowedPaths = Array.isArray(labelBucket?.allowed_paths) ? labelBucket.allowed_paths.filter(Boolean) : [];
  const metricKeys = Object.keys(labelBucket?.metrics && typeof labelBucket.metrics === "object" ? labelBucket.metrics : {});
  const primaryMetric = normalizePrimaryMetric(metricKeys.find((key) => ALLOWED_PRIMARY_METRICS.has(key)), "checkout_complete / sessions");
  const where = allowedPaths.length ? `${allowedPaths.slice(0, 3).join(", ")} 구간` : "어느 화면에서 발생했는지 아직 명확하지 않습니다.";
  const evidence = [
    `${displayName} 유형이 ${affectedSessions}개 세션에서 관찰되었습니다.`,
    `전체 중 비중은 ${Math.round(share * 100)}%입니다.`,
  ];
  if (allowedPaths.length) evidence.unshift(`대표 경로로 ${allowedPaths.slice(0, 3).join(", ")}가 확인되었습니다.`);
  return {
    label,
    title: `${displayName} 흐름을 확인해 주세요`,
    operator_summary: `${displayName} 흐름이 일부 관찰되었습니다.`,
    plain_explanation: "현재 데이터만으로 원인을 단정하기보다는, 사용자가 다음 행동으로 이어지지 않는 지점을 먼저 확인하는 것이 좋습니다.",
    where,
    priority_reason: affectedSessions > 0 ? "실제 세션에서 반복 신호가 있어 확인 가치가 있습니다." : "아직 세션 근거가 부족합니다.",
    impact: {
      affected_sessions: affectedSessions,
      share,
      primary_metric: primaryMetric,
    },
    evidence,
    evidence_bullets: evidence.slice(),
    possible_causes: [],
    validation_methods: ["관련 화면의 CTA 클릭 이벤트와 다음 단계 이동 여부를 확인합니다."],
    recommended_actions: ["이벤트 추적과 세션 흐름이 정상적으로 잡히는지 먼저 점검합니다."],
    next_best_action: "CTA 클릭 이벤트와 다음 단계 이동 이벤트가 정상적으로 수집되는지 확인하세요.",
    recommended_experiments: [],
    experiment_brief: "데이터가 더 쌓인 뒤 CTA 문구나 위치를 비교하는 A/B 테스트를 검토할 수 있습니다.",
    risk_note: "표본이 적으면 UX 문제로 단정하기 어렵습니다.",
    confidence_reason: affectedSessions >= 3 ? "반복 세션이 일부 있어 중간 수준의 근거입니다." : "세션 수가 적어 약한 근거입니다.",
    priority: affectedSessions >= 3 || share >= 0.3 ? "medium" : "low",
    evidence_level: affectedSessions >= 3 ? "moderate" : "weak",
  };
}

function mergeInsights(input, candidateOutput) {
  const labelContext = buildLabelContext(input);
  const baseByLabel = new Map((Array.isArray(input?.labels) ? input.labels : []).map((label) => [label?.label, buildBaseInsight(label)]));
  const byLabel = new Map();
  for (const insight of Array.isArray(candidateOutput?.insights) ? candidateOutput.insights : []) {
    if (typeof insight?.label === "string" && insight.label) {
      byLabel.set(insight.label, insight);
    }
  }

  return {
    site_id: input?.site_id || candidateOutput?.site_id || "",
    generated_at: Date.now(),
    status: candidateOutput?.status === "insufficient_data" ? "insufficient_data" : "ready",
    summary: normalizeSummary(candidateOutput?.summary, {
      headline: "수집된 UX 신호를 바탕으로 우선 확인할 흐름을 정리했습니다.",
      plain_explanation: "아래 항목은 실제 세션과 이벤트 근거가 있는 범위에서만 정리한 내용입니다.",
      top_priority_reason: "운영자가 바로 확인할 수 있는 행동 흐름과 이벤트 수집 상태를 우선합니다.",
    }),
    insights: Array.from(byLabel.entries()).filter(([label]) => baseByLabel.has(label)).map(([label, candidate]) => {
      const baseInsight = baseByLabel.get(label) || buildBaseInsight({ label, sessions: 0, share: 0 });
      if (!candidate) return baseInsight;
      const ctx = labelContext.get(baseInsight.label);
      const recommendedExperiments = normalizeExperiments(candidate.recommended_experiments, baseInsight.recommended_experiments);

      return {
        label: baseInsight.label,
        title: normalizeString(candidate.title, baseInsight.title),
        operator_summary: normalizeString(candidate.operator_summary, baseInsight.operator_summary),
        plain_explanation: normalizeString(candidate.plain_explanation, baseInsight.plain_explanation),
        where: normalizeWhere(candidate.where, baseInsight.where, ctx),
        priority_reason: normalizeString(candidate.priority_reason, baseInsight.priority_reason),
        impact: normalizeImpact(candidate.impact, baseInsight.impact),
        evidence: normalizeGroundedStringList(candidate.evidence, baseInsight.evidence, ctx),
        evidence_bullets: normalizeGroundedStringList(candidate.evidence_bullets, baseInsight.evidence_bullets, ctx),
        possible_causes: normalizeStringList(candidate.possible_causes, baseInsight.possible_causes),
        validation_methods: normalizeStringList(candidate.validation_methods, baseInsight.validation_methods),
        recommended_actions: normalizeStringList(candidate.recommended_actions, baseInsight.recommended_actions),
        next_best_action: normalizeString(candidate.next_best_action, baseInsight.next_best_action),
        recommended_experiments: recommendedExperiments,
        experiment_brief: normalizeString(candidate.experiment_brief, baseInsight.experiment_brief),
        risk_note: normalizeString(candidate.risk_note, baseInsight.risk_note),
        confidence_reason: normalizeString(candidate.confidence_reason, baseInsight.confidence_reason),
        priority: normalizePriority(candidate.priority, baseInsight.priority),
        evidence_level: normalizeEvidenceLevel(candidate.evidence_level, baseInsight.evidence_level)
      };
    })
  };
}

function resolveProvider(opts) {
  loadEnvFromFile();
  const explicit = String(opts?.provider || "").trim().toLowerCase();
  if (explicit) return explicit;
  return String(process.env.UX_INSIGHTS_PROVIDER || "fallback").trim().toLowerCase() || "fallback";
}

async function generateInsights(input, opts) {
  const provider = resolveProvider(opts);
  const prompt = buildInsightsPrompt(input);

  if (!hasInsightData(input)) {
    return {
      provider: "fallback",
      model: null,
      prompt,
      fallbackReason: "insufficient_data",
      output: buildStatusOutput(input, "insufficient_data", "insufficient_data"),
    };
  }

  if (provider === "openai") {
    try {
      const result = await callOpenAIChat(prompt, {
        apiKey: opts?.apiKey || process.env.UX_INSIGHTS_API_KEY,
        baseUrl: opts?.baseUrl || process.env.UX_INSIGHTS_BASE_URL,
        model: opts?.model || process.env.UX_INSIGHTS_MODEL
      });

      return {
        provider: "openai",
        model: result.model,
        prompt,
        output: mergeInsights(input, safeParseJson(result.content))
      };
    } catch (error) {
      return {
        provider: "fallback",
        model: null,
        prompt,
        fallbackReason: String(error),
        output: buildStatusOutput(input, "generation_failed", String(error))
      };
    }
  }

  return {
    provider: "fallback",
    model: null,
    prompt,
    fallbackReason: provider === "fallback" ? "fallback_provider" : `unsupported_provider:${provider}`,
    output: buildStatusOutput(input, "insufficient_data", provider === "fallback" ? "fallback_provider" : `unsupported_provider:${provider}`)
  };
}

module.exports = {
  generateInsights,
  mergeInsights,
  resolveProvider
};
