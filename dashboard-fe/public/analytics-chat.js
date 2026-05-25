(function () {
  function createMessage(role, text) {
    const el = document.createElement("div");
    el.className = `chatbotMessage ${role}`;
    el.textContent = String(text || "");
    return el;
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
  }

  function initAnalyticsChatWidget(options) {
    const fab = document.getElementById(options.fabId);
    const panel = document.getElementById(options.panelId);
    const closeBtn = document.getElementById(options.closeBtnId);
    const messagesEl = document.getElementById(options.messagesId);
    const inputEl = document.getElementById(options.inputId);
    const sendBtn = document.getElementById(options.sendBtnId);
    const selectedExperimentEl = document.getElementById(options.selectedExperimentId);
    const quickButtons = Array.from(panel?.querySelectorAll("[data-q]") || []);

    if (!fab || !panel || !messagesEl || !inputEl || !sendBtn) return null;

    const openKey = `uxsdk.chatWidget.open.${options.storageKey || "default"}`;
    const state = {
      isOpen: false,
      sessionId: `analytics_${Math.random().toString(16).slice(2, 10)}`,
      selectedExperimentKey: null,
      agentMode: false,
      agentStatus: null,
      agentStatusLoaded: false,
    };

    const agentControls = createEl("div", "agentModeControls");
    const agentToggle = createEl("button", "agentModeToggle", "Agent Mode OFF");
    const agentBadge = createEl("span", "agentModeBadge", "일반 챗봇");
    const agentNotice = createEl("div", "agentModeNotice", "Agent Mode를 켜면 UX Agent와 실험 초안 생성을 사용할 수 있습니다.");
    agentToggle.type = "button";
    agentToggle.setAttribute("aria-pressed", "false");
    agentToggle.setAttribute("aria-label", "Agent Mode 끄기");
    agentControls.appendChild(agentToggle);
    agentControls.appendChild(agentBadge);
    agentControls.appendChild(agentNotice);
    const metaRow = panel.querySelector(".chatbotMetaRow");
    if (metaRow && metaRow.parentNode) metaRow.parentNode.insertBefore(agentControls, metaRow.nextSibling);

    function scrollToBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderMessage(role, text) {
      messagesEl.appendChild(createMessage(role, text));
      scrollToBottom();
    }

    function currentSiteId() {
      if (typeof options.getSiteId === "function") return String(options.getSiteId() || "").trim();
      return String(options.siteId || "").trim();
    }

    function compactJson(value) {
      if (!value || typeof value !== "object") return "";
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "";
      }
    }

    function capabilityLabel(key) {
      const labels = {
        list_experiments: "실험 목록 조회",
        summarize_experiment: "실험 결과 요약",
        summarize_insights: "인사이트 요약",
        summarize_labels: "이탈 유형 요약",
        get_preview_targets: "미리보기 대상 조회",
        create_experiment_draft: "초안 생성",
        publish_experiment: "배포",
        pause_experiment: "중지",
        rollback_experiment: "롤백",
        archive_experiment: "보관",
      };
      return labels[key] || key;
    }

    function renderAgentStatus() {
      agentToggle.classList.toggle("is-active", state.agentMode);
      agentToggle.textContent = state.agentMode ? "Agent Mode ON" : "Agent Mode OFF";
      agentToggle.setAttribute("aria-pressed", state.agentMode ? "true" : "false");
      agentToggle.setAttribute("aria-label", state.agentMode ? "Agent Mode 켜짐" : "Agent Mode 꺼짐");
      agentBadge.textContent = state.agentMode ? "Draft Agent" : "일반 챗봇";
      agentBadge.classList.toggle("is-active", state.agentMode);

      if (!state.agentMode) {
        agentNotice.textContent = "Agent Mode를 켜면 UX Agent와 실험 초안 생성을 사용할 수 있습니다.";
        return;
      }

      if (!state.agentStatusLoaded) {
        agentNotice.textContent = "Agent 상태를 불러오는 중입니다.";
        return;
      }

      const caps = Array.isArray(state.agentStatus?.capabilities) ? state.agentStatus.capabilities.slice(0, 3).map(capabilityLabel).join(", ") : "읽기 기능";
      const disabled = Array.isArray(state.agentStatus?.disabled_capabilities) ? state.agentStatus.disabled_capabilities.slice(0, 3).map(capabilityLabel).join(", ") : "쓰기 기능";
      agentNotice.textContent = `phase: ${state.agentStatus?.phase || "read_only"} · 가능: ${caps} · 비활성: ${disabled}`;
    }

    function renderAgentCard(data) {
      const type = data?.type || (data?.ok === false ? "action_failed" : "analysis_summary");
      const card = createEl("article", `agentCard ${type === "safety_blocked" ? "blocked" : type === "action_failed" ? "failed" : type === "approval_required" ? "approval" : type === "draft_created" ? "draft" : "analysis"}`);
      const titleMap = {
        analysis_summary: "Agent 분석 요약",
        action_plan: "Agent 실행 계획",
        draft_created: "실험 초안",
        approval_required: "승인 필요",
        action_executed: "작업 완료",
        action_failed: "요청 실패",
        safety_blocked: "승인 단계 전 차단됨",
      };
      card.appendChild(createEl("div", "agentCardTitle", titleMap[type] || "Agent 응답"));
      card.appendChild(createEl("div", "agentCardMessage", data?.message || data?.reason || "응답이 비어 있습니다."));

      if (type === "draft_created" && data?.experiment) {
        const exp = data.experiment;
        card.appendChild(createEl("div", "agentDraftMeta", `key: ${exp.key || "-"}`));
        card.appendChild(createEl("div", "agentDraftMeta", `status: ${exp.status || "draft"} · url: ${exp.url_prefix || "/"}`));
        card.appendChild(createEl("div", "agentCardMeta", "아직 배포되지 않은 초안입니다. 실제 사용자는 이 변경을 보지 않습니다."));
      }

      if (type === "safety_blocked") {
        card.appendChild(createEl("div", "agentCardMeta", "현재 MVP에서는 승인 gate가 필요한 작업을 실행하지 않습니다."));
      } else if (type === "action_failed" && data?.reason) {
        card.appendChild(createEl("div", "agentCardMeta", `reason: ${data.reason}`));
      } else if (data?.intent) {
        card.appendChild(createEl("div", "agentCardMeta", `intent: ${data.intent}`));
      }

      const dataText = compactJson(data?.data);
      if (dataText && dataText !== "{}") {
        const details = createEl("details", "agentCardDetails");
        const summary = createEl("summary", "", "데이터 보기");
        const pre = createEl("pre", "agentCardJson", dataText);
        details.appendChild(summary);
        details.appendChild(pre);
        card.appendChild(details);
      }

      const actions = Array.isArray(data?.actions) ? data.actions : [];
      if (actions.length) {
        const row = createEl("div", "agentActionRow");
        actions.forEach((action) => {
          const btn = createEl("button", "agentActionButton", action.label || action.type || "action");
          btn.type = "button";
          if (action.type === "open_editor" || action.type === "open_preview") {
            btn.addEventListener("click", () => { if (action.url) window.open(action.url, "_blank", "noopener"); });
          } else {
            btn.disabled = true;
            btn.title = "다음 단계에서 지원됩니다.";
          }
          row.appendChild(btn);
        });
        card.appendChild(row);
      }

      messagesEl.appendChild(card);
      scrollToBottom();
    }

    function setOpen(nextOpen) {
      state.isOpen = !!nextOpen;
      panel.classList.toggle("is-hidden", !state.isOpen);
      panel.setAttribute("aria-hidden", state.isOpen ? "false" : "true");
      fab.setAttribute("aria-expanded", state.isOpen ? "true" : "false");
      try {
        localStorage.setItem(openKey, state.isOpen ? "1" : "0");
      } catch {}
      if (state.isOpen) {
        setTimeout(() => inputEl.focus(), 120);
      }
    }

    function setBusy(busy) {
      sendBtn.disabled = busy;
      inputEl.disabled = busy;
    }

    async function loadAgentStatus() {
      const siteId = currentSiteId();
      if (!siteId) {
        state.agentStatusLoaded = true;
        state.agentStatus = { phase: "read_only", capabilities: [], disabled_capabilities: [] };
        renderAgentStatus();
        return;
      }
      state.agentStatusLoaded = false;
      renderAgentStatus();
      try {
        const response = await fetch(`/api/agent/status?site_id=${encodeURIComponent(siteId)}`, { credentials: "same-origin" });
        const data = await response.json();
        if (!data?.ok) throw new Error(data?.reason || "agent status failed");
        state.agentStatus = data;
      } catch (error) {
        console.warn("Agent status failed", error);
        state.agentStatus = { phase: "read_only", capabilities: [], disabled_capabilities: [], error: String(error) };
      } finally {
        state.agentStatusLoaded = true;
        renderAgentStatus();
      }
    }

    function setAgentMode(nextMode) {
      const enabled = !!nextMode;
      if (state.agentMode === enabled) return;
      state.agentMode = enabled;
      renderAgentStatus();
      if (enabled) {
        renderAgentCard({
          type: "analysis_summary",
          intent: "agent_mode_on",
          message: "Agent Mode가 활성화되었습니다.\n실험 목록, 실험 결과, 인사이트, 이탈 유형, 미리보기 대상 조회와 A/B 테스트 초안 생성을 도와드릴 수 있습니다.\n생성된 초안은 아직 배포되지 않으며, 실제 배포는 다음 단계의 승인 흐름에서 처리됩니다.",
          data: {},
          actions: [],
        });
        loadAgentStatus();
      }
    }

    function setSelectedExperimentKey(key) {
      state.selectedExperimentKey = key || null;
      if (!selectedExperimentEl) return;
      selectedExperimentEl.textContent = state.selectedExperimentKey
        ? `「${state.selectedExperimentKey}」 기준으로 답할게요`
        : "실험을 한 개 골라 두면 더 맞는 답을 드릴 수 있어요";
    }

    async function send(text) {
      const content = String(text || "").trim();
      if (!content) return;

      renderMessage("user", content);
      inputEl.value = "";
      setBusy(true);

      try {
        if (state.agentMode) {
          const response = await fetch("/api/agent/message", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              site_id: currentSiteId(),
              conversation_id: state.sessionId,
              message: content,
              selected_experiment_key: state.selectedExperimentKey || "",
              agent_mode: true,
            }),
          });
          const data = await response.json().catch(() => null);
          if (!data) throw new Error("empty agent response");
          renderAgentCard(data);
          if (data.type === "draft_created" && typeof options.onAgentDraftCreated === "function") options.onAgentDraftCreated(data);
          return;
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agent: "analytics_copilot",
            messages: [{ role: "user", content }],
            context: {
              page: "dashboard",
              selectedExperimentKey: state.selectedExperimentKey,
              sessionId: state.sessionId,
            },
          }),
        });

        const data = await response.json();
        if (!data?.ok) throw new Error(data?.reason || "chat failed");

        renderMessage("assistant", data.answer || "응답이 비어 있어요.");

        const actions = Array.isArray(data.actions) ? data.actions : [];
        const draftAction = actions.find((item) => item.type === "experiment_draft");
        const changesAction = actions.find((item) => item.type === "editor_changes");
        if (draftAction && typeof options.onExperimentDraft === "function") {
          options.onExperimentDraft(draftAction.draft);
        }
        if (changesAction && typeof options.onEditorChanges === "function") {
          options.onEditorChanges(changesAction.changesB || [], draftAction?.draft || null);
        }
      } catch (error) {
        if (state.agentMode) {
          console.warn("Agent Mode request failed", error);
          renderAgentCard({
            ok: false,
            type: "action_failed",
            intent: "unknown",
            message: "Agent Mode 요청을 처리하지 못했습니다.\n잠시 후 다시 시도하거나 Agent Mode를 끄고 일반 챗봇을 사용해 주세요.",
            reason: String(error),
          });
        } else {
          renderMessage("assistant", `오류: ${String(error)}`);
        }
      } finally {
        setBusy(false);
      }
    }

    fab.addEventListener("click", () => setOpen(!state.isOpen));
    if (closeBtn) closeBtn.addEventListener("click", () => setOpen(false));
    agentToggle.addEventListener("click", () => setAgentMode(!state.agentMode));
    document.addEventListener("pointerdown", (event) => {
      if (!state.isOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target) || fab.contains(target)) return;
      setOpen(false);
    });
    sendBtn.addEventListener("click", () => send(inputEl.value));
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send(inputEl.value);
      }
    });
    quickButtons.forEach((btn) => {
      btn.addEventListener("click", () => send(btn.dataset.q || ""));
    });

    renderMessage("assistant", "안녕하세요. 실험 결과 해석이나 다음에 시험해 볼 아이디어가 필요하면 편하게 물어보세요.");

    try {
      setOpen(localStorage.getItem(openKey) === "1");
    } catch {
      setOpen(false);
    }

    return {
      setSelectedExperimentKey,
      setSiteId(siteId) {
        options.siteId = siteId || "";
        if (state.agentMode) loadAgentStatus();
      },
      open() {
        setOpen(true);
      },
      close() {
        setOpen(false);
      },
      send,
    };
  }

  window.AnalyticsChatWidget = {
    init: initAnalyticsChatWidget,
  };
})();
