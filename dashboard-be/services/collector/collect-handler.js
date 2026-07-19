const KAFKA_UNAVAILABLE_RESPONSE = {
  ok: false,
  reason: "kafka_unavailable",
  message: "이벤트 스트림에 연결할 수 없습니다. Kafka collector 설정을 확인해 주세요.",
  source: "kafka",
  fallback_used: false,
};

const JSONL_WRITE_FAILED_RESPONSE = {
  ok: false,
  reason: "jsonl_write_failed",
  message: "연구용 JSONL 이벤트 로그에 기록할 수 없습니다. JSONL collector 설정을 확인해 주세요.",
  source: "jsonl",
  fallback_used: false,
};

function kafkaUnavailableResponse() {
  return { ...KAFKA_UNAVAILABLE_RESPONSE };
}

function jsonlWriteFailedResponse() {
  return { ...JSONL_WRITE_FAILED_RESPONSE };
}

function buildUnavailableResponse(source) {
  if (source === "jsonl") return jsonlWriteFailedResponse();
  return kafkaUnavailableResponse();
}

async function collectEvents({ events, eventStore, source = "kafka", meta, logger = console } = {}) {
  const list = Array.isArray(events) ? events.filter(Boolean) : [];
  if (list.length === 0) return { status: 400, body: { ok: false, reason: "no events" } };

  const metadata = {
    received_at: typeof meta?.received_at === "number" ? meta.received_at : Date.now(),
    request_id: typeof meta?.request_id === "string" ? meta.request_id : "",
  };

  if (!eventStore) return { status: 503, body: buildUnavailableResponse(source) };

  try {
    const result = await eventStore.appendBatch(list, metadata);
    return {
      status: 200,
      body: {
        ok: true,
        received: result?.written || list.length,
        source,
        fallback_used: false,
      },
    };
  } catch (error) {
    if (logger?.warn) logger.warn(`[collector] ${source} append failed`, error);
    return { status: 503, body: buildUnavailableResponse(source) };
  }
}

function createCollectHandler({ eventStore, source = "kafka", createRequestId, logger = console } = {}) {
  return async function collectHandler(req, res) {
    const result = await collectEvents({
      events: Array.isArray(req.body?.events) ? req.body.events : [],
      eventStore,
      source,
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
  JSONL_WRITE_FAILED_RESPONSE,
  kafkaUnavailableResponse,
  jsonlWriteFailedResponse,
  collectEvents,
  createCollectHandler,
};
