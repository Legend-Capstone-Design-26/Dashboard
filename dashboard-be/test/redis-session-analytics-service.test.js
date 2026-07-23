const test = require("node:test");
const assert = require("node:assert/strict");
const { createRedisSessionStore } = require("../services/stores/redis-session-store");
const {
  createRedisSessionAnalyticsService,
  normalizeRedisSessionStateToSummary,
} = require("../services/analytics/redis-session-analytics-service");

function createFakeRedisRuntime(initial = {}, keyPrefix = "") {
  const data = new Map(Object.entries(initial));
  const zsets = new Map();
  const withPrefix = (key) => `${keyPrefix}${key}`;
  const runtime = {
    data,
    deleteKey(key) {
      data.delete(key);
    },
    async connect() {
      return {
        options: { keyPrefix },
        async set(key, value) { data.set(withPrefix(key), value); },
        async get(key) { return data.get(withPrefix(key)) || null; },
        async zadd(key, score, member) {
          const fullKey = withPrefix(key);
          if (!zsets.has(fullKey)) zsets.set(fullKey, new Map());
          zsets.get(fullKey).set(String(member), Number(score));
          return 1;
        },
        async zrangebyscore(key, min, max, limitKeyword, offset, count) {
          const low = min === "-inf" ? -Infinity : Number(min);
          const high = max === "+inf" ? Infinity : Number(max);
          const members = Array.from((zsets.get(withPrefix(key)) || new Map()).entries())
            .filter(([, score]) => score >= low && score <= high)
            .sort((a, b) => a[1] - b[1])
            .map(([member]) => member);
          if (limitKeyword === "LIMIT") return members.slice(Number(offset), Number(offset) + Number(count));
          return members;
        },
        async keys(pattern) {
          const prefixedPattern = withPrefix(pattern);
          const regex = new RegExp(`^${prefixedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
          return Array.from(data.keys()).filter((key) => regex.test(key));
        },
        async mget() { throw new Error("mget should not be used for Redis session reads"); },
      };
    },
  };
  return runtime;
}

function createService(states) {
  const redisSessionStore = {
    async listSessionStates({ fromTs, toTs, limit }) {
      return states
        .filter((state) => typeof fromTs !== "number" || Number(state.last_ts || 0) >= fromTs)
        .filter((state) => typeof toTs !== "number" || Number(state.last_ts || 0) <= toTs)
        .slice(0, limit || states.length);
    },
  };
  const redisEventSummaryStore = {
    async getEventSummary({ siteId }) {
      return { ok: true, source: "redis", site_id: siteId, total_events: 10, top_pages: [{ path: "/checkout", count: 2 }] };
    },
  };
  return createRedisSessionAnalyticsService({ redisSessionStore, redisEventSummaryStore });
}

test("normalizes Redis session state to existing session summary shape", () => {
  const summary = normalizeRedisSessionStateToSummary({
    site_id: "site_a",
    session_id: "s1",
    anon_user_id: "u1",
    started_at: 1000,
    last_ts: 4000,
    page_view_count: 2,
    click_count: 1,
    event_count: 3,
    paths: ["/", "/checkout"],
    checkout_started: true,
    max_step: "checkout",
  });
  assert.equal(summary.session_id, "s1");
  assert.equal(summary.duration_ms, 3000);
  assert.equal(summary.page_views, 2);
  assert.equal(summary.clicks, 1);
  assert.equal(summary.depth, 2);
  assert.equal(summary.checkout_entered, true);
});

test("builds sessions and label summary from Redis session states", async () => {
  const service = createService([
    { site_id: "site_a", session_id: "s1", started_at: 1000, last_ts: 120000, page_view_count: 5, click_count: 1, event_count: 6, paths: ["/", "/product/1", "/checkout"], checkout_started: true, max_step: "checkout" },
    { site_id: "site_a", session_id: "s2", started_at: 1000, last_ts: 200000, page_view_count: 1, click_count: 0, event_count: 1, paths: ["/"] },
  ]);
  const sessions = await service.getSessions({ siteId: "site_a", limit: 10 });
  assert.equal(sessions.ok, true);
  assert.equal(sessions.source, "redis_historical_sessions");
  assert.equal(sessions.fallback_used, false);
  assert.equal(sessions.sessions.length, 2);
  assert.equal(Boolean(sessions.sessions[0].summary), true);
  assert.equal(Boolean(sessions.sessions[0].label), true);

  const labels = await service.getLabelsSummary({ siteId: "site_a", limit: 10 });
  assert.equal(labels.ok, true);
  assert.equal(labels.source, "redis_historical_sessions");
  assert.equal(labels.summary.reduce((sum, item) => sum + item.sessions, 0), 2);
  assert.equal(labels.summary.every((item) => item.priority), true);
});

test("builds insights input from Redis sessions and Redis event summary", async () => {
  const service = createService([
    { site_id: "site_a", session_id: "s1", anon_user_id: "u1", started_at: 1000, last_ts: 200000, page_view_count: 4, click_count: 1, event_count: 5, paths: ["/", "/product/1", "/checkout"], checkout_started: true, max_step: "checkout" },
  ]);
  const input = await service.buildRedisInsightsInput({ siteId: "site_a", reps: 2 });
  assert.equal(input.site_id, "site_a");
  assert.equal(input.source, "redis_historical_sessions");
  assert.equal(input.fallback_used, false);
  assert.equal(Array.isArray(input.labels), true);
  assert.equal(input.event_summary.source, "redis");
});

test("returns empty Redis analytics results for empty session state", async () => {
  const service = createService([]);
  const sessions = await service.getSessions({ siteId: "site_empty" });
  const labels = await service.getLabelsSummary({ siteId: "site_empty" });
  assert.deepEqual(sessions.sessions, []);
  assert.deepEqual(labels.summary, []);
});

test("redis session store applies from_ts and to_ts filters", async () => {
  const runtime = createFakeRedisRuntime({
    "uxsdk:session:site_a:s1": JSON.stringify({ session_id: "s1", last_ts: 1000 }),
    "uxsdk:session:site_a:s2": JSON.stringify({ session_id: "s2", last_ts: 2000 }),
    "uxsdk:session:site_a:s3": JSON.stringify({ session_id: "s3", last_ts: 3000 }),
  }, "uxsdk:");
  const store = createRedisSessionStore({ redisRuntime: runtime, sessionTtlSec: 1800, assignmentTtlSec: 100 });
  const sessions = await store.listSessionStates({ siteId: "site_a", fromTs: 1500, toTs: 2500, limit: 10 });
  assert.deepEqual(sessions.map((session) => session.session_id), ["s2"]);
});

test("historical session summaries survive live session key expiration", async () => {
  const startedAt = Date.UTC(2026, 6, 10, 14, 30, 0);
  const lastTs = startedAt + (45 * 60 * 1000);
  const runtime = createFakeRedisRuntime({}, "uxsdk:");
  const store = createRedisSessionStore({ redisRuntime: runtime, sessionTtlSec: 1800, assignmentTtlSec: 100 });

  await store.upsertSessionState({
    siteId: "site_a",
    sessionId: "s_cross_midnight",
    state: {
      site_id: "site_a",
      session_id: "s_cross_midnight",
      anon_user_id: "u1",
      started_at: startedAt,
      last_ts: lastTs,
      event_count: 3,
      page_view_count: 2,
      click_count: 1,
      paths: ["/", "/checkout"],
      checkout_started: true,
      max_step: "checkout",
    },
  });

  runtime.deleteKey("uxsdk:session:site_a:s_cross_midnight");
  const liveSessions = await store.listSessionStates({ siteId: "site_a", fromTs: startedAt - 1, toTs: lastTs + 1, limit: 10 });
  assert.deepEqual(liveSessions, []);

  const historical = await store.listHistoricalSessionSummaries({ siteId: "site_a", fromTs: startedAt - 1, toTs: startedAt + 1, limit: 10 });
  assert.equal(historical.length, 1);
  assert.equal(historical[0].session_id, "s_cross_midnight");
  assert.equal(historical[0].started_at, startedAt);
  assert.equal(historical[0].last_ts, lastTs);
  assert.equal(historical[0].duration_ms, 45 * 60 * 1000);
  assert.equal(historical[0].depth, 2);
});

test("historical session summaries preserve ordered path_sequence and dashboard aliases", async () => {
  const runtime = createFakeRedisRuntime({}, "uxsdk:");
  const store = createRedisSessionStore({ redisRuntime: runtime, sessionTtlSec: 1800, assignmentTtlSec: 100 });

  await store.upsertHistoricalSessionSummary({
    siteId: "site_a",
    sessionId: "s_repeat",
    state: {
      site_id: "site_a",
      session_id: "s_repeat",
      started_at: 1000,
      last_ts: 2000,
      path_sequence: ["/product", "/cart", "/product"],
      paths: ["/product", "/cart"],
      page_view_count: 3,
    },
  });

  const historical = await store.listHistoricalSessionSummaries({ siteId: "site_a", limit: 10 });
  assert.equal(historical[0].summary_schema_version, 2);
  assert.deepEqual(historical[0].path_sequence, ["/product", "/cart", "/product"]);
  assert.deepEqual(historical[0].unique_paths, ["/product", "/cart"]);
  assert.deepEqual(historical[0].paths, ["/product", "/cart"]);
  assert.equal(historical[0].depth, 2);
});

test("historical analytics keep KPI labels and trend consistent after live TTL expiry", async () => {
  const kstDayStart = Date.UTC(2026, 6, 9, 15, 0, 0); // 2026-07-10 00:00 Asia/Seoul
  const firstStartedAt = Date.UTC(2026, 6, 10, 14, 30, 0); // crosses into 2026-07-11 KST by last_ts
  const secondStartedAt = Date.UTC(2026, 6, 11, 1, 0, 0);
  const runtime = createFakeRedisRuntime({}, "uxsdk:");
  const store = createRedisSessionStore({ redisRuntime: runtime, sessionTtlSec: 1800, assignmentTtlSec: 100 });
  const service = createRedisSessionAnalyticsService({ redisSessionStore: store });

  await store.upsertSessionState({
    siteId: "site_a",
    sessionId: "s1",
    state: {
      site_id: "site_a",
      session_id: "s1",
      started_at: firstStartedAt,
      last_ts: firstStartedAt + (20 * 60 * 1000),
      event_count: 1,
      page_view_count: 1,
      click_count: 0,
      paths: ["/"],
    },
  });
  await store.upsertSessionState({
    siteId: "site_a",
    sessionId: "s1",
    state: {
      site_id: "site_a",
      session_id: "s1",
      started_at: firstStartedAt,
      last_ts: firstStartedAt + (45 * 60 * 1000),
      event_count: 3,
      page_view_count: 2,
      click_count: 1,
      paths: ["/", "/checkout"],
      checkout_started: true,
      max_step: "checkout",
    },
  });
  await store.upsertSessionState({
    siteId: "site_a",
    sessionId: "s2",
    state: {
      site_id: "site_a",
      session_id: "s2",
      started_at: secondStartedAt,
      last_ts: secondStartedAt + 60_000,
      event_count: 2,
      page_view_count: 1,
      click_count: 1,
      paths: ["/product/1"],
      price_interaction_count: 1,
      max_step: "product",
    },
  });
  await store.upsertSessionState({
    siteId: "site_b",
    sessionId: "s_other",
    state: { site_id: "site_b", session_id: "s_other", started_at: secondStartedAt, last_ts: secondStartedAt, event_count: 1, paths: ["/"] },
  });

  runtime.deleteKey("uxsdk:session:site_a:s1");
  runtime.deleteKey("uxsdk:session:site_a:s2");
  const liveSessions = await store.listSessionStates({ siteId: "site_a", fromTs: kstDayStart, toTs: kstDayStart + (2 * 24 * 60 * 60 * 1000), limit: 10 });
  assert.deepEqual(liveSessions, []);

  const sessions = await service.getSessions({ siteId: "site_a", fromTs: kstDayStart, toTs: kstDayStart + (2 * 24 * 60 * 60 * 1000), limit: 10 });
  assert.equal(sessions.sessions.length, 2);
  assert.deepEqual(new Set(sessions.sessions.map((entry) => entry.summary.session_id)), new Set(["s1", "s2"]));

  const labels = await service.getLabelsSummary({ siteId: "site_a", fromTs: kstDayStart, toTs: kstDayStart + (2 * 24 * 60 * 60 * 1000), limit: 10 });
  assert.equal(labels.summary.reduce((sum, item) => sum + item.sessions, 0), 2);

  const trend = await service.getSessionTrend({ siteId: "site_a", fromTs: kstDayStart, toTs: kstDayStart + (2 * 24 * 60 * 60 * 1000), limit: 10 });
  assert.equal(trend.reduce((sum, item) => sum + item.session_count, 0), 2);
  assert.equal(trend.find((item) => item.ts === kstDayStart)?.session_count, 1);
  assert.equal(trend.find((item) => item.ts === kstDayStart + (24 * 60 * 60 * 1000))?.session_count, 1);
});
