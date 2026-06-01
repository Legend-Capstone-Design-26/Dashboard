function summarizeExperiment(experiment) {
  if (!experiment || typeof experiment !== "object") return null;
  return {
    id: experiment.id || null,
    key: experiment.key || null,
    url_prefix: experiment.url_prefix || null,
    status: experiment.status || null,
    version: experiment.version || null,
    published_at: experiment.published_at || null,
    updated_at: experiment.updated_at || null,
  };
}

function isReplaceRunningRequested(input) {
  const body = input && typeof input === "object" ? input : {};
  const value = body.replace_running ?? body.replaceRunning ?? body.force_replace ?? body.forceReplace;
  return value === true || value === 1 || String(value || "").trim().toLowerCase() === "true";
}

function findConflictingRunningExperiments({ experimentStore, siteId, targetExperimentId }) {
  const targetId = String(targetExperimentId || "").trim();
  return experimentStore
    .list(siteId)
    .filter((experiment) => experiment.site_id === siteId && experiment.status === "running")
    .filter((experiment) => !targetId || experiment.id !== targetId)
    .sort((a, b) => ((b.published_at || b.updated_at || 0) - (a.published_at || a.updated_at || 0)));
}

function findConflictingRunningExperiment(args) {
  const conflicts = findConflictingRunningExperiments(args);
  const rawExperiment = conflicts[0] || null;
  return rawExperiment
    ? { ok: true, experiment: summarizeExperiment(rawExperiment), rawExperiment, conflicts }
    : { ok: false, reason: "running_experiment_not_found", conflicts: [] };
}

function runningExperimentConflictResponse(runningExperiment) {
  return {
    ok: false,
    reason: "running_experiment_exists",
    message: "이미 진행 중인 실험이 있습니다. 기존 실험을 일시 중지한 뒤 새 실험을 배포할 수 있습니다.",
    running_experiment: summarizeExperiment(runningExperiment),
  };
}

function replaceRunningExperimentIfRequested({ experimentStore, siteId, targetExperimentId, replaceRunning, now = Date.now() }) {
  const conflicts = findConflictingRunningExperiments({ experimentStore, siteId, targetExperimentId });
  if (conflicts.length && !replaceRunning) return runningExperimentConflictResponse(conflicts[0]);

  const paused = [];
  if (conflicts.length) {
    conflicts.forEach((experiment) => {
      const pausedExperiment = experimentStore.patchById(siteId, experiment.id, (current) => ({
        ...current,
        status: "paused",
        updated_at: now,
        archived_at: null,
      }));
      if (pausedExperiment) paused.push(pausedExperiment);
    });
  }

  return {
    ok: true,
    replaced: paused.length > 0,
    paused_experiment: paused[0] ? summarizeExperiment(paused[0]) : null,
    paused_experiments: paused.map(summarizeExperiment),
  };
}

function selectLatestExperiment(experiments) {
  const list = Array.isArray(experiments) ? experiments.filter(Boolean) : [];
  return list.slice().sort((a, b) => ((b.published_at || b.updated_at || 0) - (a.published_at || a.updated_at || 0)))[0] || null;
}

function detectDuplicateRunningExperiments(experiments) {
  const groups = new Map();
  (Array.isArray(experiments) ? experiments : []).forEach((experiment) => {
    if (!experiment || experiment.status !== "running") return;
    const siteId = experiment.site_id || "unknown";
    if (!groups.has(siteId)) groups.set(siteId, []);
    groups.get(siteId).push(experiment);
  });
  return Array.from(groups.entries())
    .filter(([, items]) => items.length > 1)
    .map(([siteId, items]) => ({ site_id: siteId, experiments: items.map(summarizeExperiment) }));
}

module.exports = {
  summarizeExperiment,
  isReplaceRunningRequested,
  findConflictingRunningExperiment,
  findConflictingRunningExperiments,
  runningExperimentConflictResponse,
  replaceRunningExperimentIfRequested,
  selectLatestExperiment,
  detectDuplicateRunningExperiments,
};
