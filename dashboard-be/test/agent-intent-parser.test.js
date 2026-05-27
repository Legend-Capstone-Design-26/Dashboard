const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAgentIntent } = require("../services/agent/intent-parser");

test("agent parser detects read-only experiment list intent", () => {
  const parsed = parseAgentIntent("현재 진행 중인 A/B 테스트 목록 보여줘");
  assert.equal(parsed.intent, "list_experiments");
  assert.equal(parsed.write, false);
});

test("agent parser detects publish as write intent", () => {
  const parsed = parseAgentIntent("방금 만든 초안을 배포해줘");
  assert.equal(parsed.intent, "publish_experiment");
  assert.equal(parsed.write, true);
});

test("agent parser detects draft creation as write intent", () => {
  const parsed = parseAgentIntent("결제 페이지 CTA 실험 초안 만들어줘");
  assert.equal(parsed.intent, "create_experiment_draft");
  assert.equal(parsed.write, true);
});
