const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateBaselineTransitions,
  aggregateChangedTransitions,
  applyMultipliersToBaseline,
  buildTransitionAnalysis,
  summarizeMappedCohortMembers,
} = require("../personas/transition-analysis");

function persona(id, styleKey = "comparison") {
  return {
    id,
    group_id: `30s__office_worker__${styleKey}`,
    age_group: "30s",
    occupation_group: "office_worker",
    style_key: styleKey,
    normalized_persona: { style_key: styleKey },
    state_model: {
      states: {
        landing: { transitions: [{ to: "cta_click", weight: 2 }, { to: "exit", weight: 1 }] },
        cta_click: { transitions: [{ to: "checkout", weight: 1 }, { to: "exit", weight: 1 }] },
      },
    },
  };
}

test("aggregateBaselineTransitions averages normalized outgoing probabilities", () => {
  const p1 = persona("p1");
  const p2 = persona("p2");
  p2.state_model.states.landing.transitions = [{ to: "cta_click", weight: 1 }, { to: "exit", weight: 1 }];

  const baseline = aggregateBaselineTransitions([
    { member: { uuid: "m1" }, persona: p1 },
    { member: { uuid: "m2" }, persona: p2 },
  ]);

  const landingToCta = baseline.transitions.find((transition) => transition.edge_id === "landing->cta_click");
  const landingToExit = baseline.transitions.find((transition) => transition.edge_id === "landing->exit");
  assert.equal(landingToCta.probability, 0.583333);
  assert.equal(landingToExit.probability, 0.416667);
  assert.equal(baseline.mapped_agent_count, 2);
  assert.equal(baseline.state_count, 2);
});

test("applyMultipliersToBaseline renormalizes B changed probabilities per source state", () => {
  const changed = applyMultipliersToBaseline([
    { edge_id: "landing->cta_click", from: "landing", to: "cta_click", probability: 0.5, agent_count: 2 },
    { edge_id: "landing->exit", from: "landing", to: "exit", probability: 0.5, agent_count: 2 },
  ], {
    "landing->cta_click": 1.5,
  });

  const cta = changed.find((transition) => transition.edge_id === "landing->cta_click");
  const exit = changed.find((transition) => transition.edge_id === "landing->exit");
  assert.equal(cta.changed_probability, 0.6);
  assert.equal(exit.changed_probability, 0.4);
  assert.equal(cta.delta, 0.1);
  assert.equal(exit.delta, -0.1);
});

test("aggregateChangedTransitions divides missing-edge probabilities by source-state agent count", () => {
  const p1 = persona("p1");
  const p2 = persona("p2");
  p1.state_model.states.landing.transitions = [{ to: "cta_click", weight: 1 }, { to: "exit", weight: 1 }];
  p2.state_model.states.landing.transitions = [{ to: "exit", weight: 1 }];
  p1.state_model.states.cta_click.transitions = [];
  p2.state_model.states.cta_click.transitions = [];

  const mapped = [
    { member: { uuid: "m1" }, persona: p1 },
    { member: { uuid: "m2" }, persona: p2 },
  ];
  const baseline = aggregateBaselineTransitions(mapped);
  const overlays = new Map([
    ["p1", { multipliers: { "landing->cta_click": 1.5 } }],
    ["p2", { multipliers: {} }],
  ]);

  const changed = aggregateChangedTransitions(mapped, overlays, baseline.transitions);
  const cta = changed.find((transition) => transition.edge_id === "landing->cta_click");
  const exit = changed.find((transition) => transition.edge_id === "landing->exit");

  assert.equal(cta.baseline_probability, 0.25);
  assert.equal(cta.changed_probability, 0.3);
  assert.equal(cta.agent_count, 2);
  assert.equal(exit.changed_probability, 0.7);
});

