const express = require("express");
const { createFileExperimentStore } = require("../services/stores/experiment-store");
const { createFileEventStore } = require("../services/stores/event-store");
const { createFileSiteRegistryStore } = require("../services/stores/site-registry-store");
const { createMetricsReadModel } = require("../services/read-models/metrics-read-model");
const { createAgentToolRegistry } = require("../services/agent/tool-registry");
const { createAgentOrchestrator } = require("../services/agent/agent-orchestrator");
const { statusResponse } = require("../services/agent/agent-response");

function createAgentRoutes({ files, middlewares = {}, analytics = {} }) {
  const router = express.Router();
  const requireAuth = typeof middlewares.requireAuth === "function" ? middlewares.requireAuth : (_req, _res, next) => next();
  const requireSiteAccess = typeof middlewares.requireSiteAccess === "function" ? middlewares.requireSiteAccess : (_req, _res, next) => next();

  const experimentStore = createFileExperimentStore({ experimentsFile: files.experimentsFile });
  const eventStore = createFileEventStore({ eventsFile: files.eventsFile });
  const siteRegistryStore = createFileSiteRegistryStore({ sitesFile: files.sitesFile });
  const metricsReadModel = createMetricsReadModel({ eventStore, experimentStore });
  const toolRegistry = createAgentToolRegistry({
    experimentStore,
    metricsReadModel,
    siteRegistryStore,
    eventsFile: files.eventsFile,
    computeLabeledSessionSummaries: analytics.computeLabeledSessionSummaries,
    computeLabelsSummary: analytics.computeLabelsSummary,
    buildInsightsInput: analytics.buildInsightsInput,
    generateInsights: analytics.generateInsights,
  });
  const orchestrator = createAgentOrchestrator({ toolRegistry });

  router.get("/status", requireAuth, requireSiteAccess, (req, res) => {
    return res.json(statusResponse({ siteId: req.authorizedSiteId }));
  });

  router.post("/message", requireAuth, requireSiteAccess, async (req, res) => {
    const body = req.body || {};
    const message = String(body.message || "").trim();
    if (!message) return res.status(400).json({ ok: false, reason: "missing message" });
    const result = await orchestrator.runAgentTurn({
      siteId: req.authorizedSiteId,
      message,
      selectedExperimentKey: body.selected_experiment_key ? String(body.selected_experiment_key) : "",
    });
    return res.status(result.ok === false ? 400 : 200).json(result);
  });

  return router;
}

module.exports = { createAgentRoutes };
