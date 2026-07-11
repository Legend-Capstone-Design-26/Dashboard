// ─── Distance Helpers ─────────────────────────────────────────────────────────

function euclideanDistSq(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function euclideanDist(a, b) {
  return Math.sqrt(euclideanDistSq(a, b));
}

function nearestCentroidIdx(vector, centroids) {
  let bestIdx  = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const d = euclideanDistSq(vector, centroids[i]);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function meanVector(vectors) {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) sum[i] += v[i];
  return sum.map((s) => s / vectors.length);
}

// ─── K-Means++ Initialization ─────────────────────────────────────────────────
// 초기 centroid 를 무작위가 아닌 거리 확률 분포로 선택해 수렴 안정성을 높인다.

function createSeededRng(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return function rng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function initCentroids(vectors, k, opts = {}) {
  const rng = opts.rng || createSeededRng(opts.seed);
  const centroids = [vectors[Math.floor(rng() * vectors.length)]];

  while (centroids.length < k) {
    const dists = vectors.map((v) =>
      Math.min(...centroids.map((c) => euclideanDistSq(v, c)))
    );
    const total = dists.reduce((a, b) => a + b, 0);
    if (total === 0) {
      centroids.push(vectors[centroids.length % vectors.length]);
      continue;
    }

    let r = rng() * total;

    let chosen = vectors[vectors.length - 1];
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { chosen = vectors[i]; break; }
    }
    centroids.push(chosen);
  }

  return centroids;
}

// ─── Core K-Means ─────────────────────────────────────────────────────────────

function kMeans(vectors, k, maxIter = 100) {
  const opts = typeof maxIter === "object" && maxIter !== null ? maxIter : {};
  const iterations = typeof maxIter === "number" ? maxIter : (opts.maxIter || 100);
  if (vectors.length < k) {
    throw new Error(`k(${k}) > 샘플 수(${vectors.length})`);
  }

  const centroids   = initCentroids(vectors, k, opts).map((c) => [...c]);
  let   assignments = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const newAssignments = vectors.map((v) => nearestCentroidIdx(v, centroids));

    const converged = newAssignments.every((a, i) => a === assignments[i]);
    assignments = newAssignments;
    if (converged) break;

    for (let c = 0; c < k; c++) {
      const cluster = vectors.filter((_, i) => assignments[i] === c);
      if (cluster.length > 0) centroids[c] = meanVector(cluster);
      // cluster 가 비면 centroid 를 유지해 빈 클러스터 문제를 회피한다
    }
  }

  const wcss = vectors.reduce(
    (sum, v, i) => sum + euclideanDistSq(v, centroids[assignments[i]]),
    0
  );

  return orderClusters({ assignments, centroids, wcss });
}

// 로컬 최솟값 회피를 위해 restarts 번 실행 후 WCSS 가 가장 낮은 결과를 선택한다
function stableKMeans(vectors, k, restarts = 3, opts = {}) {
  const options = typeof restarts === "object" && restarts !== null ? restarts : opts;
  const restartCount = typeof restarts === "number" ? restarts : (options.restarts || 3);
  const baseSeed = options.seed ?? 1;
  let best = null;
  for (let r = 0; r < restartCount; r++) {
    const result = kMeans(vectors, k, { ...options, seed: deriveSeed(baseSeed, r) });
    if (!best || result.wcss < best.wcss || (result.wcss === best.wcss && compareCentroids(result.centroids, best.centroids) < 0)) best = result;
  }
  return best;
}

function deriveSeed(seed, offset) {
  return ((Number(seed) >>> 0) + (offset * 2654435761)) >>> 0;
}

function orderClusters(result) {
  const order = result.centroids.map((centroid, index) => ({ centroid, index }))
    .sort((a, b) => compareVectors(a.centroid, b.centroid) || a.index - b.index);
  const remap = new Map(order.map((entry, newIndex) => [entry.index, newIndex]));
  return {
    assignments: result.assignments.map((idx) => remap.get(idx)),
    centroids: order.map((entry) => entry.centroid),
    wcss: result.wcss,
  };
}

function compareCentroids(left, right) {
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const cmp = compareVectors(left[i], right[i]);
    if (cmp !== 0) return cmp;
  }
  return left.length - right.length;
}

function compareVectors(left, right) {
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

// ─── Silhouette Score ─────────────────────────────────────────────────────────
// 각 포인트가 자기 클러스터에 얼마나 잘 속하는지 측정한다. 범위: -1 ~ 1.
// O(n²) 이므로 수천 세션까지는 문제없고 그 이상이면 샘플링이 필요하다.

function silhouetteScore(vectors, assignments, k) {
  const n = vectors.length;
  if (n < 2 || k < 2) return 0;

  let total = 0;
  for (let i = 0; i < n; i++) {
    const myCluster   = assignments[i];
    const sameCluster = vectors.filter((_, j) => j !== i && assignments[j] === myCluster);

    const a = sameCluster.length === 0
      ? 0
      : sameCluster.reduce((s, v) => s + euclideanDist(vectors[i], v), 0) / sameCluster.length;

    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myCluster) continue;
      const other = vectors.filter((_, j) => assignments[j] === c);
      if (other.length === 0) continue;
      const meanDist = other.reduce((s, v) => s + euclideanDist(vectors[i], v), 0) / other.length;
      if (meanDist < b) b = meanDist;
    }
    if (!Number.isFinite(b)) b = 0;

    const denom = Math.max(a, b);
    total += denom === 0 ? 0 : (b - a) / denom;
  }
  return total / n;
}

// ─── Optimal K Search ─────────────────────────────────────────────────────────
// Elbow(WCSS 2차 미분)와 Silhouette 두 지표를 모두 계산하고,
// 일치하면 그 K, 불일치하면 Silhouette 우선(더 객관적)으로 선택한다.

function findOptimalK(vectors, minK = 3, maxK = 8, opts = {}) {
  const upperBound = Math.min(maxK, vectors.length - 1);
  if (upperBound < minK) return { chosenK: minK, candidates: [] };

  const candidates = [];
  for (let k = minK; k <= upperBound; k++) {
    const result = stableKMeans(vectors, k, opts.restarts || 3, { ...opts, seed: deriveSeed(opts.seed ?? 1, k) });
    const sil    = silhouetteScore(vectors, result.assignments, k);
    candidates.push({ k, result, wcss: result.wcss, silhouette: sil });
  }

  // Elbow: WCSS 감소율의 2차 미분이 최대인 지점
  let elbowK  = candidates[0].k;
  let maxDiff = -Infinity;
  for (let i = 1; i < candidates.length - 1; i++) {
    const drop1 = candidates[i - 1].wcss - candidates[i].wcss;
    const drop2 = candidates[i].wcss     - candidates[i + 1].wcss;
    const diff  = drop1 - drop2;
    if (diff > maxDiff) { maxDiff = diff; elbowK = candidates[i].k; }
  }

  // Silhouette: 가장 높은 점수의 K
  const bestSilIdx = candidates.reduce(
    (bi, c, i) => (c.silhouette > candidates[bi].silhouette ? i : bi),
    0
  );
  const bestSilK = candidates[bestSilIdx].k;

  const chosenK = elbowK === bestSilK ? elbowK : bestSilK;
  const chosen  = candidates.find((c) => c.k === chosenK);
  return { chosenK, chosen, candidates };
}

module.exports = {
  kMeans,
  stableKMeans,
  silhouetteScore,
  findOptimalK,
  euclideanDistSq,
  nearestCentroidIdx,
  initCentroids,
  createSeededRng,
};
