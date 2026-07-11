function buildAssignmentKey({ siteId, experimentKey, anonUserId }) {
  return `ab:assign:${siteId}:${experimentKey}:${anonUserId}`;
}

function buildSessionKey({ siteId, sessionId }) {
  // TODO: For Redis Cluster, migrate new keys to hash tags such as
  // `uxsdk:{site:<siteId>}:session:<sessionId>` after existing data compatibility is handled.
  return `session:${siteId}:${sessionId}`;
}

function buildHistoricalSessionKey({ siteId, sessionId }) {
  return `session_summary:${siteId}:${sessionId}`;
}

function buildHistoricalSessionIndexKey({ siteId }) {
  return `session_summary_index:${siteId}:started_at`;
}

const HISTORICAL_SUMMARY_SCHEMA_VERSION = 2;

function normalizePathList(paths) {
  return (Array.isArray(paths) ? paths : [])
    .map((path) => String(path || "").trim())
    .filter(Boolean);
}

function normalizePathSequence(state) {
  const explicit = normalizePathList(state?.path_sequence);
  if (explicit.length > 0) return explicit;
  const fallback = normalizePathList(state?.paths);
  if (state?.last_path) fallback.push(String(state.last_path).trim());
  return fallback.filter(Boolean);
}

function normalizePaths(state) {
  const values = normalizePathSequence(state);
  return Array.from(new Set(values));
}

function normalizeHistoricalSessionSummary(state) {
  const startTs = Number(state?.started_at || state?.start_ts || state?.last_ts || 0) || 0;
  const endTs = Number(state?.last_ts || state?.last_event_at || state?.updated_at || startTs) || startTs;
  const pathSequence = normalizePathSequence(state);
  const uniquePaths = normalizePaths(state);
  const pageViews = Number(state?.page_view_count ?? state?.page_views ?? state?.pageviews ?? 0) || 0;
  const clicks = Number(state?.click_count ?? state?.clicks ?? 0) || 0;
  const checkoutEntered = Boolean(state?.checkout_entered || state?.checkout_started || state?.max_step === "checkout" || state?.max_step === "payment");
  const checkoutComplete = Boolean(state?.checkout_complete || state?.checkout_completed);
  return {
    ...(state || {}),
    site_id: state?.site_id || null,
    session_id: state?.session_id || null,
    summary_schema_version: Number(state?.summary_schema_version || HISTORICAL_SUMMARY_SCHEMA_VERSION),
    anon_user_id: state?.anon_user_id || null,
    started_at: startTs || null,
    start_ts: startTs || null,
    last_event_at: endTs || null,
    last_ts: endTs || null,
    end_ts: endTs || null,
    duration_ms: Math.max(0, endTs - startTs),
    event_count: Number(state?.event_count || 0),
    page_view_count: pageViews,
    page_views: pageViews,
    pageviews: pageViews,
    click_count: clicks,
    clicks,
    depth: uniquePaths.length,
    path_sequence: pathSequence,
    paths: uniquePaths,
    unique_paths: uniquePaths,
    dwell_total_ms: Number(state?.dwell_total_ms || state?.last_dwell_ms || 0) || 0,
    back_count: Number(state?.back_count || 0) || 0,
    error_count: Number(state?.error_count || 0) || 0,
    rage_clicks_count: Number(state?.rage_clicks_count || 0) || 0,
    price_interaction_count: Number(state?.price_interaction_count || 0) || 0,
    filter_count: Number(state?.filter_count || state?.filter_change_count || 0) || 0,
    filter_change_count: Number(state?.filter_count || state?.filter_change_count || 0) || 0,
    search_count: Number(state?.search_count || 0) || 0,
    cart_add_count: Number(state?.cart_add_count || state?.add_to_cart_count || 0) || 0,
    add_to_cart_count: Number(state?.cart_add_count || state?.add_to_cart_count || 0) || 0,
    cart_remove_count: Number(state?.cart_remove_count || 0) || 0,
    wishlist_count: Number(state?.wishlist_count || 0) || 0,
    payment_attempt_count: Number(state?.payment_attempt_count || 0) || 0,
    checkout_started: checkoutEntered,
    checkout_entered: checkoutEntered,
    checkout_completed: checkoutComplete,
    checkout_complete: checkoutComplete,
    max_step: state?.max_step || "home",
    ui_variant: state?.ui_variant || null,
    experiments: Array.isArray(state?.experiments) ? state.experiments : [],
    evidence: Array.isArray(state?.evidence) ? state.evidence : [
      uniquePaths[0] ? { ts: startTs || null, event_name: "session_start", path: uniquePaths[0], props: {} } : null,
      state?.last_event_name ? { ts: endTs || null, event_name: state.last_event_name, path: state.last_path || null, props: {} } : null,
    ].filter(Boolean),
  };
}

async function scanKeys(client, pattern) {
  const prefix = String(client?.options?.keyPrefix || "");
  const physicalPattern = `${prefix}${pattern}`;

  if (typeof client.scan === "function") {
    const keys = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await client.scan(cursor, "MATCH", physicalPattern, "COUNT", 100);
      cursor = String(nextCursor);
      keys.push(...(Array.isArray(batch) ? batch : []));
    } while (cursor !== "0");

    return keys.map((key) => prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key);
  }

  const keys = await client.keys(pattern);
  return keys.map((key) => prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key);
}

