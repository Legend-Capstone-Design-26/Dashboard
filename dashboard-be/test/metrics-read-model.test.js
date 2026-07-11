const test = require("node:test");
const assert = require("node:assert/strict");

const { createMetricsReadModel } = require("../services/read-models/metrics-read-model");

function createExperimentStore() {
  return {
    getByKey(siteId, key) {
      if (siteId !== "legend-ecommerce" || key !== "exp_checkout_cta_v1") return null;
      return {
        id: "exp1",
        status: "running",
        url_prefix: "/checkout",
        version: 1,
        goals: ["checkout_complete"],
        variants: { A: [], B: [] },
      };
    },
  };
}

test("metrics read model isolates synthetic persona and simulation run filters", () => {
  const events = [
    {
      site_id: "legend-ecommerce",
      actor_type: "synthetic_agent",
      persona_id: "persona-a",
      simulation_run_id: "run-1",
      anon_user_id: "u1",
      session_id: "s1",
      event_name: "page_view",
      ts: 1,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "B" }],
      props: {},
    },
    {
      site_id: "legend-ecommerce",
      actor_type: "synthetic_agent",
      persona_id: "persona-a",
      simulation_run_id: "run-1",
      anon_user_id: "u1",
      session_id: "s1",
      event_name: "checkout_complete",
      ts: 2,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "B" }],
      props: {},
    },
    {
      site_id: "legend-ecommerce",
      actor_type: "synthetic_agent",
      persona_id: "persona-b",
      simulation_run_id: "run-2",
      anon_user_id: "u2",
      session_id: "s2",
      event_name: "checkout_complete",
      ts: 3,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "A" }],
      props: {},
    },
    {
      site_id: "legend-ecommerce",
      actor_type: "browser",
      persona_id: "persona-a",
      simulation_run_id: "run-1",
      anon_user_id: "u3",
      session_id: "s3",
      event_name: "checkout_complete",
      ts: 4,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "B" }],
      props: {},
    },
  ];
  const readModel = createMetricsReadModel({
    eventStore: { readAll() { return events; } },
    experimentStore: createExperimentStore(),
  });

  const metrics = readModel.getExperimentMetrics({
    siteId: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    actorType: "synthetic_agent",
    personaId: "persona-a",
    runId: "run-1",
  });

  assert.equal(metrics.ok, true);
  assert.equal(metrics.A.sessions, 0);
  assert.equal(metrics.A.conversions, 0);
  assert.equal(metrics.B.sessions, 1);
  assert.equal(metrics.B.conversions, 1);
  assert.equal(metrics.totals.events, 2);
});
