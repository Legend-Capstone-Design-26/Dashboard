// public/editor.js
(function () {
  const frame = document.getElementById("previewFrame");
  const targetSelect = document.getElementById("targetSelect");
  const reloadBtn = document.getElementById("reloadBtn");
  const authUserLabel = document.getElementById("authUserLabel");
  const logoutBtn = document.getElementById("logoutBtn");
  const openDashboardLink = document.getElementById("openDashboardLink");
  const togglePickBtn = document.getElementById("togglePickBtn");

  const variantABtn = document.getElementById("variantABtn");
  const variantBBtn = document.getElementById("variantBBtn");

  const expKeyInput = document.getElementById("expKey");
  const experimentVersionText = document.getElementById("experimentVersionText");
  const urlPrefixInput = document.getElementById("urlPrefix");

  const elementNameText = document.getElementById("elementNameText");
  const statusText = document.getElementById("statusText");
  const selectorText = document.getElementById("selectorText");
  const tagText = document.getElementById("tagText");
  const trackIdText = document.getElementById("trackIdText");
  const textText = document.getElementById("textText");
  const rectText = document.getElementById("rectText");
  const logBox = document.getElementById("logBox");

  const actionType = document.getElementById("actionType");
  const intentButtons = Array.from(document.querySelectorAll(".intentBtn"));
  const textPanel = document.getElementById("textPanel");
  const stylePanel = document.getElementById("stylePanel");
  const visibilityPanel = document.getElementById("visibilityPanel");
  const linkPanel = document.getElementById("linkPanel");
  const advancedEditorBox = document.getElementById("advancedEditorBox");
  const valueRow = document.getElementById("valueRow");
  const valueLabel = valueRow.querySelector(".formLabel");
  const actionValue = document.getElementById("actionValue");

  const attrRow = document.getElementById("attrRow");
  const attrName = document.getElementById("attrName");
  const attrValue = document.getElementById("attrValue");

  const cssRow = document.getElementById("cssRow");
  const cssValue = document.getElementById("cssValue");
  const styleRow = document.getElementById("styleRow");
  const styleValue = document.getElementById("styleValue");
  const styleWidth = document.getElementById("styleWidth");
  const styleHeight = document.getElementById("styleHeight");
  const styleFontSize = document.getElementById("styleFontSize");
  const styleFontWeight = document.getElementById("styleFontWeight");
  const styleRadius = document.getElementById("styleRadius");
  const styleTextAlign = document.getElementById("styleTextAlign");
  const enableTextColor = document.getElementById("enableTextColor");
  const styleTextColor = document.getElementById("styleTextColor");
  const enableBackgroundColor = document.getElementById("enableBackgroundColor");
  const styleBackgroundColor = document.getElementById("styleBackgroundColor");
  const stylePaddingX = document.getElementById("stylePaddingX");
  const stylePaddingY = document.getElementById("stylePaddingY");
  const styleMoveX = document.getElementById("styleMoveX");
  const styleMoveY = document.getElementById("styleMoveY");
  const visibilityInputs = Array.from(document.querySelectorAll('input[name="visibilityMode"]'));
  const linkHrefValue = document.getElementById("linkHrefValue");
  const linkLabelValue = document.getElementById("linkLabelValue");

  const addChangeBtn = document.getElementById("addChangeBtn");
  const applyNowBtn = document.getElementById("applyNowBtn");
  const realApplyBtn = document.getElementById("realApplyBtn");
  const openRealBtn = document.getElementById("openRealBtn");
  const clearChangesBtn = document.getElementById("clearChangesBtn");

  const changesList = document.getElementById("changesList");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const copyJsonBtn = document.getElementById("copyJsonBtn");
  const jsonBox = document.getElementById("jsonBox");
  const editorCopilotExpKey = document.getElementById("editorCopilotExpKey");
  const editorImportedState = document.getElementById("editorImportedState");
  const applyImportedDraftBtn = document.getElementById("applyImportedDraftBtn");
  const editorCopilotRoot = document.getElementById("editorCopilotRoot");
  const editorCopilotToggleBtn = document.getElementById("editorCopilotToggleBtn");

  const editTargetsBtn = document.getElementById("editTargetsBtn");
  const targetsModal = document.getElementById("targetsModal");
  const targetsModalCloseBtn = document.getElementById("targetsModalCloseBtn");
  const targetsModalCancelBtn = document.getElementById("targetsModalCancelBtn");
  const targetsModalSaveBtn = document.getElementById("targetsModalSaveBtn");
  const targetsTableBody = document.getElementById("targetsTableBody");
  const addTargetRowBtn = document.getElementById("addTargetRowBtn");
  const targetsModalStatus = document.getElementById("targetsModalStatus");

  const DRAFT_STORAGE_KEY = "uxsdk.analyticsCopilotDraft";
  const DASHBOARD_SITE_STORAGE_KEY = "uxsdk.dashboard.siteId";
  const DEFAULT_SITE_ID = "legend-ecommerce";

  function resolveSiteId() {
    const params = new URLSearchParams(location.search);
    const querySiteId = (params.get("site_id") || "").trim();
    const storedSiteId = (localStorage.getItem(DASHBOARD_SITE_STORAGE_KEY) || "").trim();
    return querySiteId || storedSiteId || DEFAULT_SITE_ID;
  }

  let currentSiteId = resolveSiteId();
  localStorage.setItem(DASHBOARD_SITE_STORAGE_KEY, currentSiteId);
  let authUser = null;

  async function fetchAuthMe() {
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
    const allowed = Array.isArray(authUser?.allowed_site_ids) ? authUser.allowed_site_ids : [];
    if (allowed.length === 0) return currentSiteId;
    currentSiteId = allowed.includes(currentSiteId) ? currentSiteId : (authUser.default_site_id || allowed[0]);
    localStorage.setItem(DASHBOARD_SITE_STORAGE_KEY, currentSiteId);
    return currentSiteId;
  }

  function getDashboardUrl() {
    const url = new URL("/dashboard", location.origin);
    url.searchParams.set("site_id", currentSiteId);
    return `${url.pathname}${url.search}`;
  }

  function appendAbForce(urlString, forceVariant) {
    const url = new URL(urlString, location.origin);
    if (forceVariant) url.searchParams.set("__ab_force", forceVariant);
    return url.toString();
  }

  function setExperimentVersion(version) {
    const n = Number(version);
    const next = Number.isFinite(n) && n > 0 ? n : null;
    currentExperimentVersion = next;
    if (experimentVersionText) {
      experimentVersionText.textContent = next ? `v${next}` : "—";
    }
  }

  if (openDashboardLink) {
    openDashboardLink.href = getDashboardUrl();
  }
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      location.href = "/login";
    });
  }

  let pickMode = true;
  let currentVariant = "A";
  let currentComposerMode = "text";
  let currentSiteConfig = null;
  let currentTarget = null;
  let lastSelected = null;
  let currentExperimentVersion = null;
  let changesB = [];
  let latestImportedDraft = null;
  let copilot = null;

  function log(msg) {
    const t = new Date().toLocaleTimeString();
    logBox.textContent = `[${t}] ${msg}\n` + logBox.textContent;
  }

  function postToFrame(type, payload) {
    try {
      frame.contentWindow.postMessage({ type, ...(payload || {}) }, location.origin);
      return true;
    } catch (e) {
      log(`postMessage 실패: ${String(e)}`);
      return false;
    }
  }

  function setPickMode(on) {
    pickMode = on;
    togglePickBtn.dataset.state = on ? "on" : "off";
    togglePickBtn.textContent = on ? "요소 선택 켜짐" : "요소 선택 꺼짐";
    togglePickBtn.classList.toggle("is-on", on);
    postToFrame("EDITOR_SET_PICKMODE", { pickMode: on });
    log(`요소 선택 ${on ? "켜짐" : "꺼짐"}`);
  }

  function setVariant(v, options) {
    currentVariant = v;
    variantABtn.classList.toggle("active", v === "A");
    variantBBtn.classList.toggle("active", v === "B");

    if (options?.refreshFrame && currentTarget) {
      applyTarget(currentTarget, { preserveExpKey: true, forceVariant: v });
      return;
    }

    if (v === "A") {
      postToFrame("EDITOR_PREVIEW_SET_VARIANT", { variant: "A", changes: [] });
      log("미리보기 -> 원본 화면(A)");
    } else {
      postToFrame("EDITOR_PREVIEW_SET_VARIANT", { variant: "B", changes: changesB });
      log(`미리보기 -> 편집 화면(B), 변경 ${changesB.length}개`);
    }
  }

  // iframe 로드마다 선택 도구 주입
  function injectOverlay() {
    statusText.textContent = "화면을 불러왔습니다. 선택 도구 준비 중…";
    try {
      const doc = frame.contentDocument;
      if (!doc) throw new Error("iframe contentDocument 접근 불가");

      if (doc.getElementById("__visual_editor_overlay__")) {
        statusText.textContent = "선택 도구가 이미 켜져 있습니다.";
        setPickMode(pickMode);
        setVariant(currentVariant);
        return;
      }

      const script = doc.createElement("script");
      script.id = "__visual_editor_overlay__";
      script.src = "/editor-overlay.js";
      script.async = false;

      script.onload = () => {
        statusText.textContent = "선택 도구가 준비됐습니다.";
        log("선택 도구 준비 완료");
        setPickMode(pickMode);
        setVariant(currentVariant, { refreshFrame: false });
      };

      script.onerror = () => {
        statusText.textContent = "선택 도구를 불러오지 못했습니다. 권한을 확인하세요.";
        log("선택 도구 불러오기 실패");
      };

      doc.documentElement.appendChild(script);
    } catch (e) {
      statusText.textContent = "선택 도구를 불러오지 못했습니다. 같은 사이트 화면인지 확인하세요.";
      log(`inject error: ${String(e)}`);
    }
  }

  function renderSelected(info) {
    elementNameText.textContent = getFriendlyElementName(info);
    selectorText.textContent = info?.selector || "—";
    tagText.textContent = info?.tag || "—";
    trackIdText.textContent = info?.track_id || "—";
    textText.textContent = info?.text || "—";
    rectText.textContent = info?.rect
      ? `x:${info.rect.x} y:${info.rect.y} w:${info.rect.w} h:${info.rect.h}`
      : "—";
  }

  function prettifyToken(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncateText(value, max) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function getFriendlyElementName(info) {
    const tag = String(info?.tag || "").toLowerCase();
    const tagLabelMap = {
      button: "버튼",
      a: "링크",
      img: "이미지",
      input: "입력창",
      textarea: "입력 영역",
      h1: "제목",
      h2: "제목",
      h3: "제목",
      p: "문단",
      span: "텍스트",
      div: "영역"
    };
    const tagLabel = tagLabelMap[tag] || (tag ? `${tag} 요소` : "요소");
    const readableTrack = prettifyToken(info?.track_id);
    const readableText = truncateText(info?.text, 26);

    if (readableText && (tag === "button" || tag === "a")) {
      return `"${readableText}" ${tagLabel}`;
    }
    if (readableText) {
      return `"${readableText}" ${tagLabel}`;
    }
    if (readableTrack) {
      return `${readableTrack} ${tagLabel}`;
    }
    return `선택한 ${tagLabel}`;
  }

  function parseOptionalNumber(inputEl) {
    const raw = String(inputEl?.value || "").trim();
    if (raw === "") return { ok: true, value: null };
    const num = Number(raw);
    if (!Number.isFinite(num)) return { ok: false, reason: `숫자를 확인하세요: ${raw}` };
    return { ok: true, value: num };
  }

  function buildStyleObjectFromControls() {
    const styles = {};
    const pxFields = [
      [styleWidth, "width"],
      [styleHeight, "height"],
      [styleFontSize, "font-size"],
      [styleRadius, "border-radius"]
    ];

    for (const [inputEl, prop] of pxFields) {
      const parsed = parseOptionalNumber(inputEl);
      if (!parsed.ok) return parsed;
      if (parsed.value !== null) styles[prop] = `${parsed.value}px`;
    }

    const paddingX = parseOptionalNumber(stylePaddingX);
    if (!paddingX.ok) return paddingX;
    if (paddingX.value !== null) {
      styles["padding-left"] = `${paddingX.value}px`;
      styles["padding-right"] = `${paddingX.value}px`;
    }

    const paddingY = parseOptionalNumber(stylePaddingY);
    if (!paddingY.ok) return paddingY;
    if (paddingY.value !== null) {
      styles["padding-top"] = `${paddingY.value}px`;
      styles["padding-bottom"] = `${paddingY.value}px`;
    }

    const moveX = parseOptionalNumber(styleMoveX);
    if (!moveX.ok) return moveX;
    const moveY = parseOptionalNumber(styleMoveY);
    if (!moveY.ok) return moveY;
    if (moveX.value !== null || moveY.value !== null) {
      styles.transform = `translate(${moveX.value ?? 0}px, ${moveY.value ?? 0}px)`;
    }

    if (styleFontWeight.value) styles["font-weight"] = styleFontWeight.value;
    if (styleTextAlign.value) styles["text-align"] = styleTextAlign.value;
    if (enableTextColor.checked) styles.color = styleTextColor.value;
    if (enableBackgroundColor.checked) styles["background-color"] = styleBackgroundColor.value;

    if (Object.keys(styles).length === 0) {
      return { ok: false, reason: "먼저 바꾸고 싶은 스타일 값을 하나 이상 입력하세요." };
    }

    return { ok: true, styles };
  }

  function getVisibilityMode() {
    const checked = visibilityInputs.find((input) => input.checked);
    return checked?.value === "hide" ? "hide" : "show";
  }

  function getStyleSummary(styles) {
    const labels = {
      width: "가로",
      height: "세로",
      "font-size": "글자 크기",
      "font-weight": "글자 굵기",
      "border-radius": "둥근 정도",
      color: "글자 색",
      "background-color": "배경 색",
      "padding-left": "안쪽 여백",
      transform: "위치 이동",
      "text-align": "정렬"
    };
    const names = [];
    for (const key of Object.keys(styles || {})) {
      const label = labels[key];
      if (label && !names.includes(label)) names.push(label);
      if (names.length >= 3) break;
    }
    return names.length ? names.join(", ") : "스타일 조정";
  }

  function buildFriendlyDetail(change) {
    if (change.type === "inject_css") {
      return "고급 CSS 규칙이 추가돼요.";
    }
    const action = Array.isArray(change.actions) ? change.actions[0] : null;
    if (!action) return "변경 상세 정보 없음";

    if (action.type === "set_text") return `새 문구: ${String(action.value || "")}`;
    if (action.type === "set_style") return `조정 항목: ${getStyleSummary(action.styles || {})}`;
    if (action.type === "hide") return "선택한 요소를 숨겨요.";
    if (action.type === "show") return "선택한 요소를 다시 보여줘요.";
    if (action.type === "set_attr" && action.name === "href") return `이동 주소: ${String(action.value || "")}`;
    if (action.type === "set_attr") return `속성 변경: ${action.name}`;
    if (action.type === "add_class") return `클래스 추가: ${String(action.value || "")}`;
    if (action.type === "remove_class") return `클래스 제거: ${String(action.value || "")}`;
    return action.type;
  }

  function buildChangeRationale(change) {
    const action = Array.isArray(change?.actions) ? change.actions[0] : null;
    const isCss = change?.type === "inject_css";
    if (isCss) {
      return {
        intent: "시각적 주목도 조정",
        expected_effect: "페이지 가독성이나 노출량이 바뀌어 반응 차이가 생길 수 있어요.",
        primary_metric: "노출률 / 클릭률",
      };
    }

    if (action?.type === "set_text") {
      return {
        intent: "문구를 더 명확하게 만듦",
        expected_effect: "버튼과 안내 문구의 이해도가 올라 클릭이 늘어날 수 있어요.",
        primary_metric: "클릭률",
      };
    }

    if (action?.type === "set_style") {
      const styles = action?.styles && typeof action.styles === "object" ? Object.keys(action.styles) : [];
      const isVisual = styles.some((key) => /color|background|border|outline/i.test(key));
      return {
        intent: isVisual ? "시각적 강조 강화" : "레이아웃 미세 조정",
        expected_effect: isVisual ? "버튼/영역이 더 눈에 띄어 반응이 달라질 수 있어요." : "배치 감이 바뀌어 시선 이동과 체류가 달라질 수 있어요.",
        primary_metric: isVisual ? "클릭률 / 전환율" : "체류시간 / 페이지 깊이",
      };
    }

    if (action?.type === "hide") {
      return {
        intent: "불필요한 요소 제거",
        expected_effect: "주의 분산을 줄여 핵심 행동으로 더 빨리 이동하게 만들 수 있어요.",
        primary_metric: "전환율 / 이탈률",
      };
    }

    if (action?.type === "show") {
      return {
        intent: "정보 노출 확대",
        expected_effect: "안내가 늘어나 사용자의 이해와 신뢰가 높아질 수 있어요.",
        primary_metric: "전환율 / 체류시간",
      };
    }

    if (action?.type === "set_attr" && String(action.name || "").toLowerCase() === "href") {
      return {
        intent: "진입 경로를 더 직접적으로 연결",
        expected_effect: "클릭 후 이동 경로가 바뀌어 구매 흐름이 더 짧아질 수 있어요.",
        primary_metric: "클릭률 / 전환율",
      };
    }

    return {
      intent: "행동 변화를 유도",
      expected_effect: "페이지 상호작용 패턴이 바뀔 수 있어요.",
      primary_metric: "클릭률 / 전환율",
    };
  }

  function buildChangeLabel(change) {
    if (change.type === "inject_css") return change.label || "고급 CSS 규칙 적용";

    const name = change.element_name || getFriendlyElementName(lastSelected);
    const action = Array.isArray(change.actions) ? change.actions[0] : null;
    if (!action) return name;

    if (action.type === "set_text") return `${name} 문구 변경`;
    if (action.type === "set_style") return `${name} 스타일 조정`;
    if (action.type === "hide") return `${name} 숨기기`;
    if (action.type === "show") return `${name} 다시 보이기`;
    if (action.type === "set_attr" && action.name === "href") return `${name} 링크 바꾸기`;
    if (action.type === "set_attr") return `${name} 속성 변경`;
    if (action.type === "add_class") return `${name} 클래스 추가`;
    if (action.type === "remove_class") return `${name} 클래스 제거`;
    return name;
  }

  function withChangeMeta(change, info) {
    const base = { ...change };
    delete base.impact_pct;
    delete base.impact_direction;
    delete base.impact_label;
    if (base.type === "inject_css") {
      base.label = base.label || "고급 CSS 규칙 적용";
      base.detail = base.detail || "개발자용 사용자 정의 규칙이에요.";
      return base;
    }

    base.element_name = getFriendlyElementName(info);
    base.label = buildChangeLabel(base);
    base.detail = buildFriendlyDetail(base);
    base.rationale = base.rationale || buildChangeRationale(base);
    return base;
  }

  function setComposerMode(mode) {
    currentComposerMode = mode;
    intentButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));

    valueRow.style.display = mode === "text" ? "flex" : "none";
    attrRow.style.display = "none";
    cssRow.style.display = "none";
    styleRow.style.display = "none";
    textPanel.style.display = mode === "text" ? "block" : "none";
    stylePanel.style.display = mode === "style" ? "block" : "none";
    visibilityPanel.style.display = mode === "visibility" ? "block" : "none";
    linkPanel.style.display = mode === "link" ? "block" : "none";
    advancedEditorBox.style.display = mode === "advanced" ? "block" : "none";
    if (mode === "advanced") {
      advancedEditorBox.open = true;
      actionType.dispatchEvent(new Event("change"));
    }

    if (mode === "text") {
      valueLabel.textContent = "새 문구";
      addChangeBtn.textContent = "문구 편집 추가";
    } else if (mode === "style") {
      addChangeBtn.textContent = "모양 편집 추가";
    } else if (mode === "visibility") {
      addChangeBtn.textContent = "노출 설정 추가";
    } else if (mode === "link") {
      addChangeBtn.textContent = "이동 주소 편집 추가";
    } else {
      addChangeBtn.textContent = "개발자 편집 추가";
    }
  }

  function parseStyleDeclarations(input) {
    const raw = String(input || "").trim();
    if (!raw) {
      return { ok: false, reason: "스타일 선언을 입력하세요." };
    }

    const styles = {};
    const chunks = raw.split(/;|\r?\n/);

    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line) continue;

      const colonIdx = line.indexOf(":");
      if (colonIdx <= 0) {
        return { ok: false, reason: `잘못된 선언: ${line}` };
      }

      const property = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (!property || !value) {
        return { ok: false, reason: `잘못된 선언: ${line}` };
      }

      styles[property] = value;
    }

    const entries = Object.entries(styles);
    if (entries.length === 0) {
      return { ok: false, reason: "스타일 선언을 입력하세요." };
    }

    return { ok: true, styles };
  }

  function normalizeChangeFromUI() {
    const isAdvancedCss = currentComposerMode === "advanced" && actionType.value === "inject_css";
    if (!lastSelected && !isAdvancedCss) {
      alert("먼저 iframe에서 요소를 클릭해 선택하세요.");
      return null;
    }

    if (currentComposerMode === "text") {
      const value = (actionValue.value || "").trim();
      if (!value) { alert("새 문구를 입력하세요."); return null; }
      return withChangeMeta({
        selector: lastSelected.selector,
        actions: [{ type: "set_text", value }]
      }, lastSelected);
    }

    if (currentComposerMode === "style") {
      const built = buildStyleObjectFromControls();
      if (!built.ok) { alert(built.reason); return null; }
      return withChangeMeta({
        selector: lastSelected.selector,
        actions: [{ type: "set_style", styles: built.styles }]
      }, lastSelected);
    }

    if (currentComposerMode === "visibility") {
      const type = getVisibilityMode();
      return withChangeMeta({
        selector: lastSelected.selector,
        actions: [{ type }]
      }, lastSelected);
    }

    if (currentComposerMode === "link") {
      const href = (linkHrefValue.value || "").trim();
      const label = (linkLabelValue.value || "").trim();
      if (!href) { alert("이동 주소를 입력하세요."); return null; }
      const actions = [{ type: "set_attr", name: "href", value: href }];
      if (label) {
        actions.push({ type: "set_attr", name: "aria-label", value: label });
        actions.push({ type: "set_attr", name: "title", value: label });
      }
      return withChangeMeta({
        selector: lastSelected.selector,
        actions
      }, lastSelected);
    }

    const type = actionType.value;

    if (type === "inject_css") {
      const css = (cssValue.value || "").trim();
      if (!css) { alert("CSS 내용을 입력하세요."); return null; }
      return withChangeMeta({ type: "inject_css", css }, lastSelected);
    }

    const selector = lastSelected.selector;
    if (!selector) { alert("selector가 없습니다."); return null; }

    if (type === "hide" || type === "show") {
      return withChangeMeta({ selector, actions: [{ type }] }, lastSelected);
    }

    if (type === "set_text") {
      const v = (actionValue.value || "").trim();
      if (!v) { alert("텍스트를 입력하세요."); return null; }
      return withChangeMeta({ selector, actions: [{ type: "set_text", value: v }] }, lastSelected);
    }

    if (type === "set_style") {
      const parsed = parseStyleDeclarations(styleValue.value);
      if (!parsed.ok) { alert(parsed.reason); return null; }
      return withChangeMeta({ selector, actions: [{ type: "set_style", styles: parsed.styles }] }, lastSelected);
    }

    if (type === "add_class" || type === "remove_class") {
      const v = (actionValue.value || "").trim();
      if (!v) { alert("클래스명을 입력하세요."); return null; }
      return withChangeMeta({ selector, actions: [{ type, value: v }] }, lastSelected);
    }

    if (type === "set_attr") {
      const n = (attrName.value || "").trim();
      const v = (attrValue.value || "").trim();
      if (!n) { alert("attr name을 입력하세요."); return null; }
      return withChangeMeta({ selector, actions: [{ type: "set_attr", name: n, value: v }] }, lastSelected);
    }

    alert("지원하지 않는 action입니다.");
    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderChangesList() {
    changesList.innerHTML = "";
    if (changesB.length === 0) {
      changesList.innerHTML = `<div class="changeMeta">아직 추가한 편집 내용이 없습니다.</div>`;
      return;
    }

    changesB.forEach((c, idx) => {
      const el = document.createElement("div");
      el.className = "changeItem";

      let meta = "";
      let code = "";

      if (c.type === "inject_css") {
        meta = `#${idx} · ${escapeHtml(c.label || "고급 CSS 규칙 적용")}`;
        code = c.detail || "고급 CSS 규칙이 추가돼요.";
      } else {
        meta = `#${idx} · ${escapeHtml(c.label || c.element_name || "변경")}`;
        code = c.detail || buildFriendlyDetail(c);
      }

      const rationale = c.rationale || buildChangeRationale(c);

      el.innerHTML = `
        <div class="changeTop">
          <div>
            <div class="changeMeta">${meta}</div>
            <div class="mono changeCode">${escapeHtml(code)}</div>
            <div class="changeRationale">
              <div><strong>의도</strong> · ${escapeHtml(rationale.intent || "—")}</div>
              <div><strong>예상 효과</strong> · ${escapeHtml(rationale.expected_effect || "—")}</div>
              <div><strong>근거 지표</strong> · ${escapeHtml(rationale.primary_metric || "—")}</div>
            </div>
          </div>
          <div class="changeBtns">
            <button class="btn smallBtn" data-act="apply" data-idx="${idx}">확인</button>
            <button class="btn danger smallBtn" data-act="del" data-idx="${idx}">삭제</button>
          </div>
        </div>
      `;

      changesList.appendChild(el);
    });
  }

  function mergeImportedChange(change) {
    if (!change || typeof change !== "object") return null;
    if (change.type === "inject_css") {
      return withChangeMeta(change, lastSelected);
    }
    if (!change.selector || !Array.isArray(change.actions)) return null;
    const info = {
      selector: change.selector,
      tag: change.tag || null,
      track_id: change.track_id || null,
      text: change.text || change.element_name || "",
      rect: change.rect || null,
      page: change.page || null,
    };
    const merged = withChangeMeta(change, info);
    if (change.element_name) merged.element_name = change.element_name;
    if (change.label) merged.label = change.label;
    if (change.detail) merged.detail = change.detail;
    return merged;
  }

  async function fetchSiteConfig() {
    const effectiveSiteId = enforceAuthorizedSiteId();
    const r = await fetch(`/api/sites/${encodeURIComponent(effectiveSiteId)}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "site fetch failed");
    return j.site || null;
  }

  async function fetchExperimentByKey(experimentKey) {
    const key = String(experimentKey || "").trim();
    if (!key) return null;

    const r = await fetch(`/api/experiments?site_id=${encodeURIComponent(currentSiteId)}`);
    const j = await r.json();
    if (!j?.ok) throw new Error(j?.reason || "experiment fetch failed");

    return Array.isArray(j.experiments)
      ? j.experiments.find((item) => item && item.key === key) || null
      : null;
  }

  function getPreviewTargets() {
    return Array.isArray(currentSiteConfig?.preview_targets) ? currentSiteConfig.preview_targets : [];
  }

  function getTargetById(targetId) {
    return getPreviewTargets().find((target) => target.id === targetId) || null;
  }

  function getDefaultTarget() {
    const targets = getPreviewTargets();
    return targets.find((target) => target.default) || targets[0] || null;
  }

  function populateTargetSelect() {
    const targets = getPreviewTargets();
    targetSelect.innerHTML = "";

    if (targets.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "등록된 편집 화면 없음";
      targetSelect.appendChild(option);
      targetSelect.disabled = true;
      return;
    }

    targets.forEach((target) => {
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = target.label || target.url_prefix || target.id;
      targetSelect.appendChild(option);
    });
    targetSelect.disabled = false;
  }

  function applyTarget(target, options) {
    if (!target) return;
    currentTarget = target;
    targetSelect.value = target.id;
    frame.src = appendAbForce(target.preview_url, options?.forceVariant || currentVariant || "A");
    if (!options?.preserveExpKey) {
      expKeyInput.value = target.experiment_key || getDefaultExpKey();
    }
    urlPrefixInput.value = target.url_prefix || "/";
    updateEditorCopilotMeta();
    log(`편집 화면 이동 -> ${target.preview_url}`);
  }

  function setTargetByPath(pathname) {
    if (!pathname) return;
    const match = getPreviewTargets()
      .filter((target) => pathname.startsWith(target.url_prefix || "/"))
      .sort((a, b) => (b.url_prefix || "").length - (a.url_prefix || "").length)[0] || getDefaultTarget();
    if (!match) return;
    applyTarget(match, { preserveExpKey: true });
    urlPrefixInput.value = pathname === "/" ? "/" : pathname;
  }

  function applyDraftPayload(payload, options) {
    const draft = payload?.draft || null;
    const imported = Array.isArray(payload?.changesB) ? payload.changesB.map(mergeImportedChange).filter(Boolean) : [];
    if (draft?.target_page) setTargetByPath(draft.target_page);
    if (draft?.key) expKeyInput.value = draft.key;
    if (draft?.version !== undefined) setExperimentVersion(draft.version);
    if (draft?.target_page) urlPrefixInput.value = draft.target_page;
    if (imported.length > 0) {
      changesB = imported;
      renderChangesList();
      jsonBox.value = JSON.stringify({ variantB: changesB, source: "analytics_copilot" }, null, 2);
      setVariant("B");
      applyPreviewNow();
    }
    latestImportedDraft = payload || null;
    applyImportedDraftBtn.disabled = !latestImportedDraft;
    editorImportedState.textContent = draft
      ? `초안 가져옴 - ${draft.key || "draft"}${currentExperimentVersion ? ` · v${currentExperimentVersion}` : ""} / 변경 ${imported.length}개`
      : imported.length > 0
        ? `변경 ${imported.length}개 가져옴`
        : "가져온 변경 없음";
      log(`AI 초안 가져옴 (${imported.length}개 변경)`);
    if (!options?.keepStorage) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }

  function loadPendingDraftFromStorage() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      applyDraftPayload(payload);
    } catch (e) {
      log(`AI 초안 불러오기 실패: ${String(e)}`);
    }
  }

  function initCopilot() {
    if (!window.AnalyticsChat) return;
    copilot = window.AnalyticsChat.init({
      rootId: "editorCopilotRoot",
      page: "editor",
      floatingStorageKey: "editor-copilot",
      getContext() {
        return {
          page: "editor",
          selectedElement: lastSelected,
          selectedExperimentKey: (expKeyInput.value || "").trim() || null,
        };
      },
      onExperimentDraft(draft) {
        latestImportedDraft = {
          draft,
          changesB: Array.isArray(draft?.variant_b_changes) ? draft.variant_b_changes : [],
        };
        applyImportedDraftBtn.disabled = false;
        editorImportedState.textContent = `새 초안 도착 - ${draft?.key || "draft"}`;
      },
      onEditorChanges(changes, draft) {
        applyDraftPayload({ draft, changesB: changes }, { keepStorage: true });
      },
    });
  }

  function applyPreviewNow() {
    if (currentVariant !== "B") {
      setVariant("B");
      log(`편집 화면 확인 (B, ${changesB.length}개)`);
      return;
    }
    postToFrame("EDITOR_PREVIEW_SET_VARIANT", { variant: "B", changes: changesB });
    log(`편집 화면 확인 (B, ${changesB.length}개)`);
  }

  function getDefaultExpKey() {
    if (currentTarget?.experiment_key) return currentTarget.experiment_key;
    const path = currentTarget?.url_prefix || "/";
    if (path.startsWith("/checkout")) return "exp_checkout_cta_v1";
    if (path.startsWith("/detail")) return "exp_detail_cta_v1";
    if (path.startsWith("/collection")) return "exp_collection_cta_v1";
    return "exp_main_cta_v1";
  }

  function getDefaultUrlPrefix() {
    const path = currentTarget?.url_prefix || "/";
    return path === "/" ? "/" : path;
  }

  function updateEditorCopilotMeta() {
    editorCopilotExpKey.textContent = (expKeyInput.value || "").trim() || getDefaultExpKey();
    if (copilot) {
      copilot.setSelectedExperimentKey((expKeyInput.value || "").trim() || null);
      copilot.setSelectedElement(lastSelected);
    }
  }

  function setEditorCopilotCollapsed(collapsed) {
    editorCopilotRoot.classList.toggle("is-collapsed", collapsed);
    editorCopilotToggleBtn.textContent = collapsed ? "열기" : "접기";
    editorCopilotToggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  async function realApplyToServer() {
    const expKey = (expKeyInput.value || "").trim() || getDefaultExpKey();
    const urlPrefix = (urlPrefixInput.value || "").trim() || getDefaultUrlPrefix();

    if (!expKey) { alert("실험 키가 필요합니다."); return; }
    if (!urlPrefix) { alert("실험 적용 경로가 필요합니다."); return; }

    // 실제 저장은 서버에 running 상태로 배포한다.
    const payload = {
      site_id: currentSiteId,
      key: expKey,
      url_prefix: urlPrefix,
      traffic: { A: 50, B: 50 },
      goals: ["checkout_complete"],
      variants: {
        A: [],         // A는 원본(변경 없음)
        B: changesB    // B에만 변경
      }
    };

    try {
      async function request(replaceRunning = false) {
        const r = await fetch("/api/experiments/real-apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, replace_running: replaceRunning })
        });
        return r.json().catch(() => ({ ok: false, reason: "unknown" }));
      }

      let j = await request(false);
      if (!j?.ok && j?.reason === "running_experiment_exists") {
        const runningKey = j.running_experiment?.key || "기존 실험";
        const confirmed = window.confirm(`현재 ${runningKey} 실험이 진행 중입니다.\n새 실험을 배포하려면 기존 실험을 일시 중지해야 합니다.\n\n기존 실험을 일시 중지하고 새 실험을 배포하시겠습니까?`);
        if (confirmed) j = await request(true);
      }
      if (!j?.ok) {
        alert("실제 저장 실패: " + (j?.message || j?.reason || "unknown"));
        log("실제 저장 실패");
        return;
      }

      log(`실제 저장 완료: ${expKey} (v${j.experiment.version}) 경로=${urlPrefix}`);
      setExperimentVersion(j?.experiment?.version || null);

      // 실제 저장 후 동작 확인을 위해 새 탭으로 연다.
      const liveUrl = appendAbForce(currentTarget?.live_url || currentTarget?.preview_url || "/", "B");
      window.open(liveUrl, "_blank", "noopener,noreferrer");

      alert(`실제 저장 완료!\n새 탭에서 서버 설정을 받아 A/B 실험이 실행됩니다.\n방문자마다 원본/편집 화면이 다르게 보일 수 있습니다.`);
    } catch (e) {
      alert("실제 저장 실패(네트워크): " + String(e));
      log(`real apply error: ${String(e)}`);
    }
  }

  // --- UI hooks ---
  targetSelect.addEventListener("change", () => {
    const target = getTargetById(targetSelect.value) || getDefaultTarget();
    if (!target) return;
    applyTarget(target);
  });

  expKeyInput.addEventListener("input", () => updateEditorCopilotMeta());

  reloadBtn.addEventListener("click", () => {
    frame.contentWindow.location.reload();
    log("화면 새로고침");
  });

  intentButtons.forEach((btn) => {
    btn.addEventListener("click", () => setComposerMode(btn.dataset.mode || "text"));
  });

  togglePickBtn.addEventListener("click", () => setPickMode(!pickMode));
  variantABtn.addEventListener("click", () => setVariant("A"));
  variantBBtn.addEventListener("click", () => setVariant("B"));

  actionType.addEventListener("change", () => {
    const t = actionType.value;
    if (currentComposerMode !== "advanced") return;

    textPanel.style.display = "none";
    stylePanel.style.display = "none";
    visibilityPanel.style.display = "none";
    linkPanel.style.display = "none";

    valueRow.style.display = "none";
    attrRow.style.display = "none";
    cssRow.style.display = "none";
    styleRow.style.display = "none";

    if (t === "set_text" || t === "add_class" || t === "remove_class") {
      textPanel.style.display = "block";
      valueRow.style.display = "flex";
      valueLabel.textContent = t === "set_text" ? "새 문구" : "값";
      if (t === "add_class") actionValue.placeholder = "예: primary";
      if (t === "remove_class") actionValue.placeholder = "예: primary";
    }
    if (t === "set_attr") attrRow.style.display = "flex";
    if (t === "inject_css") cssRow.style.display = "flex";
    if (t === "set_style") styleRow.style.display = "flex";
    if (t === "hide" || t === "show") {/* none */}
  });

  addChangeBtn.addEventListener("click", () => {
    const change = normalizeChangeFromUI();
    if (!change) return;

    changesB.push(change);
    renderChangesList();
    log(`편집 내용 추가 (#${changesB.length - 1})`);

    if (currentVariant === "B") applyPreviewNow();
  });

  applyNowBtn.addEventListener("click", () => applyPreviewNow());
  realApplyBtn.addEventListener("click", () => realApplyToServer());

  openRealBtn.addEventListener("click", () => {
    const liveUrl = appendAbForce(currentTarget?.live_url || currentTarget?.preview_url || "/", "B");
    window.open(liveUrl, "_blank", "noopener,noreferrer");
  });

  clearChangesBtn.addEventListener("click", () => {
    if (!confirm("추가한 편집 내용을 모두 삭제할까요?")) return;
    changesB = [];
    renderChangesList();
    jsonBox.value = "";
    log("편집 내용 모두 삭제");
    if (currentVariant === "B") applyPreviewNow();
  });

  changesList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const act = btn.dataset.act;

    if (!Number.isFinite(idx) || idx < 0 || idx >= changesB.length) return;

    if (act === "del") {
      changesB.splice(idx, 1);
      renderChangesList();
      log(`편집 내용 삭제 (#${idx})`);
      if (currentVariant === "B") applyPreviewNow();
    }
    if (act === "apply") {
      applyPreviewNow();
    }
  });

  exportJsonBtn.addEventListener("click", () => {
    const out = {
      variantB: changesB,
      meta: {
        target: targetSelect.value,
        exported_at: new Date().toISOString()
      }
    };
    jsonBox.value = JSON.stringify(out, null, 2);
    log("JSON 내보내기");
  });

  copyJsonBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(jsonBox.value || "");
      log("JSON 복사 완료");
    } catch (e) {
      alert("복사 실패: 브라우저 권한을 확인하세요.");
      log(`copy failed: ${String(e)}`);
    }
  });

  applyImportedDraftBtn.addEventListener("click", () => {
    if (!latestImportedDraft) return;
    applyDraftPayload(latestImportedDraft, { keepStorage: true });
  });
  editorCopilotToggleBtn.addEventListener("click", () => {
    setEditorCopilotCollapsed(!editorCopilotRoot.classList.contains("is-collapsed"));
  });

  // iframe load hook
  frame.addEventListener("load", () => {
    log("iframe loaded");
    injectOverlay();
  });

  // iframe → parent 메시지 수신
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const data = event.data || {};

    if (data.type === "EDITOR_ELEMENT_HOVER") {
      statusText.textContent = `가리키는 중: ${getFriendlyElementName(data)}`;
      return;
    }

    if (data.type === "EDITOR_ELEMENT_SELECTED") {
      statusText.textContent = `${getFriendlyElementName(data)} 선택됨`;
      lastSelected = data;
      renderSelected(lastSelected);
      updateEditorCopilotMeta();
      if (lastSelected.text) actionValue.placeholder = `예: ${lastSelected.text.slice(0, 30)}...`;
      log(`selected -> ${data.selector}`);
      return;
    }

    if (data.type === "EDITOR_APPLY_RESULT") {
      if (data.ok) {
      statusText.textContent = `편집 화면에 반영됨 (${data.message || "ok"})`;
        log(`apply ok: ${data.message || ""}`);
      } else {
        statusText.textContent = `편집 화면 반영 실패 (${data.message || "원인 불명"})`;
        log(`apply fail: ${data.message || ""}`);
      }
      return;
    }

    if (data.type === "EDITOR_LOG") {
      log(`iframe: ${data.message}`);
      return;
    }
  });

  // ===== 경로 편집 모달 =====

  function openTargetsModal() {
    const targets = getPreviewTargets();
    renderTargetsTable(targets);
    setTargetsModalStatus("");
    targetsModal.style.display = "flex";
  }

  function closeTargetsModal() {
    targetsModal.style.display = "none";
  }

  function setTargetsModalStatus(msg, type) {
    targetsModalStatus.textContent = msg || "";
    targetsModalStatus.className = "targetsModalStatus" + (type ? ` ${type}` : "");
  }

  function renderTargetsTable(targets) {
    targetsTableBody.innerHTML = "";
    const list = targets.length ? targets : [{ id: "", label: "", path: "/", url_prefix: "/", default: true }];
    list.forEach((t, i) => addTargetRow(t, i === 0 && !targets.length));
  }

  function addTargetRow(t, isNew) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="radio" name="targetDefault" value="${escapeAttr(t?.id || "")}" ${t?.default ? "checked" : ""} /></td>
      <td><input type="text" class="targetLabelInput" placeholder="예: 홈" value="${escapeAttr(t?.label || "")}" /></td>
      <td><input type="text" class="targetPathInput" placeholder="예: /item" value="${escapeAttr(t?.path || (isNew ? "" : "/"))}" /></td>
      <td><button type="button" class="btnIcon removeTargetRowBtn" title="삭제">&#10005;</button></td>
    `;

    tr.querySelector(".removeTargetRowBtn").addEventListener("click", () => {
      tr.remove();
      reassignDefaultRadioIfNeeded();
    });

    tr.querySelector('input[name="targetDefault"]').addEventListener("change", () => {
      Array.from(targetsTableBody.querySelectorAll('input[name="targetDefault"]')).forEach((r) => {
        r.checked = r === tr.querySelector('input[name="targetDefault"]');
      });
    });

    targetsTableBody.appendChild(tr);
  }

  function reassignDefaultRadioIfNeeded() {
    const radios = Array.from(targetsTableBody.querySelectorAll('input[name="targetDefault"]'));
    if (radios.length > 0 && !radios.some((r) => r.checked)) {
      radios[0].checked = true;
    }
  }

  function escapeAttr(str) {
    return String(str || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function collectTargetsFromTable() {
    const rows = Array.from(targetsTableBody.querySelectorAll("tr"));
    return rows.map((tr, i) => {
      const label = tr.querySelector(".targetLabelInput")?.value.trim() || "";
      const path = tr.querySelector(".targetPathInput")?.value.trim() || "/";
      const isDefault = tr.querySelector('input[name="targetDefault"]')?.checked || false;
      const slugPart = path.split("/").filter(Boolean)[0] || "page";
      const id = slugPart.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `target-${i + 1}`;
      const url_prefix = path.split("?")[0] || "/";
      return { id, label: label || path, path, url_prefix, default: isDefault };
    }).filter((t) => t.path);
  }

  async function saveTargets() {
    const targets = collectTargetsFromTable();
    if (targets.length === 0) {
      setTargetsModalStatus("경로를 1개 이상 등록해주세요.", "error");
      return;
    }
    const hasDef = targets.some((t) => t.default);
    if (!hasDef) targets[0].default = true;

    setTargetsModalStatus("저장 중…");
    targetsModalSaveBtn.disabled = true;

    try {
      const r = await fetch(`/api/sites/${encodeURIComponent(currentSiteId)}/preview-targets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview_targets: targets }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.reason || "저장 실패");

      currentSiteConfig = j.site;
      populateTargetSelect();
      const newDefault = getDefaultTarget();
      if (newDefault) applyTarget(newDefault);
      setTargetsModalStatus("저장 완료!", "success");
      setTimeout(closeTargetsModal, 800);
      log(`preview_targets 저장 완료 (${targets.length}개)`);
    } catch (e) {
      setTargetsModalStatus(`오류: ${String(e)}`, "error");
      log(`preview_targets 저장 실패: ${String(e)}`);
    } finally {
      targetsModalSaveBtn.disabled = false;
    }
  }

  if (editTargetsBtn) editTargetsBtn.addEventListener("click", openTargetsModal);
  if (targetsModalCloseBtn) targetsModalCloseBtn.addEventListener("click", closeTargetsModal);
  if (targetsModalCancelBtn) targetsModalCancelBtn.addEventListener("click", closeTargetsModal);
  if (targetsModalSaveBtn) targetsModalSaveBtn.addEventListener("click", saveTargets);
  if (addTargetRowBtn) addTargetRowBtn.addEventListener("click", () => addTargetRow({}, true));
  if (targetsModal) {
    targetsModal.addEventListener("click", (e) => {
      if (e.target === targetsModal) closeTargetsModal();
    });
  }

  async function initEditor() {
    authUser = await fetchAuthMe();
    enforceAuthorizedSiteId();
    if (authUserLabel) authUserLabel.textContent = authUser.display_name || authUser.username;
    if (openDashboardLink) openDashboardLink.href = getDashboardUrl();
    currentSiteConfig = await fetchSiteConfig();
    populateTargetSelect();

    const params = new URLSearchParams(location.search);
    const targetId = (params.get("target") || "").trim();
    const experimentKey = (params.get("experiment_key") || "").trim();
    const initialTarget = getTargetById(targetId) || getDefaultTarget();
    let restoredFromServer = false;
    const queryVersion = (params.get("experiment_version") || "").trim();

    if (initialTarget) {
      applyTarget(initialTarget);
    } else {
      expKeyInput.value = getDefaultExpKey();
      urlPrefixInput.value = getDefaultUrlPrefix();
    }

    if (experimentKey) {
      try {
        const experiment = await fetchExperimentByKey(experimentKey);
        if (experiment) {
          const draft = { key: experiment.key, version: experiment.version || null, target_page: experiment.url_prefix, hypothesis: experiment.hypothesis || "" };
          applyDraftPayload({ draft, changesB: Array.isArray(experiment.variants?.B) ? experiment.variants.B : [] }, { keepStorage: true });
          restoredFromServer = true;
        }
      } catch (error) {
        log(`experiment restore failed: ${String(error)}`);
      }
    }

    if (!restoredFromServer && queryVersion) setExperimentVersion(queryVersion);

    renderChangesList();
    initCopilot();
    setEditorCopilotCollapsed(true);
    setComposerMode("text");
    setPickMode(true);
    if (!restoredFromServer) setVariant("A");
    updateEditorCopilotMeta();
    if (!restoredFromServer) loadPendingDraftFromStorage();
    log(`editor ready (${currentSiteId})`);
  }

  initEditor().catch((error) => {
    alert(String(error));
    log(`editor init failed: ${String(error)}`);
  });
})();
