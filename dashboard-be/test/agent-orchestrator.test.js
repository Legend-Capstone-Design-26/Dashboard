const test = require("node:test");
const assert = require("node:assert/strict");

const { runAgentTurn } = require("../services/agent/agent-orchestrator");
const { createAgentToolRegistry } = require("../services/agent/tool-registry");

function createMockTools() {
  const experimentStore = {
    list(siteId) {
      assert.equal(siteId, "legend-ecommerce");
      return [
        {
          id: "exp_1",
          key: "exp_checkout_cta_v1",
          status: "running",
          url_prefix: "/checkout",
          version: 2,
          updated_at: 1000,
          published_at: 900,
          archived_at: null,
        },
        {
          id: "exp_2",
          key: "exp_home_cta_v1",
          status: "draft",
          url_prefix: "/",
          version: 1,
          updated_at: 800,
          published_at: null,
          archived_at: null,
        },
      ];
    },
  };
  const metricsReadModel = {
    getExperimentMetrics() {
      return { ok: true, A: { sessions: 1, cvr: 0.1 }, B: { sessions: 2, cvr: 0.2 }, totals: { events: 3 } };
    },
  };
  const siteRegistryStore = {
    getRawById() {
      return { preview_targets: [] };
    },
  };
  return createAgentToolRegistry({
    experimentStore,
    metricsReadModel,
    siteRegistryStore,
    files: { eventsFile: "unused" },
  });
}

test("runAgentTurn blocks write intents in read-only phase", async () => {
  const result = await runAgentTurn({
    message: "방금 만든 초안을 배포해줘",
    siteId: "legend-ecommerce",
    agentMode: true,
    tools: createMockTools(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.type, "safety_blocked");
  assert.equal(result.intent, "publish_experiment");
});

test("runAgentTurn summarizes experiment list", async () => {
  const result = await runAgentTurn({
    message: "현재 진행 중인 A/B 테스트 목록 보여줘",
    siteId: "legend-ecommerce",
    agentMode: true,
    tools: createMockTools(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.intent, "list_experiments");
  assert.equal(result.data.experiments.length, 2);
  assert.match(result.message, /총 2개의 실험/);
});
