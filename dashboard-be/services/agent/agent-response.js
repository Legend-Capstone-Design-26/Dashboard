const READ_ONLY_CAPABILITIES = [
  "list_experiments",
  "summarize_experiment",
  "summarize_insights",
  "summarize_labels",
  "get_preview_targets",
  "create_experiment_draft",
];

const DISABLED_CAPABILITIES = [
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
    message: message || "이 작업은 아직 Agent Mode MVP에서 실행할 수 없습니다. 다음 단계의 approval gate에서 처리됩니다.",
    data: { write_actions_enabled: false },
  });
}

function draftCreatedResponse({ siteId, intent, experiment, hypothesis, changesCount, goals, actions }) {
  return {
    ok: true,
    type: "draft_created",
    agent_mode: true,
    site_id: siteId,
    intent: intent || "create_experiment_draft",
    message: "A/B 테스트 초안을 생성했습니다. 아직 실제 사용자에게 배포되지 않았습니다. 새로고침하면 실험 목록에서 초안을 확인할 수 있습니다.",
    experiment,
    data: {
      hypothesis,
      changes_count: changesCount,
      goals: Array.isArray(goals) ? goals : [],
      draft_not_deployed: true,
    },
    actions: Array.isArray(actions) ? actions : [],
  };
}

function statusResponse({ siteId }) {
  return {
    ok: true,
    agent_mode: true,
    site_id: siteId,
    phase: "draft_mvp",
    capabilities: READ_ONLY_CAPABILITIES.slice(),
    disabled_capabilities: DISABLED_CAPABILITIES.slice(),
    safety: {
      write_actions_enabled: true,
      enabled_write_actions: ["create_experiment_draft"],
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
  draftCreatedResponse,
  statusResponse,
};
