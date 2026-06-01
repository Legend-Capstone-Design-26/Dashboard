const crypto = require("crypto");

const DANGEROUS_INTENTS = new Set([
  "publish_experiment",
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
  "delete_experiment",
  "change_traffic",
  "overwrite_variant",
]);

function isDangerousIntent(intent) {
  return DANGEROUS_INTENTS.has(String(intent || ""));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function buildPayloadHash(payload) {
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function createApprovalRequest(input = {}, context = {}) {
  const now = Date.now();
  const intent = String(input.intent || "");
  if (intent !== "publish_experiment") {
    return { ok: false, reason: "approval_not_implemented_for_intent" };
  }
  const experiment = input.experiment || {};
  const replaceRunningExperiment = input.replaceRunningExperiment || null;
  const payload = input.payload ? { ...input.payload } : {
    experiment_id: experiment.id,
    experiment_key: experiment.key,
    target_status: "running",
  };
  if (replaceRunningExperiment) {
    payload.replace_running = true;
    payload.running_experiment_id = replaceRunningExperiment.id;
    payload.running_experiment_key = replaceRunningExperiment.key;
  }
  const id = `apv_${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString("hex")}`;
  const approval = {
    id,
    site_id: input.siteId,
    intent,
    summary: input.summary || `${experiment.key} 실험을 running 상태로 배포합니다.`,
    payload,
    status: "pending",
    risk_level: "high",
    expected_experiment_id: experiment.id,
    expected_experiment_key: experiment.key,
    expected_experiment_version: experiment.version,
    expected_status: "draft",
    expected_replaced_running_experiment_id: replaceRunningExperiment?.id || null,
    expected_replaced_running_experiment_key: replaceRunningExperiment?.key || null,
    expected_replaced_running_experiment_version: replaceRunningExperiment?.version || null,
    expected_replaced_running_experiment_status: replaceRunningExperiment ? "running" : null,
    payload_hash: buildPayloadHash(payload),
    expires_at: now + (Number(input.ttlMs) || 15 * 60 * 1000),
    created_at: now,
    updated_at: now,
    created_by_user_id: context.user?.id || input.createdBy || null,
    approved_by_user_id: null,
    cancelled_by_user_id: null,
    approved_at: null,
    cancelled_at: null,
    executed_at: null,
    idempotency_key: input.idempotencyKey || `agent_publish_${experiment.id || experiment.key}_${now}`,
  };
  return { ok: true, approval };
}

function validateApprovalBeforeExecute(approval, context = {}) {
  if (!approval) return { ok: false, reason: "approval_not_found" };
  if (approval.status !== "pending") return { ok: false, reason: `approval_not_pending:${approval.status}` };
  if (Number(approval.expires_at) <= Date.now()) return { ok: false, reason: "approval_expired" };
  const expectedHash = buildPayloadHash(approval.payload || {});
  if (approval.payload_hash !== expectedHash) return { ok: false, reason: "payload_hash_mismatch" };
  if (approval.intent !== "publish_experiment") return { ok: false, reason: "intent_not_executable" };

  const experiment = context.currentExperiment || null;
  if (!experiment) return { ok: false, reason: "experiment_not_found" };
  if (experiment.id !== approval.expected_experiment_id) return { ok: false, reason: "experiment_id_mismatch" };
  if (experiment.key !== approval.expected_experiment_key) return { ok: false, reason: "experiment_key_mismatch" };
  if (experiment.version !== approval.expected_experiment_version) return { ok: false, reason: "experiment_version_mismatch" };
  if (experiment.status !== approval.expected_status) return { ok: false, reason: "experiment_status_mismatch" };

  if (approval.expected_replaced_running_experiment_id) {
    const runningExperiment = context.replacedRunningExperiment || null;
    if (!runningExperiment) return { ok: false, reason: "replaced_running_experiment_missing" };
    if (runningExperiment.id !== approval.expected_replaced_running_experiment_id) return { ok: false, reason: "replaced_running_experiment_id_mismatch" };
    if (runningExperiment.key !== approval.expected_replaced_running_experiment_key) return { ok: false, reason: "replaced_running_experiment_key_mismatch" };
    if (runningExperiment.version !== approval.expected_replaced_running_experiment_version) return { ok: false, reason: "replaced_running_experiment_version_mismatch" };
    if (runningExperiment.status !== approval.expected_replaced_running_experiment_status) return { ok: false, reason: "replaced_running_experiment_status_mismatch" };
  }
  return { ok: true };
}

module.exports = {
  isDangerousIntent,
  createApprovalRequest,
  validateApprovalBeforeExecute,
  buildPayloadHash,
};
