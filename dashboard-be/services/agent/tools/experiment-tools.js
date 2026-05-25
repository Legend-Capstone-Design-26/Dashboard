function compactExperiment(experiment) {
  return {
    id: experiment.id,
    key: experiment.key,
    name: experiment.name || experiment.key,
    status: experiment.status || "unknown",
    version: experiment.version || null,
    url_prefix: experiment.url_prefix || null,
    traffic: experiment.traffic || null,
    goals: Array.isArray(experiment.goals) ? experiment.goals : [],
    updated_at: experiment.updated_at || null,
    published_at: experiment.published_at || null,
  };
}

function createExperimentTools({ experimentStore }) {
  function listExperiments({ siteId }) {
    const experiments = experimentStore.list(siteId).map(compactExperiment);
    const running = experiments.filter((item) => item.status === "running").length;
    const draft = experiments.filter((item) => item.status === "draft").length;
    return { experiments, counts: { total: experiments.length, running, draft } };
  }

  function summarizeExperiment({ siteId, key }) {
    const experiments = experimentStore.list(siteId);
    const experiment = key
      ? experimentStore.getByKey(siteId, key)
      : experiments.find((item) => item.status === "running") || experiments[0] || null;
    if (!experiment) return { experiment: null };
    return { experiment: compactExperiment(experiment) };
  }

  return { listExperiments, summarizeExperiment };
}

module.exports = { createExperimentTools };