test("buildTransitionAnalysis filters members and returns A/B transition analysis", async () => {
  const people = [persona("p1", "comparison"), persona("p2", "impulsive")];
  const result = await buildTransitionAnalysis({
    artifact: {
      cohort_id: "test-cohort",
      members: [
        { uuid: "m1", row_idx: 1, age_group: "30s", occupation_group: "office_worker", style_key: "comparison", group_id: "30s__office_worker__comparison" },
        { uuid: "m2", row_idx: 2, age_group: "40s", occupation_group: "other", style_key: "impulsive", group_id: "40s__other__impulsive" },
      ],
    },
    experiment: {
      key: "exp_test",
      hypothesis: "CTA 강조",
      goals: ["checkout_complete"],
      variants: { A: [], B: [{ selector: ".cta", actions: [{ type: "set_text", value: "지금 구매" }] }] },
    },
    filters: { age_group: "30s", occupation_group: "office_worker", style_key: "comparison" },
    personas: people,
    llmClient: {
      mode: "mock",
      async rewrite({ draftAnswer }) {
        return { text: draftAnswer, reason: "mock" };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.cohort.matched_count, 1);
  assert.equal(result.representative_persona.id, "p1");
  assert.equal(result.a_baseline.transitions.length > 0, true);
  assert.equal(typeof result.b_interpretation.reason_summary, "string");
  assert.equal(Array.isArray(result.b_changed.transitions), true);
});

test("summarizeMappedCohortMembers counts mapped fixed-cohort agents without overlays", () => {
  const people = [persona("p1", "comparison"), { ...persona("p2", "impulsive"), state_model: null }];
  const result = summarizeMappedCohortMembers({
    artifact: {
      cohort_id: "test-cohort",
      members: [
        { uuid: "m1", row_idx: 1, age_group: "30s", occupation_group: "office_worker", style_key: "comparison", group_id: "30s__office_worker__comparison" },
        { uuid: "m2", row_idx: 2, age_group: "30s", occupation_group: "office_worker", style_key: "impulsive", group_id: "30s__office_worker__impulsive" },
        { uuid: "m3", row_idx: 3, age_group: "40s", occupation_group: "other", style_key: "comparison", group_id: "40s__other__comparison" },
      ],
    },
    filters: { age_group: "30s", occupation_group: "office_worker" },
    personas: people,
  });

  assert.equal(result.total_members, 3);
  assert.equal(result.matched_count, 2);
  assert.equal(result.mapped_agent_count, 1);
  assert.deepEqual(result.filters, { age_group: "30s", occupation_group: "office_worker", style_key: "", province: "", sex: "" });
});

test("buildTransitionAnalysis applies overlays per mapped persona before cohort averaging", async () => {
  const people = [persona("p1", "comparison"), persona("p2", "impulsive")];
  people.forEach((item) => {
    item.state_model.states.landing.transitions = [{ to: "cta_click", weight: 1 }, { to: "exit", weight: 1 }];
  });
  const seenPrompts = [];
  const result = await buildTransitionAnalysis({
    artifact: {
      cohort_id: "test-cohort",
      members: [
        { uuid: "m1", row_idx: 1, age_group: "30s", occupation_group: "office_worker", style_key: "comparison", group_id: "30s__office_worker__comparison" },
        { uuid: "m2", row_idx: 2, age_group: "30s", occupation_group: "office_worker", style_key: "impulsive", group_id: "30s__office_worker__impulsive" },
      ],
    },
    experiment: {
      key: "exp_test",
      hypothesis: "CTA 강조",
      goals: ["checkout_complete"],
      variants: { A: [], B: [{ selector: ".cta", actions: [{ type: "set_text", value: "지금 구매" }] }] },
    },
    filters: { age_group: "30s", occupation_group: "office_worker" },
    personas: people,
    llmClient: {
      mode: "mock",
      async rewrite({ userPrompt }) {
        seenPrompts.push(userPrompt);
        const isP1 = userPrompt.includes("페르소나 라벨: p1");
        return {
          text: JSON.stringify({
            reason_summary: isP1 ? "p1 CTA 반응 증가" : "p2 변화 없음",
            edge_weight_multipliers: isP1 ? { "landing->cta_click": 1.5 } : {},
          }),
          reason: "mock",
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(seenPrompts.length, 2);
  assert.equal(result.b_interpretation.interpretation_count, 2);
  assert.deepEqual(Object.keys(result.edge_weight_multipliers), ["p1:landing->cta_click"]);

  const cta = result.b_changed.transitions.find((transition) => transition.edge_id === "landing->cta_click");
  const exit = result.b_changed.transitions.find((transition) => transition.edge_id === "landing->exit");
  assert.equal(cta.changed_probability, 0.55);
  assert.equal(exit.changed_probability, 0.45);
  assert.equal(cta.agent_count, 2);
});
