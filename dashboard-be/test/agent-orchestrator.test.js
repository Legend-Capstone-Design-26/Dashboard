const test = require("node:test");
const assert = require("node:assert/strict");
const { createAgentOrchestrator } = require("../services/agent/agent-orchestrator");

test("agent blocks write intents in read-only phase", async () => {
  const orchestrator = createAgentOrchestrator({ toolRegistry: {} });
  const result = await orchestrator.runAgentTurn({ siteId: "legend-ecommerce", message: "초안을 배포해줘" });
  assert.equal(result.ok, true);
  assert.equal(result.type, "safety_blocked");
  assert.equal(result.intent, "publish_experiment");
});

test("agent lists experiments with read-only tool", async () => {
  const orchestrator = createAgentOrchestrator({
    toolRegistry: {
      listExperiments() {
        return {
          counts: { total: 1, running: 1, draft: 0 },
          experiments: [{ key: "checkout_cta", status: "running", version: 2 }],
        };
      },
    },
  });

  const result = await orchestrator.runAgentTurn({ siteId: "legend-ecommerce", message: "실험 목록 보여줘" });
  assert.equal(result.ok, true);
  assert.equal(result.type, "analysis_summary");
  assert.equal(result.intent, "list_experiments");
  assert.match(result.message, /checkout_cta/);
});
