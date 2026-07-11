const test = require("node:test");
const assert = require("node:assert/strict");

const { nameCluster, resolveMappingDecision, fallbackName, isValidClusterName } = require("../analytics/clustering/llmNamer");

test("llm namer accepts valid Korean JSON", async () => {
  const result = await nameCluster({
    featureProfile: "- 결제 시도 수: 2.0",
    existingNames: [],
    callLlm: async () => ({ content: JSON.stringify({ name: "결제 이탈형", reason: "결제 단계 이탈", dominant_signals: ["결제"] }) }),
  });
  assert.equal(result.name, "결제 이탈형");
});

test("llm namer rejects malformed, English, internal, duplicate, and long names", async () => {
  const cases = [
    "not-json",
    JSON.stringify({ name: "depth_high_user", reason: "bad", dominant_signals: ["x"] }),
    JSON.stringify({ name: "English", reason: "bad", dominant_signals: ["x"] }),
    JSON.stringify({ name: "너무길어서쓸수없는유형명", reason: "bad", dominant_signals: ["x"] }),
    JSON.stringify({ name: "가격 탐색형", reason: "bad", dominant_signals: ["x"] }),
  ];
  for (const content of cases) {
    const result = await nameCluster({ featureProfile: "가격 price 신호", existingNames: ["가격 탐색형"], callLlm: async () => ({ content }) });
    assert.equal(isValidClusterName(result.name, ["가격 탐색형"]), true);
    assert.notEqual(result.name, "알 수 없는 유형");
  }
});

test("mapping decision respects keep_existing", async () => {
  const kept = await resolveMappingDecision({
    featureProfile: "반복 탐색",
    candidateName: "반복 탐색형",
    sim: 0.7,
    callLlm: async () => ({ content: JSON.stringify({ keep_existing: true, name: "새 이름", reason: "same", dominant_signals: ["반복"] }) }),
  });
  assert.equal(kept.keepExisting, true);
  assert.equal(kept.name, "반복 탐색형");
});

test("fallback names derive deterministic Korean names", () => {
  assert.equal(fallbackName("결제 checkout payment", []), "결제 이탈형");
  assert.equal(fallbackName("오류 error friction", []), "오류 마찰형");
});
