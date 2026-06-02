const express = require("express");
const { createFileExperimentStore } = require("../services/stores/experiment-store");
const { createFileEventStore } = require("../services/stores/event-store");
const { createFileSiteRegistryStore } = require("../services/stores/site-registry-store");
const { createMetricsReadModel } = require("../services/read-models/metrics-read-model");
const { createAgentToolRegistry } = require("../services/agent/tool-registry");
const { createAgentOrchestrator } = require("../services/agent/agent-orchestrator");
const { createFileApprovalStore } = require("../services/agent/approval-store");
const { statusResponse } = require("../services/agent/agent-response");

function createAgentRoutes({ files, middlewares = {}, analytics = {}, redisSessionAnalyticsService = null }) {
  const router = express.Router();
  const requireAuth = typeof middlewares.requireAuth === "function" ? middlewares.requireAuth : (_req, _res, next) => next();
  const requireSiteAccess = typeof middlewares.requireSiteAccess === "function" ? middlewares.requireSiteAccess : (_req, _res, next) => next();

  const experimentStore = createFileExperimentStore({ experimentsFile: files.experimentsFile });
  const eventStore = createFileEventStore({ eventsFile: files.eventsFile });
  const siteRegistryStore = createFileSiteRegistryStore({ sitesFile: files.sitesFile });
  const approvalStore = createFileApprovalStore({ approvalsFile: files.agentApprovalsFile });
  const metricsReadModel = createMetricsReadModel({ eventStore, experimentStore });
  const toolRegistry = createAgentToolRegistry({
    experimentStore,
    metricsReadModel,
    siteRegistryStore,
    eventsFile: files.eventsFile,
    redisSessionAnalyticsService,
    generateInsights: analytics.generateInsights,
  });
  const orchestrator = createAgentOrchestrator({ toolRegistry, approvalStore, agentActionsFile: files.agentActionsFile });

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
      conversationId: body.conversation_id ? String(body.conversation_id) : "",
      selectedExperimentKey: body.selected_experiment_key ? String(body.selected_experiment_key) : "",
      user: req.authUser || null,
    });
    return res.status(result.ok === false ? 400 : 200).json(result);
  });

  router.post("/approvals/:approvalId/approve", requireAuth, requireSiteAccess, (req, res) => {
    const result = orchestrator.approveApproval({
      siteId: req.authorizedSiteId,
      approvalId: String(req.params.approvalId || ""),
      user: req.authUser || null,
    });
    return res.status(result.ok === false ? 400 : 200).json(result);
  });

  router.post("/approvals/:approvalId/cancel", requireAuth, requireSiteAccess, (req, res) => {
    const result = orchestrator.cancelApproval({
      siteId: req.authorizedSiteId,
      approvalId: String(req.params.approvalId || ""),
      user: req.authUser || null,
    });
    return res.status(result.ok === false ? 400 : 200).json(result);
  });

  return router;
}

module.exports = { createAgentRoutes };
