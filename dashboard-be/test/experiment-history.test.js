const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createFileExperimentStore } = require("../services/stores/experiment-store");
const { createExperimentsService } = require("../services/analytics/experiments-service");

test("experiment store keeps prior versions in history", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ux-sdk-experiment-history-"));
  const file = path.join(dir, "experiments.json");
  const store = createFileExperimentStore({ experimentsFile: file });

  store.upsert({
    id: "exp_1",
    site_id: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    status: "running",
    url_prefix: "/checkout",
    traffic: { A: 50, B: 50 },
    goals: ["checkout_complete"],
    variants: { A: [], B: [{ type: "set_text", selector: ".cta", actions: [{ type: "set_text", value: "Buy now" }] }] },
    updated_at: 1000,
    published_at: 1000,
    archived_at: null,
    version: 1,
  }, (item) => item.id === "exp_1" && item.site_id === "legend-ecommerce");

  const updated = store.upsert({
    id: "exp_1",
    site_id: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    status: "running",
    url_prefix: "/checkout",
    traffic: { A: 50, B: 50 },
    goals: ["checkout_complete"],
    variants: { A: [], B: [{ type: "set_text", selector: ".cta", actions: [{ type: "set_text", value: "Checkout now" }] }] },
    updated_at: 2000,
    published_at: 2000,
    archived_at: null,
    version: 2,
  }, (item) => item.id === "exp_1" && item.site_id === "legend-ecommerce");

  assert.equal(updated.version, 2);
  assert.equal(Array.isArray(updated.history), true);
  assert.equal(updated.history.length, 1);
  assert.equal(updated.history[0].version, 1);
  assert.equal(updated.history[0].variants.B[0].actions[0].value, "Buy now");
});

test("draft save carries forward parent history", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ux-sdk-experiment-draft-"));
  const file = path.join(dir, "experiments.json");
  const store = createFileExperimentStore({ experimentsFile: file });
  const service = createExperimentsService({ experimentsFile: file, experimentStore: store });

  store.upsert({
    id: "exp_1",
    site_id: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    status: "running",
    url_prefix: "/checkout",
    traffic: { A: 50, B: 50 },
    goals: ["checkout_complete"],
    variants: { A: [], B: [] },
    updated_at: 1000,
    published_at: 1000,
    archived_at: null,
    version: 3,
  }, (item) => item.id === "exp_1" && item.site_id === "legend-ecommerce");

  const draft = service.saveDraft({
    siteId: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    urlPrefix: "/checkout",
    traffic: { A: 50, B: 50 },
    goals: ["checkout_complete"],
    variants: { A: [], B: [{ type: "set_text", selector: ".cta", actions: [{ type: "set_text", value: "New CTA" }] }] },
    hypothesis: "Improve CTA clarity",
    source: "chatbot",
  });

  assert.equal(draft.parent_key, "exp_checkout_cta_v1");
  assert.equal(draft.version, 4);
  assert.equal(Array.isArray(draft.history), true);
  assert.equal(draft.history[0].version, 3);
});
