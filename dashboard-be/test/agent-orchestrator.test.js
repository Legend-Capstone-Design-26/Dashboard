const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createAgentOrchestrator } = require("../services/agent/agent-orchestrator");

test("agent creates draft for create_experiment_draft intent and appends action log", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-orchestrator-"));
  const logFile = path.join(dir, "agent_actions.jsonl");
  const createdDrafts = [];
  const orchestrator = createAgentOrchestrator({
    agentActionsFile: logFile,
    toolRegistry: {
      resolveTargetPage() {
        return { targetPage: "/checkout", targetType: "checkout", target: { id: "checkout" } };
      },
      resolveExperimentKey() {
        return { key: "exp_checkout_cta_v2", versionSuffix: 2 };
      },
      buildDraftChangesFromInstruction() {
        return {
          ok: true,
          changes: [{ selector: "[data-track-id='pay_btn']", label: "결제 CTA 강조", actions: [{ type: "set_text", value: "지금 바로 주문하기" }] }],
          goals: ["checkout_complete"],
          purpose: "cta",
          hypothesis: "결제 CTA 문구와 시각적 강조를 개선하면 checkout_complete 전환율이 증가할 것이다.",
        };
      },
      validateDraftChanges() {
        return { ok: true };
      },
      createExperimentDraft(input) {
        createdDrafts.push(input);
        return {
          ok: true,
          experiment: { id: "exp_1", key: input.key, status: "draft", version: 1, url_prefix: input.urlPrefix },
        };
      },
    },
  });

  const result = await orchestrator.runAgentTurn({
    siteId: "legend-ecommerce",
    message: "결제 페이지 CTA를 더 강조해서 A/B 테스트 초안 만들어줘",
    user: { id: "user_123" },
    conversationId: "conv_123",
  });

  assert.equal(result.ok, true);
  assert.equal(result.type, "draft_created");
  assert.equal(result.experiment.status, "draft");
  assert.equal(createdDrafts[0].source, "agent_mode");
  assert.equal(createdDrafts[0].variants.B[0].selector, "[data-track-id='pay_btn']");
  const logs = fs.readFileSync(logFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "success");
  assert.equal(logs[0].result_ref.experiment_key, "exp_checkout_cta_v2");
});

test("agent blocks publish intent after draft creation phase", async () => {
  const orchestrator = createAgentOrchestrator({ toolRegistry: {}, agentActionsFile: "" });
  const result = await orchestrator.runAgentTurn({ siteId: "legend-ecommerce", message: "방금 만든 초안을 배포해줘" });
  assert.equal(result.ok, true);
  assert.equal(result.type, "safety_blocked");
  assert.equal(result.intent, "publish_experiment");
});

test("agent lists experiments with read-only tool", async () => {
  const orchestrator = createAgentOrchestrator({
    agentActionsFile: "",
    toolRegistry: {
      listExperiments() {
        return {
          message: "현재 legend-ecommerce 사이트에는 총 1개의 실험이 있습니다.",
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
  assert.equal(result.data.experiments[0].key, "checkout_cta");
});
