const test = require("node:test");
const assert = require("node:assert/strict");
const { collectEvents } = require("../services/collector/collect-handler");
const { createKafkaEventStore } = require("../services/stores/event-store");

test("collect returns 400 when events array is empty", async () => {
  const result = await collectEvents({ events: [], kafkaEventStore: { appendBatch() {} } });
  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, "no events");
});

test("collect returns kafka_unavailable when Kafka store is missing", async () => {
  let fallbackCalled = false;
  const result = await collectEvents({
    events: [{ event_name: "page_view" }],
    legacyFileEventStore: { appendBatch() { fallbackCalled = true; } },
    enableLegacyFileFallback: false,
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.reason, "kafka_unavailable");
  assert.equal(result.body.source, "kafka");
  assert.equal(result.body.fallback_used, false);
  assert.equal(fallbackCalled, false);
});

test("collect publishes to Kafka primary and returns source metadata", async () => {
  const calls = [];
  const result = await collectEvents({
    events: [{ event_name: "page_view" }, { event_name: "click" }],
    kafkaEventStore: {
      async appendBatch(events, meta) {
        calls.push({ events, meta });
        return { written: events.length };
      },
    },
    meta: { received_at: 1000, request_id: "req_1" },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.received, 2);
  assert.equal(result.body.source, "kafka");
  assert.equal(result.body.fallback_used, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].meta.request_id, "req_1");
});

test("collect does not fallback to file when Kafka publish fails by default", async () => {
  let fallbackCalled = false;
  const result = await collectEvents({
    events: [{ event_name: "page_view" }],
    kafkaEventStore: { async appendBatch() { throw new Error("broker down"); } },
    legacyFileEventStore: { appendBatch() { fallbackCalled = true; } },
    enableLegacyFileFallback: false,
    logger: { warn() {} },
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.reason, "kafka_unavailable");
  assert.equal(result.body.fallback_used, false);
  assert.equal(fallbackCalled, false);
});

test("collect can use explicit legacy file fallback only when enabled", async () => {
  let fallbackCalled = false;
  const result = await collectEvents({
    events: [{ event_name: "page_view" }],
    kafkaEventStore: { async appendBatch() { throw new Error("broker down"); } },
    legacyFileEventStore: { async appendBatch(events) { fallbackCalled = true; return { written: events.length }; } },
    enableLegacyFileFallback: true,
    logger: { warn() {} },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.source, "file");
  assert.equal(result.body.fallback_used, true);
  assert.equal(fallbackCalled, true);
});

test("Kafka event store publishes one consumer-compatible message per event", async () => {
  const publishes = [];
  const store = createKafkaEventStore({
    topic: "ux.events.raw",
    kafkaRuntime: {
      async publishBatch(payload) { publishes.push(payload); }
    },
  });
  const result = await store.appendBatch([
    { event_name: "page_view", site_id: "site_a", session_id: "s1", path: "/" },
    { event_name: "click", site_id: "site_a", session_id: "s1", props: { element_id: "buy" } },
  ], { received_at: 1000, request_id: "req_1" });

  assert.equal(result.written, 2);
  assert.equal(publishes.length, 1);
  assert.equal(publishes[0].topic, "ux.events.raw");
  assert.equal(publishes[0].messages.length, 2);
  const parsed = JSON.parse(publishes[0].messages[0].value);
  assert.equal(parsed.event_name, "page_view");
  assert.equal(parsed.received_at, 1000);
  assert.equal(parsed.request_id, "req_1");
  assert.equal(Array.isArray(parsed.events), false);
});
