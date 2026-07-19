const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createCompositeEventStore, createFileEventStore } = require("../services/stores/event-store");

function makeTempEventsFile(testContext, relativePath = "events.jsonl") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uxsdk-event-store-"));
  testContext.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return path.join(dir, relativePath);
}

test("file event store writes one JSONL line per event in input order", (t) => {
  const eventsFile = makeTempEventsFile(t, "research/raw/events.jsonl");
  const store = createFileEventStore({ eventsFile });

  const result = store.appendBatch([
    { event_name: "page_view", session_id: "s1", source: "scenario" },
    { event_name: "click", session_id: "s1", ground_truth_type: "checkout_abandoner" },
  ], { received_at: 1010, request_id: "req_1" });

  const lines = fs.readFileSync(eventsFile, "utf8").trim().split("\n");
  assert.equal(result.written, 2);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).event_name, "page_view");
  assert.equal(JSON.parse(lines[1]).event_name, "click");
});

test("file event store preserves metadata and readAll returns appended events", (t) => {
  const eventsFile = makeTempEventsFile(t);
  const store = createFileEventStore({ eventsFile });

  store.appendBatch([
    {
      event_name: "page_view",
      session_id: "s1",
      source: "synthetic",
      generation_run_id: "run_1",
      ground_truth_type: "window_shopper",
    },
  ], { received_at: 2020, request_id: "req_meta" });

  const events = store.readAll();
  assert.equal(events.length, 1);
  assert.equal(events[0].received_at, 2020);
  assert.equal(events[0].request_id, "req_meta");
  assert.equal(events[0].source, "synthetic");
  assert.equal(events[0].generation_run_id, "run_1");
  assert.equal(events[0].ground_truth_type, "window_shopper");
});

test("file event store appends without overwriting existing content", (t) => {
  const eventsFile = makeTempEventsFile(t);
  const store = createFileEventStore({ eventsFile });

  store.appendBatch([{ event_name: "page_view", session_id: "s1" }], { received_at: 1, request_id: "req_1" });
  store.appendBatch([{ event_name: "click", session_id: "s2" }], { received_at: 2, request_id: "req_2" });

  const events = store.readAll();
  assert.equal(events.length, 2);
  assert.equal(events[0].event_name, "page_view");
  assert.equal(events[1].event_name, "click");
});

test("file event store creates missing directories automatically", (t) => {
  const eventsFile = makeTempEventsFile(t, path.join("nested", "research", "raw", "events.jsonl"));
  const store = createFileEventStore({ eventsFile });

  store.appendBatch([{ event_name: "page_view", session_id: "s1" }], { received_at: 1, request_id: "req_1" });

  assert.equal(fs.existsSync(eventsFile), true);
  assert.equal(store.readAll().length, 1);
});

test("composite event store keeps primary reads and fans out writes", async () => {
  const calls = [];
  const primaryStore = {
    async appendBatch(events) {
      calls.push(["primary", events.length]);
      return { written: events.length };
    },
    readAll() {
      return [{ event_name: "page_view" }];
    },
  };
  const secondaryStore = {
    async appendBatch(events) {
      calls.push(["secondary", events.length]);
      return { written: events.length };
    },
  };

  const store = createCompositeEventStore({ primaryStore, secondaryStores: [secondaryStore] });
  const result = await store.appendBatch([{ event_name: "page_view" }, { event_name: "click" }], {});

  assert.equal(result.written, 2);
  assert.deepEqual(store.readAll(), [{ event_name: "page_view" }]);
  assert.deepEqual(calls, [["primary", 2], ["secondary", 2]]);
});
