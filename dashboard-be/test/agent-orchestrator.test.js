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

test("agent returns approval_required for publish intent", async () => {
  const approvals = [];
  const orchestrator = createAgentOrchestrator({
    toolRegistry: {
      findLatestDraftExperiment() {
        return {
          ok: true,
          experiment: { id: "exp_1", key: "exp_checkout_cta_v2", status: "draft", version: 1, traffic: { A: 50, B: 50 }, goals: ["checkout_complete"] },
        };
      },
    },
    approvalStore: {
      create(approval) { approvals.push(approval); return approval; },
    },
    agentActionsFile: "",
  });
  const result = await orchestrator.runAgentTurn({ siteId: "legend-ecommerce", message: "방금 만든 초안을 배포해줘" });
  assert.equal(result.ok, true);
  assert.equal(result.type, "approval_required");
  assert.equal(result.intent, "publish_experiment");
  assert.equal(result.approval.approval_id, approvals[0].id);
  assert.equal(result.approval.id, approvals[0].id);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].status, "pending");
});

test("agent publish approval includes replacement for existing running experiment", async () => {
  const approvals = [];
  const orchestrator = createAgentOrchestrator({
    toolRegistry: {
      findLatestDraftExperiment() {
        return {
          ok: true,
          experiment: { id: "exp_new", key: "exp_checkout_cta_v2", status: "draft", version: 1, traffic: { A: 50, B: 50 }, goals: ["checkout_complete"] },
        };
      },
      findConflictingRunningExperiment() {
        return { ok: true, experiment: { id: "exp_old", key: "exp_home_cta_v1", status: "running", version: 3 } };
      },
    },
    approvalStore: {
      create(approval) { approvals.push(approval); return approval; },
    },
    agentActionsFile: "",
  });
  const result = await orchestrator.runAgentTurn({ siteId: "legend-ecommerce", message: "초안 배포해줘" });
  assert.equal(result.ok, true);
  assert.equal(result.type, "approval_required");
  assert.equal(result.data.replace_running, true);
  assert.equal(result.data.running_experiment.key, "exp_home_cta_v1");
  assert.equal(approvals[0].payload.replace_running, true);
  assert.equal(approvals[0].expected_replaced_running_experiment_id, "exp_old");
  assert.match(result.message, /기존 실험은 paused/);
});

test("agent still blocks rollback intent", async () => {
  const orchestrator = createAgentOrchestrator({ toolRegistry: {}, agentActionsFile: "" });
  const result = await orchestrator.runAgentTurn({ siteId: "legend-ecommerce", message: "이전 버전으로 롤백해줘" });
  assert.equal(result.ok, true);
  assert.equal(result.type, "safety_blocked");
  assert.equal(result.intent, "rollback_experiment");
});

test("approve executes draft publish once and blocks duplicate", () => {
  let approval = {
    id: "apv_1",
    site_id: "legend-ecommerce",
    intent: "publish_experiment",
    status: "pending",
    payload: { experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" },
    payload_hash: require("../services/agent/approval-gate").buildPayloadHash({ experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" }),
    expected_experiment_id: "exp_1",
    expected_experiment_key: "exp_checkout_cta_v2",
    expected_experiment_version: 1,
    expected_status: "draft",
    expires_at: Date.now() + 10000,
    summary: "publish draft",
  };
  let currentExperiment = { id: "exp_1", key: "exp_checkout_cta_v2", status: "draft", version: 1 };
  const orchestrator = createAgentOrchestrator({
    agentActionsFile: "",
    approvalStore: {
      getById() { return approval; },
      update(_siteId, _approvalId, updater) { approval = updater(approval); return approval; },
    },
    toolRegistry: {
      findExperimentByKeyOrHint() { return { ok: true, rawExperiment: currentExperiment }; },
      publishDraftExperiment() {
        currentExperiment = { ...currentExperiment, status: "running", published_at: Date.now() };
        return { ok: true, experiment: currentExperiment };
      },
    },
  });

  const first = orchestrator.approveApproval({ siteId: "legend-ecommerce", approvalId: "apv_1", user: { id: "user_1" } });
  assert.equal(first.ok, true);
  assert.equal(first.type, "action_executed");
  assert.equal(approval.status, "executed");
  const second = orchestrator.approveApproval({ siteId: "legend-ecommerce", approvalId: "apv_1", user: { id: "user_1" } });
  assert.equal(second.ok, false);
  assert.match(second.reason, /approval_not_pending/);
});

test("cancelled approval cannot be approved", () => {
  let approval = {
    id: "apv_1",
    site_id: "legend-ecommerce",
    intent: "publish_experiment",
    status: "pending",
    payload: { experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" },
    payload_hash: require("../services/agent/approval-gate").buildPayloadHash({ experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" }),
    expected_experiment_id: "exp_1",
    expected_experiment_key: "exp_checkout_cta_v2",
    expected_experiment_version: 1,
    expected_status: "draft",
    expires_at: Date.now() + 10000,
    summary: "publish draft",
  };
  const orchestrator = createAgentOrchestrator({
    agentActionsFile: "",
    approvalStore: {
      getById() { return approval; },
      update(_siteId, _approvalId, updater) { approval = updater(approval); return approval; },
    },
    toolRegistry: {
      findExperimentByKeyOrHint() { return { ok: true, rawExperiment: { id: "exp_1", key: "exp_checkout_cta_v2", status: "draft", version: 1 } }; },
      publishDraftExperiment() { return { ok: true, experiment: {} }; },
    },
  });
  const cancel = orchestrator.cancelApproval({ siteId: "legend-ecommerce", approvalId: "apv_1", user: { id: "user_1" } });
  assert.equal(cancel.ok, true);
  assert.equal(cancel.type, "action_cancelled");
  const approve = orchestrator.approveApproval({ siteId: "legend-ecommerce", approvalId: "apv_1", user: { id: "user_1" } });
  assert.equal(approve.ok, false);
  assert.match(approve.reason, /approval_not_pending/);
  assert.equal(approve.message, "이미 취소된 승인 요청입니다.");
});

test("approval status mismatch returns friendly message", () => {
  const approval = {
    id: "apv_1",
    site_id: "legend-ecommerce",
    intent: "publish_experiment",
    status: "pending",
    payload: { experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" },
    payload_hash: require("../services/agent/approval-gate").buildPayloadHash({ experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" }),
    expected_experiment_id: "exp_1",
    expected_experiment_key: "exp_checkout_cta_v2",
    expected_experiment_version: 1,
    expected_status: "draft",
    expires_at: Date.now() + 10000,
    summary: "publish draft",
  };
  const orchestrator = createAgentOrchestrator({
    agentActionsFile: "",
    approvalStore: {
      getById() { return approval; },
      update(_siteId, _approvalId, updater) { return updater(approval); },
    },
    toolRegistry: {
      findExperimentByKeyOrHint() { return { ok: true, rawExperiment: { id: "exp_1", key: "exp_checkout_cta_v2", status: "running", version: 1 } }; },
    },
  });
  const result = orchestrator.approveApproval({ siteId: "legend-ecommerce", approvalId: "apv_1", user: { id: "user_1" } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "experiment_status_mismatch");
  assert.equal(result.message, "실험 상태가 변경되어 이 승인 요청을 실행할 수 없습니다. 최신 상태를 확인한 뒤 다시 요청해 주세요.");
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
