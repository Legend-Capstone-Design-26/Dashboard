const test = require("node:test");
const assert = require("node:assert/strict");

const { parseAgentIntent } = require("../services/agent/intent-parser");

test("parseAgentIntent detects experiment list requests", () => {
  const parsed = parseAgentIntent("현재 진행 중인 A/B 테스트 목록 보여줘");
  assert.equal(parsed.intent, "list_experiments");
});

test("parseAgentIntent detects publish requests", () => {
  const parsed = parseAgentIntent("방금 만든 초안을 배포해줘");
  assert.equal(parsed.intent, "publish_experiment");
});

test("parseAgentIntent detects draft creation requests", () => {
  const parsed = parseAgentIntent("결제 페이지 CTA 실험 초안 만들어줘");
  assert.equal(parsed.intent, "create_experiment_draft");
});
