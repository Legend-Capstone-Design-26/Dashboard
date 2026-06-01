const test = require("node:test");
const assert = require("node:assert/strict");
const { createRedisSessionStore } = require("../services/stores/redis-session-store");
const {
  createRedisSessionAnalyticsService,
  normalizeRedisSessionStateToSummary,
} = require("../services/analytics/redis-session-analytics-service");

function createFakeRedisRuntime(initial = {}, keyPrefix = "") {
  const data = new Map(Object.entries(initial));
  const withPrefix = (key) => `${keyPrefix}${key}`;
  return {
    async connect() {
      return {
        options: { keyPrefix },
        async set(key, value) { data.set(withPrefix(key), value); },
        async get(key) { return data.get(withPrefix(key)) || null; },
        async keys(pattern) {
          const prefixedPattern = withPrefix(pattern);
          const regex = new RegExp(`^${prefixedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
          return Array.from(data.keys()).filter((key) => regex.test(key));
        },
        async mget(keys) { return keys.map((key) => data.get(withPrefix(key)) || null); },
      };
    },
  };
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
  assert.equal(sessions.source, "redis");
  assert.equal(sessions.fallback_used, false);
  assert.equal(sessions.sessions.length, 2);
  assert.equal(Boolean(sessions.sessions[0].summary), true);
  assert.equal(Boolean(sessions.sessions[0].label), true);

  const labels = await service.getLabelsSummary({ siteId: "site_a", limit: 10 });
  assert.equal(labels.ok, true);
  assert.equal(labels.source, "redis");
  assert.equal(labels.summary.reduce((sum, item) => sum + item.sessions, 0), 2);
  assert.equal(labels.summary.every((item) => item.priority), true);
});

test("builds insights input from Redis sessions and Redis event summary", async () => {
  const service = createService([
    { site_id: "site_a", session_id: "s1", anon_user_id: "u1", started_at: 1000, last_ts: 200000, page_view_count: 4, click_count: 1, event_count: 5, paths: ["/", "/product/1", "/checkout"], checkout_started: true, max_step: "checkout" },
  ]);
  const input = await service.buildRedisInsightsInput({ siteId: "site_a", reps: 2 });
  assert.equal(input.site_id, "site_a");
  assert.equal(input.source, "redis");
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
