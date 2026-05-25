const crypto = require("crypto");

function normalizeExperiment(experiment) {
  return {
    id: experiment?.id || null,
    key: experiment?.key || null,
    name: experiment?.name || experiment?.key || null,
    status: experiment?.status || null,
    url_prefix: experiment?.url_prefix || null,
    version: experiment?.version || null,
    traffic: experiment?.traffic || null,
    goals: Array.isArray(experiment?.goals) ? experiment.goals : [],
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
  }, { total: experiments.length });
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

  function createExperimentDraft(input) {
    const siteId = String(input?.siteId || "").trim();
    const key = String(input?.key || "").trim();
    const urlPrefix = String(input?.urlPrefix || "/").trim() || "/";
    if (!siteId) return { ok: false, reason: "missing siteId" };
    if (!key) return { ok: false, reason: "missing key" };

    const existing = experimentStore.getByKey(siteId, key);
    if (existing) return { ok: false, reason: "experiment key already exists" };

    const now = Date.now();
    const id = crypto.randomUUID ? `exp_${crypto.randomUUID()}` : `exp_${crypto.randomBytes(12).toString("hex")}`;
    const experiment = {
      id,
      site_id: siteId,
      key,
      url_prefix: urlPrefix,
      traffic: input.traffic || { A: 50, B: 50 },
      goals: Array.isArray(input.goals) && input.goals.length ? input.goals : ["checkout_complete"],
      variants: input.variants || { A: [], B: [] },
      hypothesis: input.hypothesis || "Agent Mode에서 생성한 A/B 테스트 초안입니다.",
      source: input.source || "agent_mode",
      status: "draft",
      created_by: input.createdBy || null,
      updated_at: now,
      published_at: null,
      archived_at: null,
      version: 1,
    };

    const saved = experimentStore.upsert(experiment, (item) => item.site_id === siteId && item.key === key);
    return { ok: true, experiment: normalizeExperiment(saved), rawExperiment: saved };
  }

  return {
    listExperiments,
    findExperimentByKeyOrHint,
    createExperimentDraft,
  };
}

module.exports = {
  createExperimentTools,
  normalizeExperiment,
};
