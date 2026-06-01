const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFileExperimentStore } = require("../services/stores/experiment-store");
const { createExperimentTools } = require("../services/agent/tools/experiment-tools");
const {
  replaceRunningExperimentIfRequested,
  selectLatestExperiment,
} = require("../services/analytics/running-experiment-policy");

function createStore(experiments = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "running-policy-"));
  const file = path.join(dir, "experiments.json");
  fs.writeFileSync(file, JSON.stringify({ experiments }, null, 2));
  return createFileExperimentStore({ experimentsFile: file });
}

function experiment(overrides) {
  return {
    id: overrides.id,
    site_id: overrides.site_id || "site_a",
    key: overrides.key,
    url_prefix: overrides.url_prefix || "/",
    traffic: { A: 50, B: 50 },
    goals: ["checkout_complete"],
    variants: { A: [], B: [] },
    status: overrides.status || "draft",
    version: overrides.version || 1,
    updated_at: overrides.updated_at || 1000,
    published_at: overrides.published_at || null,
    archived_at: null,
  };
}

test("same site can keep multiple draft experiments", () => {
  const store = createStore();
  const tools = createExperimentTools({ experimentStore: store });
  assert.equal(tools.createExperimentDraft({ siteId: "site_a", key: "exp_a", urlPrefix: "/a" }).ok, true);
  assert.equal(tools.createExperimentDraft({ siteId: "site_a", key: "exp_b", urlPrefix: "/b" }).ok, true);
  assert.equal(store.list("site_a").filter((item) => item.status === "draft").length, 2);
});

test("draft can publish when no other running experiment exists", () => {
  const store = createStore([experiment({ id: "exp_new", key: "exp_new" })]);
  const tools = createExperimentTools({ experimentStore: store });
  const result = tools.publishDraftExperiment({
    siteId: "site_a",
    approval: { expected_experiment_id: "exp_new", expected_experiment_key: "exp_new", expected_experiment_version: 1 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.experiment.status, "running");
});

test("different draft cannot publish while another experiment is running", () => {
  const store = createStore([
    experiment({ id: "exp_old", key: "exp_old", status: "running", published_at: 2000 }),
    experiment({ id: "exp_new", key: "exp_new" }),
  ]);
  const tools = createExperimentTools({ experimentStore: store });
  const result = tools.publishDraftExperiment({
    siteId: "site_a",
    approval: { expected_experiment_id: "exp_new", expected_experiment_key: "exp_new", expected_experiment_version: 1 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "running_experiment_exists");
  assert.equal(result.running_experiment.key, "exp_old");
  assert.equal(store.getById("site_a", "exp_new").status, "draft");
});

test("replace_running pauses old running experiment and publishes new draft", () => {
  const store = createStore([
    experiment({ id: "exp_old", key: "exp_old", status: "running", published_at: 2000 }),
    experiment({ id: "exp_new", key: "exp_new" }),
  ]);
  const tools = createExperimentTools({ experimentStore: store });
  const result = tools.publishDraftExperiment({
    siteId: "site_a",
    approval: {
      expected_experiment_id: "exp_new",
      expected_experiment_key: "exp_new",
      expected_experiment_version: 1,
      payload: { replace_running: true },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.replaced, true);
  assert.equal(result.paused_experiment.key, "exp_old");
  assert.equal(store.getById("site_a", "exp_old").status, "paused");
  assert.equal(store.getById("site_a", "exp_new").status, "running");
});

test("real-apply policy blocks and then replaces another running experiment", () => {
  const store = createStore([experiment({ id: "exp_old", key: "exp_old", status: "running", published_at: 2000 })]);
  const blocked = replaceRunningExperimentIfRequested({ experimentStore: store, siteId: "site_a", targetExperimentId: null, replaceRunning: false });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "running_experiment_exists");

  const replaced = replaceRunningExperimentIfRequested({ experimentStore: store, siteId: "site_a", targetExperimentId: null, replaceRunning: true, now: 3000 });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.replaced, true);
  store.upsert(experiment({ id: "exp_new", key: "exp_new", status: "running", published_at: 3000, updated_at: 3000 }), (item) => item.site_id === "site_a" && item.key === "exp_new");
  assert.equal(store.getById("site_a", "exp_old").status, "paused");
  assert.equal(store.getById("site_a", "exp_new").status, "running");
});

test("config duplicate-running guard can select the latest running experiment", () => {
  const latest = selectLatestExperiment([
    experiment({ id: "exp_old", key: "exp_old", status: "running", published_at: 1000, updated_at: 1000 }),
    experiment({ id: "exp_new", key: "exp_new", status: "running", published_at: 3000, updated_at: 3000 }),
  ]);
  assert.equal(latest.key, "exp_new");
});
