const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFileExperimentStore } = require("../services/stores/experiment-store");
const { createExperimentTools } = require("../services/agent/tools/experiment-tools");

test("createExperimentDraft creates status draft experiment", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-experiment-"));
  const file = path.join(dir, "experiments.json");
  fs.writeFileSync(file, JSON.stringify({ experiments: [] }, null, 2));
  const experimentStore = createFileExperimentStore({ experimentsFile: file });
  const tools = createExperimentTools({ experimentStore });

  const result = tools.createExperimentDraft({
    siteId: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    urlPrefix: "/checkout",
    goals: ["checkout_complete"],
    variants: { A: [], B: [{ selector: "[data-track-id='pay_btn']", actions: [{ type: "set_text", value: "지금 바로 주문하기" }] }] },
    hypothesis: "결제 CTA 개선",
    source: "agent_mode",
    createdBy: "user_123",
  });

  assert.equal(result.ok, true);
  assert.equal(result.experiment.status, "draft");
  const saved = experimentStore.getByKey("legend-ecommerce", "exp_checkout_cta_v1");
  assert.equal(saved.status, "draft");
  assert.equal(saved.published_at, null);
  assert.equal(saved.version, 1);
});
