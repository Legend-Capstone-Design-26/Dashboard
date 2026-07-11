// analytics/pipeline.js
// TODO: Redis read model 전환 완료 후 events.jsonl 기반 analytics pipeline 제거 예정.

const { readEventsJsonl } = require("./events");
const { buildSessions } = require("./sessionize");
const { summarizeSession } = require("./sessionSummary");
const { labelSessionSummary } = require("./labeler");

const AUTH_ONLY_PATH_PREFIXES = ["/login", "/logout"];

function normalizePaths(paths) {
  return Array.isArray(paths)
    ? paths.map((path) => (typeof path === "string" ? path.trim() : "")).filter(Boolean)
    : [];
}

function isAuthOnlyPath(path) {
  return AUTH_ONLY_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function representativeScore(item) {
  const summary = item?.summary || {};
  const evidenceCount = Array.isArray(item?.label?.evidence) ? item.label.evidence.length : 0;
  const paths = normalizePaths(summary.unique_paths);
  const authOnly = paths.length > 0 && paths.every(isAuthOnlyPath);

  let score = 0;
  score += (Number(item?.label?.confidence) || 0) * 100;
  score += Math.min(evidenceCount, 5) * 8;
  score += Math.min(Number(summary.page_views) || 0, 8) * 4;
  score += Math.min(Number(summary.clicks) || 0, 8) * 3;
  score += Math.min(Number(summary.depth) || 0, 6) * 4;
  score += Math.min((Number(summary.duration_ms) || 0) / 1000, 120) * 0.2;
  score += Math.min(Number(summary.price_interaction_count) || 0, 6) * 4;
  score += Math.min(Number(summary.error_count) || 0, 4) * 6;
  if (summary.checkout_entered) score += 12;
  if (summary.checkout_complete) score += 8;
  if ((Number(summary.page_views) || 0) === 0 && (Number(summary.clicks) || 0) === 0) score -= 40;
  if (authOnly) score -= 200;
  return score;
}

function isInsightEligibleSummary(summary) {
  if (!summary || typeof summary !== "object") return false;
  const paths = normalizePaths(summary.unique_paths);
  const authOnly = paths.length > 0 && paths.every(isAuthOnlyPath);
  if (authOnly) return false;

  const signalScore = [
    Number(summary.page_views) || 0,
    Number(summary.clicks) || 0,
    Number(summary.depth) || 0,
    Number(summary.error_count) || 0,
    Number(summary.rage_clicks_count) || 0,
    Number(summary.price_interaction_count) || 0,
    Number(summary.filter_count) || 0,
    Number(summary.search_count) || 0,
    Number(summary.cart_add_count) || 0,
    Number(summary.cart_remove_count) || 0,
    Number(summary.payment_attempt_count) || 0,
    summary.checkout_entered ? 1 : 0,
    summary.checkout_complete ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);

  if (signalScore <= 0 && (Number(summary.duration_ms) || 0) < 1000) return false;
  if (paths.length === 0 && signalScore <= 0) return false;
  return true;
}

function summarizeRepresentativePaths(representatives) {
  const paths = Array.from(new Set(
    (representatives || []).flatMap((item) => normalizePaths(item?.summary?.unique_paths)).filter((path) => !isAuthOnlyPath(path))
  ));
  if (!paths.length) return "경로 근거 부족";
  return paths.slice(0, 4).join(", ");
}

function summarizeRepresentativeSteps(representatives) {
  return Array.from(new Set(
    (representatives || [])
      .map((item) => (typeof item?.summary?.max_step === "string" ? item.summary.max_step.trim() : ""))
      .filter(Boolean)
  ));
}

function pickRepresentatives(labeledSessions, perLabel, sortBy) {
  const n = typeof perLabel === "number" ? perLabel : 3;
  const sorter = sortBy || ((a, b) => representativeScore(b) - representativeScore(a));

  const byLabel = new Map();
  for (const x of labeledSessions || []) {
    const lab = x?.label?.label || "unclassified";
    if (!byLabel.has(lab)) byLabel.set(lab, []);
    byLabel.get(lab).push(x);
  }

  const out = new Map();
  for (const [lab, list] of byLabel.entries()) {
    const sorted = list.slice().sort(sorter);
    out.set(lab, sorted.slice(0, n));
  }
  return out;
}

async function computeSessionsFromJsonl(filePath, opts) {
  const {
    site_id,
    from_ts,
    to_ts,
    limit_events,
    session_ttl_ms
  } = opts || {};

  const events = await readEventsJsonl(filePath, {
    siteId: site_id,
    fromTs: from_ts,
    toTs: to_ts,
    limit: limit_events
  });

  const sessions = buildSessions(events, { sessionTtlMs: session_ttl_ms });
  return sessions;
}

async function computeSessionSummaries(filePath, opts) {
  const sessions = await computeSessionsFromJsonl(filePath, opts);
  return sessions.map((s) => summarizeSession(s, { pathMappings: opts?.pathMappings })).filter(Boolean);
}

async function computeLabeledSessionSummaries(filePath, opts) {
  const summaries = await computeSessionSummaries(filePath, opts);
  return summaries.map((s) => ({
    summary: s,
    label: labelSessionSummary(s)
  }));
}

function computeLabelsSummary(labeledSessions) {
  const list = Array.isArray(labeledSessions) ? labeledSessions : [];
  const total = list.length || 1;

  const by = new Map();
  for (const x of list) {
    const lab = x?.label?.label || "unclassified";
    if (!by.has(lab)) by.set(lab, []);
    by.get(lab).push(x);
  }

  const out = [];
  for (const [label, items] of by.entries()) {
    const sessions = items.length;
    const share = sessions / total;
    const avg = (arr) => {
      const nums = arr.filter((n) => typeof n === "number" && isFinite(n));
      if (nums.length === 0) return 0;
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    };

    const avg_duration_ms = avg(items.map((x) => x.summary?.duration_ms));
    const avg_depth = avg(items.map((x) => x.summary?.depth));
    const checkout_complete_rate = avg(items.map((x) => (x.summary?.checkout_complete ? 1 : 0)));

    out.push({
      label,
      sessions,
      share,
      metrics: {
        avg_duration_ms,
        avg_depth,
        checkout_complete_rate
      }
    });
  }

  out.sort((a, b) => b.sessions - a.sessions);
  return out;
}

function buildInsightsInput(site_id, labeledSessions, opts) {
  const { perLabelRepresentatives = 3 } = opts || {};
  const source = Array.isArray(labeledSessions)
    ? labeledSessions.filter((item) => isInsightEligibleSummary(item?.summary))
    : [];
  const effective = source.length ? source : (Array.isArray(labeledSessions) ? labeledSessions : []);
  const labelsSummary = computeLabelsSummary(effective);
  const reps = pickRepresentatives(effective, perLabelRepresentatives);

  const labels = labelsSummary.map((x) => {
    const list = reps.get(x.label) || [];
    const allowed_paths = Array.from(new Set(
      list.flatMap((item) => normalizePaths(item?.summary?.unique_paths)).filter((path) => !isAuthOnlyPath(path))
    ));
    return {
      label: x.label,
      sessions: x.sessions,
      share: x.share,
      metrics: x.metrics,
      path_summary: summarizeRepresentativePaths(list),
      representative_steps: summarizeRepresentativeSteps(list),
      allowed_paths,
      representatives: list.map((y) => ({
        session_id: y.summary?.session_id,
        anon_user_id: y.summary?.anon_user_id,
        summary: y.summary,
        evidence: y.label?.evidence || []
      }))
    };
  });

  return {
    site_id,
    generated_at: Date.now(),
    labels
  };
}

module.exports = {
  computeSessionsFromJsonl,
  computeSessionSummaries,
  computeLabeledSessionSummaries,
  computeLabelsSummary,
  buildInsightsInput,
  isInsightEligibleSummary,
  representativeScore
};
