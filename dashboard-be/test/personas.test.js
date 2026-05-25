const test = require("node:test");
const assert = require("node:assert/strict");

const { listPersonas, makeBase, generateSessionEvents } = require("../personas");

test("persona catalog exposes weighted personas", () => {
  const personas = listPersonas();
  assert.equal(personas.length > 10, true);
  for (const persona of personas) {
    assert.equal(typeof persona.id, "string");
    assert.equal(typeof persona.weight, "number");
    assert.equal(persona.runner_type === "timeline" || persona.runner_type === "state_transition", true);
  }
});

test("generateSessionEvents builds timestamped events for a persona", () => {
  const personas = listPersonas();
  const personaId = personas[0]?.id;
  assert.ok(personaId, "expected at least one persona in the catalog");

  const base = makeBase({
    site_id: "ab-sample",
    anon_user_id: "u_test",
    session_id: "s_test"
  });

  const events = generateSessionEvents({
    personaId,
    base,
    startTs: 1000,
    rng: () => 0.1
  });

  assert.equal(events.length > 0, true);
  assert.equal(events.every((event) => typeof event.ts === "number"), true);
  assert.equal(typeof events[0].path, "string");
});
