const { loadEnvFromFile } = require("../llm/config");

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function getInfraConfig() {
  loadEnvFromFile();
  return {
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
  getInfraConfig,
  parseBoolean,
};
