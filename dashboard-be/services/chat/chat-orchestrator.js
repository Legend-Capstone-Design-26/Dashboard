const { buildChatContext } = require("./context-builder");
const { getAnalyticsSystemPrompt, getCommerceSystemPrompt } = require("./prompts");

function createChatOrchestrator({ toolRegistry, conversationAnalyticsService, llmClient }) {
  const safeLlmClient =
    llmClient && typeof llmClient.rewrite === "function"
      ? llmClient
      : {
          mode: "mock",
          async rewrite({ draftAnswer }) {
            return { ok: true, text: draftAnswer, reason: "fallback_mock" };
          },
          async answer({ fallbackAnswer }) {
            return { ok: true, text: fallbackAnswer, reason: "fallback_mock" };
          },
        };

  async function maybeLLMRewrite({ agent, answer, messages, context }) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const systemPrompt = agent === "analytics_copilot" ? getAnalyticsSystemPrompt() : getCommerceSystemPrompt();
    const response = await safeLlmClient.rewrite({
      systemPrompt,
      userPrompt: `User message: ${lastUser}\n\nDraft answer:\n${answer}\n\nContext:${JSON.stringify(context)}`,
      draftAnswer: answer,
    });
    if (!response.ok || !response.text) return answer;
    return response.text;
  }

  async function invokeTool({ catalog, allowedTools, usedTools, name, input }) {
    if (!allowedTools.includes(name)) {
      throw new Error(`tool_not_allowed:${name}`);
    }
    const fn = catalog[name];
    if (typeof fn !== "function") {
      throw new Error(`tool_not_found:${name}`);
    }

    const result = await fn(input || {});
    usedTools.push({
      tool: name,
      input: input || {},
      resultPreview:
        typeof result === "object" && result
          ? Object.keys(result).slice(0, 6)
          : Array.isArray(result)
            ? { length: result.length }
            : String(result || ""),
    });
    return result;
  }

  function detectIntent(text) {
    const q = String(text || "").toLowerCase();
    if (q.includes("환불") || q.includes("refund")) return "refund";
    if (q.includes("교환") || q.includes("exchange")) return "exchange";
    if (q.includes("취소") || q.includes("cancel")) return "cancel";
    if (q.includes("배송") || q.includes("shipping")) return "shipping";
    if (q.includes("주문") || q.includes("order")) return "order_status";
    if (q.includes("상담") || q.includes("사람") || q.includes("human")) return "handoff";
    if (q.includes("실험") || q.includes("제안") || q.includes("draft")) return "experiment";
    return "general";
  }

  function shouldGenerateDraft(text) {
    const q = String(text || "").toLowerCase();
    return ["실험", "제안", "draft", "b안", "개선", "생성", "만들어", "suggest", "generate", "create"]
      .some((k) => q.includes(k));
  }

  function shouldSaveDraft(text) {
    const q = String(text || "").toLowerCase();
    return [
      "저장",
      "저장해",
      "저장해줘",
      "draft로 저장",
      "초안 저장",
      "save draft",
      "save this draft",
    ].some((k) => q.includes(k));
  }

  function hasCommerceActionIntent(text) {
    const q = String(text || "").toLowerCase();
    return ["환불", "refund", "취소", "cancel", "교환", "exchange"].some((k) => q.includes(k));
  }

  function roundRate(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Number((n * 100).toFixed(2));
  }

  function compactExperiment(exp) {
    if (!exp || typeof exp !== "object") return null;
    return {
      id: exp.id || null,
      key: exp.key || null,
      status: exp.status || null,
      url_prefix: exp.url_prefix || null,
      traffic: exp.traffic || null,
      goals: Array.isArray(exp.goals) ? exp.goals.slice(0, 5) : [],
      version: exp.version || null,
      updated_at: exp.updated_at || null,
      published_at: exp.published_at || null,
    };
  }

  function compactMetrics(metrics) {
    if (!metrics || !metrics.ok) return { ok: false, reason: metrics?.reason || "metrics_unavailable" };
    function variantStats(item) {
      return {
        sessions: Number(item?.sessions || 0),
        users: Number(item?.users || 0),
        page_views: Number(item?.page_views || 0),
        clicks: Number(item?.clicks || 0),
        conversions: Number(item?.conversions || 0),
        cvr_percent: roundRate(item?.cvr),
        ctr_percent: roundRate(item?.ctr),
        bounce_rate_percent: roundRate(item?.bounce_rate),
        top_clicked_elements: Array.isArray(item?.top_clicked_elements) ? item.top_clicked_elements.slice(0, 5) : [],
      };
    }
    return {
      ok: true,
      source: metrics.source || null,
      key: metrics.key || null,
      goals: Array.isArray(metrics.goals) ? metrics.goals.slice(0, 5) : [],
      experiment: metrics.experiment ? compactExperiment(metrics.experiment) : null,
      A: variantStats(metrics.A),
      B: variantStats(metrics.B),
      totals: metrics.totals || null,
    };
  }

  function compactEventSummary(summary) {
    if (!summary || typeof summary !== "object") return null;
    return {
      site_id: summary.site_id || null,
      total_events: Number(summary.total_events || summary.event_count || 0),
      sessions: Number(summary.sessions || summary.session_count || 0),
      event_types: Array.isArray(summary.event_types) ? summary.event_types.slice(0, 8) : summary.event_types || null,
      top_paths: Array.isArray(summary.top_paths) ? summary.top_paths.slice(0, 8) : [],
      top_elements: Array.isArray(summary.top_elements) ? summary.top_elements.slice(0, 8) : [],
      funnel: summary.funnel || null,
      labels: Array.isArray(summary.labels) ? summary.labels.slice(0, 8) : summary.labels || null,
    };
  }

  function compactIssueSummary(summary) {
    if (!summary || typeof summary !== "object") return null;
    return {
      total: Number(summary.total || summary.totalIssues || 0),
      issue_types: Array.isArray(summary.issue_types) ? summary.issue_types.slice(0, 8) : [],
      top_products: Array.isArray(summary.top_products) ? summary.top_products.slice(0, 5) : [],
      unresolved: Number(summary.unresolved || 0),
    };
  }

  function compactMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .filter((message) => ["user", "assistant"].includes(message?.role) && typeof message.content === "string")
      .slice(-10)
      .map((message) => ({ role: message.role, content: message.content.slice(0, 500) }));
  }

  function compactActions(actions) {
    return (Array.isArray(actions) ? actions : []).slice(0, 5).map((action) => ({
      type: action.type || null,
      key: action.draft?.key || action.experiment?.key || null,
      saved: action.type === "saved_experiment_draft",
      change_count: Array.isArray(action.changesB) ? action.changesB.length : Array.isArray(action.draft?.variant_b_changes) ? action.draft.variant_b_changes.length : null,
    }));
  }

  function buildFallbackAnswer({ metrics, draft, actions }) {
    const parts = ["현재 AI 답변 생성에 실패했습니다. 다만 선택된 사이트의 실험/이벤트 데이터 조회는 완료되었습니다."];
    if (metrics?.ok) {
      parts.push("선택 실험의 A/B 지표는 조회되었습니다. 상세 지표 영역에서 전환율과 클릭률을 확인해 주세요.");
    }
    if (draft) {
      parts.push(actions.some((action) => action.type === "saved_experiment_draft")
        ? "요청한 실험 초안은 draft로 저장되었습니다."
        : "요청한 실험 초안은 응답 action으로 생성되었지만 아직 저장/배포되지 않았습니다.");
    }
    parts.push("잠시 후 다시 시도해 주세요.");
    return parts.join(" ");
  }

  function buildAnalyticsAnswerContext({ ctx, messages, siteId, selectedExperimentKey, experiments, metrics, eventSummary, issueSummary, selectedElement, draft, actions, usedTools }) {
    const selectedExperiment = experiments.find((exp) => exp.key === selectedExperimentKey) || null;
    return {
      siteId,
      latestUserMessage: ctx.latestUserMessage,
      messages: compactMessages(messages),
      selectedExperimentKey,
      experiments: {
        count: experiments.length,
        running_count: experiments.filter((exp) => exp.status === "running").length,
        draft_count: experiments.filter((exp) => exp.status === "draft").length,
        selected: compactExperiment(selectedExperiment),
        recent: experiments.slice(0, 8).map(compactExperiment).filter(Boolean),
      },
      selectedExperimentMetrics: compactMetrics(metrics),
      eventSummary: compactEventSummary(eventSummary),
      chatIssueSummary: compactIssueSummary(issueSummary),
      selectedElementContext: selectedElement || null,
      draft: draft ? {
        created: true,
        key: draft.key || null,
        target_page: draft.target_page || null,
        target_selector: draft.target_selector || null,
        primary_goal: draft.primary_goal || null,
        saved: actions.some((action) => action.type === "saved_experiment_draft"),
      } : { created: false },
      actionsSummary: compactActions(actions),
      usedTools: usedTools.map((tool) => ({ tool: tool.tool, input: tool.input, resultPreview: tool.resultPreview })).slice(0, 10),
      safety: {
        noDirectWriteActions: ["publish_experiment", "pause_experiment", "rollback_experiment", "delete_experiment"],
        guidance: "일반 챗봇은 배포/중지/롤백/삭제를 직접 실행하지 않습니다. 실제 작업은 Agent Mode와 승인 흐름으로 안내하세요.",
      },
    };
  }

  function previewAnswerDetail(detail) {
    if (typeof detail !== "string" || !detail) return null;
    return detail.slice(0, 500);
  }

  async function runAnalyticsCopilot({ messages, context, siteId: requestedSiteId }) {
    const ctx = buildChatContext({ messages, context, siteId: requestedSiteId });
    const tools = toolRegistry.analyticsTools;
    const allowedTools = [
      "get_experiments",
      "get_metrics",
      "get_event_summary",
      "get_chat_issue_summary",
      "get_element_context",
      "suggest_experiment",
      "save_experiment_draft",
    ];

    const usedTools = [];
    const actions = [];
    const siteId = ctx.siteId;
    const userText = ctx.latestUserMessage;
    const detectedIntent = detectIntent(userText);

    const experiments = await invokeTool({
      catalog: tools,
      allowedTools,
      usedTools,
      name: "get_experiments",
      input: { siteId },
    });

    const selectedExperimentKey =
      ctx.selectedExperimentKey || experiments.find((x) => x.status === "running")?.key || experiments[0]?.key || null;

    let metrics = null;
    if (selectedExperimentKey) {
      metrics = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_metrics",
        input: { siteId, key: selectedExperimentKey },
      });
    }

    const eventSummary = await invokeTool({
      catalog: tools,
      allowedTools,
      usedTools,
      name: "get_event_summary",
      input: { siteId, page: null },
    });

    const issueSummary = await invokeTool({
      catalog: tools,
      allowedTools,
      usedTools,
      name: "get_chat_issue_summary",
      input: {
        siteId,
        page: ctx.page && ctx.page !== "dashboard" && ctx.page !== "editor" ? ctx.page : null,
        productId: ctx.productId || null,
      },
    });

    let selectedElement = null;
    if (ctx.selectedElement) {
      selectedElement = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_element_context",
        input: { selectedElement: ctx.selectedElement },
      });
    }

    let draft = null;
    if (shouldGenerateDraft(userText)) {
      draft = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "suggest_experiment",
        input: {
          selectedExperimentKey,
          eventSummary,
          metricSummary: metrics,
          issueSummary,
          selectedElement,
        },
      });

      actions.push({ type: "experiment_draft", draft });
      actions.push({ type: "editor_changes", changesB: draft.variant_b_changes || [] });

      if (shouldSaveDraft(userText)) {
        const saved = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "save_experiment_draft",
          input: { siteId, draft },
        });
        actions.push({ type: "saved_experiment_draft", experiment: saved });
      }
    }

    const answerContext = buildAnalyticsAnswerContext({
      ctx,
      messages,
      siteId,
      selectedExperimentKey,
      experiments,
      metrics,
      eventSummary,
      issueSummary,
      selectedElement,
      draft,
      actions,
      usedTools,
    });
    const fallbackAnswer = buildFallbackAnswer({ metrics, draft, actions });
    const answerResponse = typeof safeLlmClient.answer === "function"
      ? await safeLlmClient.answer({
          systemPrompt: getAnalyticsSystemPrompt(),
          messages,
          context: answerContext,
          fallbackAnswer,
        })
      : await safeLlmClient.rewrite({
          systemPrompt: getAnalyticsSystemPrompt(),
          userPrompt: `User message: ${userText}\n\nContext:${JSON.stringify(answerContext)}`,
          draftAnswer: fallbackAnswer,
        });
    const answer = answerResponse?.text || fallbackAnswer;
    const answerDetailPreview = previewAnswerDetail(answerResponse?.detail);

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "analytics_copilot",
      role: "user",
      content: userText,
      page: ctx.page,
      productId: ctx.productId,
      orderId: null,
      userId: ctx.userId,
      detectedIntent,
      resolved: true,
      unresolved: false,
      fallback: safeLlmClient.mode === "mock" || answerResponse?.ok === false,
      handedOffToHuman: false,
      relatedExperimentKey: selectedExperimentKey,
      metadata: { llmMode: safeLlmClient.mode, answerReason: answerResponse?.reason || null, answerDetailPreview },
    });

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "analytics_copilot",
      role: "assistant",
      content: answer,
      page: ctx.page,
      productId: ctx.productId,
      orderId: null,
      userId: ctx.userId,
      detectedIntent,
      resolved: true,
      unresolved: false,
      fallback: safeLlmClient.mode === "mock" || answerResponse?.ok === false,
      handedOffToHuman: false,
      relatedExperimentKey: selectedExperimentKey,
      metadata: { actionCount: actions.length, answerReason: answerResponse?.reason || null, answerDetailPreview },
    });

    return {
      ok: true,
      answer,
      actions,
      meta: {
        agent: "analytics_copilot",
        siteId,
        llmMode: safeLlmClient.mode,
        usedTools,
        answerMode: typeof safeLlmClient.answer === "function" ? "answer" : "rewrite_fallback",
        answerFallback: answerResponse?.ok === false,
        answerReason: answerResponse?.reason || null,
        answerDetailPreview,
      },
    };
  }

  async function runCommerceSupport({ messages, context }) {
    const ctx = buildChatContext({ messages, context });
    const tools = toolRegistry.commerceTools;
    const allowedTools = [
      "search_products",
      "get_product_detail",
      "faq_search",
      "get_order_status",
      "check_order_action_eligibility",
      "create_support_ticket",
      "draft_refund_request",
      "handoff_to_human",
    ];

    const usedTools = [];
    const actions = [];
    const userText = ctx.latestUserMessage;
    const lower = userText.toLowerCase();
    const detectedIntent = detectIntent(userText);

    let unresolved = false;
    let fallback = false;
    let handedOffToHuman = false;
    let answer = "";
    let relatedOrderId = null;

    if (ctx.productId) {
      const detail = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_product_detail",
        input: { productId: ctx.productId },
      });
      if (detail && (lower.includes("상품") || lower.includes("스펙") || lower.includes("방수") || lower.includes("재고"))) {
        answer = `${detail.name} 안내입니다. 가격은 ${detail.price.toLocaleString()}원, 재고는 ${detail.stock}개이며 주요 스펙은 ${(detail.specs || []).join(
          ", "
        )} 입니다.`;
      }
    }

    if (!answer && (lower.includes("주문") || lower.includes("order")) && !hasCommerceActionIntent(userText)) {
      const orderId = (userText.match(/ORD-[0-9]+/) || [])[0] || null;
      const order = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_order_status",
        input: { orderId, userId: ctx.userId },
      });
      if (order) {
        relatedOrderId = order.id;
        answer = `주문 ${order.id} 상태는 ${order.status}입니다. 결제금액은 ${order.totalAmount.toLocaleString()}원입니다.`;
      } else {
        answer = "주문 정보를 찾지 못했습니다. 주문번호(예: ORD-1001)를 알려주시면 다시 조회하겠습니다.";
        unresolved = true;
      }
    }

    if (!answer && hasCommerceActionIntent(userText)) {
      const actionType =
        lower.includes("취소") || lower.includes("cancel")
          ? "cancel"
          : lower.includes("교환") || lower.includes("exchange")
            ? "exchange"
            : "refund";

      const order = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "get_order_status",
        input: { orderId: null, userId: ctx.userId },
      });
      relatedOrderId = order?.id || null;

      const eligibility = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "check_order_action_eligibility",
        input: { order, actionType },
      });

      if (eligibility.eligible) {
        const draft = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "draft_refund_request",
          input: { order, reason: userText, userId: ctx.userId, actionType },
        });
        actions.push({ type: "order_action_draft", draft });
        answer = `${actionType} 가능 조건에 해당해 초안을 생성했습니다. 실제 확정은 상담팀 검토 후 진행됩니다.`;
      } else {
        const ticket = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "create_support_ticket",
          input: {
            userId: ctx.userId,
            orderId: order?.id,
            category: actionType,
            message: `Eligibility failed: ${eligibility.reason}. User request: ${userText}`,
            priority: "normal",
            source: "commerce_support",
          },
        });
        actions.push({ type: "support_ticket", ticket });
        answer = `${actionType} 즉시 처리 조건이 아니어서 상담 티켓(${ticket.id})으로 접수했습니다.`;
      }
    }

    if (!answer && (lower.includes("상담") || lower.includes("사람") || lower.includes("human"))) {
      const handoff = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "handoff_to_human",
        input: {
          userId: ctx.userId,
          reason: userText,
          context: { page: ctx.page, productId: ctx.productId },
        },
      });
      actions.push({ type: "handoff", handoff });
      handedOffToHuman = true;
      answer = `상담원 연결 요청을 등록했습니다. 티켓 번호는 ${handoff.ticketId}입니다.`;
    }

    if (!answer) {
      const products = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "search_products",
        input: { query: userText },
      });
      const faq = await invokeTool({
        catalog: tools,
        allowedTools,
        usedTools,
        name: "faq_search",
        input: { query: userText },
      });

      if (products.length) {
        const p = products[0];
        answer = `문의와 가장 가까운 상품은 ${p.name}입니다. ${p.description}`;
      } else if (faq.length) {
        answer = `${faq[0].question || faq[0].title}: ${faq[0].answer}`;
      } else {
        fallback = true;
        unresolved = true;
        const ticket = await invokeTool({
          catalog: tools,
          allowedTools,
          usedTools,
          name: "create_support_ticket",
          input: {
            userId: ctx.userId,
            orderId: null,
            category: "fallback",
            message: userText,
            priority: "normal",
            source: "commerce_support_fallback",
          },
        });
        actions.push({ type: "support_ticket", ticket });
        answer = "정확한 답변을 찾지 못해 상담 티켓으로 연결하겠습니다.";
      }
    }

    answer = await maybeLLMRewrite({
      agent: "commerce_support",
      answer,
      messages,
      context: ctx,
    });

    const resolved = !unresolved;

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "commerce_support",
      role: "user",
      content: userText,
      page: ctx.page,
      productId: ctx.productId,
      orderId: relatedOrderId,
      userId: ctx.userId,
      detectedIntent,
      resolved: false,
      unresolved: false,
      fallback: false,
      handedOffToHuman: false,
      relatedExperimentKey: null,
      metadata: { llmMode: safeLlmClient.mode },
    });

    conversationAnalyticsService.logChatEvent({
      sessionId: ctx.sessionId,
      agent: "commerce_support",
      role: "assistant",
      content: answer,
      page: ctx.page,
      productId: ctx.productId,
      orderId: relatedOrderId,
      userId: ctx.userId,
      detectedIntent,
      resolved,
      unresolved,
      fallback,
      handedOffToHuman,
      relatedExperimentKey: null,
      metadata: { actionCount: actions.length },
    });

    return {
      ok: true,
      answer,
      actions,
      meta: {
        agent: "commerce_support",
        llmMode: safeLlmClient.mode,
        usedTools,
        unresolved,
        fallback,
      },
    };
  }

  async function handleChat({ agent, messages, context, siteId }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, reason: "messages_required" };
    }
    if (agent === "analytics_copilot") return runAnalyticsCopilot({ messages, context, siteId });
    if (agent === "commerce_support") return runCommerceSupport({ messages, context });
    return { ok: false, reason: "unsupported_agent" };
  }

  return { handleChat };
}

module.exports = { createChatOrchestrator };
