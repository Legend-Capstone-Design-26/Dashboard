const express = require("express");
const { createExperimentsService } = require("../services/analytics/experiments-service");
const { createMetricsService } = require("../services/analytics/metrics-service");
const { createEventsService } = require("../services/analytics/events-service");
const { createConversationAnalyticsService } = require("../services/analytics/conversation-analytics-service");
const { createProductService } = require("../services/commerce/product-service");
const { createFaqService } = require("../services/commerce/faq-service");
const { createOrderService } = require("../services/commerce/order-service");
const { createSupportService } = require("../services/commerce/support-service");
const { createToolRegistry } = require("../services/chat/tool-registry");
const { createChatOrchestrator } = require("../services/chat/chat-orchestrator");
const { createLlmClient } = require("../services/llm");
const { createFileExperimentStore } = require("../services/stores/experiment-store");
const { createFileEventStore } = require("../services/stores/event-store");
const { createFileSiteRegistryStore } = require("../services/stores/site-registry-store");
const { createMetricsReadModel } = require("../services/read-models/metrics-read-model");

function createChatRoutes({ files, middlewares = {}, redisEventSummaryStore = null }) {
  const router = express.Router();
  const requireAuth = typeof middlewares.requireAuth === "function" ? middlewares.requireAuth : (_req, _res, next) => next();
  const requireSiteAccess = typeof middlewares.requireSiteAccess === "function" ? middlewares.requireSiteAccess : (_req, _res, next) => next();
  const experimentStore = createFileExperimentStore({ experimentsFile: files.experimentsFile });
  const eventStore = createFileEventStore({ eventsFile: files.eventsFile });
  const siteRegistryStore = files.sitesFile ? createFileSiteRegistryStore({ sitesFile: files.sitesFile }) : null;
  const metricsReadModel = createMetricsReadModel({ eventStore, experimentStore });

  const experimentsService = createExperimentsService({ experimentsFile: files.experimentsFile, experimentStore });
  const metricsService = createMetricsService({
    experimentsFile: files.experimentsFile,
    eventsFile: files.eventsFile,
    eventStore,
    experimentStore,
    metricsReadModel,
  });
  // TODO: events.jsonl 기반 analytics pipeline은 Redis read model 전환 완료 후 제거 예정.
  const eventsService = createEventsService({ eventsFile: files.eventsFile, eventStore });
  const conversationAnalyticsService = createConversationAnalyticsService({
    chatEventsFile: files.chatEventsFile,
    chatSessionsFile: files.chatSessionsFile,
    chatFeedbackFile: files.chatFeedbackFile,
  });
  const productService = createProductService({ productsFile: files.productsFile });
  const faqService = createFaqService({ faqFile: files.faqFile, policiesFile: files.policiesFile });
  const orderService = createOrderService({ ordersFile: files.ordersFile });
  const supportService = createSupportService({ supportTicketsFile: files.supportTicketsFile });

  const toolRegistry = createToolRegistry({
    experimentsService,
    metricsService,
    eventsService,
    conversationAnalyticsService,
    productService,
    faqService,
    orderService,
    supportService,
  });
  const llmClient = createLlmClient();
  const chatOrchestrator = createChatOrchestrator({ toolRegistry, conversationAnalyticsService, llmClient });

  router.post("/chat", requireAuth, requireSiteAccess, async (req, res) => {
    const { agent, messages, context, site_id } = req.body || {};
    const safeContext = context && typeof context === "object" ? context : {};
    const mergedContext = {
      ...safeContext,
      site_id: safeContext.site_id || safeContext.siteId || site_id || req.query.site_id || "",
    };
    const result = await chatOrchestrator.handleChat({ agent, messages, context: mergedContext, siteId: site_id || req.query.site_id || "" });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/event-summary", requireAuth, requireSiteAccess, async (req, res) => {
    const siteId = String(req.query.site_id || "ab-sample");
    const page = req.query.page ? String(req.query.page) : null;
    const fromTs = Number.isFinite(Number(req.query.from_ts)) ? Number(req.query.from_ts) : undefined;
    const toTs = Number.isFinite(Number(req.query.to_ts)) ? Number(req.query.to_ts) : undefined;
    const rawSite = siteRegistryStore ? siteRegistryStore.getRawById(siteId) : null;
    const pathMappings = rawSite?.journey_path_mappings || null;
    if (!redisEventSummaryStore) {
      return res.status(503).json({
        ok: false,
        reason: "redis_unavailable",
        message: "실시간 데이터 저장소에 연결할 수 없습니다. Redis와 event consumer 상태를 확인해 주세요.",
        source: "redis",
        fallback_used: false,
      });
    }
    try {
      const summary = await redisEventSummaryStore.getEventSummary({ siteId, page, fromTs, toTs, pathMappings });
      return res.json({ ...summary, source: "redis", fallback_used: false });
    } catch (error) {
      console.warn("[redis-summary] event-summary read failed", error);
      return res.status(503).json({
        ok: false,
        reason: "redis_unavailable",
        message: "실시간 데이터 저장소에 연결할 수 없습니다. Redis와 event consumer 상태를 확인해 주세요.",
        source: "redis",
        fallback_used: false,
      });
    }
  });

  router.get("/chat-issues-summary", requireAuth, requireSiteAccess, (req, res) => {
    const page = req.query.page ? String(req.query.page) : null;
    const productId = req.query.productId ? String(req.query.productId) : null;
    return res.json(conversationAnalyticsService.getChatIssueSummary({ siteId: String(req.query.site_id || ""), page, productId }));
  });

  router.post("/experiments/draft", requireAuth, requireSiteAccess, (req, res) => {
    const body = req.body || {};
    if (!body.key || !body.url_prefix) {
      return res.status(400).json({ ok: false, reason: "missing key/url_prefix" });
    }
    const draft = experimentsService.saveDraft({
      siteId: body.site_id || "ab-sample",
      key: body.key,
      urlPrefix: body.url_prefix,
      traffic: body.traffic,
      goals: body.goals,
      variants: body.variants,
      hypothesis: body.hypothesis,
      source: body.source || "api",
    });
    return res.json({ ok: true, experiment: draft });
  });

  router.post("/chat/feedback", requireAuth, requireSiteAccess, (req, res) => {
    const payload = req.body || {};
    if (!payload.site_id || !payload.sessionId || !payload.agent) {
      return res.status(400).json({ ok: false, reason: "missing site_id/sessionId/agent" });
    }
    conversationAnalyticsService.saveFeedback(payload);
    return res.json({ ok: true });
  });

  router.get("/products", (req, res) => {
    const q = req.query.q ? String(req.query.q) : "";
    const list = q ? productService.searchProducts(q) : productService.listProducts();
    return res.json({ ok: true, products: list });
  });

  router.get("/faq", (req, res) => {
    const q = req.query.q ? String(req.query.q) : "";
    const list = q ? faqService.faqSearch(q) : faqService.listFaq();
    return res.json({ ok: true, items: list });
  });

  router.get("/orders/:id", (req, res) => {
    const id = req.params.id;
    const userId = req.query.userId ? String(req.query.userId) : null;
    const order = orderService.getOrderStatus({ orderId: id, userId });
    if (!order) return res.status(404).json({ ok: false, reason: "order not found" });
    return res.json({ ok: true, order });
  });

  return router;
}

module.exports = { createChatRoutes };
