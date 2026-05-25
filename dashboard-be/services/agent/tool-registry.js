const { createExperimentTools } = require("./tools/experiment-tools");
const { createMetricsTools } = require("./tools/metrics-tools");
const { createInsightTools } = require("./tools/insight-tools");
const { createSiteTools } = require("./tools/site-tools");
const { buildDraftChangesFromInstruction, validateDraftChanges } = require("./tools/editor-tools");

function createAgentToolRegistry(deps) {
  const experimentTools = createExperimentTools(deps);
  const metricsTools = createMetricsTools(deps);
  const insightTools = createInsightTools(deps);
  const siteTools = createSiteTools(deps);
  return {
    ...experimentTools,
    ...metricsTools,
    ...insightTools,
    ...siteTools,
    buildDraftChangesFromInstruction,
    validateDraftChanges,
  };
}

module.exports = { createAgentToolRegistry };
