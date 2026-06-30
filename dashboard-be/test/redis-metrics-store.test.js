const test = require("node:test");
const assert = require("node:assert/strict");

const { createRedisMetricsStore } = require("../services/stores/redis-metrics-store");

function createFakeRedisRuntime() {
  const hashes = new Map();
  const sets = new Map();
  const zsets = new Map();
  return {
    async connect() {
      return {
        multi() {
          throw new Error("multi should not be used with Redis Cluster keys");
        },
        async hincrby(key, field, inc) {
          const map = hashes.get(key) || new Map();
          map.set(field, (Number(map.get(field) || 0) + Number(inc)));
          hashes.set(key, map);
        },
        async sadd(key, value) {
          const set = sets.get(key) || new Set();
          set.add(value);
          sets.set(key, set);
        },
        async zincrby(key, inc, member) {
          const map = zsets.get(key) || new Map();
          map.set(member, (Number(map.get(member) || 0) + Number(inc)));
          zsets.set(key, map);
        },
        async hgetall(key) {
          const map = hashes.get(key) || new Map();
          return Object.fromEntries(map.entries());
        },
        async scard(key) {
          return (sets.get(key) || new Set()).size;
        },
        async zrevrange(key, start, stop, withScores) {
          const entries = Array.from((zsets.get(key) || new Map()).entries()).sort((a, b) => b[1] - a[1]).slice(start, stop + 1);
          if (withScores === "WITHSCORES") {
            return entries.flatMap(([member, score]) => [member, String(score)]);
          }
          return entries.map(([member]) => member);
        },
        async keys(pattern) {
          const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
          return Array.from(hashes.keys()).filter((key) => regex.test(key));
        },
      };
    },
  };
}

test("redis metrics store records and reads variant metrics", async () => {
  const store = createRedisMetricsStore({ redisRuntime: createFakeRedisRuntime() });

  await store.recordExperimentEvent({
    event: { site_id: "legend-ecommerce", session_id: "s1", anon_user_id: "u1", event_name: "page_view", props: {} },
    experimentKey: "exp1",
    variant: "B",
    goals: ["checkout_complete"],
  });
  await store.recordExperimentEvent({
    event: { site_id: "legend-ecommerce", session_id: "s1", anon_user_id: "u1", event_name: "click", props: { element_id: "cta" } },
    experimentKey: "exp1",
    variant: "B",
    goals: ["checkout_complete"],
  });
  await store.recordExperimentEvent({
    event: { site_id: "legend-ecommerce", session_id: "s1", anon_user_id: "u1", event_name: "checkout_complete", props: {} },
    experimentKey: "exp1",
    variant: "B",
    goals: ["checkout_complete"],
  });

  const metrics = await store.getExperimentMetrics({
    siteId: "legend-ecommerce",
    key: "exp1",
    goals: ["checkout_complete"],
    experiment: { id: "1", status: "running", url_prefix: "/checkout", version: 1, published_at: 1 },
  });

  assert.equal(metrics.source, "redis");
  assert.equal(metrics.B.sessions, 1);
  assert.equal(metrics.B.page_views, 1);
  assert.equal(metrics.B.clicks, 1);
  assert.equal(metrics.B.conversions, 1);
  assert.equal(metrics.B.top_clicked_elements[0].element_id, "cta");
});
