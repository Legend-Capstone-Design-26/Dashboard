const { labelSessionSummary } = require("../../analytics/labeler");
const { computeLabelsSummary, buildInsightsInput } = require("../../analytics/pipeline");

const LABEL_PRIORITY = {
  ux_friction_dropper: "high",
  checkout_abandoner: "high",
  price_sensitive_dropper: "medium",
  over_explorer: "medium",
  window_shopper: "low",
};

const REDIS_UNAVAILABLE_RESPONSE = {
  ok: false,
  reason: "redis_unavailable",
  message: "실시간 데이터 저장소에 연결할 수 없습니다. Redis와 event consumer 상태를 확인해 주세요.",
  source: "redis",
  fallback_used: false,
};

function redisUnavailableResponse() {
  return { ...REDIS_UNAVAILABLE_RESPONSE };
}

function normalizePaths(state) {
  const paths = Array.isArray(state?.paths) ? state.paths : [];
  const values = paths.concat(state?.last_path ? [state.last_path] : [])
    .map((path) => String(path || "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function normalizeRedisSessionStateToSummary(state) {
  const startTs = Number(state?.started_at || state?.start_ts || state?.last_ts || 0) || 0;
  const endTs = Number(state?.last_ts || state?.updated_at || startTs) || startTs;
  const uniquePaths = normalizePaths(state);
  const pageViews = Number(state?.page_view_count ?? state?.pageviews ?? state?.page_views ?? 0) || 0;
  const clicks = Number(state?.click_count ?? state?.clicks ?? 0) || 0;
  return {
    site_id: state?.site_id || null,
    anon_user_id: state?.anon_user_id || null,
    session_id: state?.session_id || null,
    start_ts: startTs || null,
    end_ts: endTs || null,
    started_at: startTs || null,
    last_ts: endTs || null,
    duration_ms: Math.max(0, endTs - startTs),
    event_count: Number(state?.event_count || 0),
    page_views: pageViews,
    pageviews: pageViews,
    clicks,
    depth: uniquePaths.length,
    unique_paths: uniquePaths,
    paths: uniquePaths,
    dwell_total_ms: Number(state?.dwell_total_ms || state?.last_dwell_ms || 0) || 0,
    back_count: Number(state?.back_count || 0) || 0,
    error_count: Number(state?.error_count || 0) || 0,
    rage_clicks_count: Number(state?.rage_clicks_count || 0) || 0,
    price_interaction_count: Number(state?.price_interaction_count || 0) || 0,
    filter_count: Number(state?.filter_count || 0) || 0,
    search_count: Number(state?.search_count || 0) || 0,
    cart_add_count: Number(state?.cart_add_count || 0) || 0,
    cart_remove_count: Number(state?.cart_remove_count || 0) || 0,
    payment_attempt_count: Number(state?.payment_attempt_count || 0) || 0,
    checkout_entered: Boolean(state?.checkout_entered || state?.checkout_started || state?.max_step === "checkout" || state?.max_step === "payment"),
    checkout_complete: Boolean(state?.checkout_complete || state?.checkout_completed),
    max_step: state?.max_step || "home",
    ui_variant: state?.ui_variant || null,
    experiments: Array.isArray(state?.experiments) ? state.experiments : [],
    evidence: [
      uniquePaths[0] ? { ts: startTs || null, event_name: "session_start", path: uniquePaths[0], props: {} } : null,
      state?.last_event_name ? { ts: endTs || null, event_name: state.last_event_name, path: state.last_path || null, props: {} } : null,
    ].filter(Boolean),
  };
}

function labelRedisSessionState(state) {
  const summary = normalizeRedisSessionStateToSummary(state);
  return { summary, label: labelSessionSummary(summary) };
}

function withPriority(summary) {
  return summary.map((item) => ({
    ...item,
    priority: LABEL_PRIORITY[item.label] || (Number(item.share) >= 0.3 ? "medium" : "low"),
  }));
}

function createRedisSessionAnalyticsService({ redisSessionStore, redisEventSummaryStore }) {
  async function getLabeledSessions({ siteId, limit = 200, fromTs, toTs } = {}) {
    const states = await redisSessionStore.listSessionStates({ siteId, limit, fromTs, toTs });
    return states.map(labelRedisSessionState);
  }

  async function getSessions({ siteId, limit = 50, fromTs, toTs } = {}) {
    const labeled = await getLabeledSessions({ siteId, limit, fromTs, toTs });
    return {
      ok: true,
      source: "redis",
      fallback_used: false,
      site_id: siteId,
      from_ts: fromTs,
      to_ts: toTs,
      sessions: labeled,
    };
  }

  async function getLabelsSummary({ siteId, limit = 1000, fromTs, toTs } = {}) {
    const labeled = await getLabeledSessions({ siteId, limit, fromTs, toTs });
    return {
      ok: true,
      source: "redis",
      fallback_used: false,
      site_id: siteId,
      from_ts: fromTs,
      to_ts: toTs,
      summary: withPriority(computeLabelsSummary(labeled)),
    };
  }

  async function buildRedisInsightsInput({ siteId, fromTs, toTs, reps = 3, limit = 1000 } = {}) {
    const labeled = await getLabeledSessions({ siteId, limit, fromTs, toTs });
    const input = buildInsightsInput(siteId, labeled, { perLabelRepresentatives: reps });
    if (redisEventSummaryStore) {
      input.event_summary = await redisEventSummaryStore.getEventSummary({ siteId, fromTs, toTs });
    }
    input.source = "redis";
    input.fallback_used = false;
    return input;
  }

  return {
    getSessions,
    getLabelsSummary,
    buildRedisInsightsInput,
    normalizeRedisSessionStateToSummary,
  };
}

module.exports = {
  REDIS_UNAVAILABLE_RESPONSE,
  redisUnavailableResponse,
  normalizeRedisSessionStateToSummary,
  labelRedisSessionState,
  createRedisSessionAnalyticsService,
};
