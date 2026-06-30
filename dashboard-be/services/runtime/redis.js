const Redis = require("ioredis");

function createRedisRuntime({ url, keyPrefix, RedisCtor = Redis }) {
  let client = null;
  let connectPromise = null;

  function getClient() {
    if (!client) {
      client = new RedisCtor(url, {
        lazyConnect: true,
        keyPrefix: keyPrefix ? `${keyPrefix}:` : undefined,
        maxRetriesPerRequest: 1,
      });
    }
    return client;
  }

  async function connect() {
    const redis = getClient();
    if (["ready", "connect", "connecting", "reconnecting"].includes(redis.status)) {
      if (connectPromise) await connectPromise;
      return redis;
    }
    if (connectPromise) {
      await connectPromise;
      return redis;
    }
    connectPromise = redis.connect().finally(() => {
      connectPromise = null;
    });
    await connectPromise;
    return redis;
  }

  async function disconnect() {
    if (!client) return;
    await client.quit();
    client = null;
    connectPromise = null;
  }

  return {
    connect,
    disconnect,
  };
}

module.exports = { createRedisRuntime };