function createRedisSessionStore({ redisRuntime, sessionTtlSec, assignmentTtlSec }) {
  async function upsertHistoricalSessionSummaryWithClient(client, { siteId, sessionId, state }) {
    const summary = normalizeHistoricalSessionSummary({ ...(state || {}), site_id: siteId, session_id: sessionId });
    if (!summary.site_id || !summary.session_id || typeof summary.started_at !== "number") {
      return { ok: false, reason: "invalid_session_summary" };
    }
    const key = buildHistoricalSessionKey({ siteId: summary.site_id, sessionId: summary.session_id });
    const indexKey = buildHistoricalSessionIndexKey({ siteId: summary.site_id });
    const payload = JSON.stringify({ ...summary, updated_at: Date.now() });
    await client.set(key, payload);
    await client.zadd(indexKey, summary.started_at, summary.session_id);
    return { ok: true, key, indexKey };
  }

  async function upsertHistoricalSessionSummary({ siteId, sessionId, state }) {
    const client = await redisRuntime.connect();
    return upsertHistoricalSessionSummaryWithClient(client, { siteId, sessionId, state });
  }

  async function listHistoricalSessionSummaries({ siteId, limit = 1000, fromTs, toTs } = {}) {
    const client = await redisRuntime.connect();
    const indexKey = buildHistoricalSessionIndexKey({ siteId });
    const min = typeof fromTs === "number" && Number.isFinite(fromTs) ? fromTs : "-inf";
    const max = typeof toTs === "number" && Number.isFinite(toTs) ? toTs : "+inf";
    const maxLimit = Math.max(1, Math.min(Number(limit) || 1000, 100000));
    const sessionIds = await client.zrangebyscore(indexKey, min, max, "LIMIT", 0, maxLimit);
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return [];

    const keys = sessionIds.map((sessionId) => buildHistoricalSessionKey({ siteId, sessionId }));
    const values = await Promise.all(keys.map((key) => client.get(key)));
    const items = [];
    for (const value of values) {
      if (!value) continue;
      try {
        const summary = normalizeHistoricalSessionSummary(JSON.parse(value));
        const startedAt = Number(summary?.started_at || 0);
        if (typeof fromTs === "number" && Number.isFinite(fromTs) && startedAt < fromTs) continue;
        if (typeof toTs === "number" && Number.isFinite(toTs) && startedAt > toTs) continue;
        items.push(summary);
      } catch {
        continue;
      }
    }

    return items.sort((a, b) => (Number(b?.started_at) || 0) - (Number(a?.started_at) || 0));
  }

  async function listSessionStates({ siteId, limit = 50, fromTs, toTs } = {}) {
    const client = await redisRuntime.connect();
    const pattern = buildSessionKey({ siteId, sessionId: "*" });
    const keys = await scanKeys(client, pattern);
    if (keys.length === 0) return [];

    const values = await Promise.all(keys.map((key) => client.get(key)));
    const items = [];
    for (let i = 0; i < keys.length; i += 1) {
      const value = values[i];
      if (!value) continue;
      try {
        items.push(JSON.parse(value));
      } catch {
        continue;
      }
    }

    const maxLimit = Math.max(1, Math.min(Number(limit) || 50, 1000));
    return items
      .filter((item) => {
        const lastTs = Number(item?.last_ts || item?.updated_at || 0);
        if (typeof fromTs === "number" && Number.isFinite(fromTs) && lastTs < fromTs) return false;
        if (typeof toTs === "number" && Number.isFinite(toTs) && lastTs > toTs) return false;
        return true;
      })
      .sort((a, b) => (Number(b?.last_ts) || 0) - (Number(a?.last_ts) || 0))
      .slice(0, maxLimit);
  }

  async function setVariantAssignment({ siteId, experimentKey, anonUserId, variant, version }) {
    const client = await redisRuntime.connect();
    const key = buildAssignmentKey({ siteId, experimentKey, anonUserId });
    const payload = JSON.stringify({ variant, version: version || null, updated_at: Date.now() });
    await client.set(key, payload, "EX", assignmentTtlSec);
    return { ok: true, key };
  }

  async function getVariantAssignment({ siteId, experimentKey, anonUserId }) {
    const client = await redisRuntime.connect();
    const key = buildAssignmentKey({ siteId, experimentKey, anonUserId });
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  async function upsertSessionState({ siteId, sessionId, state }) {
    const client = await redisRuntime.connect();
    const key = buildSessionKey({ siteId, sessionId });
    const payload = JSON.stringify({ ...(state || {}), updated_at: Date.now() });
    await client.set(key, payload, "EX", sessionTtlSec);
    await upsertHistoricalSessionSummaryWithClient(client, { siteId, sessionId, state });
    return { ok: true, key };
  }

  async function getSessionState({ siteId, sessionId }) {
    const client = await redisRuntime.connect();
    const key = buildSessionKey({ siteId, sessionId });
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return {
    listSessionStates,
    setVariantAssignment,
    getVariantAssignment,
    upsertSessionState,
    getSessionState,
    upsertHistoricalSessionSummary,
    listHistoricalSessionSummaries,
  };
}

module.exports = {
  createRedisSessionStore,
  normalizeHistoricalSessionSummary,
  HISTORICAL_SUMMARY_SCHEMA_VERSION,
};
