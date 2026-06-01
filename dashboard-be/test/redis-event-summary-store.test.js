const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { createRedisEventSummaryStore } = require("../services/stores/redis-event-summary-store");
const { createChatRoutes } = require("../routes/chat-routes");

class MockRedisClient {
  constructor() {
    this.hashes = new Map();
    this.zsets = new Map();
    this.sets = new Map();
    this.values = new Map();
  }

  _hash(key) {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    return this.hashes.get(key);
  }

  _zset(key) {
    if (!this.zsets.has(key)) this.zsets.set(key, new Map());
    return this.zsets.get(key);
  }

  _set(key) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    return this.sets.get(key);
  }

  async hincrby(key, field, increment) {
    const hash = this._hash(key);
    const next = Number(hash.get(field) || 0) + Number(increment || 0);
    hash.set(field, String(next));
    return next;
  }

  async hgetall(key) {
    return Object.fromEntries(this._hash(key).entries());
  }

  async zadd(key, score, member) {
    this._zset(key).set(String(member), Number(score));
    return 1;
  }

  async zincrby(key, increment, member) {
    const zset = this._zset(key);
    const next = Number(zset.get(String(member)) || 0) + Number(increment || 0);
    zset.set(String(member), next);
    return String(next);
  }

  async zrevrange(key, start, stop, withScores) {
    const items = Array.from(this._zset(key).entries()).sort((a, b) => b[1] - a[1]);
    const sliced = items.slice(start, stop + 1);
    if (withScores === "WITHSCORES") return sliced.flatMap(([member, score]) => [member, String(score)]);
    return sliced.map(([member]) => member);
  }

  async zcount(key, min, max) {
    const low = min === "-inf" ? -Infinity : Number(min);
    const high = max === "+inf" ? Infinity : Number(max);
    return Array.from(this._zset(key).values()).filter((score) => score >= low && score <= high).length;
  }

  async zremrangebyscore(key, min, max) {
    const zset = this._zset(key);
    const low = Number(min);
    const high = Number(max);
    for (const [member, score] of zset.entries()) {
      if (score >= low && score <= high) zset.delete(member);
    }
  }

  async sadd(key, member) {
    this._set(key).add(String(member));
    return 1;
  }

  async scard(key) {
    return this._set(key).size;
  }

  async get(key) {
    return this.values.get(key) || null;
  }

  async set(key, value) {
    this.values.set(key, String(value));
    return "OK";
  }
}

function createMockStore() {
  const client = new MockRedisClient();
  return createRedisEventSummaryStore({ redisRuntime: { connect: async () => client } });
}

test("redis event summary records pages clicks funnel and flow", async () => {
  const store = createMockStore();
  const base = { site_id: "site_a", session_id: "s1", ts: Date.now() - 1000 };
  await store.recordEventSummary({ event: { ...base, event_name: "page_view", path: "/product/1" } });
  await store.recordEventSummary({ event: { ...base, ts: Date.now() - 900, event_name: "click", path: "/product/1", props: { element_id: "buy_btn" } } });
  await store.recordEventSummary({ event: { ...base, ts: Date.now() - 800, event_name: "page_view", path: "/checkout" } });
  await store.recordEventSummary({ event: { ...base, ts: Date.now() - 700, event_name: "checkout_complete", path: "/order-complete" } });

  const summary = await store.getEventSummary({ siteId: "site_a", fromTs: Date.now() - 60_000, toTs: Date.now() + 1000 });
  assert.equal(summary.ok, true);
  assert.equal(summary.source, "redis");
  assert.equal(summary.fallback_used, false);
  assert.equal(summary.total_events, 4);
  assert.equal(summary.top_pages[0].path, "/product/1");
  assert.equal(summary.top_elements[0].element_id, "buy_btn");
  assert.equal(summary.funnel.detail_page_view, 1);
  assert.equal(summary.funnel.checkout_page_view, 1);
  assert.equal(summary.funnel.checkout_complete, 1);
  assert.equal(summary.page_flow.some((edge) => edge.from === "/product/1" && edge.to === "/checkout"), true);
});

test("redis event summary returns empty summary for empty read model", async () => {
  const store = createMockStore();
  const summary = await store.getEventSummary({ siteId: "site_empty" });
  assert.equal(summary.ok, true);
  assert.equal(summary.total_events, 0);
  assert.deepEqual(summary.top_pages, []);
  assert.deepEqual(summary.top_elements, []);
  assert.equal(summary.sdk_status.status, "unknown");
  assert.equal(summary.journey.ok, false);
});

test("event-summary API returns redis_unavailable without file fallback when Redis store is disabled", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "event-summary-api-"));
  const files = {
    experimentsFile: path.join(dir, "experiments.json"),
    eventsFile: path.join(dir, "events.jsonl"),
    sitesFile: path.join(dir, "sites.json"),
    productsFile: path.join(dir, "products.json"),
    faqFile: path.join(dir, "faq.json"),
    policiesFile: path.join(dir, "policies.json"),
    ordersFile: path.join(dir, "orders.json"),
    supportTicketsFile: path.join(dir, "support_tickets.json"),
    chatSessionsFile: path.join(dir, "chat_sessions.json"),
    chatEventsFile: path.join(dir, "chat_events.jsonl"),
    chatFeedbackFile: path.join(dir, "chat_feedback.json"),
  };
  fs.writeFileSync(files.experimentsFile, JSON.stringify({ experiments: [] }));
  fs.writeFileSync(files.eventsFile, `${JSON.stringify({ site_id: "site_a", event_name: "page_view", path: "/", ts: Date.now() })}\n`);
  fs.writeFileSync(files.sitesFile, JSON.stringify({ sites: [{ site_id: "site_a" }] }));
  fs.writeFileSync(files.productsFile, JSON.stringify({ products: [] }));
  fs.writeFileSync(files.faqFile, JSON.stringify({ items: [] }));
  fs.writeFileSync(files.policiesFile, JSON.stringify({ policies: [] }));
  fs.writeFileSync(files.ordersFile, JSON.stringify({ orders: [] }));
  fs.writeFileSync(files.supportTicketsFile, JSON.stringify({ tickets: [] }));
  fs.writeFileSync(files.chatSessionsFile, JSON.stringify({ sessions: [] }));
  fs.writeFileSync(files.chatEventsFile, "");
  fs.writeFileSync(files.chatFeedbackFile, JSON.stringify({ feedback: [] }));

  const app = express();
  app.use(express.json());
  app.use("/api", createChatRoutes({ files, middlewares: {}, redisEventSummaryStore: null }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/event-summary?site_id=site_a`);
    const json = await response.json();
    assert.equal(response.status, 503);
    assert.equal(json.ok, false);
    assert.equal(json.reason, "redis_unavailable");
    assert.equal(json.source, "redis");
    assert.equal(json.fallback_used, false);
    assert.equal(json.total_events, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
