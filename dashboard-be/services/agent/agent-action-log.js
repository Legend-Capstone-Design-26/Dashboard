const { appendJsonl, ensureJsonlFile } = require("../data-store");

function appendAgentActionLog({ filePath, entry }) {
  if (!filePath) return { ok: false, reason: "missing filePath" };
  const record = {
    ts: Date.now(),
    site_id: entry?.site_id || null,
    user_id: entry?.user_id || null,
    username: entry?.username || null,
    conversation_id: entry?.conversation_id || null,
    intent: entry?.intent || "unknown",
    status: entry?.status || "unknown",
    summary: entry?.summary || "",
    result_ref: entry?.result_ref || null,
    reason: entry?.reason || null,
    error: entry?.error || null,
    ...entry,
  };
  try {
    ensureJsonlFile(filePath);
    appendJsonl(filePath, record);
    return { ok: true, entry: record };
  } catch (error) {
    console.warn("Agent action log append failed", error);
    return { ok: false, reason: String(error), entry: record };
  }
}

module.exports = { appendAgentActionLog };
