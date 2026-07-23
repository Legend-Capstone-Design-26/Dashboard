const test = require("node:test");
const assert = require("node:assert/strict");

const { stableKMeans, findOptimalK, silhouetteScore } = require("../analytics/clustering/kmeans");

test("stableKMeans is deterministic for a fixed seed and does not call Math.random", () => {
  const vectors = [[0, 0], [0.1, 0], [10, 10], [10.1, 10]];
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("Math.random should not be used"); };
  try {
    const first = stableKMeans(vectors, 2, 4, { seed: 42 });
    const second = stableKMeans(vectors, 2, 4, { seed: 42 });
    assert.deepEqual(second, first);
    assert.deepEqual(first.assignments, [0, 0, 1, 1]);
  } finally {
    Math.random = originalRandom;
  }
});

test("stableKMeans rejects k larger than sample count", () => {
  assert.throws(() => stableKMeans([[0], [1]], 3, { seed: 1 }), /샘플 수/);
});

test("silhouette and findOptimalK handle small samples", () => {
  assert.equal(silhouetteScore([[0], [1]], [0, 0], 1), 0);
  const result = findOptimalK([[0], [1], [10], [11]], 2, 3, { seed: 7 });
  assert.equal(result.chosenK >= 2, true);
});
