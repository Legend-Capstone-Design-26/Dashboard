const { parseAgentIntent } = require("./intent-parser");
const { blockedResponse, failedResponse, okResponse } = require("./agent-response");

function formatExperimentList(data) {
  if (!data.experiments.length) return "현재 site에 등록된 실험이 없습니다.";
  const lines = data.experiments.slice(0, 8).map((item) => `- ${item.key}: ${item.status}${item.version ? ` v${item.version}` : ""}`);
  return [`실험 ${data.counts.total}개를 찾았습니다. running ${data.counts.running}개, draft ${data.counts.draft}개입니다.`, ...lines].join("\n");
}

function createAgentOrchestrator({ toolRegistry }) {
  async function runAgentTurn({ siteId, message, selectedExperimentKey }) {
    const parsed = parseAgentIntent(message);
    if (parsed.write) return blockedResponse({ siteId, intent: parsed.intent });

    try {
      if (parsed.intent === "list_experiments") {
        const data = toolRegistry.listExperiments({ siteId });
        return okResponse({ siteId, intent: parsed.intent, message: formatExperimentList(data), data });
      }

      if (parsed.intent === "summarize_labels") {
        const data = await toolRegistry.summarizeLabels({ siteId });
        return okResponse({ siteId, intent: parsed.intent, message: "최근 세션 라벨 요약입니다.", data });
      }

      if (parsed.intent === "summarize_insights") {
        const data = await toolRegistry.summarizeInsights({ siteId });
        return okResponse({ siteId, intent: parsed.intent, message: "최근 행동 데이터 기반 인사이트입니다.", data });
      }

      if (parsed.intent === "get_preview_targets") {
        const data = toolRegistry.getPreviewTargets({ siteId });
        return okResponse({ siteId, intent: parsed.intent, message: `프리뷰 타겟 ${data.preview_targets.length}개를 찾았습니다.`, data });
      }

      const summary = toolRegistry.summarizeExperiment({ siteId, key: selectedExperimentKey });
      const metrics = summary.experiment?.key ? toolRegistry.summarizeMetrics({ siteId, key: summary.experiment.key }) : null;
      return okResponse({
        siteId,
        intent: "summarize_experiment",
        message: summary.experiment ? `${summary.experiment.key} 실험 요약입니다.` : "요약할 실험을 찾지 못했습니다.",
        data: { ...summary, metrics },
      });
    } catch (error) {
      return failedResponse({ siteId, intent: parsed.intent, message: "Agent 처리 중 오류가 발생했습니다.", reason: String(error) });
    }
  }

  return { runAgentTurn };
}

module.exports = { createAgentOrchestrator };
