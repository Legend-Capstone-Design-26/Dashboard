const test = require("node:test");
const assert = require("node:assert/strict");

const { proportionZTest, srmTest, welchTTest } = require("../services/simulations/statistics");

test("proportionZTest detects conversion uplift", () => {
  const result = proportionZTest({ successA: 80, totalA: 1000, successB: 120, totalB: 1000 });

  assert.equal(result.ok, true);
  assert.equal(result.test, "two_proportion_z_test");
  assert.equal(result.rate_b > result.rate_a, true);
  assert.equal(result.p_value < 0.01, true);
  assert.equal(result.significant, true);
});

test("srmTest warns on heavily imbalanced assignment", () => {
  const result = srmTest({ totalA: 800, totalB: 200 });

  assert.equal(result.ok, true);
  assert.equal(result.warning, true);
});

test("welchTTest summarizes continuous metric differences", () => {
  const result = welchTTest([1, 2, 2, 3, 3], [5, 6, 6, 7, 7]);

  assert.equal(result.ok, true);
  assert.equal(result.mean_b > result.mean_a, true);
  assert.equal(result.p_value < 0.01, true);
});
