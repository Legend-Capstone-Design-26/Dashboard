const test = require("node:test");
const assert = require("node:assert/strict");

const { createRedisRuntime } = require("../services/runtime/redis");

function createFakeRedisCtor(initialStatus = "wait") {
  const instances = [];
  class FakeRedis {
    constructor(_url, options) {
      this.options = options;
      this.status = initialStatus;
      this.connectCalls = 0;
      instances.push(this);
    }

    async connect() {
      this.connectCalls += 1;
      if (this.connectCalls > 1) throw new Error("Redis is already connecting/connected");
      this.status = "connecting";
      await new Promise((resolve) => setTimeout(resolve, 5));
      this.status = "ready";
    }

    async quit() {
      this.status = "end";
    }
  }
  FakeRedis.instances = instances;
  return FakeRedis;
}

test("redis runtime does not reconnect when client is already ready", async () => {
  const RedisCtor = createFakeRedisCtor("ready");
  const runtime = createRedisRuntime({ url: "redis://example", keyPrefix: "uxsdk", RedisCtor });

  const client = await runtime.connect();

  assert.equal(client.status, "ready");
  assert.equal(client.connectCalls, 0);
});

test("redis runtime does not reconnect when client is already connected", async () => {
  const RedisCtor = createFakeRedisCtor("connect");
  const runtime = createRedisRuntime({ url: "redis://example", keyPrefix: "uxsdk", RedisCtor });

  const client = await runtime.connect();

  assert.equal(client.status, "connect");
  assert.equal(client.connectCalls, 0);
});

test("redis runtime shares an in-flight connect call", async () => {
  const RedisCtor = createFakeRedisCtor("wait");
  const runtime = createRedisRuntime({ url: "redis://example", keyPrefix: "uxsdk", RedisCtor });

  const [first, second] = await Promise.all([runtime.connect(), runtime.connect()]);

  assert.equal(first, second);
  assert.equal(first.status, "ready");
  assert.equal(first.connectCalls, 1);
});
