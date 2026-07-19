const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  EVENT_INGEST_MODES,
  getInfraConfig,
  parseBoolean,
  parseEventIngestMode,
  resolveEventJsonlDir,
} = require("../services/runtime/infra-config");

test("parseBoolean handles common env flag forms", () => {
  assert.equal(parseBoolean("true"), true);
  assert.equal(parseBoolean("1"), true);
  assert.equal(parseBoolean("yes"), true);
  assert.equal(parseBoolean("false"), false);
  assert.equal(parseBoolean("0"), false);
  assert.equal(parseBoolean("", true), true);
});

test("parseEventIngestMode defaults to kafka when unset", () => {
  assert.equal(parseEventIngestMode(undefined), EVENT_INGEST_MODES.KAFKA);
  assert.equal(parseEventIngestMode(""), EVENT_INGEST_MODES.KAFKA);
});

test("parseEventIngestMode accepts kafka and jsonl", () => {
  assert.equal(parseEventIngestMode("kafka"), EVENT_INGEST_MODES.KAFKA);
  assert.equal(parseEventIngestMode("jsonl"), EVENT_INGEST_MODES.JSONL);
});

test("parseEventIngestMode normalizes whitespace and uppercase", () => {
  assert.equal(parseEventIngestMode(" JSONL "), EVENT_INGEST_MODES.JSONL);
  assert.equal(parseEventIngestMode(" KaFkA "), EVENT_INGEST_MODES.KAFKA);
});

test("parseEventIngestMode rejects unsupported values", () => {
  assert.throws(() => parseEventIngestMode("unknown"), /Allowed values: kafka, jsonl/);
});

test("resolveEventJsonlDir anchors relative paths to dashboard-be", () => {
  const resolved = resolveEventJsonlDir("./data/research/raw");
  assert.equal(resolved, path.join(__dirname, "..", "data", "research", "raw"));
});

test("getInfraConfig keeps kafka default mode and resolves jsonl path", () => {
  const originalEnv = {
    EVENT_INGEST_MODE: process.env.EVENT_INGEST_MODE,
    EVENT_JSONL_DIR: process.env.EVENT_JSONL_DIR,
    EVENT_JSONL_FILENAME: process.env.EVENT_JSONL_FILENAME,
    ENABLE_KAFKA_DUAL_WRITE: process.env.ENABLE_KAFKA_DUAL_WRITE,
    ENABLE_REDIS_SESSION_STORE: process.env.ENABLE_REDIS_SESSION_STORE,
    ENABLE_LEGACY_FILE_COLLECT_FALLBACK: process.env.ENABLE_LEGACY_FILE_COLLECT_FALLBACK,
  };

  delete process.env.EVENT_INGEST_MODE;
  process.env.EVENT_JSONL_DIR = "./data/research/raw";
  process.env.EVENT_JSONL_FILENAME = "events.jsonl";
  process.env.ENABLE_KAFKA_DUAL_WRITE = "false";
  process.env.ENABLE_REDIS_SESSION_STORE = "false";
  process.env.ENABLE_LEGACY_FILE_COLLECT_FALLBACK = "true";

  try {
    const config = getInfraConfig();
    assert.equal(config.eventIngest.mode, EVENT_INGEST_MODES.KAFKA);
    assert.equal(config.eventIngest.jsonlDir, path.join(__dirname, "..", "data", "research", "raw"));
    assert.equal(config.eventIngest.jsonlFilename, "events.jsonl");
    assert.equal(config.kafka.legacyFileCollectFallback, true);
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("getInfraConfig reads explicit jsonl mode", () => {
  const originalEnv = {
    EVENT_INGEST_MODE: process.env.EVENT_INGEST_MODE,
    EVENT_JSONL_DIR: process.env.EVENT_JSONL_DIR,
    EVENT_JSONL_FILENAME: process.env.EVENT_JSONL_FILENAME,
  };

  process.env.EVENT_INGEST_MODE = " jsonl ";
  process.env.EVENT_JSONL_DIR = "./data/research/raw";
  process.env.EVENT_JSONL_FILENAME = "research-events.jsonl";

  try {
    const config = getInfraConfig();
    assert.equal(config.eventIngest.mode, EVENT_INGEST_MODES.JSONL);
    assert.equal(config.eventIngest.jsonlFilename, "research-events.jsonl");
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  }
});
