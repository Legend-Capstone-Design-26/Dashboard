function createMetricsTools({ metricsReadModel }) {
  function summarizeMetrics({ siteId, key }) {
    if (!key) return { ok: false, reason: "missing_experiment_key" };
    const metrics = metricsReadModel.getExperimentMetrics({ siteId, key });
    if (!metrics?.ok) return metrics;
    return {
      ok: true,
      key,
      goals: metrics.goals,
      totals: metrics.totals,
      variants: {
        A: metrics.A,
        B: metrics.B,
      },
    };
  }

  return { summarizeMetrics };
}

module.exports = { createMetricsTools };
