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

test("publishDraftExperiment turns expected draft into running", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-publish-"));
  const file = path.join(dir, "experiments.json");
  const draft = {
    id: "exp_1",
    site_id: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    url_prefix: "/checkout",
    traffic: { A: 50, B: 50 },
    goals: ["checkout_complete"],
    variants: { A: [], B: [] },
    hypothesis: "결제 CTA 개선",
    source: "agent_mode",
    status: "draft",
    updated_at: Date.now() - 1000,
    published_at: null,
    archived_at: null,
    version: 1,
  };
  fs.writeFileSync(file, JSON.stringify({ experiments: [draft] }, null, 2));
  const experimentStore = createFileExperimentStore({ experimentsFile: file });
  const tools = createExperimentTools({ experimentStore });

  const result = tools.publishDraftExperiment({
    siteId: "legend-ecommerce",
    approval: {
      expected_experiment_id: "exp_1",
      expected_experiment_key: "exp_checkout_cta_v1",
      expected_experiment_version: 1,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.experiment.status, "running");
  const saved = experimentStore.getById("legend-ecommerce", "exp_1");
  assert.equal(saved.status, "running");
  assert.equal(typeof saved.published_at, "number");
});

test("publishDraftExperiment refuses non-draft experiment", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-publish-nondraft-"));
  const file = path.join(dir, "experiments.json");
  fs.writeFileSync(file, JSON.stringify({ experiments: [{ id: "exp_1", site_id: "legend-ecommerce", key: "exp_checkout_cta_v1", status: "running", version: 1 }] }, null, 2));
  const tools = createExperimentTools({ experimentStore: createFileExperimentStore({ experimentsFile: file }) });
  const result = tools.publishDraftExperiment({
    siteId: "legend-ecommerce",
    approval: { expected_experiment_id: "exp_1", expected_experiment_key: "exp_checkout_cta_v1", expected_experiment_version: 1 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "experiment_not_draft");
});
