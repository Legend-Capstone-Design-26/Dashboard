const KAFKA_UNAVAILABLE_RESPONSE = {
  ok: false,
  reason: "kafka_unavailable",
  message: "이벤트 스트림에 연결할 수 없습니다. Kafka collector 설정을 확인해 주세요.",
  source: "kafka",
  fallback_used: false,
};

function kafkaUnavailableResponse() {
  return { ...KAFKA_UNAVAILABLE_RESPONSE };
}

async function collectEvents({ events, kafkaEventStore, legacyFileEventStore, enableLegacyFileFallback = false, meta, logger = console } = {}) {
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  if (list.length === 0) return { status: 400, body: { ok: false, reason: "no events" } };

  const metadata = {
    received_at: typeof meta?.received_at === "number" ? meta.received_at : Date.now(),
    request_id: typeof meta?.request_id === "string" ? meta.request_id : "",
  };

  async function writeLegacyFallback(reason, error) {
    if (!enableLegacyFileFallback || !legacyFileEventStore) return null;
    if (error && logger?.warn) logger.warn("[collector] kafka unavailable; using legacy file collect fallback", error);
    try {
      const result = await legacyFileEventStore.appendBatch(list, metadata);
      return {
        status: 200,
        body: {
          ok: true,
          received: result?.written || list.length,
          source: "file",
          fallback_used: true,
          fallback_reason: reason,
        },
      };
    } catch (fallbackError) {
      if (logger?.warn) logger.warn("[collector] legacy file collect fallback failed", fallbackError);
      return null;
    }
  }

  if (!kafkaEventStore) {
    const fallback = await writeLegacyFallback("kafka_disabled");
    if (fallback) return fallback;
    return { status: 503, body: kafkaUnavailableResponse() };
  }

  try {
    const result = await kafkaEventStore.appendBatch(list, metadata);
    return {
      status: 200,
      body: {
        ok: true,
        received: result?.written || list.length,
        source: "kafka",
        fallback_used: false,
      },
    };
  } catch (error) {
    if (logger?.warn) logger.warn("[collector] kafka publish failed", error);
    const fallback = await writeLegacyFallback("kafka_unavailable", error);
    if (fallback) return fallback;
    return { status: 503, body: kafkaUnavailableResponse() };
  }
}

function createCollectHandler({ kafkaEventStore, legacyFileEventStore, enableLegacyFileFallback = false, createRequestId, logger = console } = {}) {
  return async function collectHandler(req, res) {
    const result = await collectEvents({
      events: Array.isArray(req.body?.events) ? req.body.events : [],
      kafkaEventStore,
      legacyFileEventStore,
      enableLegacyFileFallback,
      meta: {
        received_at: Date.now(),
        request_id: typeof createRequestId === "function" ? createRequestId() : "",
      },
      logger,
    });
    return res.status(result.status).json(result.body);
  };
}

module.exports = {
  KAFKA_UNAVAILABLE_RESPONSE,
  kafkaUnavailableResponse,
  collectEvents,
  createCollectHandler,
};
