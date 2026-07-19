const path = require("path");

const { loadEnvFromFile } = require("../llm/config");

const EVENT_INGEST_MODES = Object.freeze({
  KAFKA: "kafka",
  JSONL: "jsonl",
});

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseEventIngestMode(value) {
  const normalized = String(value || EVENT_INGEST_MODES.KAFKA).trim().toLowerCase();
  if (normalized === EVENT_INGEST_MODES.KAFKA || normalized === EVENT_INGEST_MODES.JSONL) return normalized;
  throw new Error(`Invalid EVENT_INGEST_MODE: ${normalized || "(empty)"}. Allowed values: kafka, jsonl`);
}

function getDashboardBackendDir() {
  return path.join(__dirname, "..", "..");
}

function resolveEventJsonlDir(dirPath) {
  return path.resolve(getDashboardBackendDir(), String(dirPath || "./data/research/raw"));
}

function getInfraConfig() {
  loadEnvFromFile();
  return {
    eventIngest: {
      mode: parseEventIngestMode(process.env.EVENT_INGEST_MODE),
      jsonlDir: resolveEventJsonlDir(process.env.EVENT_JSONL_DIR),
      jsonlFilename: String(process.env.EVENT_JSONL_FILENAME || "events.jsonl").trim() || "events.jsonl",
    },
    kafka: {
      enabled: parseBoolean(process.env.ENABLE_KAFKA_DUAL_WRITE, false),
      brokers: String(process.env.KAFKA_BROKERS || "localhost:9092")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      clientId: String(process.env.KAFKA_CLIENT_ID || "ux-sdk-service"),
      topicEvents: String(process.env.KAFKA_TOPIC_EVENTS || "ux.events.raw"),
      consumerGroupId: String(process.env.KAFKA_CONSUMER_GROUP_ID || "ux-sdk-event-consumer"),
      fromBeginning: parseBoolean(process.env.KAFKA_CONSUMER_FROM_BEGINNING, false),
      legacyFileCollectFallback: parseBoolean(process.env.ENABLE_LEGACY_FILE_COLLECT_FALLBACK, false),
    },
    redis: {
      enabled: parseBoolean(process.env.ENABLE_REDIS_SESSION_STORE, false),
      url: String(process.env.REDIS_URL || "redis://localhost:6379"),
      keyPrefix: String(process.env.REDIS_KEY_PREFIX || "uxsdk"),
      sessionTtlSec: Math.max(60, Number(process.env.REDIS_SESSION_TTL_SEC || 1800)),
      assignmentTtlSec: Math.max(300, Number(process.env.REDIS_ASSIGNMENT_TTL_SEC || 2592000)),
    },
  };
}

module.exports = {
  EVENT_INGEST_MODES,
  parseEventIngestMode,
  resolveEventJsonlDir,
  getInfraConfig,
  parseBoolean,
};
