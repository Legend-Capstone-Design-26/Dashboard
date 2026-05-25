const express = require("express");
const { createAgentToolRegistry } = require("../services/agent/tool-registry");
const { runAgentTurn } = require("../services/agent/agent-orchestrator");
const { statusResponse, failedResponse } = require("../services/agent/agent-response");

function createAgentRoutes({ experimentStore, metricsReadModel, siteRegistryStore, files, middlewares }) {
  const router = express.Router();
  const requireAuth = middlewares?.requireAuth || ((_req, _res, next) => next());
  const requireSiteAccess = middlewares?.requireSiteAccess || ((_req, _res, next) => next());
  const tools = createAgentToolRegistry({ experimentStore, metricsReadModel, siteRegistryStore, files });

  router.get("/status", requireAuth, requireSiteAccess, (req, res) => {
    const siteId = req.authorizedSiteId || String(req.query.site_id || "").trim();
    return res.json(statusResponse({ siteId }));
  });

  router.post("/message", requireAuth, requireSiteAccess, async (req, res) => {
    const siteId = req.authorizedSiteId || String(req.body?.site_id || "").trim();
    try {
      const result = await runAgentTurn({
        message: req.body?.message,
        siteId,
        user: req.authUser || null,
        conversationId: req.body?.conversation_id || null,
        selectedExperimentKey: req.body?.selected_experiment_key || null,
        agentMode: req.body?.agent_mode === true,
        query: req.body?.query || {},
        tools,
      });
      return res.status(result.ok === false ? 400 : 200).json(result);
    } catch (error) {
      return res.status(500).json(failedResponse({ siteId, intent: "unknown", message: "Agent message 처리에 실패했습니다.", reason: String(error) }));
    }
  });

  return router;
}

module.exports = {
  createAgentRoutes,
};
