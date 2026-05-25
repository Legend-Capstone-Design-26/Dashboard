const READ_ONLY_CAPABILITIES = [
  "list_experiments",
  "summarize_experiment",
  "summarize_insights",
  "summarize_labels",
  "get_preview_targets",
];

const DISABLED_CAPABILITIES = [
  "create_experiment_draft",
  "publish_experiment",
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
];

function okResponse({ type = "analysis_summary", siteId, intent, message, data, actions }) {
  return {
    ok: true,
    type,
    agent_mode: true,
    site_id: siteId,
    intent: intent || "unknown",
    message: message || "요청을 처리했습니다.",
    data: data || {},
    actions: Array.isArray(actions) ? actions : [],
  };
}

function failedResponse({ siteId, intent, message, reason }) {
  return {
    ok: false,
    type: "action_failed",
    agent_mode: true,
    site_id: siteId,
    intent: intent || "unknown",
    message: message || "Agent 요청을 처리하지 못했습니다.",
    reason: reason || message || "unknown_error",
  };
}

function blockedResponse({ siteId, intent, message }) {
  return okResponse({
    type: "safety_blocked",
    siteId,
    intent,
    message: message || "이 작업은 아직 1단계 Read-only Agent에서는 실행할 수 없습니다. 다음 단계에서 approval gate와 함께 구현됩니다.",
    data: { write_actions_enabled: false },
  });
}

function statusResponse({ siteId }) {
  return {
    ok: true,
    agent_mode: true,
    site_id: siteId,
    phase: "read_only",
    capabilities: READ_ONLY_CAPABILITIES.slice(),
    disabled_capabilities: DISABLED_CAPABILITIES.slice(),
    safety: {
      write_actions_enabled: false,
      approval_required_for_dangerous_actions: true,
    },
  };
}

module.exports = {
  READ_ONLY_CAPABILITIES,
  DISABLED_CAPABILITIES,
  okResponse,
  failedResponse,
  blockedResponse,
  statusResponse,
};
