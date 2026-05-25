const WRITE_INTENTS = [
  "create_experiment_draft",
  "publish_experiment",
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
];

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function parseAgentIntent(message = "") {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return { intent: "unknown", write: false };

  if (includesAny(text, ["배포", "publish", "실행", "런칭", "launch"])) {
    return { intent: "publish_experiment", write: true };
  }
  if (includesAny(text, ["초안", "draft", "만들", "생성", "create"])) {
    return { intent: "create_experiment_draft", write: true };
  }
  if (includesAny(text, ["일시중지", "중지", "pause", "stop"])) {
    return { intent: "pause_experiment", write: true };
  }
  if (includesAny(text, ["롤백", "rollback", "되돌", "복구"])) {
    return { intent: "rollback_experiment", write: true };
  }
  if (includesAny(text, ["archive", "아카이브", "보관", "삭제"])) {
    return { intent: "archive_experiment", write: true };
  }

  if (includesAny(text, ["라벨", "label", "세그먼트", "segment"])) {
    return { intent: "summarize_labels", write: false };
  }
  if (includesAny(text, ["인사이트", "insight", "분석", "요약"])) {
    return { intent: "summarize_insights", write: false };
  }
  if (includesAny(text, ["타겟", "target", "프리뷰", "preview", "selector", "셀렉터"])) {
    return { intent: "get_preview_targets", write: false };
  }
  if (includesAny(text, ["목록", "list", "실험", "테스트", "experiment", "a/b", "ab"])) {
    return { intent: "list_experiments", write: false };
  }

  return { intent: "summarize_experiment", write: false };
}

module.exports = { WRITE_INTENTS, parseAgentIntent };
