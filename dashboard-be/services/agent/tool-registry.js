const { createExperimentTools } = require("./tools/experiment-tools");
const { createMetricsTools } = require("./tools/metrics-tools");
const { createInsightTools } = require("./tools/insight-tools");
const { createSiteTools } = require("./tools/site-tools");

function createAgentToolRegistry({ experimentStore, metricsReadModel, siteRegistryStore, files }) {
  const experimentTools = createExperimentTools({ experimentStore });
  const metricsTools = createMetricsTools({ metricsReadModel, experimentStore });
  const insightTools = createInsightTools({ files, siteRegistryStore });
  const siteTools = createSiteTools({ siteRegistryStore });

  return {
    list_experiments: experimentTools.listExperiments,
    find_experiment: experimentTools.findExperimentByKeyOrHint,
    summarize_experiment: metricsTools.summarizeExperimentMetrics,
    summarize_labels: insightTools.summarizeLabels,
    summarize_insights: insightTools.summarizeInsights,
    get_preview_targets: siteTools.getPreviewTargets,
  };
}

module.exports = {
  createAgentToolRegistry,
};
