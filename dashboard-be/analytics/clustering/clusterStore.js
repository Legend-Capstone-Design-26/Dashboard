// ─── Redis Key Helpers ────────────────────────────────────────────────────────

const TTL_SEC = 60 * 60 * 24 * 30; // 30일

const keys = {
  taxonomy:     (siteId) => `cluster:taxonomy:${siteId}`,
  normParams:   (siteId) => `cluster:norm:${siteId}`,
  sessionCount: (siteId) => `cluster:count:${siteId}`,
  lastCount:    (siteId) => `cluster:last_count:${siteId}`,
};

// ─── Generic Helpers ──────────────────────────────────────────────────────────

async function setJson(redisRuntime, key, value) {
  const client = await redisRuntime.connect();
  await client.set(key, JSON.stringify(value), "EX", TTL_SEC);
}

async function getJson(redisRuntime, key) {
  const client = await redisRuntime.connect();
  const raw    = await client.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function getInt(redisRuntime, key) {
  const client = await redisRuntime.connect();
  const raw    = await client.get(key);
  return Number(raw) || 0;
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function saveTaxonomy(redisRuntime, siteId, taxonomy) {
  return setJson(redisRuntime, keys.taxonomy(siteId), taxonomy);
}

async function loadTaxonomy(redisRuntime, siteId) {
  return getJson(redisRuntime, keys.taxonomy(siteId));
}

async function saveNormParams(redisRuntime, siteId, normParams) {
  return setJson(redisRuntime, keys.normParams(siteId), normParams);
}

async function loadNormParams(redisRuntime, siteId) {
  return getJson(redisRuntime, keys.normParams(siteId));
}

async function incrementSessionCount(redisRuntime, siteId) {
  const client = await redisRuntime.connect();
  return client.incr(keys.sessionCount(siteId));
}

async function getSessionCount(redisRuntime, siteId) {
  return getInt(redisRuntime, keys.sessionCount(siteId));
}

async function getLastClusteredCount(redisRuntime, siteId) {
  return getInt(redisRuntime, keys.lastCount(siteId));
}

async function saveLastClusteredCount(redisRuntime, siteId, count) {
  const client = await redisRuntime.connect();
  await client.set(keys.lastCount(siteId), String(count), "EX", TTL_SEC);
}

module.exports = {
  saveTaxonomy,
  loadTaxonomy,
  saveNormParams,
  loadNormParams,
  incrementSessionCount,
  getSessionCount,
  getLastClusteredCount,
  saveLastClusteredCount,
};
