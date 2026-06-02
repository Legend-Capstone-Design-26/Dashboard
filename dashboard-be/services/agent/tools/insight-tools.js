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

function createInsightTools({ redisSessionAnalyticsService, generateInsights }) {
  async function summarizeLabels({ siteId, fromTs, toTs }) {
    if (!redisSessionAnalyticsService) throw new Error("redis_unavailable");
    const result = await redisSessionAnalyticsService.getLabelsSummary({ siteId, fromTs, toTs });
    const summary = Array.isArray(result?.summary) ? result.summary : [];
    const total = summary.reduce((sum, item) => sum + (Number(item.sessions) || 0), 0);
    const top = summary[0] || null;
    return {
      ok: true,
      summary,
      total_sessions: total,
      message: top
        ? `${siteId} 사이트의 주요 행동 유형은 ${labelName(top.label)}입니다. 총 ${total}개 세션 중 ${top.sessions}개를 차지합니다.`
        : `${siteId} 사이트에서 아직 요약할 세션 유형 데이터가 없습니다.`,
    };
  }

  async function summarizeInsights({ siteId, fromTs, toTs }) {
    if (!redisSessionAnalyticsService) throw new Error("redis_unavailable");
    const input = await redisSessionAnalyticsService.buildRedisInsightsInput({ siteId, fromTs, toTs, reps: 2 });
    const result = await generateInsights(input, {});
    const insights = Array.isArray(result?.output?.insights) ? result.output.insights : [];
    const first = insights[0] || null;
    return {
      ok: true,
      provider: result.provider,
      model: result.model,
      fallback_reason: result.fallbackReason || null,
      output: result.output,
      message: first
        ? `가장 먼저 볼 인사이트는 ${labelName(first.label)}입니다. 주요 위치는 ${first.where || "근거 부족"}입니다.`
        : "최근 행동 데이터 기반 인사이트입니다.",
    };
  }

  return { summarizeLabels, summarizeInsights };
}

module.exports = { createInsightTools };
