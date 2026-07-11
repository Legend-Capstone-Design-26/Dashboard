const crypto = require("crypto");
const { inferStepFromPath } = require("../../analytics/funnel");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
const RECENT_WINDOW_MS = 5 * 60 * 1000;

const JOURNEY_STEPS = [
  { key: "home", label: "홈" },
  { key: "browse", label: "상품 목록" },
  { key: "product", label: "상품 상세" },
  { key: "cart", label: "장바구니" },
  { key: "checkout", label: "결제" },
  { key: "purchase", label: "구매 완료" },
];

function getEventTs(event) {
  if (typeof event?.ts === "number" && Number.isFinite(event.ts)) return event.ts;
  if (typeof event?.received_at === "number" && Number.isFinite(event.received_at)) return event.received_at;
  return Date.now();
}

function safePath(pathname) {
  const path = String(pathname || "/").trim() || "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function parseCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function buildKey(siteId, suffix) {
  return `summary:site:${siteId}:${suffix}`;
}

function bucketStartTs(ts, bucketMs) {
  if (bucketMs === DAY_MS) return Math.floor((ts + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
  return Math.floor(ts / bucketMs) * bucketMs;
}

function mapZRangeWithScores(items, keyName) {
  const out = [];
  for (let i = 0; i < items.length; i += 2) {
    out.push({ [keyName]: items[i], count: parseCount(items[i + 1]) });
  }
  return out;
}

function normalizeJourneyStep(step, index) {
  return {
    key: step.key,
    label: step.label,
    step_index: index,
    entered_sessions: 0,
    next_step_sessions: 0,
    next_step_rate: null,
    drop_rate: null,
    high_drop: false,
  };
}

function emptySummary({ siteId, fromTs, toTs }) {
  return {
    ok: true,
    source: "redis",
    fallback_used: false,
    site_id: siteId,
    from_ts: fromTs,
    to_ts: toTs,
    total_events: 0,
    top_pages: [],
    top_elements: [],
    page_flow: [],
    trend: [],
    // TODO: 2단계에서 Redis session timeline 기반 journey 전환율을 고도화한다.
    journey: { ok: false, total_sessions: 0, steps: JOURNEY_STEPS.map(normalizeJourneyStep) },
    sdk_status: { status: "unknown", label: "수신 정보 없음", last_event_ts: null, recent_events_5m: 0 },
    funnel: { detail_page_view: 0, checkout_page_view: 0, checkout_complete: 0, checkout_completion_rate: 0 },
  };
}

function createRedisEventSummaryStore({ redisRuntime }) {
  async function recordEventSummary({ event, pathMappings } = {}) {
    const siteId = String(event?.site_id || "").trim();
    if (!siteId) return { ok: false, reason: "missing_site_id" };

    const client = await redisRuntime.connect();
    const ts = getEventTs(event);
    const eventName = String(event?.event_name || "");
    const path = safePath(event?.path || "/");
    const sessionId = event?.session_id ? String(event.session_id) : "";
    const eventId = event?.event_id || event?.id || `${ts}:${sessionId || "no_session"}:${eventName}:${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString("hex")}`;
    const statsKey = buildKey(siteId, "stats");
    const eventsKey = buildKey(siteId, "events");
    const recentKey = buildKey(siteId, "recent_events");

    await client.hincrby(statsKey, "total_events", 1);
    await client.hincrby(statsKey, "last_event_ts", 0);
    const currentStats = await client.hgetall(statsKey);
    if (ts >= parseCount(currentStats?.last_event_ts)) await client.hincrby(statsKey, "last_event_ts", ts - parseCount(currentStats?.last_event_ts));
    await client.zadd(eventsKey, ts, eventId);
    await client.zadd(recentKey, ts, eventId);
    await client.zremrangebyscore(recentKey, 0, Date.now() - RECENT_WINDOW_MS);

    for (const bucketMs of [HOUR_MS, DAY_MS]) {
      const bucketTs = bucketStartTs(ts, bucketMs);
      await client.hincrby(buildKey(siteId, `trend:${bucketMs}:events`), String(bucketTs), 1);
      if (sessionId) await client.sadd(buildKey(siteId, `trend:${bucketMs}:sessions:${bucketTs}`), sessionId);
    }

    if (eventName === "page_view") {
      await client.zincrby(buildKey(siteId, "top_pages"), 1, path);
      const step = inferStepFromPath(path, pathMappings);
      if (step === "product") await client.hincrby(buildKey(siteId, "funnel"), "detail_page_view", 1);
      if (step === "checkout") await client.hincrby(buildKey(siteId, "funnel"), "checkout_page_view", 1);
    }

    if (eventName === "click") {
      await client.zincrby(buildKey(siteId, "top_elements"), 1, event?.props?.element_id || "(unknown)");
    }

    if (eventName === "checkout_complete") {
      await client.hincrby(buildKey(siteId, "funnel"), "checkout_complete", 1);
    }

    if (sessionId && path) {
      const lastPathKey = buildKey(siteId, `session:${sessionId}:last_path`);
      const previousPath = await client.get(lastPathKey);
      if (previousPath && previousPath !== path) await client.zincrby(buildKey(siteId, "flow"), 1, `${previousPath}=>${path}`);
      await client.set(lastPathKey, path);
    }

    return { ok: true };
  }

  async function buildTrend({ client, siteId, fromTs, toTs, totalEvents }) {
    if (!totalEvents) return [];
    const now = Date.now();
    const end = typeof toTs === "number" ? toTs : now;
    const start = typeof fromTs === "number" ? fromTs : end - DAY_MS;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const bucketMs = (end - start) <= DAY_MS ? HOUR_MS : DAY_MS;
    const eventCounts = await client.hgetall(buildKey(siteId, `trend:${bucketMs}:events`));
    const trend = [];
    for (let ts = bucketStartTs(start, bucketMs); ts <= end; ts += bucketMs) {
      const eventCount = parseCount(eventCounts?.[String(ts)]);
      const sessionCount = await client.scard(buildKey(siteId, `trend:${bucketMs}:sessions:${ts}`));
      trend.push({ ts, event_count: eventCount, session_count: parseCount(sessionCount) });
    }
    return trend;
  }

  async function getEventSummary({ siteId, page, fromTs, toTs } = {}) {
    const resolvedSiteId = String(siteId || "").trim();
    const client = await redisRuntime.connect();
    const stats = await client.hgetall(buildKey(resolvedSiteId, "stats"));
    const totalEvents = (typeof fromTs === "number" || typeof toTs === "number")
      ? await client.zcount(buildKey(resolvedSiteId, "events"), typeof fromTs === "number" ? fromTs : "-inf", typeof toTs === "number" ? toTs : "+inf")
      : parseCount(stats?.total_events);
    const summary = emptySummary({ siteId: resolvedSiteId, fromTs, toTs });
    summary.total_events = parseCount(totalEvents);

    const recentEvents5m = await client.zcount(buildKey(resolvedSiteId, "recent_events"), Date.now() - RECENT_WINDOW_MS, "+inf");
    const lastEventTs = parseCount(stats?.last_event_ts) || null;
    if (lastEventTs) {
      const diffMs = Date.now() - lastEventTs;
      summary.sdk_status = {
        status: diffMs <= RECENT_WINDOW_MS ? "normal" : diffMs <= 30 * 60 * 1000 ? "caution" : "missing",
        label: diffMs <= RECENT_WINDOW_MS ? "정상" : diffMs <= 30 * 60 * 1000 ? "주의" : "미수신",
        last_event_ts: lastEventTs,
        recent_events_5m: parseCount(recentEvents5m),
      };
    }

    const topPagesRaw = await client.zrevrange(buildKey(resolvedSiteId, "top_pages"), 0, 24, "WITHSCORES");
    summary.top_pages = mapZRangeWithScores(topPagesRaw, "path")
      .filter((item) => !page || item.path.startsWith(page))
      .slice(0, 10);
    const topElementsRaw = await client.zrevrange(buildKey(resolvedSiteId, "top_elements"), 0, 9, "WITHSCORES");
    summary.top_elements = mapZRangeWithScores(topElementsRaw, "element_id");
    const flowRaw = await client.zrevrange(buildKey(resolvedSiteId, "flow"), 0, 14, "WITHSCORES");
    summary.page_flow = mapZRangeWithScores(flowRaw, "edge").map((item) => {
      const [from, to] = String(item.edge || "").split("=>");
      return { from, to, count: item.count };
    }).filter((item) => item.from && item.to);
    summary.trend = await buildTrend({ client, siteId: resolvedSiteId, fromTs, toTs, totalEvents: summary.total_events });

    const funnel = await client.hgetall(buildKey(resolvedSiteId, "funnel"));
    const checkoutPageViews = parseCount(funnel?.checkout_page_view);
    const checkoutComplete = parseCount(funnel?.checkout_complete);
    summary.funnel = {
      detail_page_view: parseCount(funnel?.detail_page_view),
      checkout_page_view: checkoutPageViews,
      checkout_complete: checkoutComplete,
      checkout_completion_rate: checkoutPageViews > 0 ? checkoutComplete / checkoutPageViews : 0,
    };

    return summary;
  }

  return { recordEventSummary, getEventSummary };
}

module.exports = {
  createRedisEventSummaryStore,
  emptySummary,
};
