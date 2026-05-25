const { createExperimentTools } = require("./tools/experiment-tools");
const { createMetricsTools } = require("./tools/metrics-tools");
const { createInsightTools } = require("./tools/insight-tools");
const { createSiteTools } = require("./tools/site-tools");

function createAgentToolRegistry(deps) {
  return {
    ...createExperimentTools(deps),
    ...createMetricsTools(deps),
    ...createInsightTools(deps),
    ...createSiteTools(deps),
  };
}

module.exports = { createAgentToolRegistry };
