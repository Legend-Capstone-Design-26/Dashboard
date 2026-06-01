const { generateDummyInsights } = require("./dummyGenerator");
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
    top_priority_reason: normalizeString(source.top_priority_reason, base.top_priority_reason || "우선순위 근거를 추가로 확인해야 합니다."),
  };
}

function mergeInsights(input, candidateOutput) {
  const fallback = generateDummyInsights(input);
  const labelContext = buildLabelContext(input);
  const byLabel = new Map();
  for (const insight of Array.isArray(candidateOutput?.insights) ? candidateOutput.insights : []) {
    if (typeof insight?.label === "string" && insight.label) {
      byLabel.set(insight.label, insight);
    }
  }

  return {
    site_id: input?.site_id || fallback.site_id,
    generated_at: Date.now(),
    summary: normalizeSummary(candidateOutput?.summary, fallback.summary),
    insights: fallback.insights.map((baseInsight) => {
      const candidate = byLabel.get(baseInsight.label);
      if (!candidate) return baseInsight;
      const ctx = labelContext.get(baseInsight.label);
      const recommendedExperiments = normalizeExperiments(candidate.recommended_experiments, baseInsight.recommended_experiments);

      return {
        label: baseInsight.label,
        title: normalizeString(candidate.title, baseInsight.title),
        where: normalizeWhere(candidate.where, baseInsight.where, ctx),
        priority_reason: normalizeString(candidate.priority_reason, baseInsight.priority_reason),
        impact: normalizeImpact(candidate.impact, baseInsight.impact),
        evidence: normalizeGroundedStringList(candidate.evidence, baseInsight.evidence, ctx),
        possible_causes: normalizeStringList(candidate.possible_causes, baseInsight.possible_causes),
        validation_methods: normalizeStringList(candidate.validation_methods, baseInsight.validation_methods),
        recommended_actions: normalizeStringList(candidate.recommended_actions, baseInsight.recommended_actions),
        recommended_experiments: recommendedExperiments,
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
        output: generateDummyInsights(input)
      };
    }
  }

  return {
    provider: "fallback",
    model: null,
    prompt,
    output: generateDummyInsights(input)
  };
}

module.exports = {
  generateInsights,
  mergeInsights,
  resolveProvider
};
