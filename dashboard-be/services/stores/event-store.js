const { appendJsonlBatch, readJsonl } = require("../data-store");

function createFileEventStore({ eventsFile }) {
  function appendBatch(events, meta) {
    const list = Array.isArray(events) ? events.filter(Boolean) : [];
    if (list.length === 0) return { written: 0 };

    const receivedAt = typeof meta?.received_at === "number" ? meta.received_at : Date.now();
    const requestId = typeof meta?.request_id === "string" ? meta.request_id : "";
    appendJsonlBatch(eventsFile, list.map((event) => ({
        ...event,
        received_at: receivedAt,
        request_id: requestId,
      })));
    return { written: list.length, received_at: receivedAt, request_id: requestId };
  }

  function readAll() {
    return readJsonl(eventsFile);
  }

  return {
    appendBatch,
    readAll,
  };
}

function createCompositeEventStore({ primaryStore, secondaryStores, logger }) {
  const fallbacks = Array.isArray(secondaryStores) ? secondaryStores.filter(Boolean) : [];

  async function appendBatch(events, meta) {
    const primaryResult = await primaryStore.appendBatch(events, meta);
    const results = [primaryResult];

    for (const store of fallbacks) {
      try {
        results.push(await store.appendBatch(events, meta));
      } catch (error) {
        if (typeof logger === "function") logger("secondary event store append failed", error);
      }
    }

    return {
      written: primaryResult?.written || 0,
      secondary_results: results.slice(1),
    };
  }

  function readAll() {
    return primaryStore.readAll();
  }

  return {
    appendBatch,
    readAll,
  };
}

function createKafkaEventStore({ kafkaRuntime, topic }) {
  async function appendBatch(events, meta) {
    const list = Array.isArray(events) ? events.filter(Boolean) : [];
    if (list.length === 0) return { written: 0 };

    const receivedAt = typeof meta?.received_at === "number" ? meta.received_at : Date.now();
    const requestId = typeof meta?.request_id === "string" ? meta.request_id : "";
    const messages = list.map((event) => ({
      key: event.session_id || event.anon_user_id || null,
      value: JSON.stringify({
        ...event,
        received_at: receivedAt,
        request_id: requestId,
      }),
    }));

    await kafkaRuntime.publishBatch({ topic, messages });
    return { written: list.length, topic };
  }

  function readAll() {
    return [];
  }

  return {
    appendBatch,
    readAll,
  };
}

module.exports = {
  createFileEventStore,
  createCompositeEventStore,
  createKafkaEventStore,
};
