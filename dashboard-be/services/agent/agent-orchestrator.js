const { parseAgentIntent } = require("./intent-parser");
const { okResponse, failedResponse, blockedResponse } = require("./agent-response");

const WRITE_INTENTS = new Set([
  "create_experiment_draft",
  "publish_experiment",
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
]);

async function runAgentTurn({
  message,
  siteId,
  user,
  conversationId,
  selectedExperimentKey,
  agentMode,
  query,
  tools,
}) {
  if (!agentMode) {
    return okResponse({
      type: "agent_mode_on",
      siteId,
      intent: "unknown",
      message: "Agent Mode를 사용하려면 agent_mode=true로 요청해 주세요. 현재 1단계에서는 읽기 전용 기능만 지원합니다.",
      data: { phase: "read_only" },
    });
  }

  const parsed = parseAgentIntent(message, { selectedExperimentKey });
  const intent = parsed.intent;
  const context = {
    siteId,
    user,
    conversationId,
    selectedExperimentKey,
    query: query || {},
  };

  if (WRITE_INTENTS.has(intent)) {
    return blockedResponse({ siteId, intent });
  }

  try {
    if (intent === "list_experiments") {
      const result = await tools.list_experiments({ siteId }, context);
      return okResponse({ siteId, intent, message: result.message, data: { experiments: result.experiments, counts: result.counts } });
    }

    if (intent === "summarize_experiment") {
      const found = await tools.find_experiment({ siteId, key: selectedExperimentKey, message }, context);
      if (!found.ok) {
        return okResponse({
          siteId,
          intent,
          message: "요약할 실험을 찾지 못했습니다. 실험을 먼저 선택하거나 experiment key를 포함해 주세요.",
          data: { reason: found.reason },
        });
      }
      const result = await tools.summarize_experiment({ siteId, key: found.experiment.key, selectedExperimentKey }, context);
      return okResponse({
        siteId,
        intent,
        message: result.message,
        data: {
          experiment_key: found.experiment.key,
          A: result.metrics?.A || null,
          B: result.metrics?.B || null,
          summary: result.summary || null,
          experiment: result.metrics?.experiment || found.experiment,
        },
      });
    }

    if (intent === "summarize_labels") {
      const result = await tools.summarize_labels({
        siteId,
        fromTs: Number.isFinite(Number(query?.from_ts)) ? Number(query.from_ts) : undefined,
        toTs: Number.isFinite(Number(query?.to_ts)) ? Number(query.to_ts) : undefined,
      }, context);
      return okResponse({ siteId, intent, message: result.message, data: { summary: result.summary, total_sessions: result.total_sessions } });
    }

    if (intent === "summarize_insights") {
      const result = await tools.summarize_insights({
        siteId,
        fromTs: Number.isFinite(Number(query?.from_ts)) ? Number(query.from_ts) : undefined,
        toTs: Number.isFinite(Number(query?.to_ts)) ? Number(query.to_ts) : undefined,
      }, context);
      return okResponse({ siteId, intent, message: result.message, data: { provider: result.provider, output: result.output, fallback_reason: result.fallback_reason || null } });
    }

    if (intent === "get_preview_targets") {
      const result = await tools.get_preview_targets({ siteId }, context);
      return okResponse({ siteId, intent, message: result.message, data: { preview_targets: result.preview_targets } });
    }

    return okResponse({
      type: "analysis_summary",
      siteId,
      intent: "unknown",
      message: "요청 의도를 명확히 파악하지 못했습니다. 실험 목록, 실험 결과, 인사이트, 라벨 요약, 미리보기 대상 중 하나로 물어봐 주세요.",
    });
  } catch (error) {
    return failedResponse({ siteId, intent, message: "Agent 요청 처리 중 오류가 발생했습니다.", reason: String(error) });
  }
}

module.exports = {
  runAgentTurn,
  WRITE_INTENTS,
};
