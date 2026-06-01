const { parseAgentIntent } = require("./intent-parser");
const { appendAgentActionLog } = require("./agent-action-log");
const { createApprovalRequest, validateApprovalBeforeExecute } = require("./approval-gate");
const {
  actionCancelledResponse,
  actionExecutedResponse,
  approvalRequiredResponse,
  blockedResponse,
  draftCreatedResponse,
  failedResponse,
  okResponse,
} = require("./agent-response");

const BLOCKED_WRITE_INTENTS = new Set([
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
]);

function previewUrl(siteId, urlPrefix) {
  const cleanPath = String(urlPrefix || "/").startsWith("/") ? String(urlPrefix || "/") : `/${urlPrefix}`;
  return `/preview/${encodeURIComponent(siteId)}${cleanPath}?__ab_force=B`;
}

function approvalFailureMessage(reason) {
  if (reason === "approval_not_found") return "승인 요청을 찾을 수 없습니다.";
  if (reason === "approval_expired") return "승인 요청이 만료되었습니다. 다시 배포 요청을 생성해 주세요.";
  if (reason === "payload_hash_mismatch") return "승인 요청 내용과 현재 실행 대상이 일치하지 않습니다. 다시 요청해 주세요.";
  if (reason === "experiment_status_mismatch" || reason === "experiment_not_draft") return "실험 상태가 변경되어 이 승인 요청을 실행할 수 없습니다. 최신 상태를 확인한 뒤 다시 요청해 주세요.";
  if (reason === "experiment_version_mismatch") return "실험 버전이 변경되어 이 승인 요청을 실행할 수 없습니다.";
  if (String(reason || "").startsWith("replaced_running_experiment_")) return "기존 진행 중 실험의 상태나 버전이 변경되어 이 승인 요청을 실행할 수 없습니다. 최신 상태로 다시 배포 요청을 생성해 주세요.";
  if (reason === "running_experiment_exists") return "이미 진행 중인 실험이 있습니다. 기존 실험을 일시 중지하는 승인 요청을 다시 생성해 주세요.";
  if (reason === "approval_not_pending:cancelled") return "이미 취소된 승인 요청입니다.";
  if (reason === "approval_not_pending:executed") return "이미 실행된 승인 요청입니다.";
  if (reason === "approval_not_pending:expired") return "만료된 승인 요청입니다. 다시 배포 요청을 생성해 주세요.";
  if (String(reason || "").startsWith("approval_not_pending:")) return "이미 처리된 승인 요청입니다.";
  return "승인된 작업을 실행할 수 없습니다.";
}

