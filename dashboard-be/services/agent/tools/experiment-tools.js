function normalizeExperiment(experiment) {
  return {
    id: experiment?.id || null,
    key: experiment?.key || null,
    status: experiment?.status || null,
    url_prefix: experiment?.url_prefix || null,
    version: experiment?.version || null,
    updated_at: experiment?.updated_at || null,
    published_at: experiment?.published_at || null,
    archived_at: experiment?.archived_at || null,
  };
}

function summarizeStatusCounts(experiments) {
  return experiments.reduce((acc, experiment) => {
    const status = experiment.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function formatStatusSummary(counts) {
  const parts = [
    ["running", "진행 중"],
    ["draft", "초안"],
    ["paused", "중지"],
    ["archived", "보관"],
  ]
    .filter(([key]) => Number(counts[key]) > 0)
    .map(([key, label]) => `${label} ${counts[key]}개`);
  return parts.length ? parts.join(", ") : "상태별 실험이 없습니다";
}

function createExperimentTools({ experimentStore }) {
  function listExperiments({ siteId }) {
    const experiments = experimentStore.list(siteId).map(normalizeExperiment);
    const counts = summarizeStatusCounts(experiments);
    return {
      ok: true,
      experiments,
      counts,
      message: `현재 ${siteId} 사이트에는 총 ${experiments.length}개의 실험이 있습니다. ${formatStatusSummary(counts)}입니다.`,
    };
  }

  function findExperimentByKeyOrHint({ siteId, key, message }) {
    const experiments = experimentStore.list(siteId);
    const requestedKey = String(key || "").trim();
    if (requestedKey) {
      const byKey = experiments.find((experiment) => experiment.key === requestedKey) || null;
      if (byKey) return { ok: true, experiment: normalizeExperiment(byKey), rawExperiment: byKey };
    }

    const text = String(message || "").toLowerCase();
    const fromText = experiments.find((experiment) => experiment.key && text.includes(String(experiment.key).toLowerCase())) || null;
    if (fromText) return { ok: true, experiment: normalizeExperiment(fromText), rawExperiment: fromText };

    const running = experiments.find((experiment) => experiment.status === "running") || null;
    const fallback = running || experiments[0] || null;
    if (!fallback) return { ok: false, reason: "experiment_not_found" };

    return { ok: true, experiment: normalizeExperiment(fallback), rawExperiment: fallback };
  }

  return {
    listExperiments,
    findExperimentByKeyOrHint,
  };
}

module.exports = {
  createExperimentTools,
  normalizeExperiment,
};
