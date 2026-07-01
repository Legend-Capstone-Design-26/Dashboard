(function () {
  const DEFAULT_SITE_ID = "legend-ecommerce";
  const SITE_STORAGE_KEY = "uxsdk.dashboard.siteId";
  const FIXED_COHORT_MODE = "fixed_10k_cohort";
  const FIXED_COHORT_ID = "fixed_10k_cohort";

  const siteSelect = document.getElementById("siteSelect");
  const authUserLabel = document.getElementById("authUserLabel");
  const logoutBtn = document.getElementById("logoutBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const editorLink = document.getElementById("editorLink");
  const experimentSelect = document.getElementById("experimentSelect");
  const ageGroupSelect = document.getElementById("ageGroupSelect");
  const occupationGroupSelect = document.getElementById("occupationGroupSelect");
  const styleSelect = document.getElementById("styleSelect");
  const personaSelect = document.getElementById("personaSelect");
  const personaCount = document.getElementById("personaCount");
  const experimentCount = document.getElementById("experimentCount");
  const overlayCount = document.getElementById("overlayCount");
  const labStatus = document.getElementById("labStatus");
  const matchedAgentSummary = document.getElementById("matchedAgentSummary");
  const personaProfile = document.getElementById("personaProfile");
  const experimentSummary = document.getElementById("experimentSummary");
  const simulationSampleSize = document.getElementById("simulationSampleSize");
  const runSimulationBtn = document.getElementById("runSimulationBtn");
  const simulationContext = document.getElementById("simulationContext");
  const simulationStatus = document.getElementById("simulationStatus");
  const simulationResults = document.getElementById("simulationResults");
  const analyzeTransitionsBtn = document.getElementById("analyzeTransitionsBtn");
  const transitionAnalysisStatus = document.getElementById("transitionAnalysisStatus");
  const transitionAnalysisResults = document.getElementById("transitionAnalysisResults");
  const generateOverlayBtn = document.getElementById("generateOverlayBtn");
  const overlayPreview = document.getElementById("overlayPreview");
  const reloadPreviewBtn = document.getElementById("reloadPreviewBtn");
  const previewSentence = document.getElementById("previewSentence");
  const previewMeta = document.getElementById("previewMeta");
  const previewStage = document.getElementById("previewStage");
  const previewFrame = document.getElementById("previewFrame");
  const previewLayer = document.getElementById("previewLayer");

  const AGE_GROUP_LABELS = {
    teens: "10대",
    "20s": "20대",
    "30s": "30대",
    "40s": "40대",
    "50s": "50대",
    "60plus": "60대+",
    unknown: "연령 미상",
  };

  const OCCUPATION_GROUP_LABELS = {
    retired: "은퇴자",
    student: "학생",
    caregiver: "돌봄/가사",
    self_employed: "자영업자",
    office_worker: "사무직",
    professional: "전문직",
    service_worker: "서비스직",
    laborer: "현장/노무직",
    other: "기타",
    unknown: "직업군 미상",
  };

  const STYLE_KEY_LABELS = {
    brand_loyal: "브랜드 선호형",
    comparison: "비교 검토형",
    fast_decision: "빠른 결정형",
    impulsive: "충동 구매형",
    price_sensitive: "가격 민감형",
    review_oriented: "리뷰 중시형",
    shipping_sensitive: "배송 중시형",
    unknown: "유형 미상",
  };

  const TRANSITION_STATE_LABELS = {
    brand_story: "브랜드 스토리",
    cart_entry: "장바구니",
    checkout: "결제 단계",
    checkout_complete: "구매 완료",
    checkout_entry: "결제",
    compare_click: "상품 비교",
    coupon_check: "쿠폰 확인",
    cta_click: "CTA 클릭",
    delivery_policy: "배송 정책 확인",
    detail_view: "상품 상세 보기",
    exit: "이탈/종료",
    filter_apply: "필터 적용",
    landing: "랜딩 진입",
    listing_view: "상품 목록 보기",
    payment_attempt: "결제 시도",
    price_check: "가격 확인",
    review_check: "리뷰 확인",
    review_sort: "리뷰 정렬",
    review_tab: "리뷰 탭 보기",
    search_entry: "검색",
    search_query: "검색 실행",
    shipping_check: "배송비 확인",
    shipping_info: "배송 정보 확인",
    spec_check: "상품 정보 확인",
    threshold_check: "무료배송 조건 확인",
    trust_check: "신뢰 정보 확인",
  };

  const state = {
    siteId: resolveSiteId(),
    sites: [],
    experiments: [],
    personas: [],
    overlays: [],
    metrics: null,
    selectedExperimentKey: "",
    selectedPersonaId: "",
    selectedAgeGroup: "",
    selectedOccupationGroup: "",
    selectedStyleKey: "",
    pending: false,
    cohortSignal: { pending: false, error: "", cohort: null, requestKey: "", requestId: 0, controller: null },
    transitionAnalysis: { pending: false, error: "", result: null, requestKey: "", requestId: 0, controller: null, expanded: false },
    simulationPending: false,
    simulationRun: null,
    simulationError: "",
  };

  function resolveSiteId() {
    const params = new URLSearchParams(location.search);
    return (params.get("site_id") || localStorage.getItem(SITE_STORAGE_KEY) || DEFAULT_SITE_ID).trim();
  }

  function setSiteInUrl(siteId) {
    const url = new URL(location.href);
    url.searchParams.set("site_id", siteId);
    history.replaceState({}, "", url.toString());
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtInt(value) {
    return new Intl.NumberFormat("ko-KR").format(Number(value) || 0);
  }

  function fmtPct(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";
  }

  function fmtSignedPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
  }

  function fmtPValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n < 0.001 ? "0.001 미만" : n.toFixed(3);
  }

  function clampSampleSize(value) {
    const n = Math.round(Number(value) || 1000);
    return Math.max(20, Math.min(50000, n));
  }

  function ageGroupLabel(ageGroup, fallback = "전체") {
    if (!ageGroup) return fallback;
    return AGE_GROUP_LABELS[ageGroup] || ageGroup;
  }

  function occupationGroupLabel(occupationGroup, fallback = "전체 직업군") {
    if (!occupationGroup) return fallback;
    return OCCUPATION_GROUP_LABELS[occupationGroup] || occupationGroup;
  }

  function styleKeyLabel(styleKey, fallback = "전체 유형") {
    if (!styleKey) return fallback;
    return STYLE_KEY_LABELS[styleKey] || styleKey;
  }

  function transitionStateLabel(stateId, fallback = "알 수 없음") {
    if (!stateId) return fallback;
    return TRANSITION_STATE_LABELS[stateId] || stateId;
  }

  function transitionActionLabel(stateId, fallback = "전이") {
    const actions = {
      cart_entry: "장바구니 진입",
      checkout_entry: "결제 진입",
      checkout_complete: "구매 완료",
      exit: "이탈",
      search_entry: "검색 진입",
    };
    if (!stateId) return fallback;
    return actions[stateId] || transitionStateLabel(stateId, fallback);
  }

  function runnerTypeLabel(runnerType) {
    const labels = {
      state_transition: "상태 전이형",
      timeline: "타임라인형",
    };
    return labels[runnerType] || "실행 방식 미상";
  }

  function transitionEdgeParts(edgeId, from, to) {
    if (from || to) return { from: from || "unknown", to: to || "unknown" };
    const parts = String(edgeId || "").split("->");
    return { from: parts[0] || "unknown", to: parts[1] || "unknown" };
  }

  function transitionEdgeRaw(edgeId, from, to) {
    return edgeId || `${from || "unknown"}->${to || "unknown"}`;
  }

  function transitionEdgeLabel(edgeId, from, to) {
    if (!from && !to && edgeId && !String(edgeId).includes("->")) return transitionStateLabel(edgeId, "전이");
    const parts = transitionEdgeParts(edgeId, from, to);
    return `${transitionStateLabel(parts.from)} → ${transitionActionLabel(parts.to)}`;
  }

  function transitionEdgeTooltip(edgeId, from, to) {
    const label = transitionEdgeLabel(edgeId, from, to);
    const raw = transitionEdgeRaw(edgeId, from, to);
    return raw && raw !== label ? `${label}\n${raw}` : label;
  }

  function segmentIdentityLabel(ageGroup, occupationGroup, styleKey) {
    return [
      ageGroupLabel(ageGroup),
      occupationGroupLabel(occupationGroup),
      styleKeyLabel(styleKey),
    ].join(" · ");
  }

  function selectorOptions(field, selectedValue) {
    return Array.from(new Set(state.personas.map((persona) => persona[field]).filter(Boolean).concat(selectedValue || "").filter(Boolean)));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function localizeKnownSegmentText(value, fallback = "") {
    if (!value) return fallback;
    const text = String(value);
    const segmentParts = text.split("__");
    if (segmentParts.length === 3) return segmentIdentityLabel(segmentParts[0], segmentParts[1], segmentParts[2]);
    return Object.entries({ ...OCCUPATION_GROUP_LABELS, ...STYLE_KEY_LABELS }).reduce(
      (label, [key, koreanLabel]) => label.replace(new RegExp(`\\b${escapeRegExp(key)}\\b`, "g"), koreanLabel),
      text
    );
  }

  function personaDisplayLabel(persona, fallback = "페르소나") {
    return localizeKnownSegmentText(persona?.group_label || persona?.description || persona?.id, fallback);
  }

  function currentExperiment() {
    return state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
  }

  function currentPersona() {
    return state.personas.find((item) => item.id === state.selectedPersonaId) || null;
  }

  function currentOverlay() {
    return state.overlays.find((item) => item.experiment_key === state.selectedExperimentKey && item.persona_id === state.selectedPersonaId && item.variant === "B") || null;
  }

  function transitionAnalysisRequestKey() {
    return [state.siteId, state.selectedExperimentKey, state.selectedAgeGroup, state.selectedOccupationGroup, state.selectedStyleKey].join("|");
  }

  function cohortSignalRequestKey() {
    return [state.siteId, state.selectedAgeGroup, state.selectedOccupationGroup, state.selectedStyleKey].join("|");
  }

  function resetTransitionAnalysis() {
    if (state.transitionAnalysis.controller) state.transitionAnalysis.controller.abort();
    state.transitionAnalysis = {
      pending: false,
      error: "",
      result: null,
      requestKey: "",
      requestId: state.transitionAnalysis.requestId + 1,
      controller: null,
      expanded: false,
    };
  }

  function resetCohortSignal() {
    if (state.cohortSignal.controller) state.cohortSignal.controller.abort();
    state.cohortSignal = {
      pending: false,
      error: "",
      cohort: null,
      requestKey: "",
      requestId: state.cohortSignal.requestId + 1,
      controller: null,
    };
  }

  function personaLabel(persona) {
    if (!persona) return "페르소나";
    const age = ageGroupLabel(persona.age_group);
    const style = styleKeyLabel(persona.style_key, persona.style_label || "유형");
    return `${age} ${style}`.trim();
  }

  async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    if (response.status === 401) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new Error("unauthorized");
    }
    const json = await response.json();
    if (!json?.ok) throw new Error(json?.reason || `request failed: ${url}`);
    return json;
  }

  async function fetchAuthMe() {
    const json = await jsonFetch("/api/auth/me");
    return json.user;
  }

  async function fetchSites() {
    const json = await jsonFetch("/api/sites");
    return Array.isArray(json.sites) ? json.sites : [];
  }

  async function fetchExperiments() {
    const json = await jsonFetch(`/api/experiments?site_id=${encodeURIComponent(state.siteId)}`);
    return Array.isArray(json.experiments) ? json.experiments : [];
  }

  async function fetchPersonas() {
    const json = await jsonFetch(`/api/personas?site_id=${encodeURIComponent(state.siteId)}`);
    return Array.isArray(json.personas) ? json.personas : [];
  }

  async function fetchOverlays() {
    const json = await jsonFetch(`/api/persona-overlays?site_id=${encodeURIComponent(state.siteId)}`);
    return Array.isArray(json.overlays) ? json.overlays : [];
  }

  async function fetchMetrics() {
    if (!state.selectedExperimentKey) return null;
    const params = new URLSearchParams({ site_id: state.siteId, key: state.selectedExperimentKey, actor_type: "synthetic_agent" });
    if (state.selectedPersonaId) params.set("persona_id", state.selectedPersonaId);
    return jsonFetch(`/api/metrics?${params.toString()}`).catch((error) => ({ ok: false, reason: String(error) }));
  }

  function currentFilteredPersonas() {
    return state.personas.filter((persona) => {
      if (state.selectedAgeGroup && persona.age_group !== state.selectedAgeGroup) return false;
      if (state.selectedOccupationGroup && persona.occupation_group !== state.selectedOccupationGroup) return false;
      if (state.selectedStyleKey && persona.style_key !== state.selectedStyleKey) return false;
      return true;
    });
  }

  async function refreshCohortSignal() {
    const requestKey = cohortSignalRequestKey();
    if (state.cohortSignal.controller) state.cohortSignal.controller.abort();
    const controller = new AbortController();
    const requestId = state.cohortSignal.requestId + 1;
    state.cohortSignal = { pending: true, error: "", cohort: null, requestKey, requestId, controller };
    renderMatchedAgentSummary();
    try {
      const params = new URLSearchParams({
        site_id: state.siteId,
        cohort_id: FIXED_COHORT_ID,
        limit: "1",
        offset: "0",
      });
      if (state.selectedAgeGroup) params.set("age_group", state.selectedAgeGroup);
      if (state.selectedOccupationGroup) params.set("occupation_group", state.selectedOccupationGroup);
      if (state.selectedStyleKey) params.set("style_key", state.selectedStyleKey);
      const json = await jsonFetch(`/api/personas/fixed-cohort?${params.toString()}`, { signal: controller.signal });
      if (state.cohortSignal.requestKey !== requestKey || state.cohortSignal.requestId !== requestId) return;
      state.cohortSignal = { pending: false, error: "", cohort: json.cohort || null, requestKey, requestId, controller: null };
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (state.cohortSignal.requestKey !== requestKey || state.cohortSignal.requestId !== requestId) return;
      state.cohortSignal = { pending: false, error: String(error), cohort: null, requestKey, requestId, controller: null };
    } finally {
      if (state.cohortSignal.requestKey === requestKey && state.cohortSignal.requestId === requestId) renderMatchedAgentSummary();
    }
  }

  async function analyzeTransitions() {
    const experiment = currentExperiment();
    if (!experiment) {
      resetTransitionAnalysis();
      state.transitionAnalysis.expanded = true;
      state.transitionAnalysis.error = "실험을 먼저 선택하세요.";
      renderTransitionAnalysis();
      return;
    }
    const requestKey = transitionAnalysisRequestKey();
    if (state.transitionAnalysis.controller) state.transitionAnalysis.controller.abort();
    const controller = new AbortController();
    const requestId = state.transitionAnalysis.requestId + 1;
    state.transitionAnalysis = { pending: true, error: "", result: null, requestKey, requestId, controller, expanded: true };
    renderTransitionAnalysis();
    try {
      const json = await jsonFetch("/api/personas/fixed-cohort/transition-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          site_id: state.siteId,
          experiment_key: experiment.key,
          cohort_id: FIXED_COHORT_ID,
          filters: {
            age_group: state.selectedAgeGroup || "",
            occupation_group: state.selectedOccupationGroup || "",
            style_key: state.selectedStyleKey || "",
          },
        }),
      });
      if (state.transitionAnalysis.requestKey !== requestKey || state.transitionAnalysis.requestId !== requestId) return;
      state.transitionAnalysis = { pending: false, error: "", result: json.analysis || null, requestKey, requestId, controller: null, expanded: true };
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (state.transitionAnalysis.requestKey !== requestKey || state.transitionAnalysis.requestId !== requestId) return;
      state.transitionAnalysis = { pending: false, error: String(error), result: null, requestKey, requestId, controller: null, expanded: true };
    } finally {
      if (state.transitionAnalysis.requestKey === requestKey && state.transitionAnalysis.requestId === requestId) renderTransitionAnalysis();
    }
  }

  async function generateOverlay() {
    const experiment = currentExperiment();
    const persona = currentPersona();
    if (!experiment || !persona) return;
    state.pending = true;
    renderOverlay();
    try {
      const json = await jsonFetch("/api/persona-overlays/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_id: state.siteId, experiment_key: experiment.key, persona_id: persona.id }),
      });
      state.overlays = state.overlays.filter((item) => item.overlay_id !== json.overlay.overlay_id).concat(json.overlay);
      if (labStatus) labStatus.textContent = `${personaLabel(persona)} 기준 오버레이를 생성했습니다.`;
    } catch (error) {
      if (labStatus) labStatus.textContent = String(error);
    } finally {
      state.pending = false;
      renderAll();
    }
  }

  async function runSimulation() {
    const experiment = currentExperiment();
    if (!experiment) {
      state.simulationError = "실험을 먼저 선택하세요.";
      renderSimulation();
      return;
    }
    const uiSampleSize = clampSampleSize(simulationSampleSize?.value);
    if (simulationSampleSize) simulationSampleSize.value = String(uiSampleSize);
    state.simulationPending = true;
    state.simulationError = "";
    renderSimulation();
    try {
      const json = await jsonFetch("/api/simulations/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_id: state.siteId, experiment_key: experiment.key, mode: FIXED_COHORT_MODE, cohort_id: FIXED_COHORT_ID }),
      });
      state.simulationRun = json.run || { run_id: json.run_id, status: json.status, results: null };
      if (labStatus) labStatus.textContent = `${experiment.key} Nemotron 고정 10k 코호트 시뮬레이션을 완료했습니다.`;
    } catch (error) {
      state.simulationError = String(error);
    } finally {
      state.simulationPending = false;
      renderSimulation();
    }
  }

  function populateSites(user) {
    if (!siteSelect) return;
    siteSelect.innerHTML = "";
    state.sites.forEach((site) => {
      const option = document.createElement("option");
      option.value = site.site_id;
      option.textContent = site.name || site.site_id;
      siteSelect.appendChild(option);
    });
    if (!state.sites.some((site) => site.site_id === state.siteId)) {
      state.siteId = user?.default_site_id || state.sites[0]?.site_id || DEFAULT_SITE_ID;
    }
    siteSelect.value = state.siteId;
    localStorage.setItem(SITE_STORAGE_KEY, state.siteId);
    setSiteInUrl(state.siteId);
  }

  function populateSelectors() {
    if (experimentSelect) {
      experimentSelect.innerHTML = '<option value="">실험을 선택하세요</option>';
      state.experiments.forEach((experiment) => {
        const option = document.createElement("option");
        option.value = experiment.key || "";
        option.textContent = `${experiment.key || "실험"} · v${experiment.version || 1}`;
        experimentSelect.appendChild(option);
      });
      if (!state.selectedExperimentKey) state.selectedExperimentKey = state.experiments[0]?.key || "";
      experimentSelect.value = state.selectedExperimentKey;
    }

    const ageOptions = selectorOptions("age_group", state.selectedAgeGroup);
    const occupationOptions = selectorOptions("occupation_group", state.selectedOccupationGroup);
    const styleOptions = selectorOptions("style_key", state.selectedStyleKey);

    if (ageGroupSelect) {
      ageGroupSelect.innerHTML = '<option value="">전체 나이대</option>';
      ageOptions.forEach((age) => {
        const option = document.createElement("option");
        option.value = age;
        option.textContent = ageGroupLabel(age);
        ageGroupSelect.appendChild(option);
      });
      ageGroupSelect.value = state.selectedAgeGroup;
    }

    if (styleSelect) {
      styleSelect.innerHTML = '<option value="">전체 유형</option>';
      styleOptions.forEach((styleKey) => {
        const option = document.createElement("option");
        option.value = styleKey;
        option.textContent = styleKeyLabel(styleKey);
        styleSelect.appendChild(option);
      });
      styleSelect.value = state.selectedStyleKey;
    }

    if (occupationGroupSelect) {
      occupationGroupSelect.innerHTML = '<option value="">전체 직업군</option>';
      occupationOptions.forEach((occupationGroup) => {
        const option = document.createElement("option");
        option.value = occupationGroup;
        option.textContent = occupationGroupLabel(occupationGroup);
        occupationGroupSelect.appendChild(option);
      });
      occupationGroupSelect.value = state.selectedOccupationGroup;
    }

    const filtered = currentFilteredPersonas();
    if (!filtered.some((persona) => persona.id === state.selectedPersonaId)) state.selectedPersonaId = filtered[0]?.id || "";

    if (personaSelect) {
      personaSelect.innerHTML = '<option value="">페르소나 선택</option>';
      filtered.forEach((persona) => {
        const option = document.createElement("option");
        option.value = persona.id;
        option.textContent = personaDisplayLabel(persona);
        personaSelect.appendChild(option);
      });
      personaSelect.value = state.selectedPersonaId;
    }
  }

  function renderPersona() {
    const persona = currentPersona();
    if (!personaProfile) return;
    if (!persona) {
      personaProfile.innerHTML = '<div class="emptyState">조건에 맞는 페르소나가 없습니다.</div>';
      return;
    }
    const traits = Array.isArray(persona.normalized_persona?.personality_traits) ? persona.normalized_persona.personality_traits : [];
    const rules = Array.isArray(persona.normalized_persona?.decision_rules) ? persona.normalized_persona.decision_rules : [];
    const transitions = Object.entries(persona.state_model?.states || {}).flatMap(([stateId, state]) =>
      (Array.isArray(state?.transitions) ? state.transitions : []).map((transition) => ({ from: stateId, to: transition.to }))
    ).slice(0, 12);
    personaProfile.innerHTML = `
      <div class="summaryMiniCard">
        <div class="summaryLabel">대표 페르소나</div>
        <div class="summaryMiniValue">${escapeHtml(personaDisplayLabel(persona))}</div>
        <div class="summaryHint">${escapeHtml(personaLabel(persona))} · ${escapeHtml(runnerTypeLabel(persona.runner_type))}</div>
      </div>
      <div class="personaTraits">${traits.concat(rules).slice(0, 8).map((item) => `<span class="personaTrait">${escapeHtml(item)}</span>`).join("") || '<span class="personaTrait">성향 정보 없음</span>'}</div>
      <div class="transitionList">${transitions.map((item) => `<span class="transitionChip" title="${escapeHtml(transitionEdgeRaw(null, item.from, item.to))}">${escapeHtml(transitionEdgeLabel(null, item.from, item.to))}</span>`).join("") || '<span class="transitionChip">상태 전이 없음</span>'}</div>`;
  }

  function summarizeChange(change) {
    const actions = Array.isArray(change?.actions) ? change.actions : [];
    const action = actions[0] || null;
    if (change?.type === "inject_css") return "고급 CSS";
    if (action?.type === "set_text") return "문구 변경";
    if (action?.type === "set_style") return "스타일 변경";
    if (action?.type === "hide") return "숨기기";
    if (action?.type === "show") return "보이기";
    if (action?.type === "set_attr" && String(action.name || "").toLowerCase() === "href") return "링크 변경";
    return action?.type || "변경";
  }

  function renderExperiment() {
    const experiment = currentExperiment();
    if (!experimentSummary) return;
    if (!experiment) {
      experimentSummary.innerHTML = '<div class="emptyState">실험을 선택하세요.</div>';
      return;
    }
    const changes = Array.isArray(experiment.variants?.B) ? experiment.variants.B : [];
    const sessions = (Number(state.metrics?.A?.sessions) || 0) + (Number(state.metrics?.B?.sessions) || 0);
    experimentSummary.innerHTML = `
      <div class="experimentDialogMetaGrid">
        <div class="summaryMiniCard"><div class="summaryLabel">상태</div><div class="summaryMiniValue">${escapeHtml(experiment.status || "—")}</div></div>
        <div class="summaryMiniCard"><div class="summaryLabel">버전</div><div class="summaryMiniValue mono">v${escapeHtml(String(experiment.version || 1))}</div></div>
        <div class="summaryMiniCard"><div class="summaryLabel">Synthetic 세션</div><div class="summaryMiniValue mono">${fmtInt(sessions)}</div></div>
        <div class="summaryMiniCard"><div class="summaryLabel">B 전환율</div><div class="summaryMiniValue mono">${fmtPct(state.metrics?.B?.cvr)}</div></div>
      </div>
      <div class="summaryHint">${escapeHtml(experiment.hypothesis || "실험 가설 없음")}</div>
      <div class="changeList">${changes.map((change) => `<span class="changeChip">${escapeHtml(summarizeChange(change))}</span>`).join("") || '<span class="changeChip">B안 변경 없음</span>'}</div>`;
  }

  function renderMatchedAgentSummary() {
    if (!matchedAgentSummary) return;
    const experiment = currentExperiment();
    const cohort = state.cohortSignal.cohort || {};
    const hasCohort = Boolean(state.cohortSignal.cohort);
    const isLoading = state.cohortSignal.pending || (!hasCohort && state.personas.length > 0 && !state.cohortSignal.error);
    const matchedCount = Number(cohort.matched_count);
    const mappedAgentCount = Number(cohort.mapped_agent_count);
    const totalMembers = Number(cohort.total_members);
    const matchedText = isLoading && !Number.isFinite(matchedCount) ? "확인 중" : fmtInt(matchedCount);
    const mappedText = isLoading && !Number.isFinite(mappedAgentCount) ? "확인 중" : fmtInt(mappedAgentCount);
    const totalText = isLoading && !Number.isFinite(totalMembers) ? "—" : fmtInt(totalMembers);
    const statusText = state.cohortSignal.error
      ? "고정 cohort 요약을 불러오지 못했습니다."
      : isLoading
        ? "현재 조건에 맞는 agent를 확인하고 있습니다."
        : "필터 변경 시 전이분석 없이 즉시 갱신됩니다.";
    matchedAgentSummary.innerHTML = `
      <div class="matchedAgentCards">
        <div class="summaryMiniCard"><div class="summaryLabel">매칭 agent</div><div class="summaryMiniValue mono">${escapeHtml(matchedText)}</div><div class="summaryHint">고정 cohort ${escapeHtml(totalText)}명 중</div></div>
        <div class="summaryMiniCard"><div class="summaryLabel">매핑 가능 agent</div><div class="summaryMiniValue mono">${escapeHtml(mappedText)}</div><div class="summaryHint">상태 모델이 있는 대표 페르소나</div></div>
      </div>
      <div class="matchedAgentMeta">
        <span class="badge label">실험 ${escapeHtml(experiment?.key || "선택 전")}</span>
        <span class="badge label">${escapeHtml(ageGroupLabel(state.selectedAgeGroup, "전체 나이대"))}</span>
        <span class="badge label">${escapeHtml(occupationGroupLabel(state.selectedOccupationGroup))}</span>
        <span class="badge label">${escapeHtml(styleKeyLabel(state.selectedStyleKey, "전체 유형"))}</span>
        <span class="summaryHint matchedAgentStatus">${escapeHtml(statusText)}</span>
      </div>`;
  }

  function renderOverlay() {
    const overlay = currentOverlay();
    const persona = currentPersona();
    const experiment = currentExperiment();
    if (generateOverlayBtn) generateOverlayBtn.disabled = state.pending || !persona || !experiment;
    if (!overlayPreview) return;
    if (state.pending) {
      overlayPreview.innerHTML = '<div class="emptyState compactEmpty">오버레이를 생성하고 있습니다...</div>';
      return;
    }
    if (!overlay) {
      overlayPreview.innerHTML = '<div class="emptyState compactEmpty">아직 생성된 오버레이가 없습니다.</div>';
      return;
    }
    const entries = Object.entries(overlay.edge_weight_multipliers || {});
    overlayPreview.innerHTML = `
      <div class="overlayPreviewMeta">
        <span class="badge running">variant ${escapeHtml(overlay.variant || "B")}</span>
        <span class="badge label">provider ${escapeHtml(overlay.provider || "unknown")}</span>
        <span class="badge label">${escapeHtml(personaLabel(persona))}</span>
      </div>
      <div class="overlayPreviewReason">${escapeHtml(overlay.reason_summary || "설명 없음")}</div>
      <div class="overlayPreviewList">${entries.map(([edge, multiplier]) => `<div class="overlayPreviewRow"><span title="${escapeHtml(edge)}">${escapeHtml(transitionEdgeLabel(edge))}</span><strong class="mono">x${escapeHtml(String(multiplier))}</strong></div>`).join("") || '<div class="emptyState compactEmpty">조정된 전이가 없습니다.</div>'}</div>`;
  }

  function renderTransitionRows(rows, mode) {
    const list = Array.isArray(rows) ? rows.slice(0, 8) : [];
    if (list.length === 0) return '<div class="emptyState compactEmpty">표시할 전이확률이 없습니다.</div>';
    return list.map((row) => {
      const rawEdge = transitionEdgeRaw(row.edge_id, row.from, row.to);
      const probability = mode === "baseline" ? row.probability : row.changed_probability;
      const baseline = row.baseline_probability;
      const delta = Number(row.delta);
      const deltaBadge = mode === "changed" && Number.isFinite(delta)
        ? `<span class="badge ${delta >= 0 ? "impactPos" : "impactNeg"}">${fmtSignedPct(delta)}</span>`
        : "";
      const multiplierBadge = mode === "changed" ? `<span class="badge label">x${escapeHtml(String(row.multiplier || 1))}</span>` : "";
      const baselineBadge = mode === "changed" ? `<span class="badge label">A ${fmtPct(baseline)}</span>` : "";
      return `<div class="transitionAnalysisRow">
        <div>
          <div class="simulationSegmentTitle" title="${escapeHtml(rawEdge)}">${escapeHtml(transitionEdgeLabel(row.edge_id, row.from, row.to))}</div>
          <div class="simulationSegmentMeta">
            <span class="badge label">agents ${fmtInt(row.agent_count)}</span>
            ${baselineBadge}${multiplierBadge}${deltaBadge}
          </div>
        </div>
        <strong class="mono">${fmtPct(probability)}</strong>
      </div>`;
    }).join("");
  }

  function transitionEdgeKey(row) {
    return row?.edge_id || `${row?.from || ""}->${row?.to || ""}`;
  }

  function transitionProbability(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function mergeTransitionGraphEdges(baselineRows, changedRows) {
    const baselineByEdge = new Map((Array.isArray(baselineRows) ? baselineRows : []).map((row) => [transitionEdgeKey(row), row]));
    return (Array.isArray(changedRows) ? changedRows : []).map((row) => {
      const edgeId = transitionEdgeKey(row);
      const baseline = baselineByEdge.get(edgeId) || {};
      const aProbability = transitionProbability(row.baseline_probability ?? baseline.probability);
      const bProbability = transitionProbability(row.changed_probability ?? row.probability);
      const delta = Number.isFinite(Number(row.delta)) ? Number(row.delta) : bProbability - aProbability;
      return {
        edgeId,
        from: row.from || baseline.from || edgeId.split("->")[0] || "unknown",
        to: row.to || baseline.to || edgeId.split("->")[1] || "unknown",
        aProbability,
        bProbability,
        delta,
        multiplier: row.multiplier ?? 1,
        agentCount: row.agent_count ?? baseline.agent_count ?? 0,
      };
    }).filter((edge) => edge.from && edge.to && (edge.aProbability > 0 || edge.bProbability > 0));
  }

  function selectTransitionGraphEdges(edges) {
    return edges.slice().sort((left, right) => {
      const leftDelta = Math.abs(left.delta);
      const rightDelta = Math.abs(right.delta);
      return rightDelta - leftDelta || right.bProbability - left.bProbability || right.agentCount - left.agentCount || left.edgeId.localeCompare(right.edgeId);
    }).slice(0, 10);
  }

  function transitionGraphDeltaClass(delta) {
    if (delta > 0.0005) return "positive";
    if (delta < -0.0005) return "negative";
    return "neutral";
  }

  function truncateTransitionStateLabel(value) {
    const text = String(value || "unknown");
    return text.length > 18 ? `${text.slice(0, 15)}...` : text;
  }

  function transitionGraphNodeLayout(edges) {
    const width = 760;
    const height = 330;
    const nodeIds = Array.from(new Set(edges.flatMap((edge) => [edge.from, edge.to]))).sort();
    const incoming = new Map();
    const outgoing = new Map();
    edges.forEach((edge) => {
      outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
      incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    });
    const columns = [[], [], []];
    nodeIds.forEach((id) => {
      const hasIncoming = incoming.has(id);
      const hasOutgoing = outgoing.has(id);
      const column = hasOutgoing && !hasIncoming ? 0 : hasIncoming && !hasOutgoing ? 2 : 1;
      columns[column].push(id);
    });
    const points = new Map();
    columns.forEach((ids, columnIndex) => {
      ids.sort((left, right) => {
        const leftDegree = (incoming.get(left) || 0) + (outgoing.get(left) || 0);
        const rightDegree = (incoming.get(right) || 0) + (outgoing.get(right) || 0);
        return rightDegree - leftDegree || left.localeCompare(right);
      });
      const gap = height / (ids.length + 1);
      ids.forEach((id, index) => {
        points.set(id, { x: 92 + columnIndex * 288, y: Math.round(gap * (index + 1)) });
      });
    });
    return { width, height, points };
  }

  function transitionGraphPath(fromPoint, toPoint, index) {
    if (!fromPoint || !toPoint) return "";
    const sweep = index % 2 === 0 ? 1 : -1;
    if (Math.abs(fromPoint.x - toPoint.x) < 24) {
      const loopX = fromPoint.x + 88 * sweep;
      const loopY = (fromPoint.y + toPoint.y) / 2 - 48 * sweep;
      return `M ${fromPoint.x} ${fromPoint.y} Q ${loopX} ${loopY} ${toPoint.x} ${toPoint.y}`;
    }
    const curve = Math.max(76, Math.abs(toPoint.x - fromPoint.x) * 0.36);
    return `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x + curve} ${fromPoint.y}, ${toPoint.x - curve} ${toPoint.y}, ${toPoint.x} ${toPoint.y}`;
  }

  function renderTransitionGraph(analysis) {
    const baselineRows = analysis?.a_baseline?.transitions;
    const changedRows = analysis?.b_changed?.transitions;
    const edges = selectTransitionGraphEdges(mergeTransitionGraphEdges(baselineRows, changedRows));
    if (edges.length === 0) return '<div class="emptyState compactEmpty">네트워크 그래프로 표시할 전이가 없습니다.</div>';

    const layout = transitionGraphNodeLayout(edges);
    const edgePaths = edges.map((edge, index) => {
      const fromPoint = layout.points.get(edge.from);
      const toPoint = layout.points.get(edge.to);
      const path = transitionGraphPath(fromPoint, toPoint, index);
      const deltaClass = transitionGraphDeltaClass(edge.delta);
      const labelX = fromPoint && toPoint ? Math.round((fromPoint.x + toPoint.x) / 2) : 0;
      const labelY = fromPoint && toPoint ? Math.round((fromPoint.y + toPoint.y) / 2) - 10 + (index % 3) * 12 : 0;
      const tooltip = `${transitionEdgeTooltip(edge.edgeId, edge.from, edge.to)}\nA ${fmtPct(edge.aProbability)} · B ${fmtPct(edge.bProbability)}\nDelta ${fmtSignedPct(edge.delta)} · x${edge.multiplier || 1}\nagents ${fmtInt(edge.agentCount)}`;
      const edgeLabel = `${transitionActionLabel(edge.to)} · ${fmtPct(edge.bProbability)} (${fmtSignedPct(edge.delta)})`;
      return `<g class="transitionGraphEdgeGroup">
        <path class="transitionGraphEdge baseline" d="${escapeHtml(path)}"><title>${escapeHtml(tooltip)}</title></path>
        <path class="transitionGraphEdge changed ${deltaClass}" d="${escapeHtml(path)}"><title>${escapeHtml(tooltip)}</title></path>
        <text class="transitionGraphEdgeLabel" x="${labelX}" y="${labelY}">${escapeHtml(edgeLabel)}<title>${escapeHtml(tooltip)}</title></text>
      </g>`;
    }).join("");
    const nodes = Array.from(layout.points.entries()).map(([id, point]) => `<g class="transitionGraphNode" transform="translate(${point.x} ${point.y})">
      <circle class="transitionGraphNodeCircle" r="22"><title>${escapeHtml(`${transitionStateLabel(id)}\n${id}`)}</title></circle>
      <text class="transitionGraphNodeLabel" y="38">${escapeHtml(truncateTransitionStateLabel(transitionStateLabel(id)))}<title>${escapeHtml(`${transitionStateLabel(id)}\n${id}`)}</title></text>
    </g>`).join("");

    return `<div class="transitionGraphCard" aria-label="A/B 전이확률 네트워크 그래프">
      <div class="transitionGraphHead">
        <div>
          <div class="summaryLabel">전이 네트워크 개요</div>
          <div class="summaryHint">delta와 B안 확률이 큰 상위 ${fmtInt(edges.length)}개 edge를 표시합니다.</div>
        </div>
        <div class="transitionGraphLegend" aria-label="그래프 범례">
          <span class="transitionGraphLegendItem"><span class="transitionGraphLegendLine baseline"></span>A baseline</span>
          <span class="transitionGraphLegendItem"><span class="transitionGraphLegendLine positive"></span>B 증가</span>
          <span class="transitionGraphLegendItem"><span class="transitionGraphLegendLine negative"></span>B 감소</span>
        </div>
      </div>
      <div class="transitionGraphViewport">
        <svg class="transitionGraphSvg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="전이 상태 노드와 A/B 확률 변화 edge 그래프">
          <defs>
            <marker id="transitionGraphArrowPositive" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="transitionGraphArrow positive" d="M 0 0 L 10 5 L 0 10 z"></path></marker>
            <marker id="transitionGraphArrowNegative" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="transitionGraphArrow negative" d="M 0 0 L 10 5 L 0 10 z"></path></marker>
            <marker id="transitionGraphArrowNeutral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="transitionGraphArrow neutral" d="M 0 0 L 10 5 L 0 10 z"></path></marker>
          </defs>
          ${edgePaths}
          ${nodes}
        </svg>
      </div>
    </div>`;
  }

  function renderTransitionAnalysis() {
    const experiment = currentExperiment();
    if (analyzeTransitionsBtn) analyzeTransitionsBtn.disabled = state.transitionAnalysis.pending || !experiment;
    if (!transitionAnalysisResults) return;
    const current = state.transitionAnalysis;
    if (analyzeTransitionsBtn) analyzeTransitionsBtn.setAttribute("aria-expanded", current.expanded ? "true" : "false");
    transitionAnalysisResults.hidden = !current.expanded;
    if (!current.expanded) {
      if (transitionAnalysisStatus) transitionAnalysisStatus.textContent = experiment ? "전이확률은 필요할 때만 확인합니다. 버튼을 누르면 그래프와 A/B 전이표가 열립니다." : "실험을 먼저 선택하세요.";
      transitionAnalysisResults.innerHTML = "";
      return;
    }
    if (current.pending) {
      if (transitionAnalysisStatus) transitionAnalysisStatus.textContent = "선택 cohort agent 기준 전이확률을 분석하고 있습니다.";
      transitionAnalysisResults.innerHTML = '<div class="emptyState compactEmpty">A안 baseline과 B안 변경 전이확률을 생성하는 중입니다.</div>';
      return;
    }
    if (current.error) {
      if (transitionAnalysisStatus) transitionAnalysisStatus.textContent = "전이확률 분석에 실패했습니다.";
      transitionAnalysisResults.innerHTML = `<div class="emptyState compactEmpty">${escapeHtml(current.error)}</div>`;
      return;
    }
    const analysis = current.result;
    if (!analysis) {
      if (transitionAnalysisStatus) transitionAnalysisStatus.textContent = experiment ? "현재 cohort 필터 기준으로 분석을 실행할 수 있습니다." : "실험을 먼저 선택하세요.";
      transitionAnalysisResults.innerHTML = '<div class="emptyState compactEmpty">아직 전이확률 분석 결과가 없습니다.</div>';
      return;
    }
    const baseline = analysis.a_baseline || {};
    const changed = analysis.b_changed || {};
    const interpretation = analysis.b_interpretation || {};
    const representative = analysis.representative_persona || {};
    if (transitionAnalysisStatus) transitionAnalysisStatus.textContent = `${fmtInt(analysis.cohort?.matched_count)}명 cohort agent 기준 분석 완료`;
    transitionAnalysisResults.innerHTML = `<div class="transitionAnalysisStack">
      <div class="simulationResultGrid">
        <div class="summaryMiniCard"><div class="summaryLabel">매칭 agent</div><div class="summaryMiniValue mono">${fmtInt(analysis.cohort?.matched_count)}</div><div class="summaryHint">현재 cohort 필터</div></div>
        <div class="summaryMiniCard"><div class="summaryLabel">매핑 agent</div><div class="summaryMiniValue mono">${fmtInt(analysis.cohort?.mapped_agent_count)}</div><div class="summaryHint">state model 사용 가능</div></div>
        <div class="summaryMiniCard"><div class="summaryLabel">A edge</div><div class="summaryMiniValue mono">${fmtInt(baseline.edge_count)}</div><div class="summaryHint">baseline transition</div></div>
        <div class="summaryMiniCard"><div class="summaryLabel">B changed</div><div class="summaryMiniValue mono">${fmtInt(changed.changed_edge_count)}</div><div class="summaryHint">multiplier 적용 edge</div></div>
      </div>
      <div class="summaryMiniCard">
        <div class="summaryLabel">LLM B안 해석</div>
        <div class="summaryHint">provider ${escapeHtml(interpretation.provider || "fallback")} · persona 해석 ${fmtInt(interpretation.interpretation_count || 1)}개 · 대표 ${escapeHtml(localizeKnownSegmentText(representative.group_label || representative.id, "—"))}</div>
        <div class="transitionInterpretation">${escapeHtml(interpretation.reason_summary || "해석 결과 없음")}</div>
      </div>
      ${renderTransitionGraph(analysis)}
      <div class="transitionAnalysisColumns">
        <div>
          <div class="summaryLabel">A안 baseline 전이확률</div>
          <div class="transitionAnalysisList">${renderTransitionRows(baseline.transitions, "baseline")}</div>
        </div>
        <div>
          <div class="summaryLabel">B안 변경 후 전이확률</div>
          <div class="transitionAnalysisList">${renderTransitionRows(changed.transitions, "changed")}</div>
        </div>
      </div>
    </div>`;
  }

  function renderCoverageDiagnostics(diagnostics) {
    if (!diagnostics) return "";
    return `
        <div class="simulationResultGrid">
          <div class="summaryMiniCard"><div class="summaryLabel">커버된 모집단 가중치</div><div class="summaryMiniValue mono">${fmtPct(diagnostics.covered_population_weight)}</div><div class="summaryHint">가상 agent 모집단 커버리지</div></div>
        </div>`;
  }

  function simulationModeLabel(mode) {
    if (mode === FIXED_COHORT_MODE) return "Nemotron 고정 10k";
    if (mode === "synthetic") return "Synthetic";
    return mode || "—";
  }

  function renderCohortMetadata(run) {
    if (!run) return "";
    const cohortMetadata = run.cohort_metadata || {};
    const observedPopulationSize = Number(run.observed_population_size ?? cohortMetadata.observed_num_rows_total);
    const cards = [
      run.mode ? `<div class="summaryMiniCard"><div class="summaryLabel">실행 모드</div><div class="summaryMiniValue mono">${escapeHtml(simulationModeLabel(run.mode))}</div><div class="summaryHint">source mode</div></div>` : "",
      run.cohort_id ? `<div class="summaryMiniCard"><div class="summaryLabel">코호트</div><div class="summaryMiniValue mono">${escapeHtml(run.cohort_id)}</div><div class="summaryHint">cohort id</div></div>` : "",
      Number.isFinite(observedPopulationSize) && observedPopulationSize > 0 ? `<div class="summaryMiniCard"><div class="summaryLabel">관측 모집단</div><div class="summaryMiniValue mono">${fmtInt(observedPopulationSize)}</div><div class="summaryHint">Nemotron source rows</div></div>` : "",
    ].filter(Boolean);
    return cards.length ? `<div class="simulationResultGrid">${cards.join("")}</div>` : "";
  }

  function renderSimulationContext() {
    if (!simulationContext) return;
    const experiment = currentExperiment();
    const persona = currentPersona();
    const age = ageGroupLabel(state.selectedAgeGroup, "전체 나이대");
    const occupation = occupationGroupLabel(state.selectedOccupationGroup);
    const stylePersona = state.personas.find((item) => item.style_key === state.selectedStyleKey);
    const style = state.selectedStyleKey ? styleKeyLabel(state.selectedStyleKey, stylePersona?.style_label || "전체 유형") : "전체 유형";
    simulationContext.innerHTML = `
      <span class="badge label">실험 ${escapeHtml(experiment?.key || "선택 전")}</span>
      <span class="badge label">${escapeHtml(age)}</span>
      <span class="badge label">${escapeHtml(occupation)}</span>
      <span class="badge label">${escapeHtml(style)}</span>
      <span class="badge label">${escapeHtml(personaLabel(persona))}</span>`;
  }

  function renderSimulation() {
    const experiment = currentExperiment();
    renderSimulationContext();
    if (runSimulationBtn) runSimulationBtn.disabled = state.simulationPending || !experiment;
    if (!simulationResults) return;

    if (state.simulationPending) {
      if (simulationStatus) simulationStatus.textContent = "Nemotron 고정 10k 코호트를 실행하고 있습니다...";
      simulationResults.innerHTML = '<div class="emptyState compactEmpty">Nemotron 고정 10k 코호트 시뮬레이션 실행 중입니다.</div>';
      return;
    }
    if (state.simulationError) {
      if (simulationStatus) simulationStatus.textContent = "시뮬레이션 실행에 실패했습니다.";
      simulationResults.innerHTML = `<div class="emptyState compactEmpty">${escapeHtml(state.simulationError)}</div>`;
      return;
    }
    const run = state.simulationRun;
    const results = run?.results;
    if (!run || !results) {
      if (simulationStatus) simulationStatus.textContent = experiment ? "실행하면 Nemotron 고정 10k 코호트 기반 A/B 결과가 표시됩니다." : "실험을 먼저 선택하세요.";
      simulationResults.innerHTML = '<div class="emptyState compactEmpty">Nemotron 고정 10k 코호트 실행 결과가 아직 없습니다. 결과는 synthetic persona simulation이며 실제 사용자 행동의 증명은 아닙니다.</div>';
      return;
    }

    const variantA = results.variants?.A || {};
    const variantB = results.variants?.B || {};
    const conversion = results.statistics?.conversion || {};
    const summary = results.summary || {};
    const sampleSize = Number(run.sample_size) || ((Number(variantA.sessions) || 0) + (Number(variantB.sessions) || 0));
    const populationSize = Number(run.population_size) || 0;
    const diagnostics = run.coverage_diagnostics || results.coverage_diagnostics || null;
    const coveredPopulationWeight = Number(diagnostics?.covered_population_weight);
    const diagnosticCoverage = Number(diagnostics?.coverage_rate);
    const fallbackCoverage = populationSize > 0 ? sampleSize / populationSize : null;
    const coverage = Number.isFinite(diagnosticCoverage) ? diagnosticCoverage : fallbackCoverage;
    const statusClass = run.status === "completed" ? "running" : run.status === "failed" ? "paused" : "draft";
    const winnerText = summary.winner === "tie" ? "동률" : `Variant ${summary.winner || "—"}`;

    if (simulationStatus) simulationStatus.textContent = `run ${run.run_id || "—"} · ${run.status || "completed"}`;
    simulationResults.innerHTML = `
      <div class="simulationResultStack">
        <div class="simulationBadgeRow">
          <span class="badge ${statusClass}">${escapeHtml(run.status || "completed")}</span>
          <span class="badge label">winner ${escapeHtml(winnerText)}</span>
          ${run.mode ? `<span class="badge label">mode ${escapeHtml(simulationModeLabel(run.mode))}</span>` : ""}
          ${run.cohort_id ? `<span class="badge label">cohort ${escapeHtml(run.cohort_id)}</span>` : ""}
          <span class="badge label">sample ${fmtInt(sampleSize)}</span>
          <span class="badge label">커버 가중치 ${fmtPct(Number.isFinite(coveredPopulationWeight) ? coveredPopulationWeight : coverage)}</span>
        </div>
        ${renderCohortMetadata(run)}
        <div class="simulationResultGrid">
          <div class="summaryMiniCard"><div class="summaryLabel">A 전환율</div><div class="summaryMiniValue mono">${fmtPct(variantA.cvr)}</div><div class="summaryHint">${fmtInt(variantA.conversions)} / ${fmtInt(variantA.sessions)}</div></div>
          <div class="summaryMiniCard"><div class="summaryLabel">B 전환율</div><div class="summaryMiniValue mono">${fmtPct(variantB.cvr)}</div><div class="summaryHint">${fmtInt(variantB.conversions)} / ${fmtInt(variantB.sessions)}</div></div>
          <div class="summaryMiniCard"><div class="summaryLabel">Uplift</div><div class="summaryMiniValue mono">${fmtSignedPct(summary.uplift ?? conversion.uplift)}</div><div class="summaryHint">B - A ${fmtSignedPct(conversion.diff)}</div></div>
          <div class="summaryMiniCard"><div class="summaryLabel">p-value</div><div class="summaryMiniValue mono">${fmtPValue(conversion.p_value)}</div><div class="summaryHint">${conversion.significant ? "유의미한 차이" : "유의성 판단 전"}</div></div>
        </div>
        <div class="simulationVariantGrid">
          <div class="summaryMiniCard"><div class="summaryLabel">Variant A</div><div class="summaryMiniValue mono">${fmtInt(variantA.sessions)} sessions</div><div class="summaryHint">CTR ${fmtPct(variantA.ctr)} · clicks ${fmtInt(variantA.clicks)}</div></div>
          <div class="summaryMiniCard"><div class="summaryLabel">Variant B</div><div class="summaryMiniValue mono">${fmtInt(variantB.sessions)} sessions</div><div class="summaryHint">CTR ${fmtPct(variantB.ctr)} · clicks ${fmtInt(variantB.clicks)}</div></div>
        </div>
        ${renderCoverageDiagnostics(diagnostics)}
        <div class="simulationCaveat">주의: 이 결과는 synthetic persona simulation이며 실제 사용자 행동이나 통계적 proof가 아닙니다. 실제 배포 판단에는 운영 데이터와 함께 확인하세요.</div>
      </div>`;
  }

  function estimateImpact(change) {
    const actions = Array.isArray(change?.actions) ? change.actions : [];
    const action = actions[0] || null;
    if (change?.type === "inject_css") return { pct: 10, label: "고급 CSS", direction: "positive" };
    if (action?.type === "hide") return { pct: -7, label: "숨김 반응", direction: "negative" };
    if (action?.type === "show") return { pct: 5, label: "노출 확대", direction: "positive" };
    if (action?.type === "set_text") return { pct: 8, label: "문구 반응", direction: "positive" };
    if (action?.type === "set_attr") return { pct: 11, label: "링크 이동", direction: "positive" };
    if (action?.type === "set_style") return { pct: 12, label: "스타일 반응", direction: "positive" };
    return { pct: 4, label: "변화 반응", direction: "positive" };
  }

  function previewTarget() {
    const site = state.sites.find((item) => item.site_id === state.siteId) || null;
    const targets = Array.isArray(site?.preview_targets) ? site.preview_targets : [];
    const experiment = currentExperiment();
    return targets.find((target) => target.experiment_key === experiment?.key)
      || targets.find((target) => String(target.url_prefix || "") === String(experiment?.url_prefix || ""))
      || targets[0]
      || null;
  }

  function appendAbForce(urlString) {
    const url = new URL(urlString, location.origin);
    url.searchParams.set("__ab_force", "B");
    return url.toString();
  }

  function renderPreview() {
    const experiment = currentExperiment();
    const persona = currentPersona();
    const target = previewTarget();
    const changes = Array.isArray(experiment?.variants?.B) ? experiment.variants.B : [];
    if (!previewFrame || !previewLayer || !previewStage) return;
    if (!target || !(target.preview_url || target.live_url)) {
      previewFrame.removeAttribute("src");
      previewLayer.innerHTML = "";
      if (previewSentence) previewSentence.textContent = "미리보기 URL이 설정되어 있지 않습니다.";
      return;
    }
    const impacts = changes.map(estimateImpact);
    const avg = impacts.length ? Math.round(impacts.reduce((sum, item) => sum + item.pct, 0) / impacts.length) : 0;
    if (previewSentence) previewSentence.textContent = `${personaLabel(persona)} 고객의 클릭 전환율이 평균 ${avg > 0 ? "+" : ""}${avg}% ${avg >= 0 ? "증가" : "감소"}할 것으로 예상됩니다.`;
    if (previewMeta) previewMeta.innerHTML = impacts.slice(0, 6).map((item) => `<span class="badge ${item.direction === "positive" ? "impactPos" : "impactNeg"}">${escapeHtml(item.label)} ${item.pct > 0 ? "+" : ""}${item.pct}%</span>`).join("");

    previewFrame.onload = () => {
      let doc = null;
      try { doc = previewFrame.contentDocument; } catch { doc = null; }
      if (!doc) return;
      const height = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0, 900);
      previewFrame.style.height = `${height}px`;
      previewStage.style.height = `${height}px`;
      previewLayer.style.height = `${height}px`;
      previewLayer.innerHTML = "";
      changes.forEach((change) => {
        const impact = estimateImpact(change);
        const marker = document.createElement("div");
        marker.className = "experimentOverlayMarker";
        marker.dataset.direction = impact.direction;
        let rect = null;
        if (change.type !== "inject_css" && change.selector) {
          try { rect = doc.querySelector(change.selector)?.getBoundingClientRect() || null; } catch { rect = null; }
        }
        marker.style.left = `${rect ? Math.max(0, Math.round(rect.left)) : 16}px`;
        marker.style.top = `${rect ? Math.max(0, Math.round(rect.top)) : 16 + (previewLayer.children.length * 86)}px`;
        marker.style.width = rect ? `${Math.max(64, Math.round(rect.width))}px` : "min(420px, calc(100% - 32px))";
        marker.style.height = rect ? `${Math.max(32, Math.round(rect.height))}px` : "72px";
        marker.innerHTML = `<div class="experimentOverlayMarkerInner"><span class="experimentOverlayMarkerPct">${impact.pct > 0 ? "+" : ""}${impact.pct}%</span><span>${escapeHtml(change.label || change.selector || impact.label)}</span></div>`;
        previewLayer.appendChild(marker);
      });
    };
    previewFrame.src = appendAbForce(target.preview_url || target.live_url);
  }

  function renderAll() {
    populateSelectors();
    if (personaCount) personaCount.textContent = fmtInt(state.personas.length);
    if (experimentCount) experimentCount.textContent = fmtInt(state.experiments.length);
    if (overlayCount) overlayCount.textContent = fmtInt(state.overlays.length);
    if (labStatus) labStatus.textContent = state.selectedExperimentKey && state.selectedPersonaId ? "실험실 준비 완료" : "실험과 페르소나를 선택하세요.";
    renderMatchedAgentSummary();
    renderPersona();
    renderExperiment();
    renderTransitionAnalysis();
    renderSimulation();
    renderOverlay();
    renderPreview();
  }

  async function loadLab() {
    const user = await fetchAuthMe();
    if (authUserLabel) authUserLabel.textContent = user?.display_name || user?.username || "";
    state.sites = await fetchSites();
    populateSites(user);
    const [experiments, personas, overlays] = await Promise.all([fetchExperiments(), fetchPersonas(), fetchOverlays()]);
    state.experiments = experiments;
    state.personas = personas;
    state.overlays = overlays;
    if (!state.selectedExperimentKey) state.selectedExperimentKey = experiments[0]?.key || "";
    if (!state.selectedPersonaId) state.selectedPersonaId = personas[0]?.id || "";
    state.metrics = await fetchMetrics();
    renderAll();
    refreshCohortSignal();
  }

  function handleCohortFilterChange(updater) {
    updater();
    resetTransitionAnalysis();
    resetCohortSignal();
    renderAll();
    refreshCohortSignal();
  }

  if (siteSelect) siteSelect.addEventListener("change", async () => {
    state.siteId = siteSelect.value || DEFAULT_SITE_ID;
    state.selectedExperimentKey = "";
    state.selectedPersonaId = "";
    state.selectedAgeGroup = "";
    state.selectedOccupationGroup = "";
    state.selectedStyleKey = "";
    resetTransitionAnalysis();
    resetCohortSignal();
    state.simulationRun = null;
    state.simulationError = "";
    localStorage.setItem(SITE_STORAGE_KEY, state.siteId);
    setSiteInUrl(state.siteId);
    await loadLab().catch((error) => { if (labStatus) labStatus.textContent = String(error); });
  });
  if (experimentSelect) experimentSelect.addEventListener("change", async () => {
    state.selectedExperimentKey = experimentSelect.value || "";
    state.simulationRun = null;
    state.simulationError = "";
    resetTransitionAnalysis();
    state.metrics = await fetchMetrics();
    renderAll();
  });
  if (ageGroupSelect) ageGroupSelect.addEventListener("change", () => handleCohortFilterChange(() => { state.selectedAgeGroup = ageGroupSelect.value || ""; }));
  if (occupationGroupSelect) occupationGroupSelect.addEventListener("change", () => handleCohortFilterChange(() => { state.selectedOccupationGroup = occupationGroupSelect.value || ""; }));
  if (styleSelect) styleSelect.addEventListener("change", () => handleCohortFilterChange(() => { state.selectedStyleKey = styleSelect.value || ""; }));
  if (personaSelect) personaSelect.addEventListener("change", async () => { state.selectedPersonaId = personaSelect.value || ""; state.metrics = await fetchMetrics(); renderAll(); });
  if (simulationSampleSize) simulationSampleSize.addEventListener("change", () => { simulationSampleSize.value = String(clampSampleSize(simulationSampleSize.value)); });
  if (runSimulationBtn) runSimulationBtn.addEventListener("click", runSimulation);
  if (analyzeTransitionsBtn) analyzeTransitionsBtn.addEventListener("click", analyzeTransitions);
  if (generateOverlayBtn) generateOverlayBtn.addEventListener("click", generateOverlay);
  if (reloadPreviewBtn) reloadPreviewBtn.addEventListener("click", renderPreview);
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadLab().catch((error) => { if (labStatus) labStatus.textContent = String(error); }));
  if (logoutBtn) logoutBtn.addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); location.href = "/login"; });
  if (editorLink) editorLink.href = `/editor?site_id=${encodeURIComponent(state.siteId)}`;

  loadLab().catch((error) => { if (labStatus) labStatus.textContent = String(error); });
})();