function createAgentOrchestrator({ toolRegistry, approvalStore, agentActionsFile }) {
  async function runDraftFlow({ siteId, message, user, conversationId }) {
    let logBase = {
      site_id: siteId,
      user_id: user?.id || null,
      conversation_id: conversationId || null,
      intent: "create_experiment_draft",
    };

    try {
      const target = toolRegistry.resolveTargetPage({ siteId, message });
      const draftPlan = toolRegistry.buildDraftChangesFromInstruction({
        message,
        targetPage: target.targetPage,
        targetType: target.targetType,
      });
      if (!draftPlan?.ok) throw new Error(draftPlan?.reason || "draft planning failed");

      const validation = toolRegistry.validateDraftChanges(draftPlan.changes);
      if (!validation.ok) throw new Error(validation.reason || "invalid draft changes");

      const keyResult = toolRegistry.resolveExperimentKey({ siteId, targetPage: target.targetPage, purpose: draftPlan.purpose });
      const created = toolRegistry.createExperimentDraft({
        siteId,
        key: keyResult.key,
        urlPrefix: target.targetPage,
        traffic: { A: 50, B: 50 },
        goals: draftPlan.goals,
        variants: { A: [], B: draftPlan.changes },
        hypothesis: draftPlan.hypothesis,
        source: "agent_mode",
        createdBy: user?.id || null,
      });
      if (!created.ok) throw new Error(created.reason || "draft creation failed");

      appendAgentActionLog({
        filePath: agentActionsFile,
        entry: {
          ...logBase,
          status: "success",
          summary: `${target.targetType || "page"} ${draftPlan.purpose || "cta"} 개선 실험 초안 생성`,
          result_ref: {
            experiment_key: created.experiment.key,
            experiment_id: created.experiment.id,
          },
        },
      });

      return draftCreatedResponse({
        siteId,
        experiment: created.experiment,
        hypothesis: draftPlan.hypothesis,
        changesCount: draftPlan.changes.length,
        goals: draftPlan.goals,
        actions: [
          {
            label: "편집기에서 열기",
            type: "open_editor",
            url: `/editor?site_id=${encodeURIComponent(siteId)}&experiment_key=${encodeURIComponent(created.experiment.key)}`,
          },
          {
            label: "미리보기",
            type: "open_preview",
            url: previewUrl(siteId, created.experiment.url_prefix),
          },
        ],
      });
    } catch (error) {
      appendAgentActionLog({
        filePath: agentActionsFile,
        entry: {
          ...logBase,
          status: "failed",
          summary: "실험 초안 생성 실패",
          reason: String(error),
        },
      });
      return failedResponse({ siteId, intent: "create_experiment_draft", message: "실험 초안을 생성하지 못했습니다.", reason: String(error) });
    }
  }

  function runPublishApprovalFlow({ siteId, message, selectedExperimentKey, user, conversationId }) {
    const found = toolRegistry.findLatestDraftExperiment({ siteId, selectedExperimentKey, message });
    if (!found.ok) return failedResponse({ siteId, intent: "publish_experiment", message: found.message || "배포할 draft 실험을 찾지 못했습니다.", reason: found.reason });

    const conflict = typeof toolRegistry.findConflictingRunningExperiment === "function"
      ? toolRegistry.findConflictingRunningExperiment({ siteId, targetExperimentId: found.experiment.id })
      : { ok: false };
    const runningExperiment = conflict.ok ? conflict.experiment : null;

    const payload = {
      experiment_id: found.experiment.id,
      experiment_key: found.experiment.key,
      target_status: "running",
      replace_running: Boolean(runningExperiment),
    };
    const approvalResult = createApprovalRequest({
      siteId,
      intent: "publish_experiment",
      experiment: found.experiment,
      payload,
      replaceRunningExperiment: runningExperiment,
      summary: runningExperiment
        ? `${runningExperiment.key} 실험을 paused로 일시 중지하고 ${found.experiment.key} 실험을 running 상태로 배포합니다.`
        : `${found.experiment.key} 실험을 running 상태로 배포합니다.`,
      createdBy: user?.id || null,
    }, { user });
    if (!approvalResult.ok) return failedResponse({ siteId, intent: "publish_experiment", message: "승인 요청을 생성하지 못했습니다.", reason: approvalResult.reason });
    const approval = approvalStore.create(approvalResult.approval);

    appendAgentActionLog({
      filePath: agentActionsFile,
      entry: {
        site_id: siteId,
        user_id: user?.id || null,
        conversation_id: conversationId || null,
        intent: "publish_experiment",
        status: "approval_required",
        summary: approval.summary,
        result_ref: { approval_id: approval.id, experiment_key: found.experiment.key, experiment_id: found.experiment.id },
      },
    });

    return approvalRequiredResponse({ siteId, approval, experiment: found.experiment, runningExperiment });
  }

  function approveApproval({ siteId, approvalId, user }) {
    const approval = approvalStore.getById(siteId, approvalId);
    if (!approval) return failedResponse({ siteId, intent: "publish_experiment", message: approvalFailureMessage("approval_not_found"), reason: "approval_not_found" });

    const found = toolRegistry.findExperimentByKeyOrHint({ siteId, key: approval.expected_experiment_key });
    const current = found?.rawExperiment || null;
    const conflict = approval.expected_replaced_running_experiment_id && typeof toolRegistry.findConflictingRunningExperiment === "function"
      ? toolRegistry.findConflictingRunningExperiment({ siteId, targetExperimentId: approval.expected_experiment_id })
      : null;
    const validation = validateApprovalBeforeExecute(approval, { currentExperiment: current, replacedRunningExperiment: conflict?.rawExperiment || null, user });
    if (!validation.ok) {
      const status = validation.reason === "approval_expired" ? "expired" : approval.status;
      if (validation.reason === "approval_expired") approvalStore.update(siteId, approvalId, (item) => ({ ...item, status: "expired" }));
      appendAgentActionLog({
        filePath: agentActionsFile,
        entry: {
          site_id: siteId,
          user_id: user?.id || null,
          intent: "publish_experiment",
          status: "failed",
          summary: "승인 실행 검증 실패",
          reason: validation.reason,
          result_ref: { approval_id: approvalId, approval_status: status },
        },
      });
      return failedResponse({ siteId, intent: "publish_experiment", message: approvalFailureMessage(validation.reason), reason: validation.reason });
    }

    const published = toolRegistry.publishDraftExperiment({ siteId, approval });
    if (!published.ok) {
      approvalStore.update(siteId, approvalId, (item) => ({ ...item, status: "failed" }));
      appendAgentActionLog({
        filePath: agentActionsFile,
        entry: {
          site_id: siteId,
          user_id: user?.id || null,
          intent: "publish_experiment",
          status: "failed",
          summary: "draft publish 실행 실패",
          reason: published.reason,
          result_ref: { approval_id: approvalId, experiment_key: approval.expected_experiment_key },
        },
      });
      return failedResponse({ siteId, intent: "publish_experiment", message: published.message || approvalFailureMessage(published.reason), reason: published.reason });
    }

    const now = Date.now();
    approvalStore.update(siteId, approvalId, (item) => ({
      ...item,
      status: "executed",
      approved_by_user_id: user?.id || null,
      approved_at: now,
      executed_at: now,
    }));
    appendAgentActionLog({
      filePath: agentActionsFile,
      entry: {
        site_id: siteId,
        user_id: user?.id || null,
        intent: "publish_experiment",
        status: "executed",
        summary: published.replaced
          ? `${published.paused_experiment?.key || "기존 실험"} 실험을 paused로 바꾸고 ${published.experiment.key} 실험을 running 상태로 배포`
          : `${published.experiment.key} 실험을 running 상태로 배포`,
        result_ref: { approval_id: approvalId, experiment_key: published.experiment.key, experiment_id: published.experiment.id, paused_experiment_key: published.paused_experiment?.key || null },
      },
    });

    return actionExecutedResponse({
      siteId,
      intent: "publish_experiment",
      message: published.replaced
        ? `${published.paused_experiment?.key || "기존 실험"} 실험을 paused로 일시 중지하고 ${published.experiment.key} 실험을 running 상태로 배포했습니다.`
        : `${published.experiment.key} 실험을 running 상태로 전환했습니다.`,
      data: { experiment: published.experiment, paused_experiment: published.paused_experiment || null, replaced: Boolean(published.replaced), approval_id: approvalId },
    });
  }

  function cancelApproval({ siteId, approvalId, user }) {
    const approval = approvalStore.getById(siteId, approvalId);
    if (!approval) return failedResponse({ siteId, intent: "publish_experiment", message: approvalFailureMessage("approval_not_found"), reason: "approval_not_found" });
    if (approval.status !== "pending") {
      const reason = `approval_not_pending:${approval.status}`;
      return failedResponse({ siteId, intent: approval.intent, message: approvalFailureMessage(reason), reason });
    }
    const now = Date.now();
    const cancelled = approvalStore.update(siteId, approvalId, (item) => ({
      ...item,
      status: "cancelled",
      cancelled_by_user_id: user?.id || null,
      cancelled_at: now,
    }));
    appendAgentActionLog({
      filePath: agentActionsFile,
      entry: {
        site_id: siteId,
        user_id: user?.id || null,
        intent: cancelled.intent,
        status: "cancelled",
        summary: cancelled.summary,
        result_ref: { approval_id: approvalId, experiment_key: cancelled.expected_experiment_key },
      },
    });
    return actionCancelledResponse({ siteId, intent: cancelled.intent, message: "승인 요청을 취소했습니다. 실험은 draft 상태로 유지됩니다.", data: { approval_id: approvalId } });
  }

  async function runAgentTurn({ siteId, message, selectedExperimentKey, user, conversationId }) {
    const parsed = parseAgentIntent(message, { selectedExperimentKey });
    const query = {};

    if (parsed.intent === "create_experiment_draft") {
      return runDraftFlow({ siteId, message, user, conversationId });
    }
    if (parsed.intent === "publish_experiment") {
      return runPublishApprovalFlow({ siteId, message, selectedExperimentKey, user, conversationId });
    }
    if (BLOCKED_WRITE_INTENTS.has(parsed.intent)) return blockedResponse({ siteId, intent: parsed.intent });

    try {
      if (parsed.intent === "list_experiments") {
        const result = toolRegistry.listExperiments({ siteId });
        return okResponse({ siteId, intent: parsed.intent, message: result.message, data: { experiments: result.experiments, counts: result.counts } });
      }

      if (parsed.intent === "summarize_labels") {
        const result = await toolRegistry.summarizeLabels({ siteId, fromTs: query.fromTs, toTs: query.toTs });
        return okResponse({ siteId, intent: parsed.intent, message: result.message, data: { summary: result.summary, total_sessions: result.total_sessions } });
      }

      if (parsed.intent === "summarize_insights") {
        const result = await toolRegistry.summarizeInsights({ siteId, fromTs: query.fromTs, toTs: query.toTs });
        return okResponse({ siteId, intent: parsed.intent, message: result.message, data: { provider: result.provider, output: result.output, fallback_reason: result.fallback_reason || null } });
      }

      if (parsed.intent === "get_preview_targets") {
        const result = toolRegistry.getPreviewTargets({ siteId });
        return okResponse({ siteId, intent: parsed.intent, message: result.message, data: { preview_targets: result.preview_targets } });
      }

      const found = toolRegistry.findExperimentByKeyOrHint({ siteId, key: selectedExperimentKey, message });
      if (!found.ok) {
        return okResponse({ siteId, intent: "summarize_experiment", message: "요약할 실험을 찾지 못했습니다. 실험을 먼저 선택하거나 experiment key를 포함해 주세요.", data: { reason: found.reason } });
      }
      const result = toolRegistry.summarizeExperimentMetrics({ siteId, key: found.experiment.key, selectedExperimentKey });
      return okResponse({
        siteId,
        intent: "summarize_experiment",
        message: result.message,
        data: {
          experiment_key: found.experiment.key,
          A: result.metrics?.A || null,
          B: result.metrics?.B || null,
          summary: result.summary || null,
          experiment: result.metrics?.experiment || found.experiment,
        },
      });
    } catch (error) {
      return failedResponse({ siteId, intent: parsed.intent, message: "Agent 요청 처리 중 오류가 발생했습니다.", reason: String(error) });
    }
  }

  return { runAgentTurn, approveApproval, cancelApproval };
}

module.exports = { createAgentOrchestrator };
