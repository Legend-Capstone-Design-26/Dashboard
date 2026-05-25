const INTENTS = new Set([
  "list_experiments",
  "summarize_experiment",
  "summarize_insights",
  "summarize_labels",
  "get_preview_targets",
  "create_experiment_draft",
  "publish_experiment",
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
  "unknown",
]);

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function parseAgentIntent(message, options) {
  const raw = String(message || "").trim();
  const text = raw.toLowerCase();
  const selectedExperimentKey = String(options?.selectedExperimentKey || "").trim() || null;

  let intent = "unknown";
  let confidence = 0.3;

  if (includesAny(text, ["롤백", "되돌려", "이전 버전", "rollback"])) {
    intent = "rollback_experiment";
    confidence = 0.9;
  } else if (includesAny(text, ["보관", "archive", "archived"])) {
    intent = "archive_experiment";
    confidence = 0.86;
  } else if (includesAny(text, ["중지", "멈춰", "pause", "paused"])) {
    intent = "pause_experiment";
    confidence = 0.86;
  } else if (includesAny(text, ["배포", "실행", "running", "켜줘", "수행해줘", "publish"])) {
    intent = "publish_experiment";
    confidence = 0.88;
  } else if (includesAny(text, ["초안", "만들어", "생성", "바꿔", "수정", "draft", "create"])) {
    intent = "create_experiment_draft";
    confidence = 0.84;
  } else if (includesAny(text, ["목록", "실험 목록", "테스트 목록", "a/b 테스트 목록", "ab 테스트 목록", "list"])) {
    intent = "list_experiments";
    confidence = 0.88;
  } else if (includesAny(text, ["인사이트", "문제", "개선", "이탈 원인", "insight"])) {
    intent = "summarize_insights";
    confidence = 0.82;
  } else if (includesAny(text, ["유형", "라벨", "이탈 유형", "패턴", "label"])) {
    intent = "summarize_labels";
    confidence = 0.82;
  } else if (includesAny(text, ["페이지", "미리보기", "preview", "대상", "target"])) {
    intent = "get_preview_targets";
    confidence = 0.78;
  } else if (
    includesAny(text, ["결과", "요약", "성과", "어때", "variant", "a/b", "ab", "metrics", "전환율"])
    && includesAny(text, ["실험", "테스트", "variant", "a/b", "ab", "exp_"])
  ) {
    intent = "summarize_experiment";
    confidence = 0.82;
  }

  if (!INTENTS.has(intent)) intent = "unknown";
  return {
    intent,
    confidence,
    message: raw,
    selectedExperimentKey,
  };
}

module.exports = {
  parseAgentIntent,
};
