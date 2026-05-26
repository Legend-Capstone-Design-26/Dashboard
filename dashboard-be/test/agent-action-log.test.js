const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { appendAgentActionLog } = require("../services/agent/agent-action-log");

test("appendAgentActionLog returns failure instead of throwing on append error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-log-dir-"));
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = appendAgentActionLog({
      filePath: dir,
      entry: { site_id: "legend-ecommerce", intent: "create_experiment_draft", status: "success", summary: "test" },
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.ok, false);
  assert.ok(result.reason);
  assert.equal(result.entry.site_id, "legend-ecommerce");
});
