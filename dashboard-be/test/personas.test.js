const test = require("node:test");
const assert = require("node:assert/strict");

const { listPersonas, makeBase, generateSessionEvents } = require("../personas");

test("persona catalog exposes weighted personas", () => {
  const personas = listPersonas();
  assert.equal(personas.length > 0, true);
  for (const persona of personas) {
    assert.equal(typeof persona.id, "string");
    assert.equal(Array.isArray(persona.timeline), true);
    assert.equal(persona.timeline.length > 0, true);
    assert.equal(typeof persona.runner_type, "string");
    assert.equal(typeof persona.state_model, "object");
    assert.equal(typeof persona.state_model?.entry_state, "string");
  }
});

test("generateSessionEvents builds timestamped events for a persona", () => {
  const personas = listPersonas();
  const targetPersona = personas[0];
  const base = makeBase({
    site_id: "ab-sample",
    anon_user_id: "u_test",
    session_id: "s_test"
  });

  const events = generateSessionEvents({
    personaId: targetPersona.id,
    base,
    startTs: 1000,
    rng: () => 0.1
  });

  assert.equal(events.length > 0, true);
  assert.equal(events[0].event_name.length > 0, true);
  assert.equal(typeof events[0].path, "string");
  assert.equal(events[0].actor_type, "synthetic_agent");
  assert.equal(events[0].persona_id, targetPersona.id);
  assert.equal(events[0].runner_type === "timeline" || events[0].runner_type === "state_transition", true);
  assert.equal(events[events.length - 1].ts >= events[0].ts, true);
});

test("generateSessionEvents is deterministic for seeded probabilistic personas", () => {
  const personas = listPersonas();
  const targetPersona = personas.find((persona) => persona.runner_type === "state_transition") || personas[0];
  const base = makeBase({
    site_id: "ab-sample",
    anon_user_id: "u_seeded",
    session_id: "s_seeded"
  });

  const sequence = [0.05, 0.45, 0.85, 0.25, 0.65, 0.15, 0.35, 0.55, 0.75, 0.95];
  let cursorA = 0;
  let cursorB = 0;
  const rngA = () => sequence[cursorA++ % sequence.length];
  const rngB = () => sequence[cursorB++ % sequence.length];

  const first = generateSessionEvents({
    personaId: targetPersona.id,
    base,
    startTs: 2000,
    rng: rngA,
    experimentKey: "exp_checkout_cta_v1",
    variant: "B",
    experimentGoals: ["checkout_complete"]
  });
  const second = generateSessionEvents({
    personaId: targetPersona.id,
    base,
    startTs: 2000,
    rng: rngB,
    experimentKey: "exp_checkout_cta_v1",
    variant: "B",
    experimentGoals: ["checkout_complete"]
  });

  assert.deepEqual(first, second);
  assert.equal(first.every((event) => event.experiments?.[0]?.key === "exp_checkout_cta_v1"), true);
  assert.equal(first.every((event) => event.experiments?.[0]?.variant === "B"), true);
  assert.deepEqual(first[0].experiment_goals, ["checkout_complete"]);
});
