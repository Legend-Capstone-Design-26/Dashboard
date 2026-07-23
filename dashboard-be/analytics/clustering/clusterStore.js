// ─── Redis Key Helpers ────────────────────────────────────────────────────────

const TTL_SEC = 60 * 60 * 24 * 30; // 30일

const keys = {
  taxonomy:     (siteId) => `cluster:taxonomy:${siteId}`,
  normParams:   (siteId) => `cluster:norm:${siteId}`,
  sessionCount: (siteId) => `cluster:count:${siteId}`,
  lastCount:    (siteId) => `cluster:last_count:${siteId}`,
};

const v2Keys = {
  taxonomy:     (siteId) => `cluster:v2:taxonomy:${siteId}`,
  normParams:   (siteId) => `cluster:v2:norm:${siteId}`,
  sessionCount: (siteId) => `cluster:v2:count:${siteId}`,
  lastCount:    (siteId) => `cluster:v2:last_count:${siteId}`,
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
  return setJson(redisRuntime, v2Keys.taxonomy(siteId), taxonomy);
}

async function loadTaxonomy(redisRuntime, siteId) {
  return (await getJson(redisRuntime, v2Keys.taxonomy(siteId))) || getJson(redisRuntime, keys.taxonomy(siteId));
}

async function saveNormParams(redisRuntime, siteId, normParams) {
  return setJson(redisRuntime, v2Keys.normParams(siteId), normParams);
}

async function loadNormParams(redisRuntime, siteId) {
  return (await getJson(redisRuntime, v2Keys.normParams(siteId))) || getJson(redisRuntime, keys.normParams(siteId));
}

async function incrementSessionCount(redisRuntime, siteId) {
  const client = await redisRuntime.connect();
  return client.incr(v2Keys.sessionCount(siteId));
}

async function getSessionCount(redisRuntime, siteId) {
  return getInt(redisRuntime, v2Keys.sessionCount(siteId));
}

async function getLastClusteredCount(redisRuntime, siteId) {
  return getInt(redisRuntime, v2Keys.lastCount(siteId));
}

async function saveLastClusteredCount(redisRuntime, siteId, count) {
  const client = await redisRuntime.connect();
  await client.set(v2Keys.lastCount(siteId), String(count), "EX", TTL_SEC);
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
  keys,
  v2Keys,
  TTL_SEC,
};
