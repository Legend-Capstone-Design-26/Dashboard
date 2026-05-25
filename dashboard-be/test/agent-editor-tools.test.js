const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDraftChangesFromInstruction, validateDraftChanges } = require("../services/agent/tools/editor-tools");

test("buildDraftChangesFromInstruction returns checkout pay button changes", () => {
  const result = buildDraftChangesFromInstruction({
    message: "결제 페이지 CTA를 더 강조해서 A/B 테스트 초안 만들어줘",
    targetPage: "/checkout",
    targetType: "checkout",
  });
  assert.equal(result.ok, true);
  assert.equal(result.changes[0].selector, "[data-track-id='pay_btn']");
  assert.equal(result.changes[0].actions[0].type, "set_text");
  assert.deepEqual(result.goals, ["checkout_complete"]);
});

test("validateDraftChanges rejects invalid action type", () => {
  const result = validateDraftChanges([{ selector: "[data-track-id='pay_btn']", actions: [{ type: "hide" }] }]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /unsupported action type/);
});

test("validateDraftChanges rejects dangerous css", () => {
  const result = validateDraftChanges([{ selector: "body", actions: [{ type: "set_style", styles: { display: "none" } }] }]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /dangerous css/);
});
