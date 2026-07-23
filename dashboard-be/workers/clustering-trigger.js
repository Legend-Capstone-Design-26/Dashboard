async function triggerHistoricalClustering({
  siteId,
  redisRuntime,
  redisSessionStore,
  incrementSessionCount,
  getLastClusteredCount,
  shouldRecluster,
  isEligibleSessionSummary,
  runClustering,
  makeLlmAdapter,
  logger = console,
}) {
  if (!redisRuntime) return { triggered: false, reason: "redis_unavailable" };

  try {
    await incrementSessionCount(redisRuntime, siteId);
    const sessions = await redisSessionStore.listHistoricalSessionSummaries({ siteId, limit: 2000 });
    const current = sessions.filter(isEligibleSessionSummary).length;
    const last = await getLastClusteredCount(redisRuntime, siteId);
    if (!shouldRecluster(last, current)) return { triggered: false, reason: "threshold", current, last };
    if (current === 0) return { triggered: false, reason: "empty", current, last };

    const callLlm = makeLlmAdapter();
    runClustering(sessions, siteId, redisRuntime, callLlm)
      .then((result) => {
        if (!result.skipped) {
          logger.log(`[clustering] site=${siteId} k=${result.k} taxonomy=${Object.keys(result.taxonomy || {}).join(", ")}`);
        }
      })
      .catch((err) => logger.warn("[clustering] background error", err));

    return { triggered: true, current, last };
  } catch (err) {
    logger.warn("[clustering] trigger error", err);
    return { triggered: false, reason: "error", error: err };
  }
}

module.exports = { triggerHistoricalClustering };
