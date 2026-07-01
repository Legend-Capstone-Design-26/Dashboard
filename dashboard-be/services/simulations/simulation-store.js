const { ensureJsonFile, readJson, writeJson } = require("../data-store");

function createSimulationStore({ simulationsFile }) {
  function ensure() {
    ensureJsonFile(simulationsFile, { runs: [] });
  }

  function load() {
    ensure();
    return readJson(simulationsFile, { runs: [] }) || { runs: [] };
  }

  function save(db) {
    writeJson(simulationsFile, db);
    return db;
  }

  function list({ siteId, limit = 20 } = {}) {
    const max = Math.max(1, Math.min(Number(limit) || 20, 100));
    return (load().runs || [])
      .filter((run) => !siteId || run.site_id === siteId)
      .sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0))
      .slice(0, max);
  }

  function get(runId) {
    return (load().runs || []).find((run) => run.run_id === runId) || null;
  }

  function upsert(run) {
    const db = load();
    const runs = Array.isArray(db.runs) ? db.runs : [];
    const index = runs.findIndex((item) => item.run_id === run.run_id);
    if (index >= 0) runs[index] = run;
    else runs.push(run);
    db.runs = runs;
    save(db);
    return run;
  }

  return { list, get, upsert };
}

module.exports = { createSimulationStore };
