const test = require("node:test");
const assert = require("node:assert/strict");

const { createRedisSessionStore } = require("../services/stores/redis-session-store");

function createFakeRedisRuntime(initial = {}, keyPrefix = "") {
  const data = new Map(Object.entries(initial));
  const withPrefix = (key) => `${keyPrefix}${key}`;
  const calls = { get: [], mget: 0 };
  const runtime = {
    calls,
    async connect() {
      return {
        options: { keyPrefix },
        async set(key, value) {
          data.set(withPrefix(key), value);
        },
        async get(key) {
          calls.get.push(key);
          return data.get(withPrefix(key)) || null;
        },
        async keys(pattern) {
          const prefixedPattern = withPrefix(pattern);
          const regex = new RegExp(`^${prefixedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`);
          return Array.from(data.keys()).filter((key) => regex.test(key));
        },
        async mget(keys) {
          calls.mget += 1;
          throw new Error(`mget should not be used for ${keys.length} keys`);
        },
      };
    },
  };
  return runtime;
}

test("redis session store lists session states newest first", async () => {
  const runtime = createFakeRedisRuntime({
    "uxsdk:session:legend-ecommerce:s1": JSON.stringify({ session_id: "s1", last_ts: 1000 }),
    "uxsdk:session:legend-ecommerce:s2": JSON.stringify({ session_id: "s2", last_ts: 1500 }),
  }, "uxsdk:");

  const store = createRedisSessionStore({
    redisRuntime: runtime,
    sessionTtlSec: 1800,
    assignmentTtlSec: 100,
  });

  const sessions = await store.listSessionStates({ siteId: "legend-ecommerce", limit: 10 });
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].session_id, "s2");
  assert.equal(sessions[1].session_id, "s1");
  assert.equal(runtime.calls.mget, 0);
  assert.deepEqual(runtime.calls.get.sort(), [
    "session:legend-ecommerce:s1",
    "session:legend-ecommerce:s2",
  ]);
});

test("redis session store reads multiple session states with individual GETs", async () => {
  const runtime = createFakeRedisRuntime({
    "uxsdk:session:site_a:s1": JSON.stringify({ session_id: "s1", last_ts: 1000 }),
    "uxsdk:session:site_a:s2": JSON.stringify({ session_id: "s2", last_ts: 2000 }),
    "uxsdk:session:site_a:s3": JSON.stringify({ session_id: "s3", last_ts: 3000 }),
  }, "uxsdk:");

  const store = createRedisSessionStore({
    redisRuntime: runtime,
    sessionTtlSec: 1800,
    assignmentTtlSec: 100,
  });

  const sessions = await store.listSessionStates({ siteId: "site_a", limit: 10 });
  assert.deepEqual(sessions.map((session) => session.session_id), ["s3", "s2", "s1"]);
  assert.equal(runtime.calls.mget, 0);
  assert.deepEqual(runtime.calls.get.sort(), [
    "session:site_a:s1",
    "session:site_a:s2",
    "session:site_a:s3",
  ]);
});
