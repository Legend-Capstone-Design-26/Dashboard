function summarizeRepresentative(rep) {
  const summary = rep?.summary || {};
  return {
    session_id: rep?.session_id || "",
    anon_user_id: rep?.anon_user_id || "",
    top_paths: Array.isArray(summary.unique_paths) ? summary.unique_paths.slice(0, 5) : [],
    metrics: {
      duration_ms: summary.duration_ms || 0,
      page_views: summary.page_views || 0,
      clicks: summary.clicks || 0,
      depth: summary.depth || 0,
      error_count: summary.error_count || 0,
      rage_clicks_count: summary.rage_clicks_count || 0,
      price_interaction_count: summary.price_interaction_count || 0,
      checkout_entered: Boolean(summary.checkout_entered),
      checkout_complete: Boolean(summary.checkout_complete),
      max_step: summary.max_step || "unknown"
    },
    evidence: Array.isArray(rep?.evidence) ? rep.evidence.slice(0, 5) : []
  };
}

function buildInsightsPrompt(input) {
  const safeInput = {
    site_id: input?.site_id || "",
    generated_at: input?.generated_at || Date.now(),
    labels: Array.isArray(input?.labels)
        ? input.labels.map((label) => ({
            label: label?.label || "unknown",
            sessions: label?.sessions || 0,
            share: label?.share || 0,
            metrics: label?.metrics && typeof label.metrics === "object" ? label.metrics : {},
            path_summary: typeof label?.path_summary === "string" ? label.path_summary : "경로 근거 부족",
            allowed_paths: Array.isArray(label?.allowed_paths) ? label.allowed_paths.slice(0, 8) : [],
            representative_steps: Array.isArray(label?.representative_steps) ? label.representative_steps.slice(0, 6) : [],
            representatives: Array.isArray(label?.representatives)
              ? label.representatives.slice(0, 3).map(summarizeRepresentative)
              : []
        }))
      : []
  };

  return {
    system: [
      "You are a senior UX analyst explaining findings to non-technical ecommerce operators.",
      "Return JSON only.",
      "Write all insight text in Korean, using friendly and easy explanations.",
      "Your job is to help the dashboard operator decide what to inspect or test next, not to write generic analysis.",
      "Avoid exposing internal labels directly. Prefer Korean explanations: window_shopper=가볍게 둘러보고 나간 사용자, over_explorer=여러 화면을 오래 둘러본 사용자, checkout_abandoner=결제 단계에서 멈춘 사용자, ux_friction_dropper=불편을 겪고 이탈한 사용자, price_sensitive_dropper=가격이나 혜택을 비교하다 나간 사용자.",
      "Do not expose metric keys alone. Explain them in plain Korean, e.g. checkout_complete / sessions means 결제 완료 비율.",
      "If data is insufficient, say so. If conversions are zero, do not claim an A/B or UX change is effective.",
      "If path evidence is weak, say 어느 화면에서 발생했는지 아직 명확하지 않습니다.",
      "Do not invent product facts, pages, causes, or user intent outside the input.",
      "Every recommended action must be something the operator can inspect or do next.",
      "Follow this schema exactly:",
      "{\"site_id\":string,\"generated_at\":number,\"status\":\"ready\"|\"insufficient_data\",\"summary\":{\"headline\":string,\"plain_explanation\":string,\"top_priority_reason\":string},\"insights\":[{\"label\":string,\"title\":string,\"operator_summary\":string,\"plain_explanation\":string,\"where\":string,\"priority\":\"high\"|\"medium\"|\"low\",\"priority_reason\":string,\"impact\":{\"affected_sessions\":number,\"share\":number,\"primary_metric\":string},\"evidence\":string[],\"evidence_bullets\":string[],\"possible_causes\":string[],\"validation_methods\":string[],\"recommended_actions\":string[],\"next_best_action\":string,\"recommended_experiments\":[{\"hypothesis\":string,\"change\":string,\"primary_metric\":string}],\"experiment_brief\":string,\"risk_note\":string,\"confidence_reason\":string,\"evidence_level\":\"strong\"|\"moderate\"|\"weak\"}]}",
      "Ground every insight in the provided summaries and evidence.",
      "Do not invent product facts outside the input.",
      "Rank insights by action priority: high for direct conversion impact, high share, errors, or rage clicks; medium for repeated indirect signals; low for weak or exploratory patterns.",
      "For `where`, use only actual path tokens from allowed_paths, path_summary, or representative evidence paths.",
      "For `evidence`, cite only provided metrics, allowed paths, representative steps, or representative evidence.",
      "Never invent generic page categories like browse page, product detail page, or cart page unless those exact path tokens appear in the input.",
      "If path evidence is weak, explicitly say 경로 근거 부족 instead of generalizing.",
      "Use only one of these primary metrics: checkout_complete / sessions, checkout_entered / sessions, page_view_to_click_rate, error_count / sessions, price_interaction_count.",
      "Keep legacy fields possible_causes, validation_methods, recommended_experiments, and priority for compatibility.",
      "Also fill operator_summary, plain_explanation, evidence_bullets, next_best_action, experiment_brief, risk_note, and confidence_reason for readability."
    ].join(" "),
    user: JSON.stringify(safeInput, null, 2)
  };
}

module.exports = {
  buildInsightsPrompt
};
