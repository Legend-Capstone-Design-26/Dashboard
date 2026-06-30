// public/dashboard.js
(function () {
  const DEFAULT_SITE_ID = "legend-ecommerce";
  const SITE_STORAGE_KEY = "uxsdk.dashboard.siteId";
  const DESIGN_PREVIEW_ENABLED = new URLSearchParams(location.search).get("design_preview") === "1";

  const expTbody = document.getElementById("expTbody");
  const expTableWrap = document.getElementById("expTableWrap");
  const expEmptyState = document.getElementById("expEmptyState");
  const refreshBtn = document.getElementById("refreshBtn");
  const siteSelect = document.getElementById("siteSelect");
  const authUserLabel = document.getElementById("authUserLabel");
  const logoutBtn = document.getElementById("logoutBtn");
  const siteIdText = document.getElementById("siteIdText");
  const topEditorLink = document.getElementById("topEditorLink");
  const emptyEditorLink = document.getElementById("emptyEditorLink");
  const quickTestLinks = document.getElementById("quickTestLinks");
  const quickTestHint = document.getElementById("quickTestHint");
  const sessionsSourceLabel = document.getElementById("sessionsSourceLabel");
  const periodPreset = document.getElementById("periodPreset");
  const periodPresetButtons = Array.from(document.querySelectorAll("[data-period-preset]"));
  const periodRangeTrigger = document.getElementById("periodRangeTrigger");
  const periodRangeInput = document.getElementById("periodRangeInput");
  const customDateRange = document.getElementById("customDateRange");
  const customFromDate = document.getElementById("customFromDate");
  const customToDate = document.getElementById("customToDate");
  const periodActiveValue = document.getElementById("periodActiveValue");
  const periodActiveRange = document.getElementById("periodActiveRange");
  const periodStatusText = document.getElementById("periodStatusText");
  const trendChartCard = document.getElementById("trendChartCard");
  const sdkStatusBadge = document.getElementById("sdkStatusBadge");
  const sdkStatusText = document.getElementById("sdkStatusText");
  const labelDonut = document.getElementById("labelDonut");
  const labelDonutTotal = document.getElementById("labelDonutTotal");
  const uxSessionHint = document.getElementById("uxSessionHint");
  const uxTopLabelHint = document.getElementById("uxTopLabelHint");
  const uxPriorityHint = document.getElementById("uxPriorityHint");
  const journeyFlow = document.getElementById("journeyFlow");

  const pathMappingsBtn = document.getElementById("pathMappingsBtn");
  const pathMappingsDialog = document.getElementById("pathMappingsDialog");
  const pathMappingsGrid = document.getElementById("pathMappingsGrid");
  const pathMappingsSaveBtn = document.getElementById("pathMappingsSaveBtn");
  const pathMappingsCancelBtn = document.getElementById("pathMappingsCancelBtn");
  const pathMappingsCloseBtn = document.getElementById("pathMappingsCloseBtn");
  const pathMappingsStatus = document.getElementById("pathMappingsStatus");

  const settingsBtn = document.getElementById("settingsBtn");
  const userManagementDialog = document.getElementById("userManagementDialog");
  const closeDialogBtn = document.getElementById("closeDialogBtn");
  const usersTbody = document.getElementById("usersTbody");
  const userCountText = document.getElementById("userCountText");
  const createUserForm = document.getElementById("createUserForm");
  const userUsernameInput = document.getElementById("userUsernameInput");
  const userDisplayNameInput = document.getElementById("userDisplayNameInput");
  const userPasswordInput = document.getElementById("userPasswordInput");
  const userActiveInput = document.getElementById("userActiveInput");
  const userSiteChecklist = document.getElementById("userSiteChecklist");
  const createUserBtn = document.getElementById("createUserBtn");
  const resetUserFormBtn = document.getElementById("resetUserFormBtn");
  const userFormStatus = document.getElementById("userFormStatus");

  const experimentSelect = document.getElementById("experimentSelect");
  const experimentSummaryCard = document.getElementById("experimentSummaryCard");
  const experimentSummaryEmpty = document.getElementById("experimentSummaryEmpty");
  const experimentSummaryTitle = document.getElementById("experimentSummaryTitle");
  const experimentSummaryPeriod = document.getElementById("experimentSummaryPeriod");
  const experimentSummaryStatus = document.getElementById("experimentSummaryStatus");
  const experimentSummaryLead = document.getElementById("experimentSummaryLead");
  const experimentVariantAName = document.getElementById("experimentVariantAName");
  const experimentVariantBName = document.getElementById("experimentVariantBName");
  const experimentParticipantSessions = document.getElementById("experimentParticipantSessions");
  const experimentPeriodResultStatus = document.getElementById("experimentPeriodResultStatus");
  const openExperimentResultsBtn = document.getElementById("openExperimentResultsBtn");
  const experimentSummaryHint = document.getElementById("experimentSummaryHint");

  const experimentMetricsDialog = document.getElementById("experimentMetricsDialog");
  const closeExperimentDialogBtn = document.getElementById("closeExperimentDialogBtn");
  const modalExperimentTitle = document.getElementById("modalExperimentTitle");
  const modalExperimentPeriod = document.getElementById("modalExperimentPeriod");
  const modalExperimentStatus = document.getElementById("modalExperimentStatus");
  const modalExperimentLead = document.getElementById("modalExperimentLead");
  const modalParticipantSessions = document.getElementById("modalParticipantSessions");
  const modalPeriodResultStatus = document.getElementById("modalPeriodResultStatus");
  const experimentResultEyebrow = document.getElementById("experimentResultEyebrow");
  const experimentResultTitle = document.getElementById("experimentResultTitle");
  const experimentResultSummary = document.getElementById("experimentResultSummary");
  const experimentResultPills = document.getElementById("experimentResultPills");
  const modalVariantAName = document.getElementById("modalVariantAName");
  const modalVariantBName = document.getElementById("modalVariantBName");
  const experimentHistoryList = document.getElementById("experimentHistoryList");
  const experimentAudienceSelect = document.getElementById("experimentAudienceSelect");
  const experimentPersonaSelect = document.getElementById("experimentPersonaSelect");
  const experimentAudienceHint = document.getElementById("experimentAudienceHint");
  const overlayPersonaSelect = document.getElementById("overlayPersonaSelect");
  const overlayAgeGroupSelect = document.getElementById("overlayAgeGroupSelect");
  const overlayStyleSelect = document.getElementById("overlayStyleSelect");
  const generateOverlayBtn = document.getElementById("generateOverlayBtn");
  const overlayBuilderStatus = document.getElementById("overlayBuilderStatus");
  const overlayBuilderPreview = document.getElementById("overlayBuilderPreview");

  const metricKeyEl = document.getElementById("metricKey");
  const cvrA = document.getElementById("cvrA");
  const cvrB = document.getElementById("cvrB");
  const ctrA = document.getElementById("ctrA");
  const ctrB = document.getElementById("ctrB");
  const brA = document.getElementById("brA");
  const brB = document.getElementById("brB");
  const durationA = document.getElementById("durationA");
  const durationB = document.getElementById("durationB");
  const depthA = document.getElementById("depthA");
  const depthB = document.getElementById("depthB");
  const cvrDelta = document.getElementById("cvrDelta");
  const ctrDelta = document.getElementById("ctrDelta");
  const brDelta = document.getElementById("brDelta");
  const durationDelta = document.getElementById("durationDelta");
  const depthDelta = document.getElementById("depthDelta");
  const countsBox = document.getElementById("countsBox");
  const topA = document.getElementById("topA");
  const topB = document.getElementById("topB");
  const experimentInterpretation = document.getElementById("experimentInterpretation");
  const toggleExperimentOverlayPreviewBtn = document.getElementById("toggleExperimentOverlayPreviewBtn");
  const experimentOverlayPreviewPanel = document.getElementById("experimentOverlayPreviewPanel");
  const experimentOverlayPreviewSentence = document.getElementById("experimentOverlayPreviewSentence");
  const experimentOverlayPreviewTarget = document.getElementById("experimentOverlayPreviewTarget");
  const experimentOverlayPreviewMeta = document.getElementById("experimentOverlayPreviewMeta");
  const experimentOverlayPreviewStatus = document.getElementById("experimentOverlayPreviewStatus");
  const experimentOverlayPreviewStage = document.getElementById("experimentOverlayPreviewStage");
  const experimentOverlayPreviewFrame = document.getElementById("experimentOverlayPreviewFrame");
  const experimentOverlayPreviewLayer = document.getElementById("experimentOverlayPreviewLayer");

  const uxTotalSessions = document.getElementById("uxTotalSessions");
  const uxTopLabel = document.getElementById("uxTopLabel");
  const uxHighPriorityCount = document.getElementById("uxHighPriorityCount");
  const labelBars = document.getElementById("labelBars");
  const labelModeToggle = document.getElementById("labelModeToggle");
  const clusteringNotice = document.getElementById("clusteringNotice");
  const labelsModeHint = document.getElementById("labelsModeHint");
  const uxFocusTitle = document.getElementById("uxFocusTitle");
  const uxFocusSummary = document.getElementById("uxFocusSummary");
  const uxFocusMeta = document.getElementById("uxFocusMeta");
  const uxFocusDetailsBtn = document.getElementById("uxFocusDetailsBtn");
  const uxFocusGenerateBtn = document.getElementById("uxFocusGenerateBtn");
  const opportunityList = document.getElementById("opportunityList");
  const labelSummaryBody = document.getElementById("labelSummaryBody");
  const sessionsBody = document.getElementById("sessionsBody");
  const insightsList = document.getElementById("insightsList");
  const generateInsightsBtn = document.getElementById("generateInsightsBtn");
  const copyInsightsMarkdownBtn = document.getElementById("copyInsightsMarkdownBtn");
  const downloadInsightsMarkdownBtn = document.getElementById("downloadInsightsMarkdownBtn");
  const sidebarLinks = Array.from(document.querySelectorAll(".sidebarLink[href^='#']"));
  const copilotExperimentKey = document.getElementById("copilotExperimentKey");
  const copilotDraftStatus = document.getElementById("copilotDraftStatus");
  const saveDraftBtn = document.getElementById("saveDraftBtn");
  const openDraftInEditorBtn = document.getElementById("openDraftInEditorBtn");
  const copilotDraftActionsRow = saveDraftBtn?.closest(".chatbotActionsRow") || null;

  const DRAFT_STORAGE_KEY = "uxsdk.analyticsCopilotDraft";
  const state = {
    siteId: resolveSiteId(),
    sites: [],
    siteConfig: null,
    experiments: [],
    selectedExperimentKey: null,
    latestDraft: null,
    chatWidget: null,
    sessionsSource: "analytics",
    authUser: null,
    users: [],
    userFetchError: null,
    newUserSiteIds: [],
    periodPreset: "weekly",
    customFromDate: "",
    customToDate: "",
    selectedExperimentMetrics: null,
    lastEventSummary: null,
    personas: [],
    overlayRecords: [],
    selectedExperimentAudience: "all",
    selectedExperimentPersonaId: "",
    selectedOverlayAgeGroup: "",
    selectedOverlayStyleKey: "",
    selectedOverlayPersonaId: "",
    overlayGenerationPending: false,
    overlayPreviewReady: false,
    generatedInsightData: null,
    insightGenerationPending: false,
    insightGenerationError: null,
    insightGenerationToken: 0,
    lastLabelSummary: [],
    sessionsError: null,
    labelsError: null,
    labelMode: "rule_base",
    clusteringFallbackUsed: false,
    clusteringTaxonomy: null,
  };
  let periodRangePicker = null;

  function warnMissingDomElement(id, usage) {
    console.warn(`[dashboard] Missing DOM element #${id}. ${usage} will not render. Check dashboard.html and dashboard.js id consistency.`);
  }

  function validateRequiredDashboardDom() {
    const required = [
      ["sessionsBody", sessionsBody, "Recent sessions table"],
      ["labelSummaryBody", labelSummaryBody, "Label summary table"],
      ["insightsList", insightsList, "AI insights section"],
      ["labelBars", labelBars, "Label distribution bars"],
      ["trendChartCard", trendChartCard, "Trend chart"],
      ["journeyFlow", journeyFlow, "Journey flow"],
      ["sdkStatusBadge", sdkStatusBadge, "SDK status badge"],
      ["sdkStatusText", sdkStatusText, "SDK status text"],
    ];
    const missing = required.filter(([, element]) => !element);
    if (!missing.length) return;
    console.warn("[dashboard] Missing required DOM elements:", missing.map(([id, , usage]) => ({ id, usage })));
  }

  validateRequiredDashboardDom();

  const AGE_GROUP_LABELS = {
    teens: "10대",
    "20s": "20대",
    "30s": "30대",
    "40s": "40대",
    "50s": "50대",
    "60plus": "60대+",
    unknown: "연령 미상",
  };

  // ─── 한국어 라벨 매핑 ───
  const LABEL_KO = {
    ux_friction_dropper: "불편 겪고 이탈",
    checkout_abandoner: "결제 전 이탈",
    price_sensitive_dropper: "가격·혜택 비교형",
    over_explorer: "여러 화면 오래 탐색",
    window_shopper: "가볍게 둘러보기",
  };

  const STATUS_KO = {
    running: "진행 중",
    paused: "멈춤",
    draft: "작성 중",
    archived: "보관함",
  };

  const LABEL_ORDER = [
    "over_explorer",
    "price_sensitive_dropper",
    "window_shopper",
    "ux_friction_dropper",
    "checkout_abandoner",
  ];

  const LABEL_DESC = {
    over_explorer: "여러 화면을 오래 둘러보지만 결정을 미루는 패턴",
    price_sensitive_dropper: "가격·혜택·배송 조건을 비교하다 이탈하는 패턴",
    window_shopper: "가볍게 둘러보다 구매 행동 없이 종료하는 패턴",
    ux_friction_dropper: "불편이나 오류를 겪은 뒤 흐름을 이탈하는 패턴",
    checkout_abandoner: "장바구니·결제 단계에서 구매 완료로 이어지지 않는 패턴",
  };

  const LABEL_COLORS = ["#5b76fe", "#7d92ff", "#ff7a45", "#ffb14a", "#ff5f7a"];

  function labelName(label) {
    return LABEL_KO[label] || label || "알 수 없음";
  }

  function statusName(status) {
    return STATUS_KO[status] || status || "—";
  }

  function labelDescription(label) {
    return LABEL_DESC[label] || "아직 설명이 준비되지 않았습니다.";
  }

  // ─── 도우미 ───
  function fmtPct(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return (x * 100).toFixed(2) + "%";
  }
  function fmtDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("ko-KR");
  }
  function fmtInt(x) {
    if (typeof x !== "number" || !isFinite(x)) return "—";
    return Math.round(x).toLocaleString("ko-KR");
  }
  function fmtDuration(ms) {
    if (typeof ms !== "number" || !isFinite(ms)) return "—";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}초`;
  }
  function fmtSignedPct(value) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  }
  function fmtSignedDiff(a, b, formatter) {
    if (typeof a !== "number" || !isFinite(a) || typeof b !== "number" || !isFinite(b)) return "계산 불가";
    return formatter(b - a);
  }
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateRangeStart(value) {
    if (!value) return null;
    return new Date(`${value}T00:00:00`).getTime();
  }

  function parseDateRangeEnd(value) {
    if (!value) return null;
    return new Date(`${value}T23:59:59.999`).getTime();
  }

  function formatPeriodDateText(ts) {
    if (typeof ts !== "number" || !Number.isFinite(ts)) return "—";
    const date = new Date(ts);
    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  function formatCompactDate(ts) {
    if (typeof ts !== "number" || !Number.isFinite(ts)) return "—";
    const date = new Date(ts);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}.${month}.${day}`;
  }

  function normalizePeriodPreset(value) {
    const raw = String(value || "").trim();
    if (raw === "today") return "daily";
    if (raw === "7d") return "weekly";
    if (raw === "30d") return "monthly";
    if (["daily", "weekly", "monthly", "custom"].includes(raw)) return raw;
    return "weekly";
  }

  function getSidebarScrollOffset() {
    const topbar = document.querySelector(".topbar");
    const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
    return Math.ceil(topbarHeight + 28);
  }

  function setActiveSidebarLink(targetId) {
    if (!targetId || !sidebarLinks.length) return;
    sidebarLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${targetId}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function getSidebarSections() {
    return sidebarLinks
      .map((link) => {
        const id = String(link.getAttribute("href") || "").replace(/^#/, "");
        const el = id ? document.getElementById(id) : null;
        return el ? { id, el } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aTop = a.el.getBoundingClientRect().top + window.scrollY;
        const bTop = b.el.getBoundingClientRect().top + window.scrollY;
        return aTop - bTop;
      });
  }

  function updateActiveSidebarFromScroll() {
    const sections = getSidebarSections();
    if (!sections.length) return;
    const marker = window.scrollY + getSidebarScrollOffset() + 12;
    let active = sections[0].id;
    sections.forEach((section) => {
      const top = section.el.getBoundingClientRect().top + window.scrollY;
      if (top <= marker) active = section.id;
    });
    setActiveSidebarLink(active);
  }

  function scrollToSidebarSection(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - getSidebarScrollOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    setActiveSidebarLink(targetId);
    if (history.pushState) history.pushState(null, "", `#${targetId}`);
  }

  function syncPeriodInputs() {
    state.periodPreset = normalizePeriodPreset(state.periodPreset);
    const today = new Date();
    const defaultTo = toDateInputValue(today);
    const defaultFrom = toDateInputValue(new Date(today.getTime() - (6 * 24 * 60 * 60 * 1000)));
    if (!state.customFromDate) state.customFromDate = defaultFrom;
    if (!state.customToDate) state.customToDate = defaultTo;
    if (periodPreset) periodPreset.value = state.periodPreset;
    periodPresetButtons.forEach((button) => {
      const isActive = normalizePeriodPreset(button.dataset.periodPreset) === state.periodPreset;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    if (customFromDate) customFromDate.value = state.customFromDate;
    if (customToDate) customToDate.value = state.customToDate;
    if (customDateRange) customDateRange.hidden = state.periodPreset !== "custom";
    if (periodRangeInput && !periodRangePicker) {
      periodRangeInput.value = [state.customFromDate, state.customToDate].filter(Boolean).join(" ~ ");
    }
  }

  function getPeriodRange() {
    state.periodPreset = normalizePeriodPreset(state.periodPreset);
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (state.periodPreset === "daily") {
      return { label: "오늘", fromTs: today.getTime(), toTs: now, bucket: "hour" };
    }
    if (state.periodPreset === "monthly") {
      return { label: "최근 30일", fromTs: now - (29 * 24 * 60 * 60 * 1000), toTs: now, bucket: "day" };
    }
    if (state.periodPreset === "custom") {
      const fromTs = parseDateRangeStart(state.customFromDate);
      const toTs = parseDateRangeEnd(state.customToDate);
      if (typeof fromTs === "number" && typeof toTs === "number" && fromTs <= toTs) {
        return { label: "사용자 지정 기간", fromTs, toTs, bucket: "day" };
      }
      return { label: "사용자 지정 기간", fromTs: null, toTs: null, bucket: "day" };
    }
    return { label: "최근 7일", fromTs: now - (6 * 24 * 60 * 60 * 1000), toTs: now, bucket: "day" };
  }

  function buildPeriodQuery() {
    const range = getPeriodRange();
    const params = new URLSearchParams();
    if (typeof range.fromTs === "number") params.set("from_ts", String(range.fromTs));
    if (typeof range.toTs === "number") params.set("to_ts", String(range.toTs));
    return { range, query: params.toString() };
  }

  function updatePeriodStatus() {
    syncPeriodInputs();
    const range = getPeriodRange();
    const fromText = typeof range.fromTs === "number" ? new Date(range.fromTs).toLocaleDateString("ko-KR") : "—";
    const toText = typeof range.toTs === "number" ? new Date(range.toTs).toLocaleDateString("ko-KR") : "—";
    const fromShort = formatCompactDate(range.fromTs);
    const toShort = formatCompactDate(range.toTs);
    if (periodActiveValue) {
      periodActiveValue.textContent = state.periodPreset === "custom" && (range.fromTs == null || range.toTs == null)
        ? "기간 선택"
        : `${fromShort} ~ ${toShort}`;
    }
    if (periodActiveRange) {
      periodActiveRange.textContent = state.periodPreset === "custom" && (range.fromTs == null || range.toTs == null)
        ? "시작일과 종료일을 모두 입력하면 선택한 기간이 적용됩니다."
        : `${range.label} 기준`;
    }
    if (periodRangeTrigger) {
      periodRangeTrigger.setAttribute("aria-label", state.periodPreset === "custom" ? "사용자 지정 기간 선택" : `${range.label} 기간 선택`);
    }
    if (!periodStatusText) return;
    if (state.periodPreset === "custom" && (range.fromTs == null || range.toTs == null)) {
      periodStatusText.textContent = "사용자 지정 기간을 선택하려면 시작일과 종료일을 모두 입력해 주세요.";
      return;
    }
    periodStatusText.textContent = `${range.label} · ${fromText} ~ ${toText} 기준으로 카드와 그래프를 집계합니다.`;
  }

  function formatRelativeTime(ts) {
    if (typeof ts !== "number" || !isFinite(ts)) return "수신 정보 없음";
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  }

  function journeyStageName(step) {
    const map = {
      home: "홈",
      browse: "상품 목록",
      product: "상품 상세",
      cart: "장바구니",
      checkout: "결제",
      purchase: "구매 완료",
    };
    return map[step] || step || "알 수 없음";
  }

  function getVariantName(variantKey, experiment) {
    const list = experiment?.variants?.[variantKey];
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0] || {};
      return first.name || first.label || first.title || `Variant ${variantKey}`;
    }
    return `Variant ${variantKey}`;
  }

  function getExperimentWindow(experiment) {
    const start = experiment?.published_at || experiment?.updated_at || null;
    const end = experiment?.archived_at || ((experiment?.status === "archived") ? experiment?.updated_at : null);
    return { start, end };
  }

  function formatExperimentWindow(experiment) {
    const { start, end } = getExperimentWindow(experiment);
    if (!start && !end) return "실험 기간 정보 없음";
    const startText = start ? fmtDate(start) : "—";
    const endText = end ? fmtDate(end) : (experiment?.status === "running" ? "진행 중" : "—");
    return `${startText} ~ ${endText}`;
  }

  function isExperimentInPeriod(experiment) {
    const { start, end } = getExperimentWindow(experiment);
    const range = getPeriodRange();
    if (range.fromTs == null || range.toTs == null) return true;
    if (!start && !end) return true;
    const expStart = start || end;
    const expEnd = end || Date.now();
    if (typeof expStart !== "number" || typeof expEnd !== "number") return true;
    return !(range.toTs < expStart || range.fromTs > expEnd);
  }

  function getLeadingVariant(metrics) {
    if (!metrics?.ok) return { text: "데이터 부족", tone: "low" };
    const aSessions = Number(metrics.A?.sessions) || 0;
    const bSessions = Number(metrics.B?.sessions) || 0;
    if (aSessions === 0 && bSessions === 0) return { text: "선택 기간 데이터 없음", tone: "low" };
    const aCvr = Number(metrics.A?.cvr);
    const bCvr = Number(metrics.B?.cvr);
    if (isFinite(aCvr) && isFinite(bCvr) && aCvr !== bCvr) {
      return bCvr > aCvr
        ? { text: "Variant B 우세", tone: "running" }
        : { text: "Variant A 우세", tone: "running" };
    }
    const aBounce = Number(metrics.A?.bounce_rate);
    const bBounce = Number(metrics.B?.bounce_rate);
    if (isFinite(aBounce) && isFinite(bBounce) && aBounce !== bBounce) {
      return bBounce < aBounce
        ? { text: "Variant B 우세", tone: "running" }
        : { text: "Variant A 우세", tone: "running" };
    }
    return { text: "우세 판단 어려움", tone: "low" };
  }

  function formatMetricValue(value, kind) {
    if (typeof value !== "number" || !isFinite(value)) return kind === "duration" ? "체류 시간 데이터 없음" : "데이터 없음";
    if (kind === "percent") return fmtPct(value);
    if (kind === "duration") return fmtDuration(value);
    if (kind === "depth") return value.toFixed(1);
    return fmtInt(value);
  }

  function metricDeltaValue(aValue, bValue, kind) {
    const a = Number(aValue);
    const b = Number(bValue);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (kind === "percent") return (b - a) * 100;
    return b - a;
  }

  function formatMetricDelta(value, kind, options = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    const useAbsoluteDirection = Boolean(options.useAbsoluteDirection);
    if (useAbsoluteDirection) {
      const direction = value < 0 ? "감소" : value > 0 ? "증가" : "변화 없음";
      if (kind === "percent") return `${Math.abs(value).toFixed(1)}%p ${direction}`;
      if (kind === "duration") return `${fmtDuration(Math.abs(value))} ${direction}`;
      if (kind === "depth") return `${Math.abs(value).toFixed(1)} ${direction}`;
      return `${fmtInt(Math.abs(value))} ${direction}`;
    }
    const sign = value > 0 ? "+" : "";
    if (kind === "percent") return `${sign}${value.toFixed(1)}%p`;
    if (kind === "duration") return `${sign}${fmtDuration(Math.abs(value))}`;
    if (kind === "depth") return `${sign}${value.toFixed(1)}`;
    return `${sign}${fmtInt(value)}`;
  }

  function metricDeltaClass(value, preferredDirection) {
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "neutral";
    const improved = preferredDirection === "lower" ? value < 0 : value > 0;
    return improved ? "positive" : "negative";
  }

  function buildMetricDeltaDisplay({
    aValue,
    bValue,
    kind,
    metricLabel,
    preferredDirection = "higher",
    positiveText,
    negativeText,
    neutralText,
  }) {
    const delta = metricDeltaValue(aValue, bValue, kind);
    if (delta == null) {
      return {
        tone: "neutral",
        valueText: "—",
        caption: "데이터 부족",
        label: metricLabel || "지표",
        badgeText: "보류",
        direction: "none",
      };
    }

    const tone = metricDeltaClass(delta, preferredDirection);
    const badgeText = tone === "positive" ? "개선" : tone === "negative" ? "악화" : "변화 없음";
    const useAbsoluteDirection = preferredDirection === "lower" || kind === "duration";
    return {
      tone,
      valueText: formatMetricDelta(delta, kind, { useAbsoluteDirection }),
      caption: tone === "positive" ? positiveText : tone === "negative" ? negativeText : (neutralText || `${metricLabel || "지표"} 변화 없음`),
      label: metricLabel || "지표",
      badgeText,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "none",
    };
  }

  function metricChangeText(options) {
    const display = buildMetricDeltaDisplay(options);
    if (display.valueText === "—") return display.caption;
    return `${display.valueText} · ${display.caption}`;
  }

  function setMetricDelta(el, options) {
    if (!el) return;
    const display = buildMetricDeltaDisplay(options);
    el.className = `metricDelta ${display.tone}`;
    el.textContent = metricChangeText(options);
    el.setAttribute("aria-label", `${display.label} ${el.textContent}`);
  }

  function renderExperimentResultHero(metrics) {
    if (!experimentResultTitle || !experimentResultSummary || !experimentResultPills) return;
    if (!metrics?.ok) {
      if (experimentResultEyebrow) experimentResultEyebrow.textContent = "결과 요약";
      experimentResultTitle.textContent = "실험 결과를 불러오지 못했습니다";
      experimentResultSummary.textContent = "잠시 후 다시 시도하거나 Redis/Kafka Consumer 상태를 확인해 주세요.";
      experimentResultPills.innerHTML = "";
      return;
    }

    const kpis = [
      buildMetricDeltaDisplay({ aValue: metrics.A?.cvr, bValue: metrics.B?.cvr, kind: "percent", metricLabel: "전환율", preferredDirection: "higher", positiveText: "전환율 증가", negativeText: "전환율 감소" }),
      buildMetricDeltaDisplay({ aValue: metrics.A?.bounce_rate, bValue: metrics.B?.bounce_rate, kind: "percent", metricLabel: "이탈률", preferredDirection: "lower", positiveText: "이탈률 개선", negativeText: "이탈률 악화" }),
      buildMetricDeltaDisplay({ aValue: metrics.A?.ctr, bValue: metrics.B?.ctr, kind: "percent", metricLabel: "클릭률", preferredDirection: "higher", positiveText: "클릭률 증가", negativeText: "클릭률 감소" }),
    ];
    const bLooksBetter = kpis.filter((kpi) => kpi.tone === "positive").length >= 2;

    if (experimentResultEyebrow) experimentResultEyebrow.textContent = bLooksBetter ? "Variant B 우세" : "결과 요약";
    experimentResultTitle.textContent = bLooksBetter
      ? "Variant B가 더 좋은 흐름을 보입니다"
      : "두 variant의 차이를 더 확인해야 합니다";
    experimentResultSummary.textContent = bLooksBetter
      ? "CTA 개선안 적용 후 핵심 행동은 증가하고, 구매 전 이탈 흐름은 감소한 것으로 보입니다. 통계적 유의성 검정은 아직 수행하지 않았습니다."
      : "현재 수집된 데이터만으로는 뚜렷한 우세를 단정하기 어렵습니다. 표본과 기간을 더 확보해 비교해 주세요.";

    experimentResultPills.innerHTML = kpis.map((kpi) => `
      <span class="experimentResultKpiCard ${escapeHtml(kpi.tone)}" aria-label="${escapeHtml(`${kpi.label} ${kpi.valueText}, ${kpi.caption}`)}">
        <span class="experimentResultKpiTop">
          <span class="experimentResultKpiLabel">${escapeHtml(kpi.label)}</span>
          <span class="experimentResultKpiBadge ${escapeHtml(kpi.tone)}">${escapeHtml(kpi.badgeText)}</span>
        </span>
        <strong class="experimentResultKpiValue">${escapeHtml(kpi.valueText)}</strong>
        <span class="experimentResultKpiCaption">${escapeHtml(kpi.caption)}</span>
      </span>
    `).join("");
  }

  function renderCountsTable(metrics) {
    const rows = [["A안", metrics.A], ["B안", metrics.B]];
    return `<table class="experimentCountsTable">
      <thead><tr><th>구분</th><th>방문자</th><th>세션</th><th>화면</th><th>클릭</th><th>전환</th></tr></thead>
      <tbody>${rows.map(([label, item]) => `<tr><th>${escapeHtml(label)}</th><td>${fmtInt(item?.users)}</td><td>${fmtInt(item?.sessions)}</td><td>${fmtInt(item?.page_views)}</td><td>${fmtInt(item?.clicks)}</td><td>${fmtInt(item?.conversions)}</td></tr>`).join("")}</tbody>
    </table><div class="experimentCountsFoot">이벤트 합계 ${fmtInt(metrics.totals?.events)}건 · 목표 ${(metrics.goals || []).map(escapeHtml).join(", ") || "없음"}</div>`;
  }

  function getMetricDeltaText(aValue, bValue, kind, preferredDirection) {
    if (typeof aValue !== "number" || !isFinite(aValue) || typeof bValue !== "number" || !isFinite(bValue)) {
      return "선택 기간 데이터가 부족해 차이값을 계산하지 못했습니다.";
    }
    const diffText = kind === "duration"
      ? fmtDuration(Math.abs(bValue - aValue))
      : (kind === "depth" ? Math.abs(bValue - aValue).toFixed(1) : fmtSignedPct((bValue - aValue) * 100));
    if (aValue === bValue) return "두 variant가 거의 비슷합니다.";
    const lead = preferredDirection === "lower"
      ? (bValue < aValue ? "Variant B" : "Variant A")
      : (bValue > aValue ? "Variant B" : "Variant A");
    const suffix = kind === "duration" || kind === "depth" ? `차이 ${diffText}` : `차이 ${diffText}`;
    return `${lead}가 더 좋게 보입니다 · ${suffix}`;
  }

  function buildInterpretation(metrics) {
    if (!metrics?.ok) return "현재 선택한 기간에 해석할 실험 데이터가 없습니다.";
    const lead = getLeadingVariant(metrics);
    if (lead.text === "선택 기간 데이터 없음") {
      return "선택한 기간에 해당 실험 데이터가 없습니다.";
    }
    if (lead.text === "우세 판단 어려움") {
      return "현재 수집된 데이터 기준으로 두 variant의 차이가 크지 않거나, 판단에 필요한 데이터가 부족합니다. 통계적 유의성 검정은 아직 수행하지 않았습니다.";
    }
    const cvrText = fmtSignedPct(((Number(metrics.B?.cvr) || 0) - (Number(metrics.A?.cvr) || 0)) * 100);
    const brText = fmtSignedPct(((Number(metrics.B?.bounce_rate) || 0) - (Number(metrics.A?.bounce_rate) || 0)) * 100);
    return `현재 수집된 데이터 기준으로 ${lead.text}입니다. 전환율 차이는 ${cvrText}, 이탈률 차이는 ${brText}입니다. 통계적 유의성 검정은 아직 수행하지 않았습니다.`;
  }

  // ─── 도움말 팝오버 ───
  const helpButtons = Array.from(document.querySelectorAll(".helpBtn"));
  function closeHelpPopovers() {
    helpButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      const p = document.getElementById(button.dataset.helpTarget || "");
      if (p) p.classList.remove("is-open");
    });
  }
  function toggleHelpPopover(button) {
    const popover = document.getElementById(button?.dataset.helpTarget || "");
    if (!popover) return;
    const willOpen = !popover.classList.contains("is-open");
    closeHelpPopovers();
    if (willOpen) {
      popover.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
    }
  }

  // ─── 인증 ───
  async function fetchAuthMe() {
    if (DESIGN_PREVIEW_ENABLED) {
      return {
        id: "design-preview-admin",
        username: "design_preview",
        display_name: "Design Preview",
        is_admin: false,
        allowed_site_ids: [getCurrentSiteId()],
        default_site_id: getCurrentSiteId(),
      };
    }
    const r = await fetch("/api/auth/me");
    if (r.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new Error("unauthorized");
    }
    const j = await r.json();
    if (!j?.ok || !j.user) throw new Error(j?.reason || "auth fetch failed");
    return j.user;
  }

  function enforceAuthorizedSiteId() {
    const allowed = Array.isArray(state.authUser?.allowed_site_ids) ? state.authUser.allowed_site_ids : [];
    if (allowed.length === 0) { state.siteId = DEFAULT_SITE_ID; return; }
    if (!allowed.includes(state.siteId)) {
      state.siteId = state.authUser.default_site_id || allowed[0];
    }
  }

  function resolveSiteId() {
    const params = new URLSearchParams(location.search);
    return (params.get("site_id") || "").trim()
      || (localStorage.getItem(SITE_STORAGE_KEY) || "").trim()
      || DEFAULT_SITE_ID;
  }

  function setSiteInUrl(siteId) {
    const url = new URL(location.href);
    url.searchParams.set("site_id", siteId);
    history.replaceState({}, "", url.toString());
  }

  function ensureSiteOption(siteId) {
    if (!siteSelect || !siteId) return;
    if (!Array.from(siteSelect.options).some((o) => o.value === siteId)) {
      const o = document.createElement("option");
      o.value = siteId;
      o.textContent = siteId;
      siteSelect.appendChild(o);
    }
  }

  function getCurrentSiteId() { return state.siteId || DEFAULT_SITE_ID; }

  function previewNow() {
    return Date.now();
  }

  function buildPreviewTrend() {
    const range = getPeriodRange();
    const now = previewNow();
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const fromTs = typeof range.fromTs === "number" ? range.fromTs : now - (6 * day);
    const toTs = typeof range.toTs === "number" ? range.toTs : now;
    const fromDay = new Date(fromTs);
    fromDay.setHours(0, 0, 0, 0);
    const toDay = new Date(toTs);
    toDay.setHours(0, 0, 0, 0);
    const span = Math.max(hour, toTs - fromTs);
    const daySpan = Math.max(0, toDay.getTime() - fromDay.getTime());
    const count = range.bucket === "hour"
      ? 8
      : Math.min(30, Math.max(2, Math.floor(daySpan / day) + 1));

    return Array.from({ length: count }, (_, index) => {
      const ratio = count === 1 ? 0 : index / (count - 1);
      const ts = range.bucket === "hour"
        ? fromTs + (span * ratio)
        : fromDay.getTime() + (index * day);
      const wave = Math.sin(index / Math.max(1, count - 1) * Math.PI) * 8;
      return {
        ts,
        session_count: Math.round(38 + (index * 4.8) + wave),
        event_count: Math.round(285 + (index * 34) + (wave * 12)),
      };
    });
  }

  function buildDesignPreviewData() {
    const now = previewNow();
    const day = 24 * 60 * 60 * 1000;
    const siteId = getCurrentSiteId() || "fake_tifof";
    const labelSummary = [
      { label: "ux_friction_dropper", sessions: 38, share: 0.29, metrics: { avg_duration_ms: 183000, avg_depth: 4.2, checkout_complete_rate: 0.08 } },
      { label: "over_explorer", sessions: 34, share: 0.26, metrics: { avg_duration_ms: 256000, avg_depth: 6.1, checkout_complete_rate: 0.12 } },
      { label: "checkout_abandoner", sessions: 28, share: 0.21, metrics: { avg_duration_ms: 142000, avg_depth: 4.8, checkout_complete_rate: 0.02 } },
      { label: "price_sensitive_dropper", sessions: 20, share: 0.15, metrics: { avg_duration_ms: 198000, avg_depth: 5.4, checkout_complete_rate: 0.1 } },
      { label: "window_shopper", sessions: 12, share: 0.09, metrics: { avg_duration_ms: 67000, avg_depth: 2.1, checkout_complete_rate: 0 } },
    ];
    const sessions = [
      { summary: { site_id: siteId, session_id: "s_cta_idle_9381", duration_ms: 294000, page_views: 6, clicks: 13, depth: 5, max_step: "product", checkout_entered: false, checkout_complete: false, paths: ["/", "/collection/sneakers", "/detail/air-runner-42"] }, label: { label: "ux_friction_dropper", confidence: 0.91 } },
      { summary: { site_id: siteId, session_id: "s_option_rage_1842", duration_ms: 218000, page_views: 4, clicks: 18, depth: 3, max_step: "product", checkout_entered: false, checkout_complete: false, paths: ["/detail/linen-shirt", "/detail/linen-shirt#option"] }, label: { label: "ux_friction_dropper", confidence: 0.88 } },
      { summary: { site_id: siteId, session_id: "s_cart_drop_5530", duration_ms: 176000, page_views: 5, clicks: 9, depth: 4, max_step: "cart", checkout_entered: true, checkout_complete: false, paths: ["/detail/desk-lamp", "/cart", "/checkout"] }, label: { label: "checkout_abandoner", confidence: 0.84 } },
      { summary: { site_id: siteId, session_id: "s_over_explore_2109", duration_ms: 386000, page_views: 11, clicks: 7, depth: 9, max_step: "browse", checkout_entered: false, checkout_complete: false, paths: ["/", "/collection", "/search?q=bag", "/detail/cross-bag"] }, label: { label: "over_explorer", confidence: 0.77 } },
      { summary: { site_id: siteId, session_id: "s_price_compare_7712", duration_ms: 232000, page_views: 7, clicks: 11, depth: 6, max_step: "product", checkout_entered: false, checkout_complete: false, paths: ["/detail/wool-coat", "/detail/wool-coat#delivery"] }, label: { label: "price_sensitive_dropper", confidence: 0.73 } },
      { summary: { site_id: siteId, session_id: "s_purchase_0084", duration_ms: 154000, page_views: 5, clicks: 8, depth: 5, max_step: "purchase", checkout_entered: true, checkout_complete: true, paths: ["/detail/cup", "/cart", "/checkout", "/order-complete"] }, label: { label: "over_explorer", confidence: 0.62 } },
    ];
    const trend = buildPreviewTrend();
    const eventSummary = {
      ok: true,
      source: "design_preview",
      fallback_used: false,
      site_id: siteId,
      total_events: 3180,
      top_pages: [
        { path: "/detail/air-runner-42", count: 146 },
        { path: "/collection/sneakers", count: 112 },
        { path: "/cart", count: 64 },
      ],
      top_elements: [
        { element_id: "product-option-size", count: 96 },
        { element_id: "add-to-cart", count: 72 },
        { element_id: "sticky-mobile-cta", count: 54 },
      ],
      page_flow: [
        { from: "/collection/sneakers", to: "/detail/air-runner-42", count: 84 },
        { from: "/detail/air-runner-42", to: "/cart", count: 32 },
        { from: "/cart", to: "/checkout", count: 21 },
      ],
      trend,
      journey: {
        ok: true,
        total_sessions: 132,
        steps: [
          { key: "home", label: "홈", step_index: 0, entered_sessions: 132, next_step_sessions: 118, next_step_rate: 0.89, drop_rate: 0.11, high_drop: false },
          { key: "browse", label: "상품 목록", step_index: 1, entered_sessions: 118, next_step_sessions: 91, next_step_rate: 0.77, drop_rate: 0.23, high_drop: false },
          { key: "product", label: "상품 상세", step_index: 2, entered_sessions: 91, next_step_sessions: 38, next_step_rate: 0.42, drop_rate: 0.58, high_drop: true },
          { key: "cart", label: "장바구니", step_index: 3, entered_sessions: 38, next_step_sessions: 24, next_step_rate: 0.63, drop_rate: 0.37, high_drop: false },
          { key: "checkout", label: "결제", step_index: 4, entered_sessions: 24, next_step_sessions: 15, next_step_rate: 0.63, drop_rate: 0.37, high_drop: false },
          { key: "purchase", label: "구매 완료", step_index: 5, entered_sessions: 15, next_step_sessions: 0, next_step_rate: null, drop_rate: null, high_drop: false },
        ],
      },
      sdk_status: { status: "normal", label: "정상", last_event_ts: now - 74000, recent_events_5m: 42 },
      funnel: { detail_page_view: 91, checkout_page_view: 24, checkout_complete: 15, checkout_completion_rate: 0.625 },
    };
    const experiments = [
      {
        id: "preview-exp-cta",
        site_id: siteId,
        key: "exp_product_cta_sticky_preview",
        status: "running",
        url_prefix: "/detail",
        version: 3,
        updated_at: now - (2 * 60 * 60 * 1000),
        published_at: now - (2 * day),
        hypothesis: "옵션 선택 직후 CTA를 고정하고 문구를 명확히 하면 CTA 이전 정체와 반복 클릭이 줄어든다.",
        traffic: { A: 50, B: 50 },
        goals: ["add_to_cart", "checkout_complete"],
        variants: {
          A: [{ name: "기존 상품 상세" }],
          B: [
            { name: "Sticky CTA + 명확한 문구", type: "dom_mutation", selector: "#add-to-cart", actions: [{ type: "set_text", value: "선택한 상품 담기" }], rationale: { intent: "옵션 선택 후 다음 행동 유도 강화", expected_effect: "CTA 이전 정체 시간 감소", primary_metric: "add_to_cart_click_rate" } },
            { type: "inject_css", selector: ".product-cta", rationale: { intent: "모바일 하단 CTA 고정", expected_effect: "핵심 행동 접근성 증가", primary_metric: "idle_before_cta_ms" } },
          ],
        },
        history: [
          { id: "preview-exp-cta-v2", key: "exp_product_cta_sticky_preview", status: "paused", url_prefix: "/detail", version: 2, updated_at: now - (4 * day), hypothesis: "CTA 색상 강조로 장바구니 클릭률을 높인다.", variants: { A: [], B: [{ type: "dom_mutation", actions: [{ type: "set_style", styles: { backgroundColor: "#4f46e5" } }] }] }, goals: ["add_to_cart"] },
          { id: "preview-exp-cta-v1", key: "exp_product_cta_sticky_preview", status: "draft", url_prefix: "/detail", version: 1, updated_at: now - (6 * day), hypothesis: "버튼 문구를 변경한다.", variants: { A: [], B: [{ type: "dom_mutation", actions: [{ type: "set_text", value: "장바구니 담기" }] }] }, goals: ["add_to_cart"] },
        ],
      },
      { id: "preview-exp-option", site_id: siteId, key: "draft_option_visibility_preview", status: "draft", url_prefix: "/detail", version: 1, updated_at: now - (35 * 60 * 1000), hypothesis: "옵션 영역 설명과 선택 상태를 더 명확하게 만든다.", traffic: { A: 50, B: 50 }, goals: ["add_to_cart"], variants: { A: [], B: [{ name: "옵션 선택 안내 강화", type: "dom_mutation", actions: [{ type: "set_text", value: "사이즈를 선택하면 바로 담을 수 있어요" }] }] }, history: [] },
    ];
    const metrics = {
      ok: true,
      source: "design_preview",
      site_id: siteId,
      key: "exp_product_cta_sticky_preview",
      goals: ["add_to_cart", "checkout_complete"],
      experiment: { id: "preview-exp-cta", status: "running", url_prefix: "/detail", version: 3, published_at: now - (2 * day) },
      A: { users: 214, sessions: 236, page_views: 612, clicks: 438, conversions: 51, cvr: 0.216, ctr: 0.215, bounce_rate: 0.431, avg_duration_ms: 184000, avg_depth: 4.1, top_clicked_elements: [{ element_id: "product-option-size", element_label: "옵션 선택", count: 96 }, { element_id: "add-to-cart", element_label: "장바구니", count: 51 }] },
      B: { users: 221, sessions: 242, page_views: 638, clicks: 512, conversions: 71, cvr: 0.293, ctr: 0.294, bounce_rate: 0.356, avg_duration_ms: 151000, avg_depth: 4.8, top_clicked_elements: [{ element_id: "sticky-mobile-cta", element_label: "선택한 상품 담기", count: 91 }, { element_id: "product-option-size", element_label: "옵션 선택", count: 74 }] },
      totals: { events: 3180 },
    };
    const insights = {
      ok: true,
      source: "design_preview",
      fallback_used: false,
      output: {
        status: "ready",
        summary: {
          headline: "상품 상세 페이지의 CTA 이전 구간에서 UX 마찰 가능성이 반복 관찰됩니다.",
          plain_explanation: "사용자가 옵션을 고른 뒤 장바구니 버튼 근처에서 오래 머물거나 같은 영역을 반복 클릭한 뒤 구매하지 않고 나가는 흐름이 많습니다.",
          top_priority_reason: "상품 상세 → 장바구니 이동률이 42%이고, CTA 이전 정체/반복 클릭 세션 비율이 높습니다.",
        },
        insights: [
          {
            title: "상품 상세 CTA 이전 정체",
            label: "ux_friction_dropper",
            priority: "high",
            where: "상품 상세 / 옵션 선택 하단 CTA",
            possible_causes: ["옵션 선택 후 다음 행동 버튼이 충분히 눈에 띄지 않을 수 있습니다."],
            recommended_actions: ["옵션 선택 직후 CTA를 강조하고 모바일에서는 sticky CTA로 고정해 보세요."],
            validation_methods: ["CTA 이전 평균 정체 시간과 장바구니 클릭률을 개선 전후로 비교하세요."],
            evidence: ["CTA 이전 평균 정체 시간 12.4초", "반복 클릭 세션 비율 18.2%", "상품 상세 단계 이탈률 58%"],
            evidence_bullets: ["상품 상세 진입 91세션 중 장바구니 이동 38세션", "옵션 영역 근처 반복 클릭이 대표 마찰 세션에서 관찰됨", "장바구니 버튼 클릭 전 이탈 세션 증가"],
            impact: { primary_metric: "idle_before_cta_ms", affected_sessions: 38, share: 0.29 },
            next_best_action: "장바구니 버튼 문구를 '선택한 상품 담기'로 바꾸고, 옵션 선택 완료 후 버튼을 시각적으로 강조하세요.",
            risk_note: "원인을 단정하기보다 대표 세션과 상품 상세 UI 상태를 함께 확인해야 합니다.",
            evidence_level: "high",
            recommended_experiments: [{ hypothesis: "CTA를 더 명확하게 만들면 장바구니 클릭률이 증가한다.", change: "버튼 문구 변경 + 모바일 sticky CTA", primary_metric: "add_to_cart_click_rate" }],
          },
          {
            title: "장바구니 진입 후 결제 전 이탈",
            label: "checkout_abandoner",
            priority: "medium",
            where: "장바구니 / 결제 진입",
            possible_causes: ["배송비, 쿠폰, 결제 조건 정보가 늦게 노출될 가능성이 있습니다."],
            recommended_actions: ["장바구니 상단에 배송비/혜택 안내를 먼저 노출해 보세요."],
            validation_methods: ["장바구니 → 결제 이동률과 구매 전 이탈률을 비교하세요."],
            evidence: ["구매 전 이탈률 43.1%", "결제 진입 후 완료율 62.5%"],
            impact: { primary_metric: "checkout_complete / sessions", affected_sessions: 28, share: 0.21 },
            recommended_experiments: [{ hypothesis: "장바구니에서 비용 정보를 먼저 보여주면 결제 이탈이 줄어든다.", change: "배송비/쿠폰 안내 블록 상단 고정", primary_metric: "checkout_complete / sessions" }],
          },
        ],
        next_steps: ["상품 상세 대표 마찰 세션 확인", "CTA 강조안으로 A/B 실험 생성", "정체 시간/반복 클릭률/장바구니 클릭률 비교"],
      },
    };
    return { siteId, labelSummary, sessions, eventSummary, experiments, metrics, insights };
  }

  function getDesignPreviewData() {
    if (!state.designPreviewData) state.designPreviewData = buildDesignPreviewData();
    const trend = buildPreviewTrend();
    state.designPreviewData.eventSummary = {
      ...state.designPreviewData.eventSummary,
      trend,
      total_events: trend.reduce((sum, item) => sum + (Number(item.event_count) || 0), 0),
    };
    return state.designPreviewData;
  }

  // ─── API ───
  async function fetchSites() {
    if (DESIGN_PREVIEW_ENABLED) {
      const data = getDesignPreviewData();
      return [{ site_id: data.siteId, name: "Design Preview Store", preview_targets: [{ label: "상품 상세 미리보기", live_url: "/preview/design-preview/detail/air-runner-42" }] }];
    }
    const r = await fetch("/api/sites");
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "sites fetch failed");
    return Array.isArray(j.sites) ? j.sites : [];
  }

  async function parseJsonResponse(response, fallbackMessage) {
    const text = await response.text();
    try { return text ? JSON.parse(text) : {}; }
    catch (_) { throw new Error(text || fallbackMessage); }
  }

  async function fetchUsers() {
    const r = await fetch("/api/users");
    if (r.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new Error("unauthorized");
    }
    const j = await parseJsonResponse(r, "users fetch failed");
    if (!j?.ok) throw new Error(j?.reason || "users fetch failed");
    return Array.isArray(j.users) ? j.users : [];
  }

  async function fetchExperiments() {
    if (DESIGN_PREVIEW_ENABLED) return getDesignPreviewData().experiments;
    const r = await fetch(`/api/experiments?site_id=${encodeURIComponent(getCurrentSiteId())}`);
    const j = await r.json();
    if (!j?.ok) throw new Error("experiments fetch failed");
    return j.experiments || [];
  }

  async function setStatus(id, status) {
    if (DESIGN_PREVIEW_ENABLED) {
      const data = getDesignPreviewData();
      const experiment = data.experiments.find((item) => item.id === id) || data.experiments[0];
      if (experiment) experiment.status = status;
      return experiment;
    }
    const siteId = getCurrentSiteId();
    async function request(replaceRunning = false) {
      const r = await fetch(`/api/experiments/${encodeURIComponent(id)}?site_id=${encodeURIComponent(siteId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, site_id: siteId, replace_running: replaceRunning }),
      });
      return r.json().catch(() => ({ ok: false, reason: "status update failed" }));
    }
    let j = await request(false);
    if (!j?.ok && j?.reason === "running_experiment_exists" && status === "running") {
      const runningKey = j.running_experiment?.key || "기존 실험";
      const confirmed = window.confirm(`현재 ${runningKey} 실험이 진행 중입니다.\n새 실험을 배포하려면 기존 실험을 일시 중지해야 합니다.\n\n기존 실험을 일시 중지하고 새 실험을 배포하시겠습니까?`);
      if (confirmed) j = await request(true);
    }
    if (!j?.ok) throw new Error(j?.message || j?.reason || "status update failed");
    return j.experiment;
  }

  async function saveDraftExperiment(payload) {
    if (DESIGN_PREVIEW_ENABLED) {
      return { id: `preview-draft-${Date.now()}`, status: "draft", version: 1, updated_at: Date.now(), ...payload };
    }
    const r = await fetch("/api/experiments/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "draft save failed");
    return j.experiment;
  }

  async function deleteExp(id) {
    if (DESIGN_PREVIEW_ENABLED) {
      const data = getDesignPreviewData();
      data.experiments = data.experiments.filter((item) => item.id !== id);
      return;
    }
    const r = await fetch(`/api/experiments/${encodeURIComponent(id)}?site_id=${encodeURIComponent(getCurrentSiteId())}`, { method: "DELETE" });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "delete failed");
  }

  async function fetchMetrics(key) {
    if (DESIGN_PREVIEW_ENABLED) return { ...getDesignPreviewData().metrics, key: key || getDesignPreviewData().metrics.key };
    const { query } = buildPeriodQuery();
    const params = new URLSearchParams(query);
    params.set("site_id", getCurrentSiteId());
    params.set("key", key);
    if (state.selectedExperimentAudience !== "all") params.set("actor_type", state.selectedExperimentAudience);
    if (state.selectedExperimentAudience === "synthetic_agent" && state.selectedExperimentPersonaId) {
      params.set("persona_id", state.selectedExperimentPersonaId);
    }
    const r = await fetch(`/api/metrics?${params.toString()}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "metrics failed");
    return j;
  }

  async function fetchPersonas() {
    if (DESIGN_PREVIEW_ENABLED) return [];
    const r = await fetch(`/api/personas?site_id=${encodeURIComponent(getCurrentSiteId())}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "personas fetch failed");
    return Array.isArray(j.personas) ? j.personas : [];
  }

  async function fetchPersonaOverlays() {
    if (DESIGN_PREVIEW_ENABLED) return [];
    const r = await fetch(`/api/persona-overlays?site_id=${encodeURIComponent(getCurrentSiteId())}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "persona overlays fetch failed");
    return Array.isArray(j.overlays) ? j.overlays : [];
  }

  async function generatePersonaOverlay(experimentKey, personaId) {
    if (DESIGN_PREVIEW_ENABLED) throw new Error("design preview mode에서는 오버레이를 생성하지 않습니다.");
    const r = await fetch("/api/persona-overlays/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        site_id: getCurrentSiteId(),
        experiment_key: experimentKey,
        persona_id: personaId,
      }),
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "persona overlay generation failed");
    return j;
  }

  async function fetchEventSummary() {
    if (DESIGN_PREVIEW_ENABLED) return getDesignPreviewData().eventSummary;
    const { query } = buildPeriodQuery();
    const suffix = query ? `&${query}` : "";
    const r = await fetch(`/api/event-summary?site_id=${encodeURIComponent(getCurrentSiteId())}${suffix}`);
    const j = await r.json().catch(() => ({ ok: false, reason: "event summary failed" }));
    if (!j?.ok) return { ...j, ok: false, http_status: r.status };
    return j;
  }

  async function fetchSessions() {
    if (DESIGN_PREVIEW_ENABLED) {
      state.sessionsSource = "design_preview";
      state.sessionsError = null;
      return getDesignPreviewData().sessions;
    }
    const siteId = encodeURIComponent(getCurrentSiteId());
    const { query } = buildPeriodQuery();
    const suffix = query ? `&${query}` : "";
    const r = await fetch(`/api/sessions?site_id=${siteId}&limit=12${suffix}`);
    const j = await r.json().catch(() => ({ ok: false, reason: "sessions failed" }));
    state.sessionsSource = j?.source || "redis";
    if (!j?.ok) {
      state.sessionsError = j;
      return [];
    }
    state.sessionsError = null;
    return j.sessions || [];
  }

  async function fetchLabelsSummary() {
    if (DESIGN_PREVIEW_ENABLED) {
      state.labelsError = null;
      return getDesignPreviewData().labelSummary;
    }
    const { query } = buildPeriodQuery();
    const suffix = query ? `&${query}` : "";
    const siteParam = `site_id=${encodeURIComponent(getCurrentSiteId())}`;

    if (state.labelMode === "clustering") {
      const r = await fetch(`/api/labels/clustering-summary?${siteParam}${suffix}`);
      const j = await r.json().catch(() => ({ ok: false, reason: "clustering summary failed" }));
      if (!j?.ok) {
        state.labelsError = j;
        state.clusteringFallbackUsed = false;
        state.clusteringTaxonomy = null;
        return [];
      }
      state.labelsError = null;
      state.clusteringFallbackUsed = j.fallback_used || false;
      state.clusteringTaxonomy = j.taxonomy || null;
      return j.summary || [];
    }

    const r = await fetch(`/api/labels/summary?${siteParam}${suffix}`);
    const j = await r.json().catch(() => ({ ok: false, reason: "labels summary failed" }));
    if (!j?.ok) {
      state.labelsError = j;
      return [];
    }
    state.labelsError = null;
    return j.summary || [];
  }

  async function fetchInsights(periodAware) {
    if (DESIGN_PREVIEW_ENABLED) return getDesignPreviewData().insights;
    const suffix = periodAware ? (() => {
      const { query } = buildPeriodQuery();
      return query ? `&${query}` : "";
    })() : "";
    const r = await fetch(`/api/insights?site_id=${encodeURIComponent(getCurrentSiteId())}&reps=3${suffix}`);
    const j = await r.json().catch(() => ({ ok: false, reason: "insights failed" }));
    if (!j?.ok && j?.reason === "redis_unavailable") throw new Error("AI 인사이트를 생성할 수 없습니다. Redis 기반 세션 데이터가 준비되지 않았습니다.");
    if (!j?.ok) throw new Error(j?.message || j?.reason || "insights failed");
    return j;
  }

  // ─── 사이트 UI ───
  function getCurrentSiteConfig() {
    if (state.siteConfig?.site_id === getCurrentSiteId()) return state.siteConfig;
    return state.sites.find((s) => s.site_id === getCurrentSiteId()) || null;
  }

  function populateSiteSelect() {
    if (!siteSelect) return;
    const current = getCurrentSiteId();
    siteSelect.innerHTML = "";
    const sites = state.sites.length ? state.sites : [{ site_id: current, name: current }];
    sites.forEach((site) => {
      const o = document.createElement("option");
      o.value = site.site_id;
      o.textContent = site.name ? `${site.name} (${site.site_id})` : site.site_id;
      siteSelect.appendChild(o);
    });
    ensureSiteOption(current);
    siteSelect.value = current;
  }

  function renderQuickTestLinks() {
    if (!quickTestLinks) return;
    const site = getCurrentSiteConfig();
    const targets = Array.isArray(site?.preview_targets) ? site.preview_targets.slice(0, 3) : [];
    if (targets.length === 0) {
      quickTestLinks.innerHTML = '<span class="emptyState" style="padding:var(--space-3);">미리볼 주소가 설정돼 있지 않아요.</span>';
      return;
    }
    quickTestLinks.innerHTML = targets.map((t) =>
      `<a class="btnPrimary" href="${escapeHtml(appendAbForceToUrl(t.live_url || t.preview_url || "/", "B"))}" target="_blank" rel="noopener">${escapeHtml(t.label || t.url_prefix || "열기")}</a>`
    ).join("");
  }

  function appendAbForceToUrl(urlString, forceVariant) {
    const url = new URL(urlString, location.origin);
    if (forceVariant) url.searchParams.set("__ab_force", forceVariant);
    return url.toString();
  }

  function getEditorUrl(extraParams) {
    const url = new URL("/editor", location.origin);
    url.searchParams.set("site_id", getCurrentSiteId());
    if (extraParams && typeof extraParams === "object") {
      Object.entries(extraParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== "") url.searchParams.set(k, String(v));
      });
    }
    return `${url.pathname}${url.search}`;
  }

  function updateSiteContextUI() {
    enforceAuthorizedSiteId();
    const siteId = getCurrentSiteId();
    state.siteConfig = getCurrentSiteConfig();
    ensureSiteOption(siteId);
    populateSiteSelect();
    if (siteIdText) siteIdText.textContent = siteId;
    if (authUserLabel) authUserLabel.textContent = state.authUser ? (state.authUser.display_name || state.authUser.username) : "";
    if (settingsBtn) settingsBtn.style.display = state.authUser?.is_admin ? "" : "none";
    if (topEditorLink) topEditorLink.href = getEditorUrl();
    if (emptyEditorLink) emptyEditorLink.href = getEditorUrl();
    renderQuickTestLinks();
    if (quickTestHint) {
      quickTestHint.textContent = "한 브라우저에서는 A·B 중 하나에 고정돼요. 다른 조합을 보려면 시크릿 창을 쓰면 됩니다.";
    }
  }

  // ─── 사용자 관리 (모달) ───
  function normalizeUserAccess(user) {
    const fallbackRole = String(user?.role || user?.user_role || "").trim();
    const bySiteId = new Map();
    function pushAccess(siteId, role) {
      const sid = String(siteId || "").trim();
      if (!sid) return;
      const r = String(role || "").trim();
      if (!bySiteId.has(sid)) { bySiteId.set(sid, { site_id: sid, role: r }); return; }
      const cur = bySiteId.get(sid);
      if (cur && !cur.role && r) cur.role = r;
    }
    function pushEntry(entry) {
      if (!entry) return;
      if (typeof entry === "string") { pushAccess(entry, fallbackRole); return; }
      if (typeof entry !== "object") return;
      pushAccess(entry.site_id || entry.siteId || entry.id || entry.value, entry.role || entry.site_role || entry.access_role || fallbackRole);
    }
    [user?.site_access, user?.siteAccess, user?.access, user?.sites, user?.site_roles, user?.roles].forEach((l) => { if (Array.isArray(l)) l.forEach(pushEntry); });
    [user?.allowed_site_ids, user?.accessible_site_ids, user?.site_ids].forEach((l) => { if (Array.isArray(l)) l.forEach((sid) => pushAccess(sid, fallbackRole)); });
    [user?.roles_by_site, user?.role_by_site, user?.site_roles].forEach((m) => {
      if (!m || typeof m !== "object" || Array.isArray(m)) return;
      Object.entries(m).forEach(([sid, role]) => pushAccess(sid, role));
    });
    return Array.from(bySiteId.values()).sort((a, b) => a.site_id.localeCompare(b.site_id));
  }

  function normalizeUserRecord(user) {
    const username = String(user?.username || user?.user_name || "").trim() || "—";
    const displayName = String(user?.display_name || user?.displayName || "").trim() || username;
    return {
      id: String(user?.id || username),
      username,
      display_name: displayName,
      is_admin: user?.is_admin === true,
      active: user?.active !== false && user?.disabled !== true && String(user?.status || "").trim().toLowerCase() !== "inactive",
      access: normalizeUserAccess(user),
      updated_at: user?.updated_at || user?.updatedAt || user?.created_at || user?.createdAt || null,
    };
  }

  function renderUsers(users) {
    const list = Array.isArray(users) ? users.map(normalizeUserRecord) : [];
    state.users = list;
    if (userCountText) {
      userCountText.textContent = state.userFetchError
        ? "(목록을 불러오지 못했어요)"
        : list.length ? `· ${fmtInt(list.length)}명` : "";
    }
    if (!usersTbody) return;
    if (state.userFetchError) {
      usersTbody.innerHTML = `<tr><td colspan="5" class="emptyState">${escapeHtml(state.userFetchError)}</td></tr>`;
      return;
    }
    if (list.length === 0) {
      usersTbody.innerHTML = '<tr><td colspan="5" class="emptyState">아직 만든 계정이 없어요.</td></tr>';
      return;
    }
    usersTbody.innerHTML = list.map((u) => {
      const accessHtml = u.access.length
        ? `<div class="tagRow">${u.access.map((e) => `<span class="badge label">${escapeHtml(e.role ? `${e.role} · ${e.site_id}` : e.site_id)}</span>`).join("")}</div>`
        : '<span class="muted">없음</span>';
      const statusBadge = u.active ? '<span class="badge running">활성</span>' : '<span class="badge paused">비활성</span>';
      const adminBadge = u.is_admin ? ' <span class="badge label">관리자</span>' : '';
      return `<tr>
        <td class="mono">${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.display_name)}</td>
        <td>${statusBadge}${adminBadge}</td>
        <td>${accessHtml}</td>
        <td>${fmtDate(u.updated_at)}</td>
      </tr>`;
    }).join("");
  }

  function getAvailableUserSiteIds() {
    return state.sites.map((s) => String(s?.site_id || "").trim()).filter(Boolean);
  }
  function deriveDefaultNewUserSiteIds() {
    const av = getAvailableUserSiteIds();
    if (!av.length) return [];
    const cur = getCurrentSiteId();
    return av.includes(cur) ? [cur] : [av[0]];
  }
  function syncNewUserSiteIds(siteIds) {
    const allowed = new Set(getAvailableUserSiteIds());
    const next = (Array.isArray(siteIds) ? siteIds : state.newUserSiteIds).map((s) => String(s || "").trim()).filter((s) => allowed.has(s));
    state.newUserSiteIds = Array.from(new Set(next));
    if (!state.newUserSiteIds.length) state.newUserSiteIds = deriveDefaultNewUserSiteIds();
  }

  function setUserFormStatus(message, isError) {
    if (!userFormStatus) return;
    userFormStatus.textContent = String(message || "").trim() || "본인에게 열려 있는 사이트만 고를 수 있어요.";
    userFormStatus.style.color = isError ? "var(--color-danger)" : "";
  }

  function renderUserSiteOptions() {
    if (!userSiteChecklist) return;
    const sites = state.sites || [];
    if (!sites.length) {
      userSiteChecklist.innerHTML = '<span class="muted">고를 수 있는 사이트가 없어요.</span>';
      return;
    }
    syncNewUserSiteIds();
    userSiteChecklist.innerHTML = sites.map((site) => {
      const sid = String(site?.site_id || "").trim();
      const checked = state.newUserSiteIds.includes(sid);
      const label = site?.name ? `${site.name} (${sid})` : sid;
      return `<label class="siteCheckLabel"><input type="checkbox" value="${escapeHtml(sid)}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
    }).join("");
  }

  function buildCreateUserPayload() {
    const username = String(userUsernameInput?.value || "").trim();
    const displayName = String(userDisplayNameInput?.value || "").trim();
    const password = String(userPasswordInput?.value || "");
    const siteIds = Array.from(new Set(state.newUserSiteIds.map((s) => String(s || "").trim()).filter(Boolean)));
    if (!username) throw new Error("아이디를 입력해 주세요.");
    if (!displayName) throw new Error("이름을 입력해 주세요.");
    if (!password) throw new Error("비밀번호를 입력해 주세요.");
    if (!siteIds.length) throw new Error("사이트를 하나 이상 골라 주세요.");
    return {
      username, display_name: displayName, displayName, password,
      active: Boolean(userActiveInput?.checked),
      site_ids: siteIds, sites: siteIds,
      site_access: siteIds.map((site_id) => ({ site_id })),
      allowed_site_ids: siteIds, accessible_site_ids: siteIds,
    };
  }

  function resetCreateUserForm() {
    if (createUserForm) createUserForm.reset();
    if (userActiveInput) userActiveInput.checked = true;
    syncNewUserSiteIds(deriveDefaultNewUserSiteIds());
    renderUserSiteOptions();
    setUserFormStatus("", false);
  }

  async function submitCreateUser(event) {
    event.preventDefault();
    if (!createUserBtn) return;
    try {
      createUserBtn.disabled = true;
      setUserFormStatus("계정을 만드는 중이에요…", false);
      const payload = buildCreateUserPayload();
      const r = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await parseJsonResponse(r, "user create failed");
      if (!j?.ok) throw new Error(j?.reason || "user create failed");
      state.userFetchError = null;
      renderUsers(await fetchUsers());
      resetCreateUserForm();
      setUserFormStatus(`${payload.display_name} 계정을 만들었어요.`, false);
    } catch (err) {
      setUserFormStatus(String(err), true);
      alert(String(err));
    } finally { createUserBtn.disabled = false; }
  }

  // ─── Copilot / Draft ───
  function updateCopilotExperimentUI() {
    if (copilotExperimentKey) copilotExperimentKey.textContent = state.selectedExperimentKey || "미선택";
    if (state.chatWidget) {
      if (typeof state.chatWidget.setContext === "function") {
        state.chatWidget.setContext({ siteId: getCurrentSiteId(), selectedExperimentKey: state.selectedExperimentKey });
      } else {
        state.chatWidget.setSelectedExperimentKey(state.selectedExperimentKey);
        if (typeof state.chatWidget.setSiteId === "function") state.chatWidget.setSiteId(getCurrentSiteId());
      }
    }
  }

  function setCopilotDraftUi({ statusText = "", showSave = false, showOpen = false, saveDisabled = false, openDisabled = false } = {}) {
    const shouldShow = Boolean(statusText || showSave || showOpen);
    if (copilotDraftStatus) {
      copilotDraftStatus.hidden = !statusText;
      copilotDraftStatus.textContent = statusText;
    }
    if (copilotDraftActionsRow) copilotDraftActionsRow.hidden = !shouldShow;
    if (saveDraftBtn) {
      saveDraftBtn.hidden = !showSave;
      saveDraftBtn.disabled = !showSave || saveDisabled;
    }
    if (openDraftInEditorBtn) {
      openDraftInEditorBtn.hidden = !showOpen;
      openDraftInEditorBtn.disabled = !showOpen || openDisabled;
    }
  }

  function stageDraftForEditor(draft, changes) {
    if (!draft && !Array.isArray(changes)) return;
    const payload = { draft: draft || null, changesB: Array.isArray(changes) ? changes : [], selectedExperimentKey: state.selectedExperimentKey, savedAt: Date.now() };
    state.latestDraft = payload;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    const cnt = payload.changesB.length;
    setCopilotDraftUi({
      statusText: draft ? `초안 준비됨 · ${draft.key || "draft"} · 수정 ${cnt}건` : `초안 준비됨 · 수정 ${cnt}건`,
      showSave: true,
    });
  }

  function stageExperimentForEditor(exp, options = {}) {
    const payload = {
      draft: { key: exp.key, version: exp.version || null, target_page: exp.url_prefix, hypothesis: exp.hypothesis || "" },
      changesB: Array.isArray(exp?.variants?.B) ? exp.variants.B : [],
      selectedExperimentKey: exp.parent_key || exp.key || null,
      savedAt: Date.now(),
    };
    state.latestDraft = payload;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    if (options.revealActions) {
      setCopilotDraftUi({
        statusText: `${exp.status === "draft" ? "초안 저장됨" : "실험 불러옴"} · ${exp.key}`,
        showOpen: true,
      });
    } else {
      setCopilotDraftUi();
    }
  }

  async function persistLatestDraft() {
    if (!state.latestDraft) return;
    const draft = state.latestDraft.draft || {};
    const changesB = Array.isArray(state.latestDraft.changesB) ? state.latestDraft.changesB : [];
    const payload = {
      site_id: getCurrentSiteId(),
      key: draft.key || state.selectedExperimentKey || `exp_copilot_${Date.now()}`,
      url_prefix: draft.target_page || "/",
      traffic: { A: 50, B: 50 },
      goals: [draft.primary_goal || "checkout_complete"],
      variants: { A: [], B: changesB },
      hypothesis: draft.hypothesis || "AI 도우미에서 만든 초안",
      source: "analytics_copilot",
    };
    const saved = await saveDraftExperiment(payload);
    stageExperimentForEditor(saved, { revealActions: true });
    await render();
    return saved;
  }

  // ─── 렌더링: 실험 테이블 ───
  function badge(status) {
    const cls = status === "running" ? "running" : status === "draft" ? "draft" : status === "archived" ? "label" : "paused";
    return `<span class="badge ${cls}">${escapeHtml(statusName(status))}</span>`;
  }

  function rowHtml(exp) {
    const status = exp.status || "paused";
    const key = exp.key || "(코드 없음)";
    const urlPrefix = exp.url_prefix || "/";
    const version = exp.version || 0;

    const btnToggle = status === "running"
      ? `<button class="btn danger" data-act="pause" data-id="${exp.id}">중지</button>`
      : status === "draft"
        ? `<button class="btn" data-act="edit-draft" data-id="${exp.id}" data-key="${key}">초안 이어쓰기</button>`
        : status === "archived"
          ? `<span class="muted">보관함</span>`
          : `<button class="btn good" data-act="run" data-id="${exp.id}">다시 켜기</button>`;

    const archiveBtn = (status === "draft" || status === "paused")
      ? `<button class="btn danger" data-act="archive" data-id="${exp.id}">보관으로</button>` : "";

    const metricsBtn = status === "draft"
      ? `<button class="btn" data-act="edit-draft" data-id="${exp.id}" data-key="${key}">편집기에서 열기</button>`
      : `<button class="btn" data-act="metrics" data-key="${key}">결과 보기</button>`;

    return `<tr>
      <td class="mono">${escapeHtml(key)}</td>
      <td>${badge(status)}</td>
      <td class="mono">${escapeHtml(urlPrefix)}</td>
      <td class="mono">v${version}</td>
      <td>${fmtDate(exp.updated_at)}</td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap;">${metricsBtn}${btnToggle}${archiveBtn}<a class="btn" href="${getEditorUrl({ experiment_key: key, experiment_version: version })}" target="_blank" rel="noopener">편집기</a><button class="btn danger" data-act="del" data-id="${exp.id}">삭제</button></div></td>
    </tr>`;
  }

  function populateExperimentSelect(experiments) {
    if (!experimentSelect) return;
    const list = Array.isArray(experiments) ? experiments : [];
    experimentSelect.innerHTML = "";
    if (!list.length) {
      experimentSelect.innerHTML = '<option value="">실험 없음</option>';
      experimentSelect.disabled = true;
      return;
    }
    experimentSelect.disabled = false;
    list.forEach((exp) => {
      const option = document.createElement("option");
      option.value = exp.key || "";
      option.textContent = `${exp.key || "실험"} · ${statusName(exp.status)} · ${exp.url_prefix || "/"}`;
      experimentSelect.appendChild(option);
    });
    experimentSelect.value = state.selectedExperimentKey || list[0].key || "";
  }

  async function loadSelectedExperimentMetrics() {
    if (!state.selectedExperimentKey) {
      state.selectedExperimentMetrics = null;
      return null;
    }
    try {
      const metrics = await fetchMetrics(state.selectedExperimentKey);
      state.selectedExperimentMetrics = metrics;
      return metrics;
    } catch (error) {
      state.selectedExperimentMetrics = { ok: false, reason: String(error) };
      return state.selectedExperimentMetrics;
    }
  }

  function renderExperimentAudienceControls() {
    if (experimentAudienceSelect) experimentAudienceSelect.value = state.selectedExperimentAudience;
    if (!experimentPersonaSelect) return;
    const personas = Array.isArray(state.personas) ? state.personas : [];
    experimentPersonaSelect.innerHTML = '<option value="">전체 에이전트</option>';
    personas.forEach((persona) => {
      const option = document.createElement("option");
      option.value = persona.id || "";
      option.textContent = persona.group_label || persona.description || persona.id || "페르소나";
      experimentPersonaSelect.appendChild(option);
    });
    experimentPersonaSelect.value = state.selectedExperimentPersonaId || "";
    const syntheticSelected = state.selectedExperimentAudience === "synthetic_agent";
    experimentPersonaSelect.disabled = !syntheticSelected;
    if (experimentAudienceHint) {
      if (state.selectedExperimentAudience === "real_user") {
        experimentAudienceHint.textContent = "실제 사용자 이벤트만 대상으로 UI/UX 변경 반응을 비교합니다.";
      } else if (syntheticSelected && state.selectedExperimentPersonaId) {
        const persona = personas.find((item) => item.id === state.selectedExperimentPersonaId);
        experimentAudienceHint.textContent = `${persona?.group_label || persona?.description || state.selectedExperimentPersonaId} 에이전트만 대상으로 UI/UX 변경 반응을 비교합니다.`;
      } else if (syntheticSelected) {
        experimentAudienceHint.textContent = "모든 시뮬레이션 에이전트를 대상으로 UI/UX 변경 반응을 비교합니다.";
      } else {
        experimentAudienceHint.textContent = "전체 트래픽 기준으로 UI/UX 변경 반응을 비교합니다.";
      }
    }
  }

  function getSelectedOverlayPersona() {
    return state.personas.find((item) => item.id === state.selectedOverlayPersonaId) || null;
  }

  function getFilteredOverlayPersonas() {
    return state.personas.filter((persona) => {
      if (state.selectedOverlayAgeGroup && persona.age_group !== state.selectedOverlayAgeGroup) return false;
      if (state.selectedOverlayStyleKey && persona.style_key !== state.selectedOverlayStyleKey) return false;
      return true;
    });
  }

  function getSelectedOverlayRecord() {
    if (!state.selectedExperimentKey || !state.selectedOverlayPersonaId) return null;
    return state.overlayRecords.find((item) => item.experiment_key === state.selectedExperimentKey && item.persona_id === state.selectedOverlayPersonaId && item.variant === "B") || null;
  }

  function getOverlayPersonaLabel(persona) {
    if (!persona) return "전체";
    const age = AGE_GROUP_LABELS[persona.age_group] || persona.age_group || "전체";
    const style = persona.style_label || persona.style_key || "유형";
    return `${age} ${style}`.trim();
  }

  function estimateUiChangeImpact(change) {
    if (!change || typeof change !== "object") {
      return { impact_pct: 0, impact_direction: "neutral", impact_label: "변화 없음" };
    }

    const actions = Array.isArray(change.actions) ? change.actions : [];
    const action = actions[0] || null;

    if (change.type === "inject_css") {
      const css = String(change.css || "").toLowerCase();
      if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(css)) return { impact_pct: -8, impact_direction: "negative", impact_label: "노출 감소" };
      if (/color|background|border|outline|font|padding|margin|grid|flex/.test(css)) return { impact_pct: 10, impact_direction: "positive", impact_label: "시각 변화" };
      return { impact_pct: 4, impact_direction: "positive", impact_label: "CSS 반응" };
    }

    if (action?.type === "hide") return { impact_pct: -7, impact_direction: "negative", impact_label: "숨김 반응" };
    if (action?.type === "show") return { impact_pct: 5, impact_direction: "positive", impact_label: "노출 확대" };
    if (action?.type === "set_text") return { impact_pct: 8, impact_direction: "positive", impact_label: "문구 반응" };
    if (action?.type === "set_attr" && String(action.name || "").toLowerCase() === "href") return { impact_pct: 11, impact_direction: "positive", impact_label: "링크 이동" };
    if (action?.type === "set_style") {
      const styles = action.styles && typeof action.styles === "object" ? action.styles : {};
      if (Object.keys(styles).some((key) => /display|visibility/i.test(key))) return { impact_pct: -7, impact_direction: "negative", impact_label: "노출 변화" };
      if (Object.keys(styles).some((key) => /color|background|border|outline/i.test(key))) return { impact_pct: 12, impact_direction: "positive", impact_label: "색/강조 반응" };
      return { impact_pct: 6, impact_direction: "positive", impact_label: "스타일 반응" };
    }
    if (action?.type === "add_class" || action?.type === "remove_class") return { impact_pct: 5, impact_direction: "positive", impact_label: "클래스 변화" };

    return { impact_pct: 4, impact_direction: "positive", impact_label: "반응" };
  }

  function buildOverlaySummary(experiment, persona) {
    const changes = Array.isArray(experiment?.variants?.B) ? experiment.variants.B : [];
    const impacts = changes.map((change) => estimateUiChangeImpact(change)).filter((item) => item.impact_pct !== 0);
    const avg = impacts.length ? (impacts.reduce((sum, item) => sum + item.impact_pct, 0) / impacts.length) : 0;
    const rounded = Math.round(avg);
    const direction = rounded >= 0 ? "positive" : "negative";
    const personaLabel = getOverlayPersonaLabel(persona);
    const countLabel = impacts.length ? `변경 요소 ${impacts.length}개 평균` : "변경 요소 없음";
    const sign = rounded > 0 ? "+" : "";
    const verb = rounded >= 0 ? "증가하였습니다" : "감소하였습니다";

    return {
      sentence: `${personaLabel} 고객의 클릭 전환율이 평균 ${sign}${rounded}% ${verb}.`,
      detail: countLabel,
      direction,
      avg,
    };
  }

  function getExperimentPreviewTarget(experiment) {
    const site = getCurrentSiteConfig();
    const targets = Array.isArray(site?.preview_targets) ? site.preview_targets : [];
    if (!experiment) return targets[0] || null;

    const experimentPath = String(experiment.url_prefix || "").trim();
    const exact = targets.find((target) => target.experiment_key === experiment.key);
    if (exact) return exact;

    const byPath = targets.find((target) => String(target.url_prefix || "").trim() === experimentPath)
      || targets.filter((target) => experimentPath && (experimentPath.startsWith(String(target.url_prefix || "").trim()) || String(target.url_prefix || "").trim().startsWith(experimentPath)))
        .sort((a, b) => String(b.url_prefix || "").length - String(a.url_prefix || "").length)[0];

    return byPath || targets[0] || null;
  }

  function clearExperimentOverlayPreview() {
    if (experimentOverlayPreviewTarget) experimentOverlayPreviewTarget.textContent = "미리보기 대상을 불러오는 중입니다.";
    if (experimentOverlayPreviewSentence) {
      experimentOverlayPreviewSentence.textContent = "오버레이 요약을 불러오는 중입니다.";
      experimentOverlayPreviewSentence.className = "experimentOverlayPreviewSentence";
    }
    if (experimentOverlayPreviewMeta) experimentOverlayPreviewMeta.innerHTML = "";
    if (experimentOverlayPreviewLayer) experimentOverlayPreviewLayer.innerHTML = "";
    if (experimentOverlayPreviewStage) experimentOverlayPreviewStage.style.height = "auto";
    if (experimentOverlayPreviewFrame) experimentOverlayPreviewFrame.removeAttribute("src");
  }

  function renderExperimentOverlayPreview(experiment) {
    if (!experimentOverlayPreviewPanel || !experimentOverlayPreviewFrame || !experimentOverlayPreviewLayer || !experimentOverlayPreviewStage) return;
    if (experimentOverlayPreviewPanel.hidden) return;

    const target = getExperimentPreviewTarget(experiment);
    const changes = Array.isArray(experiment?.variants?.B) ? experiment.variants.B : [];
    const root = experimentOverlayPreviewMeta;
    const persona = getSelectedOverlayPersona() || state.personas[0] || null;
    const summary = buildOverlaySummary(experiment, persona);

    if (experimentOverlayPreviewTarget) {
      experimentOverlayPreviewTarget.textContent = target
        ? `${target.label || target.url_prefix || target.id || "preview"} · ${target.preview_url || target.live_url || "/"}`
        : "미리보기 대상을 찾지 못했습니다.";
    }
    if (experimentOverlayPreviewSentence) {
      experimentOverlayPreviewSentence.textContent = summary.sentence;
      experimentOverlayPreviewSentence.className = `experimentOverlayPreviewSentence ${summary.direction === "positive" ? "impactPositive" : summary.direction === "negative" ? "impactNegative" : ""}`;
    }
    if (experimentOverlayPreviewStatus) {
      experimentOverlayPreviewStatus.textContent = changes.length ? `오버레이 ${changes.length}개` : "변경 없음";
    }
    if (root) {
      const items = changes.slice(0, 6).map((change) => {
        const impact = estimateUiChangeImpact(change);
        const action = Array.isArray(change.actions) ? change.actions[0] : null;
        const label = change.label || (change.type === "inject_css" ? "고급 CSS" : action?.type || "변경");
        const pct = impact.impact_pct > 0 ? `+${impact.impact_pct}%` : `${impact.impact_pct}%`;
        const className = impact.impact_direction === "positive" ? "impactPos" : impact.impact_direction === "negative" ? "impactNeg" : "label";
        return `<span class="badge ${className}">${escapeHtml(label)} ${escapeHtml(pct)}</span>`;
      });
      root.innerHTML = [
        `<span class="badge label">${escapeHtml(summary.detail)}</span>`,
        ...items,
      ].join("");
    }

    if (!target || !(target.preview_url || target.live_url)) {
      clearExperimentOverlayPreview();
      if (experimentOverlayPreviewStatus) experimentOverlayPreviewStatus.textContent = "미리보기 URL 없음";
      if (experimentOverlayPreviewTarget) experimentOverlayPreviewTarget.textContent = "사이트 설정에 preview/live URL이 없습니다.";
      return;
    }

    const src = appendAbForceToUrl(target.preview_url || target.live_url, "B");
    const overlayStage = experimentOverlayPreviewStage;
    const overlayFrame = experimentOverlayPreviewFrame;
    const overlayLayer = experimentOverlayPreviewLayer;

    const draw = () => {
      let doc = null;
      try {
        doc = overlayFrame.contentDocument;
      } catch {
        doc = null;
      }
      if (!doc) {
        if (experimentOverlayPreviewStatus) experimentOverlayPreviewStatus.textContent = "iframe 접근 불가";
        return;
      }

      let height = 0;
      try {
        height = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0, doc.documentElement?.offsetHeight || 0, doc.body?.offsetHeight || 0, 1200);
      } catch {
        height = 1200;
      }
      overlayFrame.style.height = `${height}px`;
      overlayStage.style.height = `${height}px`;
      overlayLayer.style.height = `${height}px`;
      overlayLayer.innerHTML = "";

      changes.forEach((change) => {
        const impact = estimateUiChangeImpact(change);
        if (!impact.impact_pct) return;

        if (change.type === "inject_css") {
          const marker = document.createElement("div");
          marker.className = "experimentOverlayMarker";
          marker.dataset.direction = impact.impact_direction;
          marker.style.left = "16px";
          marker.style.top = `${16 + (overlayLayer.children.length * 90)}px`;
          marker.style.width = "min(420px, calc(100% - 32px))";
          marker.style.height = "72px";
          marker.style.opacity = String(Math.max(0.18, Math.min(0.55, Math.abs(impact.impact_pct) / 24)));
          marker.innerHTML = `<div class="experimentOverlayMarkerInner"><span class="experimentOverlayMarkerPct">${impact.impact_pct > 0 ? "+" : ""}${impact.impact_pct}%</span><span>${escapeHtml(change.label || "고급 CSS")}</span></div>`;
          overlayLayer.appendChild(marker);
          return;
        }

        const selector = String(change.selector || "").trim();
        if (!selector) return;
        let elements = [];
        try {
          elements = Array.from(doc.querySelectorAll(selector));
        } catch {
          elements = [];
        }
        const el = elements[0];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;

        const marker = document.createElement("div");
        marker.className = "experimentOverlayMarker";
        marker.dataset.direction = impact.impact_direction;
        marker.style.left = `${Math.max(0, Math.round(rect.left))}px`;
        marker.style.top = `${Math.max(0, Math.round(rect.top))}px`;
        marker.style.width = `${Math.max(64, Math.round(rect.width))}px`;
        marker.style.height = `${Math.max(30, Math.round(rect.height))}px`;
        marker.style.opacity = String(Math.max(0.18, Math.min(0.6, Math.abs(impact.impact_pct) / 24)));
        marker.innerHTML = `<div class="experimentOverlayMarkerInner"><span class="experimentOverlayMarkerPct">${impact.impact_pct > 0 ? "+" : ""}${impact.impact_pct}%</span><span>${escapeHtml(change.label || selector)}</span></div>`;
        overlayLayer.appendChild(marker);
      });
    };

    overlayFrame.onload = () => {
      try {
        draw();
      } catch (error) {
        if (experimentOverlayPreviewStatus) experimentOverlayPreviewStatus.textContent = String(error);
      }
    };

    overlayFrame.src = src;
    if (experimentOverlayPreviewStatus) experimentOverlayPreviewStatus.textContent = "페이지 로딩 중";
  }

  function summarizeVariantUiChanges(experiment) {
    const changes = Array.isArray(experiment?.variants?.B) ? experiment.variants.B : [];
    if (!changes.length) return "B안의 UI 변경 사항이 아직 없습니다.";

    const counts = new Map();
    changes.forEach((change) => {
      let label = "기타 변경";
      const actions = Array.isArray(change?.actions) ? change.actions : [];
      const action = actions[0] || null;

      if (change?.type === "inject_css") {
        label = "고급 CSS";
      } else if (action?.type === "set_text") {
        label = "문구 변경";
      } else if (action?.type === "set_style") {
        const styles = action?.styles && typeof action.styles === "object" ? Object.keys(action.styles) : [];
        label = styles.some((key) => /color|background|border|outline/i.test(key)) ? "색/스타일 변경" : "스타일 변경";
      } else if (action?.type === "hide") {
        label = "숨기기";
      } else if (action?.type === "show") {
        label = "보이기";
      } else if (action?.type === "set_attr" && String(action.name || "").toLowerCase() === "href") {
        label = "링크 변경";
      } else if (action?.type === "set_attr") {
        label = "속성 변경";
      }

      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([label, count]) => `${label} ${count}건`).join(" · ");
  }

  function renderOverlayBuilder(experiment) {
    if (!overlayPersonaSelect || !overlayBuilderPreview || !overlayBuilderStatus || !generateOverlayBtn || !overlayAgeGroupSelect || !overlayStyleSelect) return;
    const personas = Array.isArray(state.personas) ? state.personas : [];
    const ageOptions = Array.from(new Set(personas.map((persona) => persona.age_group).filter(Boolean)));
    const styleOptions = Array.from(new Set(personas.map((persona) => persona.style_key).filter(Boolean)));

    overlayAgeGroupSelect.innerHTML = '<option value="">전체 나이대</option>';
    ageOptions.forEach((ageGroup) => {
      const option = document.createElement("option");
      option.value = ageGroup;
      option.textContent = AGE_GROUP_LABELS[ageGroup] || ageGroup;
      overlayAgeGroupSelect.appendChild(option);
    });
    overlayAgeGroupSelect.value = state.selectedOverlayAgeGroup || "";

    overlayStyleSelect.innerHTML = '<option value="">전체 유형</option>';
    styleOptions.forEach((styleKey) => {
      const persona = personas.find((item) => item.style_key === styleKey);
      const option = document.createElement("option");
      option.value = styleKey;
      option.textContent = persona?.style_label || styleKey;
      overlayStyleSelect.appendChild(option);
    });
    overlayStyleSelect.value = state.selectedOverlayStyleKey || "";

    const filteredPersonas = getFilteredOverlayPersonas();
    overlayPersonaSelect.innerHTML = '<option value="">페르소나를 선택하세요</option>';
    filteredPersonas.forEach((persona) => {
      const option = document.createElement("option");
      option.value = persona.id || "";
      option.textContent = persona.group_label || persona.description || persona.id || "페르소나";
      overlayPersonaSelect.appendChild(option);
    });

    if (!filteredPersonas.some((persona) => persona.id === state.selectedOverlayPersonaId)) {
      state.selectedOverlayPersonaId = filteredPersonas[0]?.id || "";
    }
    overlayPersonaSelect.value = state.selectedOverlayPersonaId || "";
    generateOverlayBtn.disabled = !experiment || !state.selectedOverlayPersonaId || state.overlayGenerationPending;

    const selectedPersona = getSelectedOverlayPersona();
    if (state.overlayGenerationPending) {
      overlayBuilderStatus.textContent = "UI/UX 반응 오버레이를 생성하고 있습니다...";
    } else if (!experiment) {
      overlayBuilderStatus.textContent = "실험을 먼저 선택하면 UI/UX 반응 오버레이를 만들 수 있습니다.";
    } else if (!selectedPersona) {
      overlayBuilderStatus.textContent = "페르소나를 선택하면 variant B 반응 보정안을 생성할 수 있습니다.";
    } else {
      overlayBuilderStatus.textContent = state.overlayPreviewReady
        ? `${selectedPersona.group_label || selectedPersona.description || selectedPersona.id} 기준 반응 오버레이를 확인할 수 있습니다.`
        : `${selectedPersona.group_label || selectedPersona.description || selectedPersona.id} 기준 반응 오버레이는 생성 버튼을 눌러야 표시됩니다.`;
    }

    if (!state.overlayPreviewReady) {
      overlayBuilderPreview.innerHTML = '<div class="emptyState compactEmpty">아직 생성된 UI/UX 반응 오버레이가 없습니다.</div>';
      return;
    }

    const overlayRecord = getSelectedOverlayRecord();
    if (!overlayRecord) {
      overlayBuilderPreview.innerHTML = '<div class="emptyState compactEmpty">아직 생성된 UI/UX 반응 오버레이가 없습니다.</div>';
      return;
    }

    const multiplierEntries = Object.entries(overlayRecord.edge_weight_multipliers || {});
    overlayBuilderPreview.innerHTML = `
      <div class="overlayPreviewMeta">
        <span class="badge running">variant ${escapeHtml(overlayRecord.variant || "B")}</span>
        <span class="badge label">provider ${escapeHtml(overlayRecord.provider || "unknown")}</span>
        <span class="badge label">${escapeHtml(selectedPersona.group_label || selectedPersona.description || selectedPersona.id)}</span>
      </div>
      <div class="overlayPreviewReason">${escapeHtml(overlayRecord.reason_summary || "설명 없음")}</div>
      <div class="overlayPreviewList">
        ${multiplierEntries.length ? multiplierEntries.map(([edgeId, multiplier]) => `
          <div class="overlayPreviewRow">
            <span class="mono">${escapeHtml(edgeId)}</span>
            <strong class="mono">x${escapeHtml(String(multiplier))}</strong>
          </div>`).join("") : '<div class="emptyState compactEmpty">조정된 전이가 없습니다.</div>'}
      </div>`;
  }

  function renderExperimentSummary(experiment, metrics) {
    if (!experimentSummaryCard || !experimentSummaryEmpty) return;
    if (!experiment) {
      experimentSummaryCard.hidden = true;
      experimentSummaryEmpty.hidden = false;
      experimentSummaryEmpty.textContent = "아직 생성된 실험이 없습니다.";
      if (openExperimentResultsBtn) openExperimentResultsBtn.disabled = true;
      return;
    }

    experimentSummaryCard.hidden = false;
    experimentSummaryEmpty.hidden = true;
    if (experimentSummaryTitle) experimentSummaryTitle.textContent = experiment.key || "실험";
    if (experimentSummaryPeriod) experimentSummaryPeriod.textContent = `실험 기간 · ${formatExperimentWindow(experiment)}`;
    if (experimentSummaryStatus) {
      experimentSummaryStatus.className = `badge ${experiment.status === "running" ? "running" : experiment.status === "paused" ? "paused" : experiment.status === "draft" ? "draft" : "label"}`;
      experimentSummaryStatus.textContent = statusName(experiment.status);
    }
    if (experimentVariantAName) experimentVariantAName.textContent = getVariantName("A", experiment);
    if (experimentVariantBName) experimentVariantBName.textContent = getVariantName("B", experiment);

    const lead = getLeadingVariant(metrics);
    if (experimentSummaryLead) {
      experimentSummaryLead.className = `badge ${lead.tone}`;
      experimentSummaryLead.textContent = lead.text;
    }

    const totalSessions = (Number(metrics?.A?.sessions) || 0) + (Number(metrics?.B?.sessions) || 0);
    if (experimentParticipantSessions) experimentParticipantSessions.textContent = fmtInt(totalSessions);

    if (experimentPeriodResultStatus) {
      experimentPeriodResultStatus.textContent = metrics?.ok
        ? (totalSessions > 0 ? `${getPeriodRange().label} 데이터 반영됨` : "선택한 기간에 해당 실험 데이터가 없습니다.")
        : "결과를 불러오지 못했습니다.";
    }

    if (experimentSummaryHint) {
      const uiChangeSummary = summarizeVariantUiChanges(experiment);
      const rationaleSummary = summarizeChangeRationale(Array.isArray(experiment?.variants?.B) ? experiment.variants.B : []);
      experimentSummaryHint.textContent = !isExperimentInPeriod(experiment)
        ? `선택한 기간이 실험 기간과 겹치지 않아 데이터가 비어 있을 수 있습니다. ${uiChangeSummary}${rationaleSummary !== "설명 없음" ? ` · ${rationaleSummary}` : ""}`
        : `${uiChangeSummary} 기준으로 전환율, 이탈률, 체류 시간, 방문 깊이, 클릭 요소를 비교합니다.${rationaleSummary !== "설명 없음" ? ` · 이유: ${rationaleSummary}` : ""}`;
    }
    if (openExperimentResultsBtn) openExperimentResultsBtn.disabled = !metrics?.ok;
  }

  function formatHistoryLabel(item, index, currentVersion) {
    const version = Number(item?.version || 0);
    const title = version ? `v${version}` : `이전 ${index + 1}`;
    const when = item?.updated_at ? fmtDate(item.updated_at) : "시간 정보 없음";
    const status = statusName(item?.status || "draft");
    const isCurrent = version === currentVersion;
    return { title, when, status, isCurrent };
  }

  function summarizeChangeList(changes) {
    const list = Array.isArray(changes) ? changes : [];
    if (!list.length) return "변경 없음";

    const counts = new Map();
    list.forEach((change) => {
      let label = "기타 변경";
      const actions = Array.isArray(change?.actions) ? change.actions : [];
      const action = actions[0] || null;

      if (change?.type === "inject_css") {
        label = "고급 CSS";
      } else if (action?.type === "set_text") {
        label = "문구 변경";
      } else if (action?.type === "set_style") {
        const styles = action?.styles && typeof action.styles === "object" ? Object.keys(action.styles) : [];
        label = styles.some((key) => /color|background|border|outline/i.test(key)) ? "색/스타일 변경" : "스타일 변경";
      } else if (action?.type === "hide") {
        label = "숨기기";
      } else if (action?.type === "show") {
        label = "보이기";
      } else if (action?.type === "set_attr" && String(action.name || "").toLowerCase() === "href") {
        label = "링크 변경";
      } else if (action?.type === "set_attr") {
        label = "속성 변경";
      } else if (action?.type === "add_class") {
        label = "클래스 추가";
      } else if (action?.type === "remove_class") {
        label = "클래스 제거";
      }

      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([label, count]) => `${label} ${count}건`).join(" · ");
  }

  function summarizeChangeRationale(changes) {
    const list = Array.isArray(changes) ? changes : [];
    if (!list.length) return "설명 없음";
    const rationals = [];
    list.forEach((change) => {
      const rationale = change?.rationale || null;
      if (!rationale) return;
      const intent = rationale.intent || "";
      const effect = rationale.expected_effect || "";
      const metric = rationale.primary_metric || "";
      const text = [intent, effect, metric].filter(Boolean).join(" / ");
      if (text) rationals.push(text);
    });
    return rationals.length ? Array.from(new Set(rationals)).slice(0, 3).join(" · ") : "설명 없음";
  }

  function describeExperimentVersionDiff(current, previous) {
    if (!previous) {
      return {
        label: "최초 버전",
        items: ["이전 버전이 없어 직접 비교할 수 없습니다."],
      };
    }

    const items = [];
    if ((current?.url_prefix || "") !== (previous?.url_prefix || "")) {
      items.push(`적용 경로: ${previous?.url_prefix || "/"} → ${current?.url_prefix || "/"}`);
    }
    if ((current?.status || "") !== (previous?.status || "")) {
      items.push(`상태: ${statusName(previous?.status)} → ${statusName(current?.status)}`);
    }
    if ((current?.hypothesis || "") !== (previous?.hypothesis || "")) {
      items.push(`가설: ${previous?.hypothesis || "없음"} → ${current?.hypothesis || "없음"}`);
    }
    if ((current?.source || "") !== (previous?.source || "")) {
      items.push(`생성 방식: ${current?.source || "unknown"}`);
    }

    const currentGoals = JSON.stringify(Array.isArray(current?.goals) ? current.goals : []);
    const previousGoals = JSON.stringify(Array.isArray(previous?.goals) ? previous.goals : []);
    if (currentGoals !== previousGoals) {
      items.push(`목표 지표: ${(previous?.goals || []).join(", ") || "없음"} → ${(current?.goals || []).join(", ") || "없음"}`);
    }

    const currentB = Array.isArray(current?.variants?.B) ? current.variants.B : [];
    const previousB = Array.isArray(previous?.variants?.B) ? previous.variants.B : [];
    const currentBLabel = summarizeChangeList(currentB);
    const previousBLabel = summarizeChangeList(previousB);
    if (currentBLabel !== previousBLabel) {
      items.push(`변경안 B: ${previousBLabel} → ${currentBLabel}`);
    }

    const currentRationale = summarizeChangeRationale(currentB);
    const previousRationale = summarizeChangeRationale(previousB);
    if (currentRationale !== previousRationale) {
      items.push(`설명: ${previousRationale} → ${currentRationale}`);
    }

    const added = currentB.length - previousB.length;
    if (added > 0) items.push(`변경안 B ${added}개 추가`);
    else if (added < 0) items.push(`변경안 B ${Math.abs(added)}개 감소`);

    return {
      label: items.length ? `변경점 ${items.length}개` : "변경점 없음",
      items: items.length ? items : ["이전 버전과 차이가 없습니다."],
    };
  }

  function renderExperimentHistory(experiment) {
    if (!experimentHistoryList) return;
    const currentVersion = Number(experiment?.version || 0);
    const history = Array.isArray(experiment?.history) ? experiment.history : [];
    const items = [experiment, ...history]
      .filter(Boolean)
      .filter((item, index, array) => array.findIndex((candidate) => Number(candidate?.version || 0) === Number(item?.version || 0)) === index)
      .sort((a, b) => Number(b?.version || 0) - Number(a?.version || 0));

    if (!items.length) {
      experimentHistoryList.innerHTML = '<div class="emptyState compactEmpty">버전 히스토리가 없습니다.</div>';
      return;
    }

    experimentHistoryList.innerHTML = items.map((item, index) => {
      const meta = formatHistoryLabel(item, index, currentVersion);
      const previous = items[index + 1] || null;
      const diff = describeExperimentVersionDiff(item, previous);
      const summary = [
        item?.hypothesis ? `가설: ${String(item.hypothesis)}` : null,
        item?.url_prefix ? `경로: ${String(item.url_prefix)}` : null,
        item?.restored_from_version ? `복원됨 · v${String(item.restored_from_version)}` : null,
      ].filter(Boolean).join(" · ");
      const rollbackDisabled = meta.isCurrent || !item?.version || item.status === "archived" && item.version === currentVersion;
      return `<div class="experimentHistoryItem ${meta.isCurrent ? "current" : ""}">
        <div class="experimentHistoryMeta">
          <div class="experimentHistoryTitle">
            <span class="badge ${meta.isCurrent ? "running" : "label"}">${meta.isCurrent ? "현재" : "이전"}</span>
            <strong class="mono">${escapeHtml(meta.title)}</strong>
            <span class="badge label">${escapeHtml(meta.status)}</span>
          </div>
          <div class="experimentHistorySummary">${escapeHtml(meta.when)}${summary ? ` · ${escapeHtml(summary)}` : ""}</div>
          <div class="experimentHistoryDiff">
            <strong>${escapeHtml(diff.label)}</strong>
            <div class="experimentHistoryDiffList">
              ${diff.items.map((line) => `<span class="experimentHistoryDiffItem">${escapeHtml(line)}</span>`).join("")}
            </div>
          </div>
        </div>
        <div class="experimentHistoryActions">
          ${meta.isCurrent ? '<span class="muted">현재 버전</span>' : `<button class="btnGhost" type="button" data-rollback-version="${escapeHtml(String(item.version || ""))}" ${rollbackDisabled ? "disabled" : ""}>이 버전으로 롤백</button>`}
        </div>
      </div>`;
    }).join("");
  }

  async function rollbackExperimentVersion(experiment, version) {
    if (!experiment || !Number.isFinite(Number(version))) return;
    if (!confirm(`v${version}으로 되돌릴까요? 현재 버전은 새 버전으로 보존됩니다.`)) return;

    const r = await fetch(`/api/experiments/${encodeURIComponent(experiment.id)}/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ site_id: getCurrentSiteId(), version: Number(version) })
    });
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "rollback failed");

    await render();
    await showMetrics(j.experiment?.key || experiment.key);
  }

  // ─── 렌더링: Metrics ───
  function renderTop(list) {
    if (!Array.isArray(list) || !list.length) return "클릭 데이터 없음";
    return list.slice(0, 5).map((x, index) => `${index + 1}. ${String(x.element_label || x.element_id || "(unknown)")} · ${fmtInt(x.count)}회`).join("\n");
  }

  function toClusteringDisplaySummary(summary) {
    const list = Array.isArray(summary) ? summary.filter((item) => item.sessions > 0) : [];
    return list.map((item, index) => ({
      label: item.label,
      color: LABEL_COLORS[index % LABEL_COLORS.length],
      sessions: Number(item.sessions) || 0,
      share: typeof item.share === "number" ? item.share : 0,
      metrics: item.metrics || { avg_duration_ms: 0, avg_depth: 0, checkout_complete_rate: 0 },
    }));
  }

  function mergeLabelSummary(summary) {
    const byLabel = new Map(Array.isArray(summary) ? summary.map((item) => [item.label, item]) : []);
    return LABEL_ORDER.map((label, index) => {
      const current = byLabel.get(label);
      return {
        label,
        color: LABEL_COLORS[index % LABEL_COLORS.length],
        sessions: Number(current?.sessions) || 0,
        share: typeof current?.share === "number" ? current.share : 0,
        metrics: current?.metrics || {
          avg_duration_ms: 0,
          avg_depth: 0,
          checkout_complete_rate: 0,
        },
      };
    });
  }

  function buildDonutGradient(summary) {
    const segments = [];
    let start = 0;
    summary.forEach((item) => {
      const pct = Math.max(0, Math.min(1, Number(item.share) || 0));
      const end = start + (pct * 360);
      segments.push(`${item.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
      start = end;
    });
    if (start < 360) segments.push(`#eef2f8 ${start.toFixed(2)}deg 360deg`);
    return `conic-gradient(${segments.join(", ")})`;
  }

  function renderTrendChart(summary) {
    if (!trendChartCard) return;
    const trend = Array.isArray(summary?.trend) ? summary.trend : [];
    if (!trend.length) {
      trendChartCard.innerHTML = '<div class="chartState">해당 기간에 수집된 로그가 없습니다.</div>';
      return;
    }

    const sessions = trend.map((item) => Number(item.session_count) || 0);
    const events = trend.map((item) => Number(item.event_count) || 0);
    const maxValue = Math.max(1, ...sessions, ...events);
    const width = 960;
    const height = 220;
    const padX = 32;
    const padTop = 16;
    const padBottom = 24;
    const usableWidth = width - (padX * 2);
    const usableHeight = height - padTop - padBottom;
    const count = trend.length;

    const pointX = (index) => count === 1 ? width / 2 : padX + ((usableWidth / (count - 1)) * index);
    const pointY = (value) => padTop + (usableHeight - ((value / maxValue) * usableHeight));
    const toPolyline = (values) => values.map((value, index) => `${pointX(index)},${pointY(value)}`).join(" ");

    const labels = trend.map((item) => {
      const date = new Date(item.ts);
      return normalizePeriodPreset(state.periodPreset) === "daily"
        ? date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
    });
    const normalizedPreset = normalizePeriodPreset(state.periodPreset);
    const maxAxisLabels = normalizedPreset === "daily"
      ? (window.innerWidth <= 640 ? 6 : 8)
      : normalizedPreset === "custom"
        ? (window.innerWidth <= 640 ? 6 : 10)
        : (window.innerWidth <= 640 ? 5 : 7);
    const axisStep = count <= maxAxisLabels ? 1 : Math.ceil((count - 1) / (maxAxisLabels - 1));
    const axisLabels = labels.map((label, index) => {
      const visible = count <= maxAxisLabels
        || index === 0
        || index === count - 1
        || index % axisStep === 0;
      return { label, visible };
    });

    const tooltipHtml = (index) => `
      <div class="trendTooltipTitle">${escapeHtml(labels[index])}</div>
      <div class="trendTooltipRow"><span class="trendTooltipKey"><span class="trendTooltipDot"></span>세션 수</span><strong class="mono">${fmtInt(sessions[index])}</strong></div>
      <div class="trendTooltipRow"><span class="trendTooltipKey"><span class="trendTooltipDot events"></span>이벤트 수</span><strong class="mono">${fmtInt(events[index])}</strong></div>
    `;

    trendChartCard.innerHTML = `
      <div class="trendChartWrap">
        <div class="trendTooltip" id="trendTooltip" role="status" aria-live="polite"></div>
        <svg class="trendSvg" viewBox="0 0 ${width} ${height}" role="img" aria-label="세션 수와 이벤트 수 추이 그래프">
          ${[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padTop + usableHeight * ratio;
            return `<line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="#e8eef6" stroke-width="1" stroke-dasharray="4 5" />`;
          }).join("")}
          <line x1="${padX}" y1="${height - padBottom}" x2="${width - padX}" y2="${height - padBottom}" stroke="#dbe3ef" stroke-width="1" />
          <polyline fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" points="${toPolyline(sessions)}"></polyline>
          <polyline fill="none" stroke="#14b8a6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${toPolyline(events)}"></polyline>
          ${trend.map((item, index) => `
            <g class="trendPointGroup" tabindex="0" data-index="${index}" data-tooltip="${escapeHtml(tooltipHtml(index))}" data-x="${pointX(index)}" data-y="${Math.min(pointY(sessions[index]), pointY(events[index]))}">
              <line class="trendHoverLine" x1="${pointX(index)}" y1="${padTop}" x2="${pointX(index)}" y2="${height - padBottom}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 4" />
              <circle class="trendHoverPoint" cx="${pointX(index)}" cy="${pointY(sessions[index])}" r="7" fill="rgba(99,102,241,.18)"></circle>
              <circle cx="${pointX(index)}" cy="${pointY(sessions[index])}" r="4.5" fill="#6366f1"></circle>
              <circle class="trendHoverPoint" cx="${pointX(index)}" cy="${pointY(events[index])}" r="6" fill="rgba(20,184,166,.18)"></circle>
              <circle cx="${pointX(index)}" cy="${pointY(events[index])}" r="3.8" fill="#14b8a6"></circle>
              <rect class="trendHoverBand" x="${Math.max(0, pointX(index) - (usableWidth / Math.max(count - 1, 1) / 2))}" y="0" width="${Math.max(28, usableWidth / Math.max(count - 1, 1))}" height="${height}" fill="transparent"></rect>
            </g>
          `).join("")}
        </svg>
        <div class="trendAxisLabelRow" style="grid-template-columns: repeat(${count}, minmax(0, 1fr));">${axisLabels.map((item) => `<span class="trendAxisLabel${item.visible ? "" : " is-empty"}" title="${escapeHtml(item.label)}">${item.visible ? escapeHtml(item.label) : ""}</span>`).join("")}</div>
      </div>`;

    const tooltip = trendChartCard.querySelector("#trendTooltip");
    const svg = trendChartCard.querySelector(".trendSvg");
    const showTooltip = (group) => {
      if (!tooltip || !svg || !group) return;
      const x = Number(group.dataset.x) || 0;
      const y = Number(group.dataset.y) || 0;
      const viewBox = svg.viewBox.baseVal;
      const svgRect = svg.getBoundingClientRect();
      const left = (x / viewBox.width) * svgRect.width;
      const top = (y / viewBox.height) * svgRect.height;
      tooltip.innerHTML = group.dataset.tooltip || "";
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(40, top)}px`;
      tooltip.classList.add("is-visible");
    };
    const hideTooltip = () => tooltip?.classList.remove("is-visible");
    trendChartCard.querySelectorAll(".trendPointGroup").forEach((group) => {
      group.addEventListener("mouseenter", () => showTooltip(group));
      group.addEventListener("focus", () => showTooltip(group));
      group.addEventListener("mouseleave", hideTooltip);
      group.addEventListener("blur", hideTooltip);
    });
  }

  function renderSdkStatus(summary) {
    if (!sdkStatusBadge || !sdkStatusText) return;
    const sdk = summary?.sdk_status;
    if (!sdk) {
      sdkStatusBadge.className = "sdkStatusBadge unknown";
      sdkStatusBadge.textContent = "수신 정보 없음";
      sdkStatusText.textContent = "SDK 연동 상태를 아직 판단할 수 없습니다.";
      return;
    }
    sdkStatusBadge.className = `sdkStatusBadge ${sdk.status || "unknown"}`;
    sdkStatusBadge.textContent = sdk.label || "수신 정보 없음";
    sdkStatusText.textContent = sdk.last_event_ts
      ? `마지막 이벤트 ${fmtDate(sdk.last_event_ts)} (${formatRelativeTime(sdk.last_event_ts)}) · 최근 5분 ${fmtInt(sdk.recent_events_5m)}건`
      : "연동 상태를 판단할 수 있는 수신 정보가 없습니다.";
  }

  function renderJourneyFlow(summary) {
    if (!journeyFlow) return;
    const journey = summary?.journey;
    if (!journey?.ok || !Array.isArray(journey.steps) || !journey.steps.some((step) => Number(step.entered_sessions) > 0)) {
      journeyFlow.innerHTML = '<div class="emptyState">선택한 기간에 수집된 이동 흐름 데이터가 없습니다.<br/>충분한 page_view 데이터가 쌓이면 이 영역에 표시됩니다.</div>';
      return;
    }

    journeyFlow.innerHTML = journey.steps.map((step, index) => {
      const entered = Number(step.entered_sessions) || 0;
      const nextRate = typeof step.next_step_rate === "number" ? fmtPct(step.next_step_rate) : "—";
      const dropRate = typeof step.drop_rate === "number" ? fmtPct(step.drop_rate) : "—";
      const nextCount = Number(step.next_step_sessions) || 0;
      const highDrop = step.high_drop === true;
      return `<article class="journeyStep ${highDrop ? "highDrop" : ""}">
        <div class="journeyStepTitle">
          <span class="journeyStepName">${escapeHtml(step.label || journeyStageName(step.key))}</span>
          ${highDrop ? '<span class="badge high">높은 이탈</span>' : (index === journey.steps.length - 1 ? '<span class="badge running">완료</span>' : '')}
        </div>
        <div class="journeyStats">
          <div>진입 세션 <span class="journeyStatValue mono">${fmtInt(entered)}</span></div>
          <div>다음 단계 이동 <span class="journeyStatValue mono">${nextRate}</span></div>
          <div>이탈률 <span class="journeyStatValue mono">${dropRate}</span></div>
        </div>
        <div class="journeyHint">${index === journey.steps.length - 1 ? '구매 완료 단계입니다.' : `다음 단계로 이동한 세션 ${fmtInt(nextCount)}건`}</div>
      </article>`;
    }).join("");
  }

  function buildProductInsightModel(insightData, journeySummary, labelSummary) {
    const insights = Array.isArray(insightData?.output?.insights) ? insightData.output.insights : [];
    const outputStatus = insightData?.output?.status || "ready";
    const nextSteps = Array.isArray(insightData?.output?.next_steps) ? insightData.output.next_steps : [];
    const labels = mergeLabelSummary(labelSummary).filter((item) => item.sessions > 0);
    const topLabel = labels.slice().sort((a, b) => b.sessions - a.sessions)[0] || null;
    const journeySteps = Array.isArray(journeySummary?.journey?.steps) ? journeySummary.journey.steps : [];
    const highDropSteps = journeySteps.filter((step) => typeof step.drop_rate === "number" && step.drop_rate >= 0.5).slice(0, 2);
    const insightSummary = insightData?.output?.summary && typeof insightData.output.summary === "object" ? insightData.output.summary : null;

    const cleanText = (value) => String(value == null ? "" : value).trim();
    const firstText = (value) => Array.isArray(value) ? cleanText(value[0]) : cleanText(value);
    const metricName = (metric) => ({
      "checkout_complete / sessions": "결제 완료 비율",
      "checkout_entered / sessions": "결제 단계 진입 비율",
      page_view_to_click_rate: "화면 조회 후 클릭 비율",
      "error_count / sessions": "세션당 오류 발생 정도",
      price_interaction_count: "가격/혜택 관련 상호작용 수",
    }[cleanText(metric)] || cleanText(metric));
    const formatImpact = (impact) => {
      if (!impact || typeof impact !== "object") return "";
      const parts = [];
      const metric = metricName(impact.primary_metric);
      if (metric) parts.push(metric);
      if (typeof impact.affected_sessions === "number" && isFinite(impact.affected_sessions)) parts.push(`영향 세션 ${fmtInt(impact.affected_sessions)}`);
      if (typeof impact.share === "number" && isFinite(impact.share)) parts.push(`비중 ${fmtPct(impact.share)}`);
      return parts.join(" · ");
    };
    const compactEvidence = (evidence) => {
      if (!Array.isArray(evidence)) return "";
      return evidence.map(cleanText).filter(Boolean).slice(0, 2).join(" · ");
    };

    const summary = {
      headline: cleanText(insightSummary?.headline),
      plainExplanation: cleanText(insightSummary?.plain_explanation),
      firstCheck: cleanText(insightSummary?.top_priority_reason),
    };
    const summaryParts = [summary.headline, summary.plainExplanation, summary.firstCheck].filter(Boolean);
    if (highDropSteps[0]) {
      summaryParts.push(`${highDropSteps[0].label} 단계에서 이탈이 상대적으로 높게 나타났습니다.`);
    }
    if (topLabel) {
      summaryParts.push(`${labelName(topLabel.label)} 유형이 전체 세션의 ${fmtPct(topLabel.share)}로 가장 높은 비중을 보입니다.`);
    }
    if (!summaryParts.length && insights.length) {
      summaryParts.push("선택한 기간 동안 수집된 UX 패턴을 바탕으로 주요 문제를 요약했습니다.");
    }

    const problemCards = [];
    highDropSteps.forEach((step) => {
      problemCards.push({
        title: `${step.label} 이후 전환 약화`,
        priority: step.high_drop ? "high" : "medium",
        where: step.label,
        metric: `다음 단계 이동률 ${fmtPct(step.next_step_rate)} · 이탈률 ${fmtPct(step.drop_rate)}`,
        plainExplanation: `${step.label} 단계에서 다음 흐름으로 이어지지 않는 세션이 많아 보입니다. CTA 배치나 정보 전달을 우선 확인해볼 수 있습니다.`,
        evidenceBullets: [`다음 단계 이동률 ${fmtPct(step.next_step_rate)}`, `이탈률 ${fmtPct(step.drop_rate)}`],
        nextBestAction: `${step.label} 단계의 CTA 위치와 문구가 명확한지 먼저 확인하세요.`,
        riskNote: "표본이 적다면 이탈 원인을 확정하기 어렵습니다.",
      });
    });
    insights.slice(0, Math.max(0, 3 - problemCards.length)).forEach((item) => {
      const relatedLabel = item.label ? labelName(item.label) : "";
      const impactText = formatImpact(item.impact);
      const evidenceText = compactEvidence(item.evidence);
      const fallbackCause = firstText(item.possible_causes);
      problemCards.push({
        title: cleanText(item.title) || cleanText(item.where) || relatedLabel || "우선 확인 포인트",
        priority: item.priority || "low",
        where: cleanText(item.where) || relatedLabel || "확인 위치 미상",
        metric: impactText || (topLabel && item.label === topLabel.label ? `유형 비중 ${fmtPct(topLabel.share)}` : "근거 지표 확인 필요"),
        priorityReason: cleanText(item.priority_reason) || fallbackCause || "현재 데이터만으로는 원인을 단정하기 어렵지만 우선 확인이 필요한 신호입니다.",
        evidence: evidenceText,
        plainExplanation: cleanText(item.plain_explanation) || cleanText(item.operator_summary) || fallbackCause || "데이터를 더 확인해야 하는 사용자 흐름입니다.",
        evidenceBullets: (Array.isArray(item.evidence_bullets) && item.evidence_bullets.length ? item.evidence_bullets : item.evidence || []).map(cleanText).filter(Boolean).slice(0, 3),
        nextBestAction: cleanText(item.next_best_action) || firstText(item.recommended_actions) || firstText(item.validation_methods) || "관련 이벤트 수집 상태를 먼저 확인하세요.",
        riskNote: cleanText(item.risk_note) || cleanText(item.confidence_reason) || "데이터가 적으면 확정적인 결론으로 보기 어렵습니다.",
        evidenceLevel: cleanText(item.evidence_level),
      });
    });

    const actions = [];
    highDropSteps.forEach((step) => {
      actions.push(`${step.label} 단계의 CTA 위치와 정보 밀도를 먼저 점검해볼 수 있습니다.`);
    });
    insights.forEach((item) => {
      (Array.isArray(item.recommended_actions) ? item.recommended_actions : []).forEach((action) => {
        const text = cleanText(action);
        if (text) actions.push(text);
      });
      if (Array.isArray(item.validation_methods) && item.validation_methods[0]) actions.push(item.validation_methods[0]);
    });

    const experiments = [];
    insights.forEach((item) => {
      (Array.isArray(item.recommended_experiments) ? item.recommended_experiments : []).forEach((exp) => {
        const brief = cleanText(item.experiment_brief);
        if (brief) experiments.push({ brief, hypothesis: exp?.hypothesis || "", change: exp?.change || "", metric: metricName(exp?.primary_metric || "") });
        else if (exp?.hypothesis || exp?.change) experiments.push({ hypothesis: exp.hypothesis || "", change: exp.change || "", metric: metricName(exp.primary_metric || "지표 확인 필요") });
      });
    });

    return {
      status: outputStatus,
      fallbackReason: insightData?.fallback_reason || insightData?.output?.fallbackReason || null,
      nextSteps,
      hasData: outputStatus === "ready" && Boolean(summaryParts.length || problemCards.length || actions.length || experiments.length),
      summary,
      problems: problemCards.slice(0, 3),
      actions: Array.from(new Set(actions)).slice(0, 4),
      experiments: experiments.slice(0, 4),
    };
  }

  function buildInsightsMarkdown(insightData, eventSummary, labelSummary) {
    const insights = Array.isArray(insightData?.output?.insights) ? insightData.output.insights : [];
    const model = buildProductInsightModel(insightData, eventSummary, labelSummary);
    if (model.status !== "ready" || !insights.length || !model.hasData) return "";
    const period = getPeriodRange();
    const lines = [
      "# AI UX 인사이트",
      "",
      "## 전체 요약",
      `- 한 줄 결론: ${model.summary.headline || "정리된 결론 없음"}`,
      `- 쉽게 말하면: ${model.summary.plainExplanation || "사용자 행동 데이터를 바탕으로 먼저 확인할 흐름을 정리했습니다."}`,
      `- 지금 가장 먼저 볼 것: ${model.summary.firstCheck || "CTA 클릭 이벤트와 결제 완료 이벤트 수집을 확인하세요."}`,
      "",
      "## 주요 문제",
    ];
    if (model.problems.length) {
      model.problems.forEach((item, index) => {
        const evidence = item.evidenceBullets && item.evidenceBullets.length ? item.evidenceBullets : [item.evidence || item.metric].filter(Boolean);
        lines.push(
          `### ${index + 1}. ${item.title}`,
          `- 위치: ${item.where || "확인 위치 미상"}`,
          `- 우선순위: ${item.priority === "high" ? "높음" : item.priority === "medium" ? "보통" : "낮음"}`,
          `- 쉽게 말하면: ${item.plainExplanation || item.priorityReason || "우선 확인이 필요한 신호입니다."}`,
          `- 근거: ${evidence.join(" / ") || item.metric || "근거 지표 확인 필요"}`,
          `- 먼저 확인할 것: ${item.nextBestAction || "관련 이벤트 수집 상태를 먼저 확인하세요."}`,
          `- 주의할 점: ${item.riskNote || "표본이 적으면 확정적인 결론으로 보기 어렵습니다."}`,
          "",
        );
      });
    } else {
      lines.push("- 아직 주요 문제를 정리할 수 있는 데이터가 부족합니다.", "");
    }
    lines.push("## 권장 액션");
    if (model.actions.length) model.actions.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
    else lines.push("1. 아직 권장 액션을 만들 수 있는 데이터가 부족합니다.");
    lines.push("", "## 관련 실험 제안");
    if (model.experiments.length) {
      model.experiments.forEach((item, index) => {
        lines.push(
          `### ${index + 1}. 실험 제안`,
          item.brief ? `- 요약: ${item.brief}` : "",
          item.hypothesis ? `- 가설: ${item.hypothesis}` : "",
          item.change ? `- 바꿀 것: ${item.change}` : "",
          item.metric ? `- 확인할 지표: ${item.metric}` : "",
          "",
        );
      });
    } else {
      lines.push("- 현재 인사이트 기준으로 바로 연결할 실험 제안이 없습니다.", "");
    }
    lines.push(
      "## 메타 정보",
      `- 사이트 ID: ${getCurrentSiteId()}`,
      `- 기간: ${period.label}`,
      `- 생성 시각: ${window.UxExportUtils.formatTimestampForMarkdown(Date.now())}`,
      `- 총 이벤트: ${fmtInt(eventSummary?.summary?.total_events)}`,
      "- 출처: Dashboard AI UX 인사이트",
      "",
    );
    return `${lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim()}\n`;
  }

  function hasExportableInsights() {
    return Boolean(buildInsightsMarkdown(state.generatedInsightData, state.lastEventSummary, state.lastLabelSummary));
  }

  function setTemporaryButtonText(button, text, delay = 1200) {
    if (!button) return;
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => { button.textContent = original; }, delay);
  }

  function renderInsightExportButtons() {
    const enabled = hasExportableInsights() && !state.insightGenerationPending;
    [copyInsightsMarkdownBtn, downloadInsightsMarkdownBtn].forEach((button) => {
      if (!button) return;
      button.disabled = !enabled;
      button.title = enabled ? "생성된 인사이트를 Markdown으로 내보냅니다." : "다운로드할 인사이트가 없습니다.";
    });
  }

  async function showMetrics(key) {
    const experiment = state.experiments.find((item) => item.key === key) || null;
    const metrics = state.selectedExperimentKey === key && state.selectedExperimentMetrics
      ? state.selectedExperimentMetrics
      : await fetchMetrics(key).catch((error) => ({ ok: false, reason: String(error) }));

    state.selectedExperimentKey = key;
    state.selectedExperimentMetrics = metrics;
    state.overlayPreviewReady = false;
    if (experimentSelect) experimentSelect.value = key;
    metricKeyEl.textContent = key;
    updateCopilotExperimentUI();
    renderExperimentSummary(experiment, metrics);

    if (modalExperimentTitle) modalExperimentTitle.textContent = key;
    if (modalExperimentPeriod) modalExperimentPeriod.textContent = experiment ? `실험 기간 · ${formatExperimentWindow(experiment)}` : "실험 기간 정보 없음";
    if (modalExperimentStatus) {
      modalExperimentStatus.className = `badge ${experiment?.status === "running" ? "running" : experiment?.status === "paused" ? "paused" : experiment?.status === "draft" ? "draft" : "label"}`;
      modalExperimentStatus.textContent = statusName(experiment?.status);
    }
    const lead = getLeadingVariant(metrics);
    if (modalExperimentLead) {
      modalExperimentLead.className = `badge ${lead.tone}`;
      modalExperimentLead.textContent = lead.text;
    }
    if (modalVariantAName) modalVariantAName.textContent = getVariantName("A", experiment);
    if (modalVariantBName) modalVariantBName.textContent = getVariantName("B", experiment);
    if (modalParticipantSessions) modalParticipantSessions.textContent = fmtInt((Number(metrics?.A?.sessions) || 0) + (Number(metrics?.B?.sessions) || 0));
    if (modalPeriodResultStatus) {
      modalPeriodResultStatus.textContent = metrics?.ok
        ? (((Number(metrics?.A?.sessions) || 0) + (Number(metrics?.B?.sessions) || 0)) > 0 ? `${getPeriodRange().label} 결과` : "선택한 기간에 해당 실험 데이터가 없습니다.")
        : "결과를 불러오지 못했습니다.";
    }
    renderExperimentHistory(experiment);

    cvrA.textContent = cvrB.textContent = "…";
    ctrA.textContent = ctrB.textContent = "…";
    brA.textContent = brB.textContent = "…";
    durationA.textContent = durationB.textContent = "…";
    depthA.textContent = depthB.textContent = "…";
    cvrDelta.textContent = brDelta.textContent = durationDelta.textContent = depthDelta.textContent = ctrDelta.textContent = "계산 중…";
    countsBox.textContent = "불러오는 중…";
    topA.textContent = topB.textContent = "…";

    if (!metrics?.ok) {
      renderExperimentResultHero(metrics);
      countsBox.textContent = String(metrics?.reason || "결과를 불러오지 못했습니다.");
      topA.textContent = topB.textContent = "클릭 데이터 없음";
      if (experimentInterpretation) experimentInterpretation.textContent = "현재 실험 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      if (experimentMetricsDialog && !experimentMetricsDialog.open) experimentMetricsDialog.showModal();
      return;
    }

    renderExperimentResultHero(metrics);

    cvrA.textContent = formatMetricValue(metrics.A?.cvr, "percent");
    cvrB.textContent = formatMetricValue(metrics.B?.cvr, "percent");
    ctrA.textContent = formatMetricValue(metrics.A?.ctr, "percent");
    ctrB.textContent = formatMetricValue(metrics.B?.ctr, "percent");
    brA.textContent = formatMetricValue(metrics.A?.bounce_rate, "percent");
    brB.textContent = formatMetricValue(metrics.B?.bounce_rate, "percent");
    durationA.textContent = formatMetricValue(metrics.A?.avg_duration_ms, "duration");
    durationB.textContent = formatMetricValue(metrics.B?.avg_duration_ms, "duration");
    depthA.textContent = formatMetricValue(metrics.A?.avg_depth, "depth");
    depthB.textContent = formatMetricValue(metrics.B?.avg_depth, "depth");

    setMetricDelta(cvrDelta, { aValue: metrics.A?.cvr, bValue: metrics.B?.cvr, kind: "percent", metricLabel: "전환율", preferredDirection: "higher", positiveText: "전환율 증가", negativeText: "전환율 감소" });
    setMetricDelta(brDelta, { aValue: metrics.A?.bounce_rate, bValue: metrics.B?.bounce_rate, kind: "percent", metricLabel: "이탈률", preferredDirection: "lower", positiveText: "이탈률 개선", negativeText: "이탈률 악화" });
    setMetricDelta(durationDelta, { aValue: metrics.A?.avg_duration_ms, bValue: metrics.B?.avg_duration_ms, kind: "duration", metricLabel: "평균 체류 시간", preferredDirection: "higher", positiveText: "체류 시간 증가", negativeText: "체류 시간 감소" });
    setMetricDelta(depthDelta, { aValue: metrics.A?.avg_depth, bValue: metrics.B?.avg_depth, kind: "depth", metricLabel: "평균 방문 페이지 수", preferredDirection: "higher", positiveText: "방문 깊이 증가", negativeText: "방문 깊이 감소" });
    setMetricDelta(ctrDelta, { aValue: metrics.A?.ctr, bValue: metrics.B?.ctr, kind: "percent", metricLabel: "클릭률", preferredDirection: "higher", positiveText: "클릭률 증가", negativeText: "클릭률 감소" });

    countsBox.innerHTML = renderCountsTable(metrics);

    topA.textContent = renderTop(metrics.A?.top_clicked_elements);
    topB.textContent = renderTop(metrics.B?.top_clicked_elements);
    if (experimentInterpretation) experimentInterpretation.textContent = buildInterpretation(metrics);

    if (experimentMetricsDialog && !experimentMetricsDialog.open) experimentMetricsDialog.showModal();
  }

  // ─── 렌더링: 라벨 분포 바 ───
  function renderLabelBars(summary) {
    if (!labelBars) {
      warnMissingDomElement("labelBars", "Label distribution bars");
      return;
    }
    if (state.labelsError) {
      if (labelDonutTotal) labelDonutTotal.textContent = "—";
      if (labelDonut) labelDonut.classList.add("empty");
      labelBars.innerHTML = '<div class="emptyState">UX 라벨 데이터를 불러오지 못했습니다.<br/>Redis 또는 Kafka Consumer 상태를 확인해 주세요.</div>';
      return;
    }
    const isClustering = state.labelMode === "clustering";
    const fullSummary = isClustering ? toClusteringDisplaySummary(summary) : mergeLabelSummary(summary);
    const totalSessions = fullSummary.reduce((sum, item) => sum + item.sessions, 0);
    if (labelDonutTotal) labelDonutTotal.textContent = fmtInt(totalSessions);
    if (labelDonut) {
      labelDonut.classList.toggle("empty", totalSessions === 0);
      labelDonut.style.setProperty("--donut-bg", buildDonutGradient(fullSummary));
    }

    if (isClustering && fullSummary.length === 0) {
      labelBars.innerHTML = '<div class="emptyState">아직 클러스터링 데이터가 없습니다.<br/>세션이 100개 이상 쌓이면 자동으로 학습합니다.</div>';
      return;
    }

    labelBars.innerHTML = fullSummary.map((item) => {
      const share = typeof item.share === "number" ? item.share : 0;
      const pct = Math.max(0, Math.min(100, share * 100));
      const desc = isClustering
        ? (state.clusteringFallbackUsed ? "규칙 기반 분류 (학습 데이터 부족)" : "비지도 학습으로 발견된 유형")
        : (item.sessions === 0 ? "아직 감지되지 않음" : labelDescription(item.label));
      return `<div class="barRow ${item.sessions === 0 ? "mutedBar" : ""}">
        <div class="barMeta"><span>${escapeHtml(item.label)}</span><span class="mono">${fmtInt(item.sessions)} / ${fmtPct(share)}</span></div>
        <div class="labelDescription">${escapeHtml(desc)}</div>
        <div class="barTrack"><div class="barFill" style="width:${pct.toFixed(2)}%;background:${escapeHtml(item.color)}"></div></div>
      </div>`;
    }).join("");
  }

  // ─── 렌더링: 개선 기회 ───
  function renderOpportunities(insights) {
    if (state.insightGenerationPending) {
      opportunityList.innerHTML = '<div class="emptyState">AI 인사이트를 도출하는 중입니다. 완료되면 우선 확인 포인트가 여기에 표시됩니다.</div>';
      if (uxPriorityHint) uxPriorityHint.textContent = "AI 인사이트를 생성하는 중입니다.";
      return;
    }
    if (state.insightGenerationError && !state.generatedInsightData) {
      opportunityList.innerHTML = `<div class="emptyState">인사이트 생성에 실패했습니다.<br/>${escapeHtml(state.insightGenerationError)}</div>`;
      if (uxPriorityHint) uxPriorityHint.textContent = "인사이트 생성에 실패했습니다.";
      return;
    }
    if (!state.generatedInsightData) {
      opportunityList.innerHTML = '<div class="emptyState">인사이트 도출 버튼을 누르면 우선 확인 포인트가 여기에 표시됩니다.</div>';
      if (uxPriorityHint) uxPriorityHint.textContent = state.insightGenerationError || "버튼을 눌러 우선 확인 항목을 생성해 주세요.";
      return;
    }
    if (!Array.isArray(insights) || !insights.length) {
      opportunityList.innerHTML = '<div class="emptyState">인사이트가 생기면 요약이 여기에 올라옵니다.</div>';
      if (uxPriorityHint) uxPriorityHint.textContent = "우선 확인이 필요한 항목을 아직 만들지 못했습니다.";
      return;
    }
    const priorityKo = { high: "긴급", medium: "보통", low: "낮음" };
    const topItem = insights[0];
    if (uxPriorityHint) {
      uxPriorityHint.textContent = topItem
        ? `${labelName(topItem.label)} · ${topItem.where || "우선 확인 포인트"}`
        : "우선 확인이 필요한 항목 수";
    }
    opportunityList.innerHTML = insights.slice(0, 3).map((i) => `
      <div class="opportunityItem">
        <div class="opportunityTitle">
          <strong>${escapeHtml(i.where || labelName(i.label))}</strong>
          <span class="badge ${escapeHtml(i.priority || "low")}">${escapeHtml(priorityKo[i.priority] || i.priority || "낮음")}</span>
        </div>
        <div class="opportunityMeta">
          <span class="badge label">${escapeHtml(labelName(i.label))}</span>
          ${i.where ? `<span class="badge label">${escapeHtml(i.where)}</span>` : ""}
        </div>
        <div class="opportunityDesc">${escapeHtml((Array.isArray(i.possible_causes) && i.possible_causes[0]) || i.where || "최근 수집된 UX 패턴을 기반으로 우선 확인이 필요한 항목입니다.")}</div>
        <div class="opportunityAction"><strong>권장 액션</strong> · ${escapeHtml((Array.isArray(i.recommended_actions) && i.recommended_actions[0]) || (Array.isArray(i.validation_methods) && i.validation_methods[0]) || (Array.isArray(i.recommended_experiments) && (i.recommended_experiments[0]?.hypothesis || i.recommended_experiments[0]?.change)) || "관련 페이지와 사용자 행동을 먼저 확인해 주세요.")}</div>
      </div>
    `).join("");
  }

  function getTopOpportunityHeroModel(labelSummary, eventSummary) {
    const data = state.generatedInsightData;
    const output = data?.output || {};
    const summary = output.summary && typeof output.summary === "object" ? output.summary : {};
    const insights = Array.isArray(output.insights) ? output.insights : [];
    const first = insights[0] || null;
    const firstCause = Array.isArray(first?.possible_causes) ? first.possible_causes[0] : "";
    const firstAction = Array.isArray(first?.recommended_actions) ? first.recommended_actions[0] : "";
    const title = String(summary.headline || first?.title || "오늘 먼저 볼 UX 포인트").trim();
    const body = String(summary.plain_explanation || summary.top_priority_reason || first?.plain_explanation || firstCause || firstAction || "").trim();
    const period = getPeriodRange().label;

    if (state.insightGenerationPending) {
      return {
        title: "오늘 먼저 볼 UX 포인트를 도출하는 중입니다",
        body: "선택한 기간의 세션, 행동 유형, 사용자 흐름을 바탕으로 가장 먼저 확인할 문제 후보를 정리하고 있습니다.",
        metaItems: [`${period} 기준`, "AI 인사이트 생성 중"],
        tone: "loading",
      };
    }

    if (state.insightGenerationError && !data) {
      return {
        title: "인사이트 생성에 실패했습니다",
        body: "Redis, Kafka Consumer, LLM 설정 상태를 확인한 뒤 다시 시도해 주세요.",
        metaItems: [`${period} 기준`, "생성 실패"],
        tone: "error",
      };
    }

    if (!data || output.status !== "ready" || !insights.length) {
      const labels = mergeLabelSummary(labelSummary).filter((item) => Number(item.sessions) > 0);
      const top = labels.slice().sort((a, b) => b.sessions - a.sessions)[0] || null;
      return {
        title: "오늘 먼저 볼 UX 포인트",
        body: top
          ? `${labelName(top.label)} 유형이 ${fmtPct(top.share)}로 가장 높습니다. 인사이트 도출을 누르면 문제 후보와 권장 액션을 더 자세히 정리합니다.`
          : "인사이트 도출 버튼을 누르면 선택한 기간의 핵심 UX 포인트가 여기에 표시됩니다.",
        metaItems: [`${period} 기준`, eventSummary?.total_events ? `이벤트 ${fmtInt(eventSummary.total_events)}건` : "세션과 행동 패턴 요약"],
        tone: "empty",
      };
    }

    const priorityKo = { high: "우선순위 높음", medium: "우선순위 보통", low: "우선순위 낮음" };
    const affectedSessions = Number(first?.impact?.affected_sessions);
    const share = Number(first?.impact?.share);
    const metaItems = [
      `${period} 기준`,
      first?.priority ? priorityKo[first.priority] || first.priority : "우선 확인 포인트",
      Number.isFinite(affectedSessions) ? `영향 세션 ${fmtInt(affectedSessions)}건` : "",
      Number.isFinite(share) ? `비중 ${fmtPct(share)}` : "",
      first?.where ? String(first.where) : "",
    ].filter(Boolean);

    return {
      title,
      body: body || "수집된 행동 패턴에서 우선 확인할 UX 문제 후보가 감지되었습니다.",
      metaItems,
      tone: first?.priority || "ready",
    };
  }

  function renderTopOpportunityHero(labelSummary, eventSummary) {
    if (!uxFocusTitle || !uxFocusSummary || !uxFocusMeta) return;
    const model = getTopOpportunityHeroModel(labelSummary, eventSummary);
    uxFocusTitle.textContent = model.title;
    uxFocusSummary.textContent = model.body;
    uxFocusMeta.innerHTML = model.metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
    if (uxFocusGenerateBtn) {
      uxFocusGenerateBtn.disabled = state.insightGenerationPending;
      uxFocusGenerateBtn.textContent = state.insightGenerationPending ? "도출 중…" : "인사이트 도출";
    }
  }

  function getGeneratedInsightItems() {
    return Array.isArray(state.generatedInsightData?.output?.insights) ? state.generatedInsightData.output.insights : [];
  }

  function resetGeneratedInsights() {
    state.insightGenerationToken += 1;
    state.generatedInsightData = null;
    state.insightGenerationPending = false;
    state.insightGenerationError = null;
  }

  function renderInsightGenerationButton() {
    if (!generateInsightsBtn) return;
    generateInsightsBtn.disabled = state.insightGenerationPending;
    generateInsightsBtn.textContent = state.insightGenerationPending ? "도출 중…" : "인사이트 도출";
    renderInsightExportButtons();
  }

  function renderGeneratedInsightSections() {
    renderInsights(state.generatedInsightData, state.lastEventSummary, state.lastLabelSummary);
    renderOpportunities(getGeneratedInsightItems());
    renderTopOpportunityHero(state.lastLabelSummary, state.lastEventSummary);
  }

  // ─── 렌더링: 라벨 요약 테이블 ───
  function renderLabelSummary(summary) {
    if (!labelSummaryBody) {
      warnMissingDomElement("labelSummaryBody", "Label summary table");
      return;
    }

    const isClustering = state.labelMode === "clustering";

    if (labelsModeHint) {
      labelsModeHint.textContent = isClustering
        ? "비지도 학습 클러스터 기반 세션 분포"
        : "세션 수·비중·체류·방문 깊이·결제까지 갔는지";
    }
    if (clusteringNotice) {
      if (isClustering && state.clusteringFallbackUsed) {
        clusteringNotice.hidden = false;
        clusteringNotice.textContent = "⚠️  아직 클러스터링 학습 데이터가 부족합니다 (100 세션 미만). 현재는 규칙 기반 분류를 대신 사용합니다.";
      } else if (isClustering && state.clusteringTaxonomy) {
        const count = Object.values(state.clusteringTaxonomy).filter((e) => e.status === "active").length;
        clusteringNotice.hidden = false;
        clusteringNotice.textContent = `✅  비지도 학습 활성화 — LLM이 ${count}개 유형 발견`;
      } else {
        clusteringNotice.hidden = true;
      }
    }

    if (state.labelsError) {
      labelSummaryBody.innerHTML = '<tr><td colspan="6" class="emptyState">UX 라벨 데이터를 불러오지 못했습니다.<br/>Redis 또는 Kafka Consumer 상태를 확인해 주세요.</td></tr>';
      return;
    }

    const displaySummary = isClustering
      ? (Array.isArray(summary) ? summary.filter((item) => item.sessions > 0) : [])
      : summary;

    if (!Array.isArray(displaySummary) || !displaySummary.length) {
      const msg = isClustering
        ? "아직 클러스터링 데이터가 없어요. 세션이 100개 이상 쌓이면 자동으로 학습합니다."
        : "세션 데이터가 없어요.";
      labelSummaryBody.innerHTML = `<tr><td colspan="6" class="emptyState">${msg}</td></tr>`;
      return;
    }

    labelSummaryBody.innerHTML = displaySummary.map((item) => `<tr>
      <td><span class="badge label">${escapeHtml(item.label)}</span></td>
      <td class="mono">${fmtInt(item.sessions)}</td>
      <td class="mono">${fmtPct(item.share)}</td>
      <td class="mono">${fmtDuration(item.metrics?.avg_duration_ms)}</td>
      <td class="mono">${typeof item.metrics?.avg_depth === "number" ? item.metrics.avg_depth.toFixed(1) : "—"}</td>
      <td class="mono">${fmtPct(item.metrics?.checkout_complete_rate)}</td>
    </tr>`).join("");
  }

  // ─── 렌더링: 최근 세션 ───
  function renderSessions(sessions) {
    if (!sessionsBody) {
      warnMissingDomElement("sessionsBody", "Recent sessions table");
      return;
    }
    if (sessionsSourceLabel) {
      sessionsSourceLabel.textContent = state.sessionsSource === "design_preview"
        ? "Design preview data"
        : state.sessionsSource === "redis"
        ? "Redis read model"
        : "최근 방문 기록";
    }
    if (state.sessionsError) {
      sessionsBody.innerHTML = '<tr><td colspan="9" class="emptyState">실시간 세션 데이터 연결 실패<br/>Redis 또는 Kafka Consumer 상태를 확인해 주세요.</td></tr>';
      return;
    }
    if (!Array.isArray(sessions) || !sessions.length) {
      sessionsBody.innerHTML = '<tr><td colspan="9" class="emptyState">세션 데이터가 없어요.</td></tr>';
      return;
    }
    if (state.sessionsSource === "redis" && !sessions.some((entry) => entry && entry.summary)) {
      sessionsBody.innerHTML = sessions.map((s) => `<tr>
        <td class="mono">${escapeHtml(s.session_id || "—")}</td>
        <td><span class="badge running">라이브</span></td>
        <td class="mono">—</td>
        <td class="mono">${fmtDuration((Number(s.last_ts) || 0) - (Number(s.started_at) || 0))}</td>
        <td class="mono">${fmtInt(s.page_view_count)}</td>
        <td class="mono">${fmtInt(s.click_count)}</td>
        <td class="mono">${fmtInt(s.event_count)}</td>
        <td class="mono">${escapeHtml(s.max_step || "—")}</td>
        <td class="mono">${s.checkout_completed ? "완료" : (s.checkout_started ? "진입" : "없음")}</td>
      </tr>`).join("");
      return;
    }
    sessionsBody.innerHTML = sessions.map((entry) => {
      const sm = entry.summary || {};
      const lb = entry.label || {};
      return `<tr>
        <td class="mono">${escapeHtml(sm.session_id || "—")}</td>
        <td><span class="badge label">${escapeHtml(labelName(lb.label))}</span></td>
        <td class="mono">${fmtPct(lb.confidence)}</td>
        <td class="mono">${fmtDuration(sm.duration_ms)}</td>
        <td class="mono">${fmtInt(sm.page_views)}</td>
        <td class="mono">${fmtInt(sm.clicks)}</td>
        <td class="mono">${fmtInt(sm.depth)}</td>
        <td class="mono">${escapeHtml(sm.max_step || "—")}</td>
        <td class="mono">${sm.checkout_complete ? "완료" : (sm.checkout_entered ? "진입" : "없음")}</td>
      </tr>`;
    }).join("");
  }

  // ─── 렌더링: 인사이트 ───
  function renderInsights(data, eventSummary, labelSummary) {
    renderInsightGenerationButton();
    if (!insightsList) {
      warnMissingDomElement("insightsList", "AI insights section");
      return;
    }
    if (state.insightGenerationPending) {
      uxHighPriorityCount.textContent = "…";
      insightsList.innerHTML = '<div class="emptyState">선택한 기간의 AI UX 인사이트를 도출하는 중입니다.</div>';
      return;
    }
    if (state.insightGenerationError && !data) {
      uxHighPriorityCount.textContent = "—";
      insightsList.innerHTML = `<div class="emptyState">인사이트 생성에 실패했습니다.<br/>${escapeHtml(state.insightGenerationError)}</div>`;
      return;
    }
    if (!data) {
      uxHighPriorityCount.textContent = "—";
      insightsList.innerHTML = '<div class="emptyState">인사이트 도출 버튼을 누르면 선택한 기간의 AI UX 인사이트를 생성합니다.</div>';
      return;
    }
    const insights = Array.isArray(data?.output?.insights) ? data.output.insights : [];
    uxHighPriorityCount.textContent = String(insights.filter((i) => i.priority === "high").length);

    const model = buildProductInsightModel(data, eventSummary, labelSummary);
    if (model.status !== "ready" || !insights.length) {
      uxHighPriorityCount.textContent = "0";
      const summary = data?.output?.summary || {};
      const nextSteps = model.nextSteps.length ? model.nextSteps : [
        "SDK 이벤트 수집 상태 확인",
        "CTA 클릭 이벤트 수집 확인",
        "결제 완료 이벤트 수집 확인",
        "데이터를 더 모은 뒤 다시 인사이트 도출",
      ];
      insightsList.innerHTML = `
        <section class="productInsightStatusCard">
          <h3>${escapeHtml(summary.headline || "아직 AI 인사이트를 만들기에는 데이터가 부족합니다.")}</h3>
          <p>${escapeHtml(summary.plain_explanation || "이벤트는 일부 수집되고 있지만, 전환이나 세션 흐름을 판단할 만큼 충분하지 않습니다.")}</p>
          <div class="productInsightStatusGrid">
            <div>
              <strong>현재 확인된 내용</strong>
              <ul class="compactList">
                <li>${escapeHtml(summary.top_priority_reason || "이벤트 추적과 세션 집계가 정상인지 먼저 확인해야 합니다.")}</li>
                ${model.fallbackReason ? `<li>상태: ${escapeHtml(model.fallbackReason)}</li>` : ""}
              </ul>
            </div>
            <div>
              <strong>먼저 할 일</strong>
              <ol class="compactList">${nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
            </div>
          </div>
        </section>`;
      return;
    }
    if (!model.hasData) {
      insightsList.innerHTML = '<div class="emptyState">아직 AI 인사이트를 생성할 수 있는 데이터가 부족합니다.</div>';
      return;
    }

    insightsList.innerHTML = `
      <section class="productInsightSummary">
        <h3>전체 요약</h3>
        <div class="summaryExplainGrid">
          <div><strong>한 줄 결론</strong><p>${escapeHtml(model.summary.headline || "선택한 기간의 UX 상태를 요약할 수 있는 데이터가 아직 충분하지 않습니다.")}</p></div>
          <div><strong>쉽게 말하면</strong><p>${escapeHtml(model.summary.plainExplanation || "사용자 행동 데이터를 바탕으로 먼저 확인할 흐름을 정리했습니다.")}</p></div>
          <div><strong>지금 가장 먼저 볼 것</strong><p>${escapeHtml(model.summary.firstCheck || "CTA 클릭 이벤트와 결제 완료 이벤트가 정상적으로 수집되는지 확인하세요.")}</p></div>
        </div>
      </section>
      <div class="productInsightBlocks">
        <section class="productInsightBlock">
          <h3>주요 문제</h3>
          ${model.problems.length ? model.problems.map((item) => `
            <article class="productInsightProblemCard">
              <div class="insightHead">
                <div>
                  <div class="insightTitle">${escapeHtml(item.title)}</div>
                  <div class="muted">${escapeHtml(item.where)}</div>
                </div>
                <span class="badge ${escapeHtml(item.priority || "low")}">${escapeHtml(item.priority === "high" ? "높음" : item.priority === "medium" ? "보통" : "낮음")}</span>
              </div>
              <div class="productInsightMeta"><span class="badge label">${escapeHtml(item.metric)}</span></div>
              ${item.evidenceLevel ? `<div class="productInsightMeta"><span class="badge label">근거 ${escapeHtml(item.evidenceLevel)}</span></div>` : ""}
              <div class="insightSectionLabel">쉽게 말하면</div>
              <div class="insightText">${escapeHtml(item.plainExplanation || item.priorityReason || "현재 데이터만으로 원인을 단정하기 어렵지만 우선 확인이 필요한 신호입니다.")}</div>
              <div class="insightSectionLabel">근거</div>
              <ul class="compactList">${(item.evidenceBullets && item.evidenceBullets.length ? item.evidenceBullets : [item.evidence || item.metric]).filter(Boolean).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
              <div class="insightSectionLabel">먼저 확인할 것</div>
              <div class="insightText">${escapeHtml(item.nextBestAction || "관련 이벤트 수집 상태를 먼저 확인하세요.")}</div>
              <div class="insightSectionLabel">주의할 점</div>
              <div class="muted">${escapeHtml(item.riskNote || "표본이 적으면 확정적인 결론으로 보기 어렵습니다.")}</div>
            </article>
          `).join("") : '<div class="emptyState">아직 주요 문제를 정리할 수 있는 데이터가 부족합니다.</div>'}
        </section>
        <section class="productInsightBlock">
          <h3>권장 액션</h3>
          <ol class="compactList">${model.actions.length ? model.actions.map((item, index) => `<li><strong>${index + 1}순위:</strong> ${escapeHtml(item)}</li>`).join("") : '<li>아직 권장 액션을 만들 수 있는 데이터가 부족합니다.</li>'}</ol>
        </section>
        <section class="productInsightBlock">
          <h3>관련 실험 제안</h3>
          ${model.experiments.length ? model.experiments.map((item) => `<div class="experimentBrief">
            ${item.brief ? `<p>${escapeHtml(item.brief)}</p>` : ""}
            ${item.hypothesis ? `<div><strong>가설:</strong> ${escapeHtml(item.hypothesis)}</div>` : ""}
            ${item.change ? `<div><strong>바꿀 것:</strong> ${escapeHtml(item.change)}</div>` : ""}
            ${item.metric ? `<div><strong>확인할 지표:</strong> ${escapeHtml(item.metric)}</div>` : ""}
          </div>`).join("") : '<div class="emptyState">현재 인사이트 기준으로 바로 연결할 실험 제안이 없습니다.</div>'}
        </section>
      </div>`;
  }

  // ─── 렌더링: UX 개요 ───
  function renderUxOverview(summary, insightData, eventSummary) {
    const mergedSummary = mergeLabelSummary(summary);
    const totalSessions = mergedSummary.reduce((s, i) => s + (Number(i.sessions) || 0), 0);
    const top = mergedSummary.slice().sort((a, b) => b.sessions - a.sessions)[0] || null;

    uxTotalSessions.textContent = totalSessions > 0 ? fmtInt(totalSessions) : "—";
    uxTopLabel.textContent = top && top.sessions > 0 ? labelName(top.label) : "—";
    if (uxTopLabelHint) {
      uxTopLabelHint.textContent = top && top.sessions > 0
        ? `${labelName(top.label)}이 전체 세션의 ${fmtPct(top.share)}로 가장 높습니다. ${labelDescription(top.label)}`
        : "아직 가장 두드러진 이탈 유형이 감지되지 않았습니다.";
    }
    renderLabelBars(mergedSummary);
    renderInsights(insightData, eventSummary, mergedSummary);
  }

  // ─── 메인 렌더 ───
  async function render() {
    state.authUser = await fetchAuthMe();
    enforceAuthorizedSiteId();
    updatePeriodStatus();
    if (trendChartCard) trendChartCard.innerHTML = '<div class="chartState">불러오는 중…</div>';

    const [sites, exps, sessions, labelSummary, eventSummary, usersResult] = await Promise.all([
      fetchSites(),
      fetchExperiments(),
      fetchSessions(),
      fetchLabelsSummary(),
      fetchEventSummary().catch((error) => ({ ok: false, reason: String(error) })),
      state.authUser?.is_admin === true
        ? fetchUsers().then((users) => ({ users, error: null })).catch((error) => ({ users: [], error: String(error) }))
        : Promise.resolve({ users: [], error: null }),
    ]);

    state.sites = sites;
    state.siteConfig = getCurrentSiteConfig();
    state.experiments = exps;
    state.userFetchError = usersResult.error;
    state.lastEventSummary = eventSummary?.ok ? eventSummary : null;
    state.lastLabelSummary = labelSummary;
    if (DESIGN_PREVIEW_ENABLED && !state.generatedInsightData) {
      state.generatedInsightData = getDesignPreviewData().insights;
      state.insightGenerationError = null;
      state.insightGenerationPending = false;
    }
    syncNewUserSiteIds();

    if (!state.selectedExperimentKey && exps.length > 0) {
      state.selectedExperimentKey = exps[0].key || null;
      updateCopilotExperimentUI();
    }

    populateExperimentSelect(exps);

    const selectedExperiment = exps.find((exp) => exp.key === state.selectedExperimentKey) || exps[0] || null;
    if (selectedExperiment && selectedExperiment.key !== state.selectedExperimentKey) {
      state.selectedExperimentKey = selectedExperiment.key;
      updateCopilotExperimentUI();
      populateExperimentSelect(exps);
    }
    const selectedExperimentMetrics = selectedExperiment ? await loadSelectedExperimentMetrics() : null;
    renderExperimentSummary(selectedExperiment, selectedExperimentMetrics);

    if (exps.length === 0) {
      if (expTableWrap) expTableWrap.style.display = "none";
      if (expEmptyState) expEmptyState.style.display = "";
    } else {
      if (expTableWrap) expTableWrap.style.display = "";
      if (expEmptyState) expEmptyState.style.display = "none";
      expTbody.innerHTML = exps.map(rowHtml).join("");
    }

    renderSessions(sessions);
    renderLabelSummary(labelSummary);
    renderUxOverview(labelSummary, state.generatedInsightData, eventSummary?.ok ? eventSummary : null);
    renderOpportunities(getGeneratedInsightItems());
    renderTopOpportunityHero(labelSummary, eventSummary?.ok ? eventSummary : null);
    if (eventSummary?.ok) {
      renderTrendChart(eventSummary);
      renderJourneyFlow(eventSummary);
      renderSdkStatus(eventSummary);
      if (uxSessionHint) {
        uxSessionHint.textContent = `${getPeriodRange().label} 동안 세션 ${fmtInt(labelSummary.reduce((sum, item) => sum + (Number(item.sessions) || 0), 0))}건 · 이벤트 ${fmtInt(eventSummary.total_events || 0)}건`;
      }
    } else if (trendChartCard) {
      const redisUnavailable = eventSummary?.reason === "redis_unavailable";
      const message = redisUnavailable
        ? "실시간 데이터 연결 실패<br/>Redis 또는 Kafka Consumer 상태를 확인해 주세요."
        : `그래프를 불러오지 못했어요.<br/>${escapeHtml(eventSummary?.message || eventSummary?.reason || "잠시 후 다시 시도해 주세요.")}`;
      trendChartCard.innerHTML = `<div class="chartState">${message}</div>`;
      renderJourneyFlow(null);
      if (redisUnavailable && sdkStatusBadge && sdkStatusText) {
        sdkStatusBadge.className = "sdkStatusBadge missing";
        sdkStatusBadge.textContent = "연결 실패";
        sdkStatusText.textContent = "실시간 데이터 연결 실패. Redis 또는 Kafka Consumer 상태를 확인해 주세요.";
      } else {
        renderSdkStatus(null);
      }
      if (uxSessionHint) uxSessionHint.textContent = redisUnavailable
        ? "실시간 데이터 저장소에 연결할 수 없어 요약 데이터를 표시하지 못했습니다."
        : "세션 카드와 그래프는 선택한 기간 기준으로 집계됩니다.";
    }

    if (state.authUser?.is_admin === true) {
      renderUserSiteOptions();
      renderUsers(usersResult.users);
      if (state.userFetchError) setUserFormStatus(state.userFetchError, true);
    }
    updateSiteContextUI();
  }

  async function generateInsights() {
    if (state.insightGenerationPending) return;
    const token = state.insightGenerationToken + 1;
    state.insightGenerationToken = token;
    state.generatedInsightData = null;
    state.insightGenerationPending = true;
    state.insightGenerationError = null;
    renderGeneratedInsightSections();
    try {
      const result = await fetchInsights(true);
      if (state.insightGenerationToken !== token) return;
      state.generatedInsightData = result;
    } catch (error) {
      if (state.insightGenerationToken !== token) return;
      state.insightGenerationError = String(error);
    } finally {
      if (state.insightGenerationToken === token) {
        state.insightGenerationPending = false;
        renderGeneratedInsightSections();
      }
    }
  }

  // ─── 이벤트 리스너 ───
  expTbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    try {
      if (act === "metrics") { await showMetrics(btn.dataset.key); }
      else if (act === "edit-draft") {
        const exp = state.experiments.find((i) => i.id === btn.dataset.id);
        if (!exp) throw new Error("초안을 찾을 수 없습니다.");
        stageExperimentForEditor(exp);
        window.open(getEditorUrl({ from: "copilot", experiment_key: exp.key, experiment_version: exp.version || null }), "_blank", "noopener");
      }
      else if (act === "pause") { await setStatus(btn.dataset.id, "paused"); await render(); }
      else if (act === "run") { await setStatus(btn.dataset.id, "running"); await render(); }
      else if (act === "archive") { await setStatus(btn.dataset.id, "archived"); await render(); }
      else if (act === "del") { if (!confirm("정말 삭제할까요?")) return; await deleteExp(btn.dataset.id); await render(); }
    } catch (err) { alert(String(err)); }
  });

  helpButtons.forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); toggleHelpPopover(b); }));
  document.addEventListener("click", (e) => { if (!e.target.closest(".helpBtn, .helpPopover")) closeHelpPopovers(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeHelpPopovers();
      if (experimentMetricsDialog?.open) experimentMetricsDialog.close();
    }
  });

  if (sidebarLinks.length) {
    sidebarLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const targetId = String(link.getAttribute("href") || "").replace(/^#/, "");
        if (!targetId || !document.getElementById(targetId)) return;
        event.preventDefault();
        scrollToSidebarSection(targetId);
      });
    });
    window.addEventListener("scroll", updateActiveSidebarFromScroll, { passive: true });
    window.addEventListener("resize", updateActiveSidebarFromScroll);
  }

  refreshBtn.addEventListener("click", () => {
    if (experimentMetricsDialog?.open) experimentMetricsDialog.close();
    render();
  });

  if (generateInsightsBtn) {
    generateInsightsBtn.addEventListener("click", () => {
      generateInsights().catch((error) => {
        state.insightGenerationPending = false;
        state.insightGenerationError = String(error);
        renderGeneratedInsightSections();
      });
    });
  }

  if (uxFocusDetailsBtn) {
    uxFocusDetailsBtn.addEventListener("click", () => {
      const target = document.getElementById("opportunitiesCard");
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - getSidebarScrollOffset();
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }

  if (uxFocusGenerateBtn) {
    uxFocusGenerateBtn.addEventListener("click", () => {
      generateInsights().catch((error) => {
        state.insightGenerationPending = false;
        state.insightGenerationError = String(error);
        renderGeneratedInsightSections();
      });
    });
  }

  if (copyInsightsMarkdownBtn) {
    copyInsightsMarkdownBtn.addEventListener("click", async () => {
      const markdown = buildInsightsMarkdown(state.generatedInsightData, state.lastEventSummary, state.lastLabelSummary);
      if (!markdown) {
        setTemporaryButtonText(copyInsightsMarkdownBtn, "복사할 인사이트 없음");
        return;
      }
      try {
        await window.UxExportUtils.copyTextToClipboard(markdown);
        setTemporaryButtonText(copyInsightsMarkdownBtn, "복사됨");
      } catch {
        setTemporaryButtonText(copyInsightsMarkdownBtn, "복사 실패");
      }
    });
  }

  if (downloadInsightsMarkdownBtn) {
    downloadInsightsMarkdownBtn.addEventListener("click", () => {
      const markdown = buildInsightsMarkdown(state.generatedInsightData, state.lastEventSummary, state.lastLabelSummary);
      if (!markdown) {
        setTemporaryButtonText(downloadInsightsMarkdownBtn, "다운로드 없음");
        return;
      }
      const site = window.UxExportUtils.safeFilenamePart(getCurrentSiteId());
      const ts = window.UxExportUtils.formatTimestampForFilename(Date.now());
      window.UxExportUtils.downloadTextFile(`ux-insights-${site}-${ts}.md`, markdown);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      location.href = "/login";
    });
  }

  if (siteSelect) {
    siteSelect.addEventListener("change", () => {
      const next = String(siteSelect.value || "").trim() || DEFAULT_SITE_ID;
      state.siteId = next;
      state.selectedExperimentKey = null;
      state.selectedExperimentMetrics = null;
      resetGeneratedInsights();
      renderGeneratedInsightSections();
      if (experimentMetricsDialog?.open) experimentMetricsDialog.close();
      localStorage.setItem(SITE_STORAGE_KEY, next);
      setSiteInUrl(next);
      updateSiteContextUI();
      updateCopilotExperimentUI();
      render().catch((e) => alert(String(e)));
    });
  }

  window.addEventListener("uxsdk:agent:experiment-updated", (event) => {
    const detail = event.detail || {};
    if (detail.site_id && detail.site_id !== getCurrentSiteId()) return;
    render().catch((error) => console.warn("agent experiment refresh failed", error));
  });

  if (experimentSelect) {
    experimentSelect.addEventListener("change", async () => {
      state.selectedExperimentKey = String(experimentSelect.value || "").trim() || null;
      updateCopilotExperimentUI();
      const experiment = state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
      const metrics = experiment ? await loadSelectedExperimentMetrics() : null;
      renderExperimentSummary(experiment, metrics);
    });
  }

  if (experimentAudienceSelect) {
    experimentAudienceSelect.addEventListener("change", async () => {
      state.selectedExperimentAudience = String(experimentAudienceSelect.value || "all");
      if (state.selectedExperimentAudience !== "synthetic_agent") {
        state.selectedExperimentPersonaId = "";
      }
      renderExperimentAudienceControls();
      if (experimentMetricsDialog?.open && state.selectedExperimentKey) {
        await showMetrics(state.selectedExperimentKey);
      }
    });
  }

  if (experimentPersonaSelect) {
    experimentPersonaSelect.addEventListener("change", async () => {
      state.selectedExperimentPersonaId = String(experimentPersonaSelect.value || "");
      renderExperimentAudienceControls();
      if (experimentMetricsDialog?.open && state.selectedExperimentKey) {
        await showMetrics(state.selectedExperimentKey);
      }
    });
  }

  if (overlayPersonaSelect) {
    overlayPersonaSelect.addEventListener("change", () => {
      state.selectedOverlayPersonaId = String(overlayPersonaSelect.value || "");
      state.overlayPreviewReady = false;
      const experiment = state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
      renderOverlayBuilder(experiment);
    });
  }

  if (overlayAgeGroupSelect) {
    overlayAgeGroupSelect.addEventListener("change", () => {
      state.selectedOverlayAgeGroup = String(overlayAgeGroupSelect.value || "");
      state.overlayPreviewReady = false;
      const experiment = state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
      renderOverlayBuilder(experiment);
    });
  }

  if (overlayStyleSelect) {
    overlayStyleSelect.addEventListener("change", () => {
      state.selectedOverlayStyleKey = String(overlayStyleSelect.value || "");
      state.overlayPreviewReady = false;
      const experiment = state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
      renderOverlayBuilder(experiment);
    });
  }

  if (generateOverlayBtn) {
    generateOverlayBtn.addEventListener("click", async () => {
      const experiment = state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
      if (!experiment || !state.selectedOverlayPersonaId) return;
      try {
        state.overlayGenerationPending = true;
        renderOverlayBuilder(experiment);
        const result = await generatePersonaOverlay(experiment.key, state.selectedOverlayPersonaId);
        const next = state.overlayRecords.filter((item) => item.overlay_id !== result.overlay.overlay_id);
        next.push(result.overlay);
        state.overlayRecords = next;
        state.overlayPreviewReady = true;
        renderOverlayBuilder(experiment);
      } catch (error) {
        if (overlayBuilderStatus) overlayBuilderStatus.textContent = String(error);
      } finally {
        state.overlayGenerationPending = false;
        renderOverlayBuilder(experiment);
      }
    });
  }

  function refreshPeriodRangePicker(triggerChange = false) {
    if (!periodRangePicker) return;
    const dates = [state.customFromDate, state.customToDate].filter(Boolean);
    periodRangePicker.setDate(dates, triggerChange);
  }

  function applyPeriodChange({ shouldRender = true } = {}) {
    resetGeneratedInsights();
    renderGeneratedInsightSections();
    updatePeriodStatus();
    const range = getPeriodRange();
    if (shouldRender && (state.periodPreset !== "custom" || (range.fromTs != null && range.toTs != null))) {
      if (experimentMetricsDialog?.open) experimentMetricsDialog.close();
      render().catch((e) => alert(String(e)));
    }
  }

  function applyPeriodPresetChange(value, options = {}) {
    state.periodPreset = normalizePeriodPreset(value);
    applyPeriodChange({ shouldRender: options.shouldRender !== false });
    if (options.openPicker) {
      periodRangePicker?.open();
    }
  }

  function applyCustomDateRange(fromDate, toDate) {
    state.periodPreset = "custom";
    state.customFromDate = toDateInputValue(fromDate);
    state.customToDate = toDateInputValue(toDate);
    if (customFromDate) customFromDate.value = state.customFromDate;
    if (customToDate) customToDate.value = state.customToDate;
    applyPeriodChange();
  }

  function initPeriodRangePicker() {
    if (!periodRangeInput || !window.flatpickr) return;
    if (periodRangePicker) return;
    periodRangePicker = window.flatpickr(periodRangeInput, {
      mode: "range",
      locale: window.flatpickr.l10ns?.ko || "ko",
      dateFormat: "Y-m-d",
      conjunction: " ~ ",
      showMonths: window.innerWidth <= 640 ? 1 : 2,
      defaultDate: [state.customFromDate, state.customToDate].filter(Boolean),
      disableMobile: true,
      onChange(selectedDates) {
        if (!Array.isArray(selectedDates) || selectedDates.length !== 2) return;
        applyCustomDateRange(selectedDates[0], selectedDates[1]);
      },
    });
  }

  if (periodPreset) {
    periodPreset.addEventListener("change", () => {
      applyPeriodPresetChange(periodPreset.value);
    });
  }

  periodPresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextPreset = normalizePeriodPreset(button.dataset.periodPreset);
      applyPeriodPresetChange(nextPreset, { openPicker: nextPreset === "custom" });
    });
  });

  if (periodRangeTrigger) {
    periodRangeTrigger.addEventListener("click", () => {
      if (state.periodPreset !== "custom") {
        state.periodPreset = "custom";
        applyPeriodChange({ shouldRender: false });
      }
      periodRangePicker?.open();
    });
  }

  if (periodRangeInput) {
    periodRangeInput.addEventListener("click", () => {
      if (state.periodPreset !== "custom") {
        state.periodPreset = "custom";
        applyPeriodChange({ shouldRender: false });
      }
    });
  }

  if (customFromDate) {
    customFromDate.addEventListener("change", () => {
      state.customFromDate = String(customFromDate.value || "");
      refreshPeriodRangePicker(false);
      applyPeriodChange({ shouldRender: false });
      const range = getPeriodRange();
      if (state.periodPreset === "custom" && range.fromTs != null && range.toTs != null) {
        if (experimentMetricsDialog?.open) experimentMetricsDialog.close();
        render().catch((e) => alert(String(e)));
      }
    });
  }

  if (customToDate) {
    customToDate.addEventListener("change", () => {
      state.customToDate = String(customToDate.value || "");
      refreshPeriodRangePicker(false);
      applyPeriodChange({ shouldRender: false });
      const range = getPeriodRange();
      if (state.periodPreset === "custom" && range.fromTs != null && range.toTs != null) {
        if (experimentMetricsDialog?.open) experimentMetricsDialog.close();
        render().catch((e) => alert(String(e)));
      }
    });
  }

  // 경로 매핑 설정 모달
  const PATH_MAPPING_STEPS = [
    { key: "home",     label: "홈",       sub: "메인 페이지" },
    { key: "browse",   label: "상품 목록", sub: "카테고리/검색" },
    { key: "product",  label: "상품 상세", sub: "개별 상품 페이지" },
    { key: "cart",     label: "장바구니",  sub: "카트 페이지" },
    { key: "checkout", label: "결제",     sub: "결제 진행 페이지" },
    { key: "purchase", label: "구매 완료", sub: "주문 완료 페이지" },
  ];
  const DEFAULT_MAPPINGS = {
    home:     ["/", "/home"],
    browse:   ["/collection", "/category", "/search"],
    product:  ["/detail", "/product"],
    cart:     ["/cart"],
    checkout: ["/checkout"],
    purchase: ["/order-complete"],
  };

  function setPathMappingsStatus(msg, type) {
    if (!pathMappingsStatus) return;
    pathMappingsStatus.textContent = msg || "";
    pathMappingsStatus.className = "pathMappingsStatus" + (type ? ` ${type}` : "");
  }

  function renderPathMappingsGrid(savedMappings) {
    if (!pathMappingsGrid) return;
    pathMappingsGrid.innerHTML = "";

    for (const step of PATH_MAPPING_STEPS) {
      const current = Array.isArray(savedMappings?.[step.key]) ? savedMappings[step.key] : DEFAULT_MAPPINGS[step.key];

      const row = document.createElement("div");
      row.className = "pathMappingRow";
      row.dataset.stepKey = step.key;

      const labelEl = document.createElement("div");
      labelEl.className = "pathMappingLabel";
      labelEl.innerHTML = `${step.label}<br/><span class="pathMappingLabelSub">${step.sub}</span>`;
      row.appendChild(labelEl);

      const inputsWrap = document.createElement("div");
      inputsWrap.className = "pathMappingInputs";

      function addInputRow(val) {
        const inputRow = document.createElement("div");
        inputRow.className = "pathMappingInputRow";
        const inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = "예: /item";
        inp.value = val || "";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "pathMappingRemoveBtn";
        removeBtn.title = "삭제";
        removeBtn.textContent = "×";
        removeBtn.addEventListener("click", () => inputRow.remove());
        inputRow.appendChild(inp);
        inputRow.appendChild(removeBtn);
        inputsWrap.insertBefore(inputRow, addBtn);
      }

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "pathMappingAddBtn";
      addBtn.textContent = "+ 경로 추가";
      addBtn.addEventListener("click", () => addInputRow(""));
      inputsWrap.appendChild(addBtn);

      current.forEach(addInputRow);
      row.appendChild(inputsWrap);
      pathMappingsGrid.appendChild(row);
    }
  }

  function collectPathMappings() {
    const result = {};
    if (!pathMappingsGrid) return result;
    for (const step of PATH_MAPPING_STEPS) {
      const row = pathMappingsGrid.querySelector(`[data-step-key="${step.key}"]`);
      if (!row) continue;
      const values = Array.from(row.querySelectorAll(".pathMappingInputRow input"))
        .map((inp) => inp.value.trim())
        .filter((v) => v.startsWith("/"));
      result[step.key] = values.length ? values : DEFAULT_MAPPINGS[step.key];
    }
    return result;
  }

  async function openPathMappingsDialog() {
    if (!pathMappingsDialog) return;
    setPathMappingsStatus("");
    const siteId = getCurrentSiteId();
    try {
      const r = await fetch(`/api/sites/${encodeURIComponent(siteId)}`);
      const j = await r.json();
      const savedMappings = j?.site?.journey_path_mappings || null;
      renderPathMappingsGrid(savedMappings);
    } catch {
      renderPathMappingsGrid(null);
    }
    pathMappingsDialog.showModal();
  }

  async function savePathMappings() {
    const siteId = getCurrentSiteId();
    const mappings = collectPathMappings();
    setPathMappingsStatus("저장 중…");
    if (pathMappingsSaveBtn) pathMappingsSaveBtn.disabled = true;
    try {
      const r = await fetch(`/api/sites/${encodeURIComponent(siteId)}/journey-path-mappings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journey_path_mappings: mappings }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.reason || "저장 실패");
      setPathMappingsStatus("저장 완료! 대시보드를 새로고침하면 반영됩니다.", "success");
      setTimeout(() => pathMappingsDialog.close(), 1200);
    } catch (e) {
      setPathMappingsStatus(`오류: ${String(e)}`, "error");
    } finally {
      if (pathMappingsSaveBtn) pathMappingsSaveBtn.disabled = false;
    }
  }

  function closePathMappingsDialog() {
    if (!pathMappingsDialog?.open) return;
    pathMappingsDialog.close();
  }

  if (labelModeToggle) {
    labelModeToggle.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode === state.labelMode) return;
      state.labelMode = mode;
      labelModeToggle.querySelectorAll(".toggleBtn").forEach((b) => {
        const active = b.dataset.mode === mode;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      const labelSummary = await fetchLabelsSummary().catch(() => []);
      state.lastLabelSummary = labelSummary;
      renderLabelBars(labelSummary);
      renderLabelSummary(labelSummary);
    });
  }

  if (pathMappingsBtn) pathMappingsBtn.addEventListener("click", openPathMappingsDialog);
  if (pathMappingsSaveBtn) pathMappingsSaveBtn.addEventListener("click", savePathMappings);
  if (pathMappingsCancelBtn) pathMappingsCancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePathMappingsDialog();
  });
  if (pathMappingsCloseBtn) pathMappingsCloseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePathMappingsDialog();
  });
  if (pathMappingsDialog) {
    pathMappingsDialog.addEventListener("click", (e) => {
      const closeTrigger = e.target instanceof Element ? e.target.closest('[data-dialog-close="path-mappings"]') : null;
      if (closeTrigger) {
        e.preventDefault();
        e.stopPropagation();
        closePathMappingsDialog();
        return;
      }
      if (e.target === pathMappingsDialog) closePathMappingsDialog();
    });
  }

  // 사용자 관리 모달
  if (settingsBtn && userManagementDialog) {
    settingsBtn.addEventListener("click", () => {
      userManagementDialog.showModal();
    });
  }
  if (closeDialogBtn && userManagementDialog) {
    closeDialogBtn.addEventListener("click", () => userManagementDialog.close());
  }
  if (userManagementDialog) {
    userManagementDialog.addEventListener("click", (e) => {
      if (e.target === userManagementDialog) userManagementDialog.close();
    });
  }

  if (userSiteChecklist) {
    userSiteChecklist.addEventListener("change", (e) => {
      if (!(e.target instanceof HTMLInputElement) || e.target.type !== "checkbox") return;
      const checked = Array.from(userSiteChecklist.querySelectorAll('input[type="checkbox"]:checked')).map((i) => String(i.value || "").trim()).filter(Boolean);
      syncNewUserSiteIds(checked);
      renderUserSiteOptions();
    });
  }
  if (createUserForm) createUserForm.addEventListener("submit", submitCreateUser);
  if (resetUserFormBtn) resetUserFormBtn.addEventListener("click", resetCreateUserForm);

  if (saveDraftBtn) {
    saveDraftBtn.addEventListener("click", async () => {
      try {
        saveDraftBtn.disabled = true;
        const saved = await persistLatestDraft();
        if (copilotDraftStatus) copilotDraftStatus.textContent = `초안 저장됨 · ${saved.key}`;
      } catch (err) {
        alert(String(err));
        saveDraftBtn.disabled = !state.latestDraft;
      }
    });
  }
  if (openDraftInEditorBtn) {
    openDraftInEditorBtn.addEventListener("click", () => {
      if (!state.latestDraft) return;
      const draftKey = state.latestDraft?.draft?.key || state.selectedExperimentKey || "";
      const draftVersion = state.latestDraft?.draft?.version || null;
      window.open(getEditorUrl({ from: "copilot", experiment_key: draftKey, experiment_version: draftVersion }), "_blank", "noopener");
    });
  }

  if (openExperimentResultsBtn) {
    openExperimentResultsBtn.addEventListener("click", async () => {
      if (!state.selectedExperimentKey) return;
      await showMetrics(state.selectedExperimentKey);
    });
  }

  if (experimentHistoryList) {
    experimentHistoryList.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-rollback-version]");
      if (!btn || !state.selectedExperimentKey) return;
      const experiment = state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
      if (!experiment) return;
      const version = Number(btn.dataset.rollbackVersion);
      btn.disabled = true;
      try {
        await rollbackExperimentVersion(experiment, version);
      } catch (error) {
        alert(String(error));
        btn.disabled = false;
      }
    });
  }

  if (toggleExperimentOverlayPreviewBtn) {
    toggleExperimentOverlayPreviewBtn.addEventListener("click", () => {
      if (!experimentOverlayPreviewPanel) return;
      experimentOverlayPreviewPanel.hidden = !experimentOverlayPreviewPanel.hidden;
      toggleExperimentOverlayPreviewBtn.textContent = experimentOverlayPreviewPanel.hidden ? "전체 페이지 + 오버레이 보기" : "오버레이 숨기기";
      if (!experimentOverlayPreviewPanel.hidden) {
        const experiment = state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
        renderExperimentOverlayPreview(experiment);
      } else {
        clearExperimentOverlayPreview();
      }
    });
  }

  if (closeExperimentDialogBtn && experimentMetricsDialog) {
    closeExperimentDialogBtn.addEventListener("click", () => experimentMetricsDialog.close());
  }

  if (experimentMetricsDialog) {
    experimentMetricsDialog.addEventListener("click", (e) => {
      if (e.target === experimentMetricsDialog) experimentMetricsDialog.close();
    });
  }

  if (window.AnalyticsChatWidget) {
    state.chatWidget = window.AnalyticsChatWidget.init({
      fabId: "chatbotFab",
      panelId: "analyticsChatPanel",
      closeBtnId: "chatbotCloseBtn",
      messagesId: "chatMessages",
      inputId: "chatInput",
      sendBtnId: "chatSendBtn",
      selectedExperimentId: "chatSelectedExperiment",
      storageKey: "dashboard",
      getSiteId: () => getCurrentSiteId(),
      onExperimentDraft(draft) { stageDraftForEditor(draft, draft?.variant_b_changes || []); },
      onEditorChanges(changes, draft) { stageDraftForEditor(draft, changes); },
    });
    updateCopilotExperimentUI();
  }

  localStorage.setItem(SITE_STORAGE_KEY, getCurrentSiteId());
  setSiteInUrl(getCurrentSiteId());
  syncPeriodInputs();
  initPeriodRangePicker();
  updatePeriodStatus();
  updateSiteContextUI();
  updateActiveSidebarFromScroll();
  render().catch((e) => alert(String(e)));
})();
