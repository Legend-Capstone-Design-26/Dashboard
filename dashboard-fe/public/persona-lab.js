(function () {
  const DEFAULT_SITE_ID = "legend-ecommerce";
  const SITE_STORAGE_KEY = "uxsdk.dashboard.siteId";

  const siteSelect = document.getElementById("siteSelect");
  const authUserLabel = document.getElementById("authUserLabel");
  const logoutBtn = document.getElementById("logoutBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const editorLink = document.getElementById("editorLink");
  const experimentSelect = document.getElementById("experimentSelect");
  const ageGroupSelect = document.getElementById("ageGroupSelect");
  const styleSelect = document.getElementById("styleSelect");
  const personaSelect = document.getElementById("personaSelect");
  const personaCount = document.getElementById("personaCount");
  const experimentCount = document.getElementById("experimentCount");
  const overlayCount = document.getElementById("overlayCount");
  const labStatus = document.getElementById("labStatus");
  const personaProfile = document.getElementById("personaProfile");
  const experimentSummary = document.getElementById("experimentSummary");
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
    selectedStyleKey: "",
    pending: false,
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

  function currentExperiment() {
    return state.experiments.find((item) => item.key === state.selectedExperimentKey) || null;
  }

  function currentPersona() {
    return state.personas.find((item) => item.id === state.selectedPersonaId) || null;
  }

  function currentOverlay() {
    return state.overlays.find((item) => item.experiment_key === state.selectedExperimentKey && item.persona_id === state.selectedPersonaId && item.variant === "B") || null;
  }

  function personaLabel(persona) {
    if (!persona) return "페르소나";
    const age = AGE_GROUP_LABELS[persona.age_group] || persona.age_group || "전체";
    const style = persona.style_label || persona.style_key || "유형";
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

    const ageOptions = Array.from(new Set(state.personas.map((persona) => persona.age_group).filter(Boolean)));
    const styleOptions = Array.from(new Set(state.personas.map((persona) => persona.style_key).filter(Boolean)));

    if (ageGroupSelect) {
      ageGroupSelect.innerHTML = '<option value="">전체 나이대</option>';
      ageOptions.forEach((age) => {
        const option = document.createElement("option");
        option.value = age;
        option.textContent = AGE_GROUP_LABELS[age] || age;
        ageGroupSelect.appendChild(option);
      });
      ageGroupSelect.value = state.selectedAgeGroup;
    }

    if (styleSelect) {
      styleSelect.innerHTML = '<option value="">전체 유형</option>';
      styleOptions.forEach((styleKey) => {
        const persona = state.personas.find((item) => item.style_key === styleKey);
        const option = document.createElement("option");
        option.value = styleKey;
        option.textContent = persona?.style_label || styleKey;
        styleSelect.appendChild(option);
      });
      styleSelect.value = state.selectedStyleKey;
    }

    const filtered = state.personas.filter((persona) => {
      if (state.selectedAgeGroup && persona.age_group !== state.selectedAgeGroup) return false;
      if (state.selectedStyleKey && persona.style_key !== state.selectedStyleKey) return false;
      return true;
    });
    if (!filtered.some((persona) => persona.id === state.selectedPersonaId)) state.selectedPersonaId = filtered[0]?.id || "";

    if (personaSelect) {
      personaSelect.innerHTML = '<option value="">페르소나 선택</option>';
      filtered.forEach((persona) => {
        const option = document.createElement("option");
        option.value = persona.id;
        option.textContent = persona.group_label || persona.description || persona.id;
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
      (Array.isArray(state?.transitions) ? state.transitions : []).map((transition) => `${stateId}->${transition.to}`)
    ).slice(0, 12);
    personaProfile.innerHTML = `
      <div class="summaryMiniCard">
        <div class="summaryLabel">대표 페르소나</div>
        <div class="summaryMiniValue">${escapeHtml(persona.group_label || persona.description || persona.id)}</div>
        <div class="summaryHint">${escapeHtml(personaLabel(persona))} · ${escapeHtml(persona.runner_type || "runner")}</div>
      </div>
      <div class="personaTraits">${traits.concat(rules).slice(0, 8).map((item) => `<span class="personaTrait">${escapeHtml(item)}</span>`).join("") || '<span class="personaTrait">성향 정보 없음</span>'}</div>
      <div class="transitionList">${transitions.map((item) => `<span class="transitionChip mono">${escapeHtml(item)}</span>`).join("") || '<span class="transitionChip">상태 전이 없음</span>'}</div>`;
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
      <div class="overlayPreviewList">${entries.map(([edge, multiplier]) => `<div class="overlayPreviewRow"><span class="mono">${escapeHtml(edge)}</span><strong class="mono">x${escapeHtml(String(multiplier))}</strong></div>`).join("") || '<div class="emptyState compactEmpty">조정된 전이가 없습니다.</div>'}</div>`;
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
    renderPersona();
    renderExperiment();
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
  }

  if (siteSelect) siteSelect.addEventListener("change", async () => {
    state.siteId = siteSelect.value || DEFAULT_SITE_ID;
    state.selectedExperimentKey = "";
    state.selectedPersonaId = "";
    localStorage.setItem(SITE_STORAGE_KEY, state.siteId);
    setSiteInUrl(state.siteId);
    await loadLab().catch((error) => { if (labStatus) labStatus.textContent = String(error); });
  });
  if (experimentSelect) experimentSelect.addEventListener("change", async () => {
    state.selectedExperimentKey = experimentSelect.value || "";
    state.metrics = await fetchMetrics();
    renderAll();
  });
  if (ageGroupSelect) ageGroupSelect.addEventListener("change", () => { state.selectedAgeGroup = ageGroupSelect.value || ""; renderAll(); });
  if (styleSelect) styleSelect.addEventListener("change", () => { state.selectedStyleKey = styleSelect.value || ""; renderAll(); });
  if (personaSelect) personaSelect.addEventListener("change", async () => { state.selectedPersonaId = personaSelect.value || ""; state.metrics = await fetchMetrics(); renderAll(); });
  if (generateOverlayBtn) generateOverlayBtn.addEventListener("click", generateOverlay);
  if (reloadPreviewBtn) reloadPreviewBtn.addEventListener("click", renderPreview);
  if (refreshBtn) refreshBtn.addEventListener("click", () => loadLab().catch((error) => { if (labStatus) labStatus.textContent = String(error); }));
  if (logoutBtn) logoutBtn.addEventListener("click", async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); location.href = "/login"; });
  if (editorLink) editorLink.href = `/editor?site_id=${encodeURIComponent(state.siteId)}`;

  loadLab().catch((error) => { if (labStatus) labStatus.textContent = String(error); });
})();
