const { parseAgentIntent } = require("./intent-parser");
const { appendAgentActionLog } = require("./agent-action-log");
const { blockedResponse, draftCreatedResponse, failedResponse, okResponse } = require("./agent-response");

const BLOCKED_WRITE_INTENTS = new Set([
  "publish_experiment",
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
]);

function previewUrl(siteId, urlPrefix) {
  const cleanPath = String(urlPrefix || "/").startsWith("/") ? String(urlPrefix || "/") : `/${urlPrefix}`;
  return `/preview/${encodeURIComponent(siteId)}${cleanPath}?__ab_force=B`;
}

function createAgentOrchestrator({ toolRegistry, agentActionsFile }) {
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

  async function runAgentTurn({ siteId, message, selectedExperimentKey, user, conversationId }) {
    const parsed = parseAgentIntent(message, { selectedExperimentKey });
    const query = {};

    if (parsed.intent === "create_experiment_draft") {
      return runDraftFlow({ siteId, message, user, conversationId });
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

  return { runAgentTurn };
}

module.exports = { createAgentOrchestrator };
