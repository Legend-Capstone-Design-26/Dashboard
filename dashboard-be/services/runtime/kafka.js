const { Kafka, logLevel } = require("kafkajs");

function createKafkaRuntime({ brokers, clientId }) {
  let producerPromise = null;
  const kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.NOTHING,
  });

  async function getProducer() {
    if (!producerPromise) {
      producerPromise = (async () => {
        const producer = kafka.producer();
        await producer.connect();
        return producer;
      })().catch((error) => {
        producerPromise = null;
        throw error;
      });
    }
    return producerPromise;
  }

  async function publishBatch({ topic, messages }) {
    const list = Array.isArray(messages) ? messages.filter(Boolean) : [];
    if (list.length === 0) return { sent: 0 };
    const producer = await getProducer();
    await producer.send({ topic, messages: list });
    return { sent: list.length };
  }

  async function createConsumer({ groupId, topics, fromBeginning = false, eachMessage }) {
    const consumer = kafka.consumer({ groupId });
    await consumer.connect();

    for (const topic of topics || []) {
      await consumer.subscribe({ topic, fromBeginning });
    }

    await consumer.run({ eachMessage });
    return consumer;
  }

  async function disconnect() {
    if (!producerPromise) return;
    const producer = await producerPromise;
    await producer.disconnect();
    producerPromise = null;
  }

  async function ping() {
    const admin = kafka.admin();
    await admin.connect();
    try {
      await admin.listTopics();
      return { ok: true };
    } finally {
      await admin.disconnect();
    }
  }

  return {
    publishBatch,
    createConsumer,
    ping,
    disconnect,
  };
}

module.exports = { createKafkaRuntime };
