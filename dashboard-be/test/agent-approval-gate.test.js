const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildPayloadHash,
  createApprovalRequest,
  validateApprovalBeforeExecute,
} = require("../services/agent/approval-gate");

test("createApprovalRequest includes expected version status hash expiry and idempotency", () => {
  const experiment = { id: "exp_1", key: "exp_checkout_cta_v2", version: 1, status: "draft" };
  const payload = { experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" };
  const result = createApprovalRequest({ siteId: "legend-ecommerce", intent: "publish_experiment", experiment, payload }, { user: { id: "user_1" } });
  assert.equal(result.ok, true);
  assert.equal(result.approval.expected_experiment_version, 1);
  assert.equal(result.approval.expected_status, "draft");
  assert.equal(result.approval.payload_hash, buildPayloadHash(payload));
  assert.ok(result.approval.expires_at > Date.now());
  assert.match(result.approval.idempotency_key, /^agent_publish_/);
});

test("expired approval is not executable", () => {
  const experiment = { id: "exp_1", key: "exp_checkout_cta_v2", version: 1, status: "draft" };
  const payload = { experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" };
  const approval = createApprovalRequest({ siteId: "legend-ecommerce", intent: "publish_experiment", experiment, payload }).approval;
  approval.expires_at = Date.now() - 1;
  const result = validateApprovalBeforeExecute(approval, { currentExperiment: experiment });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "approval_expired");
});

test("payload hash mismatch is not executable", () => {
  const experiment = { id: "exp_1", key: "exp_checkout_cta_v2", version: 1, status: "draft" };
  const payload = { experiment_id: "exp_1", experiment_key: "exp_checkout_cta_v2", target_status: "running" };
  const approval = createApprovalRequest({ siteId: "legend-ecommerce", intent: "publish_experiment", experiment, payload }).approval;
  approval.payload.target_status = "paused";
  const result = validateApprovalBeforeExecute(approval, { currentExperiment: experiment });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "payload_hash_mismatch");
});
