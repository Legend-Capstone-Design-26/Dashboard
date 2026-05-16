function summarizeVariantChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return ["No explicit UI changes recorded."];
  }

  return changes.map((change, index) => {
    const selector = typeof change?.selector === "string" && change.selector.trim()
      ? change.selector.trim()
      : "(global)";
    const type = typeof change?.type === "string" && change.type.trim()
      ? change.type.trim()
      : "mutation";
    const actions = Array.isArray(change?.actions) ? change.actions : [];
    const actionSummary = actions.map((action) => {
      const actionType = typeof action?.type === "string" ? action.type : "unknown";
      const value = action?.value != null ? `=${String(action.value)}` : "";
      const styles = action?.styles && typeof action.styles === "object"
        ? ` styles=${JSON.stringify(action.styles)}`
        : "";
      return `${actionType}${value}${styles}`;
    }).join(", ");
    return `${index + 1}. selector=${selector}; change_type=${type}; actions=${actionSummary || "none"}`;
  });
}

function listTransitions(stateModel) {
  const states = stateModel?.states && typeof stateModel.states === "object" ? stateModel.states : {};
  const rows = [];
  for (const [stateId, state] of Object.entries(states)) {
    const transitions = Array.isArray(state?.transitions) ? state.transitions : [];
    for (const transition of transitions) {
      rows.push(`${stateId}->${transition.to} weight=${Number(transition.weight || 0)}`);
    }
  }
  return rows;
}

function summarizeUiChange(change) {
  if (!change || typeof change !== "object") return "알 수 없는 변경";

  const selector = typeof change.selector === "string" && change.selector.trim()
    ? change.selector.trim()
    : "(global)";
  const actions = Array.isArray(change.actions) ? change.actions : [];
  const actionLabels = actions.map((action) => {
    if (action?.type === "set_text") return "문구 변경";
    if (action?.type === "set_style") {
      const styles = action?.styles && typeof action.styles === "object" ? Object.keys(action.styles) : [];
      if (styles.some((key) => /color|background|border|outline/i.test(key))) return "색/스타일 변경";
      return "스타일 변경";
    }
    if (action?.type === "hide") return "숨기기";
    if (action?.type === "show") return "보이기";
    if (action?.type === "set_attr" && action.name === "href") return "링크 변경";
    if (action?.type === "inject_css") return "고급 CSS";
    return String(action?.type || "변경");
  });
  return `${selector} · ${actionLabels.join(", ") || "변경"}`;
}

function summarizeUiChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return ["UI 변경 없음"];
  return changes.map((change, index) => `${index + 1}. ${summarizeUiChange(change)}`);
}

function buildOverlayPrompt({ experiment, persona }) {
  const stateModel = persona?.state_model || {};
  const transitions = listTransitions(stateModel);
  const variantA = summarizeUiChanges(experiment?.variants?.A || []);
  const variantB = summarizeUiChanges(experiment?.variants?.B || []);
  const styleKey = persona?.normalized_persona?.style_key || "unknown";

  return {
    system: [
      "너는 이커머스 UI/UX 반응 분석가다.",
      "목표는 variant B의 UI/UX 변경이 어떤 반응을 만들지 설명하는 overlay를 제안하는 것이다.",
      "반드시 JSON만 반환하라.",
      "없는 state나 edge를 새로 만들지 마라.",
      "기존 edge의 weight만 multiplier로 조정하라.",
      "multiplier는 특별한 이유가 없으면 0.6 이상 1.6 이하를 사용하라.",
      "reason_summary는 반드시 한국어 한두 문장으로 작성하라.",
      "문구, 스타일, 숨김/노출, 링크, CSS 변경이 어떤 유형의 사용자 반응을 유발하는지 중심으로 설명하라.",
      "출력 스키마는 다음과 같다:",
      JSON.stringify({
        reason_summary: "한국어 설명 문자열",
        edge_weight_multipliers: {
          "from->to": 1.0,
        },
      }),
    ].join("\n"),
    user: [
      `실험 key: ${experiment?.key || "unknown"}`,
      `실험 가설: ${experiment?.hypothesis || ""}`,
      `목표 지표: ${Array.isArray(experiment?.goals) ? experiment.goals.join(", ") : "checkout_complete"}`,
      `페르소나 라벨: ${persona?.group_label || persona?.description || persona?.id || "unknown"}`,
      `페르소나 스타일: ${styleKey}`,
      `페르소나 성향: ${JSON.stringify(persona?.normalized_persona?.personality_traits || [])}`,
      `페르소나 의사결정 규칙: ${JSON.stringify(persona?.normalized_persona?.decision_rules || [])}`,
      "UI 변경 유형 요약:",
      ...variantB,
      "사용 가능한 전이 목록:",
      ...transitions,
      "Variant A 변경사항:",
      ...variantA,
      "Variant B 변경사항:",
      ...variantB,
      "작업: baseline 대비 variant B에서 UI/UX 변화가 유발할 반응 중심으로 edge multiplier만 제안하라. 바꿀 이유가 없으면 빈 객체를 반환하라.",
    ].join("\n"),
  };
}

module.exports = {
  buildOverlayPrompt,
  summarizeVariantChanges,
  listTransitions,
};
