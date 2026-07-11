function createFakeRedisRuntime(initial = {}, keyPrefix = "") {
  const data = new Map(Object.entries(initial));
  const withPrefix = (key) => `${keyPrefix}${key}`;
  const runtime = {
    data,
    async connect() {
      return {
        options: { keyPrefix },
        async set(key, value) { data.set(withPrefix(key), value); return "OK"; },
        async get(key) { return data.get(withPrefix(key)) || null; },
        async incr(key) {
          const fullKey = withPrefix(key);
          const next = (Number(data.get(fullKey)) || 0) + 1;
          data.set(fullKey, String(next));
          return next;
        },
      };
    },
  };
  return runtime;
}

function makeSummary(overrides = {}) {
  return {
    site_id: "site_a",
    session_id: `s_${Math.random().toString(16).slice(2)}`,
    started_at: 1000,
    last_ts: 2000,
    event_count: 5,
    page_view_count: 3,
    click_count: 2,
    path_sequence: ["/", "/product", "/cart"],
    paths: ["/", "/product", "/cart"],
    dwell_total_ms: 30_000,
    max_step: "cart",
    ...overrides,
  };
}

module.exports = { createFakeRedisRuntime, makeSummary };
