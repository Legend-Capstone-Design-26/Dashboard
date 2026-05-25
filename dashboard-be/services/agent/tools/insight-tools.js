const {
  computeLabeledSessionSummaries,
  computeLabelsSummary,
  buildInsightsInput,
} = require("../../../analytics/pipeline");
const { generateInsights } = require("../../../insights/generator");

function labelName(label) {
  const map = {
    ux_friction_dropper: "불편 겪고 이탈",
    checkout_abandoner: "결제 전 이탈",
    price_sensitive_dropper: "가격·혜택 비교형",
    over_explorer: "여러 화면 오래 탐색",
    window_shopper: "가볍게 둘러보기",
  };
  return map[label] || label || "알 수 없음";
}

function createInsightTools({ files, siteRegistryStore }) {
  async function buildLabeled({ siteId, fromTs, toTs }) {
    const rawSite = siteRegistryStore?.getRawById ? siteRegistryStore.getRawById(siteId) : null;
    const pathMappings = rawSite?.journey_path_mappings || null;
    return computeLabeledSessionSummaries(files.eventsFile, {
      site_id: siteId,
      from_ts: typeof fromTs === "number" ? fromTs : undefined,
      to_ts: typeof toTs === "number" ? toTs : undefined,
      limit_events: 100000,
      session_ttl_ms: 30 * 60 * 1000,
      pathMappings,
    });
  }

  async function summarizeLabels({ siteId, fromTs, toTs }) {
    const labeled = await buildLabeled({ siteId, fromTs, toTs });
    const summary = computeLabelsSummary(labeled);
    const total = summary.reduce((sum, item) => sum + (Number(item.sessions) || 0), 0);
    const top = summary[0] || null;
    const message = top
      ? `${siteId} 사이트의 주요 행동 유형은 ${labelName(top.label)}입니다. 총 ${total}개 세션 중 ${top.sessions}개(${(top.share * 100).toFixed(1)}%)를 차지합니다.`
      : `${siteId} 사이트에서 아직 요약할 세션 유형 데이터가 없습니다.`;
    return { ok: true, summary, total_sessions: total, message };
  }

  async function summarizeInsights({ siteId, fromTs, toTs }) {
    const labeled = await buildLabeled({ siteId, fromTs, toTs });
    const input = buildInsightsInput(siteId, labeled, { perLabelRepresentatives: 3 });
    try {
      const result = await generateInsights(input, { provider: "fallback" });
      const insights = Array.isArray(result?.output?.insights) ? result.output.insights : [];
      const first = insights[0] || null;
      const message = first
        ? `가장 먼저 볼 인사이트는 ${labelName(first.label)}입니다. 주요 위치는 ${first.where || "근거 부족"}이며, 우선순위는 ${first.priority || "medium"}입니다.`
        : "현재 생성할 수 있는 UX 인사이트가 없습니다.";
      return { ok: true, provider: result.provider, input, output: result.output, message };
    } catch (error) {
      const labels = computeLabelsSummary(labeled);
      const top = labels[0] || null;
      return {
        ok: true,
        provider: "fallback",
        input,
        output: { site_id: siteId, insights: [] },
        message: top
          ? `${labelName(top.label)} 유형이 가장 많이 관찰됩니다. 세부 인사이트 생성은 실패했지만 라벨 요약 기준으로 먼저 확인할 수 있습니다.`
          : "현재 인사이트를 생성할 데이터가 부족합니다.",
        fallback_reason: String(error),
      };
    }
  }

  return {
    summarizeLabels,
    summarizeInsights,
  };
}

module.exports = {
  createInsightTools,
};
