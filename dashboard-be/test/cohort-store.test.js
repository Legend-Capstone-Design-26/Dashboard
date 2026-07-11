const test = require("node:test");
const assert = require("node:assert/strict");

const { listFixedCohortMembers } = require("../personas/cohort-store");

test("listFixedCohortMembers filters fixed JSON cohort and returns public members", () => {
  const result = listFixedCohortMembers({
    cohortId: "fixed_10k_cohort",
    filters: { age_group: "60plus", occupation_group: "retired", style_key: "brand_loyal" },
    limit: 5,
  });

  assert.equal(result.cohort_id.startsWith("nemotron-korea-fixed-10000-"), true);
  assert.equal(result.total_members, 10000);
  assert.equal(result.matched_count > 0, true);
  assert.equal(result.members.length <= 5, true);
  assert.equal(result.population_profile_metadata.scan_complete, true);
  assert.equal(Array.isArray(result.facets.age_groups), true);
  assert.equal(Array.isArray(result.facets.occupation_groups), true);
  assert.equal(Array.isArray(result.facets.style_keys), true);

  const member = result.members[0];
  assert.equal(member.age_group, "60plus");
  assert.equal(member.occupation_group, "retired");
  assert.equal(member.style_key, "brand_loyal");
  assert.equal(typeof member.persona_summary, "string");
  assert.equal(typeof member.population_weight, "number");
  assert.equal("professional_persona" in member, false);
  assert.equal("sports_persona" in member, false);
  assert.equal("raw_rows" in result, false);
});
