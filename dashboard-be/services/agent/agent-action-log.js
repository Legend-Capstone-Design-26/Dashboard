const { appendJsonl, ensureJsonlFile } = require("../data-store");

function appendAgentActionLog({ filePath, entry }) {
  if (!filePath) return { ok: false, reason: "missing filePath" };
  const record = {
    ts: Date.now(),
    ...entry,
  };
  ensureJsonlFile(filePath);
  appendJsonl(filePath, record);
  return { ok: true, entry: record };
}

module.exports = { appendAgentActionLog };
