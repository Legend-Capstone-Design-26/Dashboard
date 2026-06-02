function buildAssignmentKey({ siteId, experimentKey, anonUserId }) {
  return `ab:assign:${siteId}:${experimentKey}:${anonUserId}`;
}

function buildSessionKey({ siteId, sessionId }) {
  // TODO: For Redis Cluster, migrate new keys to hash tags such as
  // `uxsdk:{site:<siteId>}:session:<sessionId>` after existing data compatibility is handled.
  return `session:${siteId}:${sessionId}`;
}

async function scanKeys(client, pattern) {
  const prefix = String(client?.options?.keyPrefix || "");
  const physicalPattern = `${prefix}${pattern}`;

  if (typeof client.scan === "function") {
    const keys = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await client.scan(cursor, "MATCH", physicalPattern, "COUNT", 100);
      cursor = String(nextCursor);
      keys.push(...(Array.isArray(batch) ? batch : []));
    } while (cursor !== "0");

    return keys.map((key) => prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key);
  }

  const keys = await client.keys(pattern);
  return keys.map((key) => prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key);
}

function createRedisSessionStore({ redisRuntime, sessionTtlSec, assignmentTtlSec }) {
  async function listSessionStates({ siteId, limit = 50, fromTs, toTs } = {}) {
    const client = await redisRuntime.connect();
    const pattern = buildSessionKey({ siteId, sessionId: "*" });
    const keys = await scanKeys(client, pattern);
    if (keys.length === 0) return [];

    const values = await Promise.all(keys.map((key) => client.get(key)));
    const items = [];
    for (let i = 0; i < keys.length; i += 1) {
      const value = values[i];
      if (!value) continue;
      try {
        items.push(JSON.parse(value));
      } catch {
        continue;
      }
    }

    const maxLimit = Math.max(1, Math.min(Number(limit) || 50, 1000));
    return items
      .filter((item) => {
        const lastTs = Number(item?.last_ts || item?.updated_at || 0);
        if (typeof fromTs === "number" && Number.isFinite(fromTs) && lastTs < fromTs) return false;
        if (typeof toTs === "number" && Number.isFinite(toTs) && lastTs > toTs) return false;
        return true;
      })
      .sort((a, b) => (Number(b?.last_ts) || 0) - (Number(a?.last_ts) || 0))
      .slice(0, maxLimit);
  }

  async function setVariantAssignment({ siteId, experimentKey, anonUserId, variant, version }) {
    const client = await redisRuntime.connect();
    const key = buildAssignmentKey({ siteId, experimentKey, anonUserId });
    const payload = JSON.stringify({ variant, version: version || null, updated_at: Date.now() });
    await client.set(key, payload, "EX", assignmentTtlSec);
    return { ok: true, key };
  }

  async function getVariantAssignment({ siteId, experimentKey, anonUserId }) {
    const client = await redisRuntime.connect();
    const key = buildAssignmentKey({ siteId, experimentKey, anonUserId });
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  async function upsertSessionState({ siteId, sessionId, state }) {
    const client = await redisRuntime.connect();
    const key = buildSessionKey({ siteId, sessionId });
    const payload = JSON.stringify({ ...(state || {}), updated_at: Date.now() });
    await client.set(key, payload, "EX", sessionTtlSec);
    return { ok: true, key };
  }

  async function getSessionState({ siteId, sessionId }) {
    const client = await redisRuntime.connect();
    const key = buildSessionKey({ siteId, sessionId });
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return {
    listSessionStates,
    setVariantAssignment,
    getVariantAssignment,
    upsertSessionState,
    getSessionState,
  };
}

module.exports = { createRedisSessionStore };
