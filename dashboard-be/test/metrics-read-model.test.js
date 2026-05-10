const test = require("node:test");
const assert = require("node:assert/strict");

const { createMetricsReadModel } = require("../services/read-models/metrics-read-model");

function createModel(events) {
  return createMetricsReadModel({
    eventStore: {
      readAll() {
        return events;
      },
    },
    experimentStore: {
      getByKey(siteId, key) {
        if (siteId !== "legend-ecommerce" || key !== "exp_checkout_cta_v1") return null;
        return {
          id: "exp1",
          site_id: siteId,
          key,
          goals: ["checkout_complete"],
          status: "running",
          url_prefix: "/checkout",
          version: 1,
          published_at: 1,
          updated_at: 1,
          variants: { A: [], B: [] },
        };
      },
    },
  });
}

test("metrics read model treats missing actor_type as real_user", () => {
  const model = createModel([
    {
      site_id: "legend-ecommerce",
      anon_user_id: "u-real",
      session_id: "s-real",
      event_name: "page_view",
      path: "/checkout",
      props: {},
      ts: 1000,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "A" }],
    },
    {
      site_id: "legend-ecommerce",
      anon_user_id: "u-real",
      session_id: "s-real",
      event_name: "checkout_complete",
      path: "/checkout",
      props: {},
      ts: 1200,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "A" }],
    },
  ]);

  const result = model.getExperimentMetrics({
    siteId: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    actorType: "real_user",
  });

  assert.equal(result.ok, true);
  assert.equal(result.A.sessions, 1);
  assert.equal(result.A.conversions, 1);
  assert.equal(result.actor_type, "real_user");
});

test("metrics read model filters synthetic agent traffic by actor_type and persona_id", () => {
  const model = createModel([
    {
      site_id: "legend-ecommerce",
      anon_user_id: "u-real",
      session_id: "s-real",
      event_name: "page_view",
      path: "/checkout",
      props: {},
      ts: 1000,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "A" }],
    },
    {
      site_id: "legend-ecommerce",
      anon_user_id: "u-sim-1",
      session_id: "s-sim-1",
      actor_type: "synthetic_agent",
      persona_id: "checkout_abandoner",
      event_name: "page_view",
      path: "/checkout",
      props: {},
      ts: 1100,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "B" }],
    },
    {
      site_id: "legend-ecommerce",
      anon_user_id: "u-sim-1",
      session_id: "s-sim-1",
      actor_type: "synthetic_agent",
      persona_id: "checkout_abandoner",
      event_name: "checkout_complete",
      path: "/checkout",
      props: {},
      ts: 1400,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "B" }],
    },
    {
      site_id: "legend-ecommerce",
      anon_user_id: "u-sim-2",
      session_id: "s-sim-2",
      actor_type: "synthetic_agent",
      persona_id: "window_shopper",
      event_name: "page_view",
      path: "/",
      props: {},
      ts: 1500,
      experiments: [{ key: "exp_checkout_cta_v1", variant: "B" }],
    },
  ]);

  const syntheticOnly = model.getExperimentMetrics({
    siteId: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    actorType: "synthetic_agent",
  });
  assert.equal(syntheticOnly.A.sessions, 0);
  assert.equal(syntheticOnly.B.sessions, 2);
  assert.equal(syntheticOnly.B.conversions, 1);

  const byPersona = model.getExperimentMetrics({
    siteId: "legend-ecommerce",
    key: "exp_checkout_cta_v1",
    actorType: "synthetic_agent",
    personaId: "checkout_abandoner",
  });
  assert.equal(byPersona.B.sessions, 1);
  assert.equal(byPersona.B.conversions, 1);
  assert.equal(byPersona.persona_id, "checkout_abandoner");
});
