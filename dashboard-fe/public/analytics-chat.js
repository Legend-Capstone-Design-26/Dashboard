(function () {
  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatTimestampForFilename(ts) {
    const d = ts ? new Date(ts) : new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  }

  function formatTimestampForMarkdown(ts) {
    const d = ts ? new Date(ts) : new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function safeFilenamePart(value) {
    return String(value || "unknown").trim().replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
  }

  function downloadTextFile(filename, content, mimeType = "text/markdown;charset=utf-8") {
    const blob = new Blob([String(content || "")], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyTextToClipboard(text) {
    const value = String(text || "");
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    if (!ok) throw new Error("copy_failed");
    return true;
  }

  window.UxExportUtils = {
    downloadTextFile,
    copyTextToClipboard,
    formatTimestampForFilename,
    formatTimestampForMarkdown,
    safeFilenamePart,
  };

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
    const sizeKey = `uxsdk.chatWidget.size.${options.storageKey || "default"}`;
    const sizePresets = [
      { key: "default", label: "기본" },
      { key: "wide", label: "넓게" },
      { key: "large", label: "크게" },
    ];
    const state = {
      isOpen: false,
      size: "default",
      helpOpen: false,
      sessionId: `analytics_${Math.random().toString(16).slice(2, 10)}`,
      selectedExperimentKey: null,
      agentMode: false,
      agentStatus: null,
      agentStatusLoaded: false,
      messages: [],
      pendingApprovalActions: new Set(),
      completedApprovalActions: new Set(),
    };

    const utilityRow = createEl("div", "chatbotUtilityRow");
    const sizeControls = createEl("div", "chatbotSizeControls");
    const sizeLabel = createEl("span", "chatbotSizeLabel", "크기");
    const sizeButtons = sizePresets.map((preset) => {
      const btn = createEl("button", "chatbotSizeButton", preset.label);
      btn.type = "button";
      btn.dataset.size = preset.key;
      sizeControls.appendChild(btn);
      return btn;
    });
    const helpButton = createEl("button", "chatbotHelpButton", "도움말");
    const helpPanel = createEl("div", "chatbotHelpPanel");
    helpButton.type = "button";
    helpButton.setAttribute("aria-expanded", "false");
    helpPanel.hidden = true;
    helpPanel.innerHTML = `
      <div class="chatbotHelpSection"><strong>일반 챗봇</strong><span>실험 결과 해석, 이탈 원인, 다음 실험 아이디어를 물어볼 수 있습니다.</span></div>
      <div class="chatbotHelpSection"><strong>Agent Mode</strong><span>켜면 실험 목록 조회와 초안 생성을 Agent 흐름으로 처리합니다. 배포는 승인 gate를 거칩니다.</span></div>
      <div class="chatbotHelpSection"><strong>복사/다운로드</strong><span>일반 챗봇 답변과 AI UX 인사이트는 브라우저에서 Markdown으로 복사하거나 저장합니다.</span></div>
      <div class="chatbotHelpSection"><strong>추천 질문</strong><span>“현재 실험 요약해줘”, “가장 먼저 볼 UX 문제는?”, “다음 실험안을 만들어줘”</span></div>`;
    sizeControls.prepend(sizeLabel);
    utilityRow.appendChild(sizeControls);
    utilityRow.appendChild(helpButton);
    const headerEl = panel.querySelector(".chatbotHeader");
    if (headerEl && headerEl.parentNode) {
      headerEl.parentNode.insertBefore(utilityRow, headerEl.nextSibling);
      headerEl.parentNode.insertBefore(helpPanel, utilityRow.nextSibling);
    }

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
      const el = createMessage(role, text);
      messagesEl.appendChild(el);
      scrollToBottom();
      return el;
    }

    function setChatSize(size) {
      const next = sizePresets.some((preset) => preset.key === size) ? size : "default";
      state.size = next;
      sizePresets.forEach((preset) => panel.classList.toggle(`size-${preset.key}`, preset.key === next));
      sizeButtons.forEach((btn) => {
        const active = btn.dataset.size === next;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      try { localStorage.setItem(sizeKey, next); } catch {}
    }

    function setHelpOpen(open) {
      state.helpOpen = !!open;
      helpPanel.hidden = !state.helpOpen;
      helpButton.classList.toggle("is-active", state.helpOpen);
      helpButton.setAttribute("aria-expanded", state.helpOpen ? "true" : "false");
    }

    function rememberChatMessage(role, content) {
      state.messages.push({ role, content: String(content || "") });
      if (state.messages.length > 20) state.messages = state.messages.slice(-20);
    }

    function currentSiteId() {
      if (typeof options.getSiteId === "function") return String(options.getSiteId() || "").trim();
      return String(options.siteId || "").trim();
    }

    function buildChatMarkdown({ question, answer, createdAt }) {
      const siteId = currentSiteId() || "없음";
      const selectedExperiment = state.selectedExperimentKey || "없음";
      return [
        "# AI UX Copilot 답변",
        "",
        "## 질문",
        String(question || ""),
        "",
        "## 답변",
        String(answer || ""),
        "",
        "## 메타 정보",
        `- 사이트 ID: ${siteId}`,
        `- 선택 실험: ${selectedExperiment}`,
        `- 생성 시각: ${window.UxExportUtils.formatTimestampForMarkdown(createdAt)}`,
        "- 출처: Dashboard AI Copilot",
        "",
      ].join("\n");
    }

    function setTemporaryButtonText(button, text, delay = 1200) {
      const original = button.textContent;
      button.textContent = text;
      setTimeout(() => { button.textContent = original; }, delay);
    }

    function renderAssistantMessageWithActions({ answer, question }) {
      renderMessage("assistant", answer || "응답이 비어 있어요.");
      const row = createEl("div", "chatbotMessageActions");
      const copyBtn = createEl("button", "chatbotActionButton", "복사");
      const downloadBtn = createEl("button", "chatbotActionButton", "MD 다운로드");
      const createdAt = Date.now();
      copyBtn.type = "button";
      downloadBtn.type = "button";
      copyBtn.addEventListener("click", async () => {
        try {
          await window.UxExportUtils.copyTextToClipboard(answer || "");
          setTemporaryButtonText(copyBtn, "복사됨");
        } catch {
          setTemporaryButtonText(copyBtn, "복사 실패");
        }
      });
      downloadBtn.addEventListener("click", () => {
        const site = window.UxExportUtils.safeFilenamePart(currentSiteId());
        const ts = window.UxExportUtils.formatTimestampForFilename(createdAt);
        window.UxExportUtils.downloadTextFile(`ux-chat-answer-${site}-${ts}.md`, buildChatMarkdown({ question, answer, createdAt }));
      });
      row.appendChild(copyBtn);
      row.appendChild(downloadBtn);
      messagesEl.appendChild(row);
      scrollToBottom();
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
      const cardClass = type === "safety_blocked" ? "blocked"
        : type === "action_failed" ? "failed"
          : type === "approval_required" ? "approval"
            : type === "action_executed" ? "executed"
              : type === "action_cancelled" ? "cancelled"
                : type === "draft_created" ? "draft"
                  : "analysis";
      const card = createEl("article", `agentCard ${cardClass}`);
      const titleMap = {
        analysis_summary: "Agent 분석 요약",
        action_plan: "Agent 실행 계획",
        draft_created: "실험 초안",
        approval_required: "승인 필요",
        action_executed: "작업 완료",
        action_cancelled: "작업 취소됨",
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

      if (type === "approval_required" && data?.approval) {
        card.appendChild(createEl("div", "agentDraftMeta", `approval: ${data.approval.approval_id || "-"}`));
        card.appendChild(createEl("div", "agentApprovalWarning", "승인하면 이 실험은 실제 사용자에게 노출될 수 있습니다."));
      }

      if (type === "action_executed") {
        card.appendChild(createEl("div", "agentCardMeta", "배포 완료: 새로고침하면 실험 상태를 확인할 수 있습니다."));
      } else if (type === "action_cancelled") {
        card.appendChild(createEl("div", "agentCardMeta", "요청 취소됨: 실험은 draft 상태로 유지됩니다."));
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
          if (action.type === "approve_agent_action") btn.classList.add("approve");
          if (action.type === "cancel_agent_action") btn.classList.add("danger");
          if (action.type === "open_editor" || action.type === "open_preview") {
            btn.addEventListener("click", () => { if (action.url) window.open(action.url, "_blank", "noopener"); });
          } else if (action.type === "approve_agent_action" || action.type === "cancel_agent_action") {
            btn.addEventListener("click", () => executeAgentAction(action, row));
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

    async function executeAgentAction(action, row) {
      if (!state.agentMode) return;
      const approvalId = action.approval_id || action.approvalId;
      if (!approvalId) return;
      const actionKey = `${action.type}:${approvalId}`;
      if (state.pendingApprovalActions.has(actionKey) || state.completedApprovalActions.has(approvalId)) return;
      state.pendingApprovalActions.add(actionKey);
      Array.from(row.querySelectorAll("button")).forEach((btn) => { btn.disabled = true; });
      const endpoint = action.type === "approve_agent_action" ? "approve" : "cancel";
      try {
        const response = await fetch(`/api/agent/approvals/${encodeURIComponent(approvalId)}/${endpoint}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ site_id: currentSiteId() }),
        });
        const data = await response.json().catch(() => null);
        if (!data) throw new Error("empty approval response");
        state.completedApprovalActions.add(approvalId);
        renderAgentCard(data);
        if (data.type === "action_executed" || data.type === "action_cancelled") dispatchExperimentUpdated(data, data.type);
        if (data.type === "action_executed" && typeof options.onAgentActionExecuted === "function") options.onAgentActionExecuted(data);
      } catch (error) {
        renderAgentCard({
          ok: false,
          type: "action_failed",
          intent: action.type,
          message: "승인 작업을 처리하지 못했습니다.",
          reason: String(error),
        });
      } finally {
        state.pendingApprovalActions.delete(actionKey);
      }
    }

    function dispatchExperimentUpdated(data, action) {
      try {
        window.dispatchEvent(new CustomEvent("uxsdk:agent:experiment-updated", {
          detail: {
            site_id: currentSiteId(),
            experiment_key: data?.experiment?.key || data?.data?.experiment?.key || data?.data?.experiment_key || "",
            action,
          },
        }));
      } catch {}
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
        const siteId = currentSiteId();
        if (!siteId) {
          renderMessage("assistant", "현재 사이트 정보를 찾을 수 없습니다. 사이트를 다시 선택한 뒤 시도해 주세요.");
          return;
        }
        if (state.agentMode) {
          const response = await fetch("/api/agent/message", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              site_id: siteId,
              conversation_id: state.sessionId,
              message: content,
              selected_experiment_key: state.selectedExperimentKey || "",
              agent_mode: true,
            }),
          });
          const data = await response.json().catch(() => null);
          if (!data) throw new Error("empty agent response");
          renderAgentCard(data);
          if (data.type === "draft_created") dispatchExperimentUpdated(data, "draft_created");
          if (data.type === "draft_created" && typeof options.onAgentDraftCreated === "function") options.onAgentDraftCreated(data);
          return;
        }

        rememberChatMessage("user", content);

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            site_id: siteId,
            agent: "analytics_copilot",
            messages: state.messages.slice(-10),
            context: {
              page: "dashboard",
              site_id: siteId,
              selectedExperimentKey: state.selectedExperimentKey,
              sessionId: state.sessionId,
            },
          }),
        });

        const data = await response.json();
        if (!data?.ok) throw new Error(data?.reason || "chat failed");

        renderAssistantMessageWithActions({ answer: data.answer || "응답이 비어 있어요.", question: content });
        rememberChatMessage("assistant", data.answer || "");

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
    sizeButtons.forEach((btn) => btn.addEventListener("click", () => setChatSize(btn.dataset.size || "default")));
    helpButton.addEventListener("click", () => setHelpOpen(!state.helpOpen));
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
      setChatSize(localStorage.getItem(sizeKey) || "default");
    } catch {
      setChatSize("default");
    }

    try {
      setOpen(localStorage.getItem(openKey) === "1");
    } catch {
      setOpen(false);
    }

    return {
      setSelectedExperimentKey,
      setSiteId(siteId) {
        const nextSiteId = siteId || "";
        if (options.siteId && options.siteId !== nextSiteId) state.messages = [];
        options.siteId = nextSiteId;
        if (state.agentMode) loadAgentStatus();
      },
      setContext(context) {
        if (context && Object.prototype.hasOwnProperty.call(context, "siteId")) {
          const nextSiteId = context.siteId || "";
          if (options.siteId && options.siteId !== nextSiteId) state.messages = [];
          options.siteId = nextSiteId;
        }
        if (context && Object.prototype.hasOwnProperty.call(context, "selectedExperimentKey")) setSelectedExperimentKey(context.selectedExperimentKey || null);
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
