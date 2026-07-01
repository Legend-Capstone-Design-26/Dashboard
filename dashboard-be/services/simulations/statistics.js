function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * value);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-value * value);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function clampProbability(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function twoSidedNormalP(z) {
  if (!Number.isFinite(z)) return null;
  return clampProbability(2 * (1 - normalCdf(Math.abs(z))));
}

function proportionZTest({ successA, totalA, successB, totalB, confidenceLevel = 0.95 }) {
  const aSuccess = Number(successA) || 0;
  const bSuccess = Number(successB) || 0;
  const aTotal = Number(totalA) || 0;
  const bTotal = Number(totalB) || 0;
  if (aTotal <= 0 || bTotal <= 0) {
    return { ok: false, reason: "insufficient_sample" };
  }

  const rateA = aSuccess / aTotal;
  const rateB = bSuccess / bTotal;
  const pooled = (aSuccess + bSuccess) / (aTotal + bTotal);
  const se = Math.sqrt(pooled * (1 - pooled) * ((1 / aTotal) + (1 / bTotal)));
  const z = se > 0 ? (rateB - rateA) / se : 0;
  const pValue = twoSidedNormalP(z);
  const diff = rateB - rateA;
  const unpooledSe = Math.sqrt((rateA * (1 - rateA) / aTotal) + (rateB * (1 - rateB) / bTotal));
  const zCritical = confidenceLevel >= 0.99 ? 2.575829 : 1.959964;

  return {
    ok: true,
    test: "two_proportion_z_test",
    confidence_level: confidenceLevel,
    rate_a: rateA,
    rate_b: rateB,
    diff,
    uplift: rateA > 0 ? diff / rateA : null,
    z,
    p_value: pValue,
    significant: pValue != null ? pValue < (1 - confidenceLevel) : false,
    confidence_interval: {
      low: diff - zCritical * unpooledSe,
      high: diff + zCritical * unpooledSe,
    },
  };
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values, avg) {
  if (values.length < 2) return 0;
  return values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1);
}

function summarizeContinuous(values) {
  const list = values.map(Number).filter(Number.isFinite);
  const avg = mean(list);
  return {
    n: list.length,
    mean: avg,
    variance: avg == null ? null : variance(list, avg),
  };
}

function welchTTest(valuesA, valuesB, confidenceLevel = 0.95) {
  const a = summarizeContinuous(valuesA);
  const b = summarizeContinuous(valuesB);
  if (a.n < 2 || b.n < 2 || a.mean == null || b.mean == null) {
    return { ok: false, reason: "insufficient_sample" };
  }
  const se = Math.sqrt((a.variance / a.n) + (b.variance / b.n));
  const t = se > 0 ? (b.mean - a.mean) / se : 0;
  const pValue = twoSidedNormalP(t);
  return {
    ok: true,
    test: "welch_t_test_normal_approximation",
    confidence_level: confidenceLevel,
    mean_a: a.mean,
    mean_b: b.mean,
    diff: b.mean - a.mean,
    t,
    p_value: pValue,
    significant: pValue != null ? pValue < (1 - confidenceLevel) : false,
  };
}

function srmTest({ totalA, totalB, expectedRatioA = 0.5 }) {
  const a = Number(totalA) || 0;
  const b = Number(totalB) || 0;
  const total = a + b;
  if (total <= 0) return { ok: false, reason: "insufficient_sample" };
  const expectedA = total * expectedRatioA;
  const expectedB = total - expectedA;
  if (expectedA <= 0 || expectedB <= 0) return { ok: false, reason: "invalid_expected_ratio" };
  const chiSquare = ((a - expectedA) ** 2 / expectedA) + ((b - expectedB) ** 2 / expectedB);
  const pValue = 1 - erf(Math.sqrt(chiSquare / 2));
  return {
    ok: true,
    test: "sample_ratio_mismatch_chi_square_df1",
    expected_ratio_a: expectedRatioA,
    observed_ratio_a: a / total,
    chi_square: chiSquare,
    p_value: clampProbability(pValue),
    warning: pValue < 0.001,
  };
}

module.exports = {
  proportionZTest,
  welchTTest,
  srmTest,
};
