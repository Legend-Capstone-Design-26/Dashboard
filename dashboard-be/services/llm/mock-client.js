function createMockClient() {
  return {
    mode: "mock",
    async rewrite({ draftAnswer }) {
      return {
        ok: true,
        text: draftAnswer,
        reason: "mock_mode",
      };
    },
    async answer({ context, fallbackAnswer }) {
      const siteId = context?.siteId || context?.site_id || "현재 사이트";
      const experimentCount = Number(context?.experiments?.count || 0);
      const hasMetrics = !!context?.selectedExperimentMetrics?.ok;
      const draftText = context?.draft?.created ? " 요청에 따라 실험 초안 컨텍스트도 준비했습니다." : "";
      const text = fallbackAnswer || `현재 mock 모드입니다. ${siteId} 기준으로 실험 ${experimentCount}개를 조회했고${hasMetrics ? " 선택 실험 지표도 확인했습니다" : " 선택 실험 지표는 확인되지 않았습니다"}.${draftText}`;
      return {
        ok: true,
        text,
        reason: "mock_mode",
      };
    },
  };
}

module.exports = { createMockClient };
