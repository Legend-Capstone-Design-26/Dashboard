function createInsightTools({ computeLabeledSessionSummaries, computeLabelsSummary, buildInsightsInput, generateInsights, eventsFile, siteRegistryStore }) {
  async function getLabeled(siteId) {
    const pathMappings = siteRegistryStore.getRawById(siteId)?.journey_path_mappings || null;
    return computeLabeledSessionSummaries(eventsFile, {
      site_id: siteId,
      limit_events: 50000,
      session_ttl_ms: 30 * 60 * 1000,
      pathMappings,
    });
  }

  async function summarizeLabels({ siteId }) {
    const labeled = await getLabeled(siteId);
    return { summary: computeLabelsSummary(labeled) };
  }

  async function summarizeInsights({ siteId }) {
    const labeled = await getLabeled(siteId);
    const input = buildInsightsInput(siteId, labeled, { perLabelRepresentatives: 2 });
    const result = await generateInsights(input, {});
    return {
      provider: result.provider,
      model: result.model,
      fallback_reason: result.fallbackReason || null,
      output: result.output,
    };
  }

  return { summarizeLabels, summarizeInsights };
}

module.exports = { createInsightTools };
