// public/editor-overlay.js
(function () {
  "use strict";

  let pickMode = true;

  // Hover/select overlay boxes
  const hoverBox = document.createElement("div");
  const selectBox = document.createElement("div");
  const heatmapLayer = document.createElement("div");

  // Editor applied style holder (for inject_css)
  const injectedStyle = document.createElement("style");
  injectedStyle.id = "__ve_injected_css__";
  document.documentElement.appendChild(injectedStyle);

  // Store original states for reset
  // key: selector (or internal id), value: { text, display, className, attrs: Map }
  const originalMap = new Map();

  // Style for overlay UI
  const style = document.createElement("style");
  style.textContent = `
    .__ve_box {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      border-radius: 8px;
      box-sizing: border-box;
    }
    .__ve_hover { border: 2px solid rgba(106,169,255,0.95); box-shadow: 0 0 0 2px rgba(106,169,255,0.12); }
    .__ve_select { border: 2px solid rgba(59,214,113,0.95); box-shadow: 0 0 0 2px rgba(59,214,113,0.12); }
      .__ve_badge {
        position: fixed;
        z-index: 2147483647;
      pointer-events: none;
      background: rgba(23,26,33,0.92);
      color: #e9eef6;
      border: 1px solid rgba(42,47,58,0.9);
      border-radius: 10px;
      padding: 6px 8px;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      max-width: 560px;
      white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .__ve_heatmap_layer {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
      }
      .__ve_heatmap_marker {
        position: fixed;
        border-radius: 14px;
        pointer-events: none;
        box-sizing: border-box;
        mix-blend-mode: multiply;
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
        padding: 8px 10px;
        font: 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 700;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0,0,0,0.42);
        overflow: hidden;
      }
      .__ve_heatmap_marker[data-direction="positive"] { background: rgba(56, 122, 255, 0.25); border: 2px solid rgba(56, 122, 255, 0.85); }
      .__ve_heatmap_marker[data-direction="negative"] { background: rgba(255, 73, 73, 0.22); border: 2px solid rgba(255, 73, 73, 0.88); }
      .__ve_heatmap_marker[data-direction="neutral"] { background: rgba(170, 170, 170, 0.18); border: 2px solid rgba(170, 170, 170, 0.7); }
      .__ve_heatmap_marker .__ve_heatmap_text {
        display: inline-flex;
        flex-direction: column;
        gap: 2px;
        max-width: 220px;
      }
      .__ve_heatmap_marker .__ve_heatmap_pct {
        font-size: 14px;
      }
    `;
  document.documentElement.appendChild(style);

  hoverBox.className = "__ve_box __ve_hover";
  selectBox.className = "__ve_box __ve_select";
  heatmapLayer.className = "__ve_heatmap_layer";
  document.documentElement.appendChild(hoverBox);
  document.documentElement.appendChild(selectBox);
  document.documentElement.appendChild(heatmapLayer);

  const badge = document.createElement("div");
  badge.className = "__ve_badge";
  document.documentElement.appendChild(badge);

  hideEl(hoverBox); hideEl(selectBox); badge.style.display = "none";

  function hideEl(el) { el.style.display = "none"; }
  function showEl(el) { el.style.display = "block"; }

  function clearHeatmap() {
    heatmapLayer.innerHTML = "";
  }

  function inferHeatmap(change) {
    if (!change || typeof change !== "object") return { impact_pct: 0, impact_direction: "neutral", impact_label: "변화 없음" };
    const actions = Array.isArray(change.actions) ? change.actions : [];
    const action = actions[0] || null;
    if (typeof change.impact_pct === "number") {
      return {
        impact_pct: change.impact_pct,
        impact_direction: change.impact_direction || (change.impact_pct > 0 ? "positive" : change.impact_pct < 0 ? "negative" : "neutral"),
        impact_label: change.impact_label || "예상 반응",
      };
    }

    if (change.type === "inject_css") {
      const css = String(change.css || "").toLowerCase();
      if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(css)) return { impact_pct: -8, impact_direction: "negative", impact_label: "노출 감소 예상" };
      if (/color|background|border|outline|font|padding|margin|grid|flex/.test(css)) return { impact_pct: 10, impact_direction: "positive", impact_label: "시각 변화 예상" };
      return { impact_pct: 4, impact_direction: "positive", impact_label: "고급 CSS 반응" };
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

    return { impact_pct: 4, impact_direction: "positive", impact_label: "변화 반응" };
  }

  function renderHeatmap(changes) {
    clearHeatmap();
    const list = Array.isArray(changes) ? changes : [];
    if (list.length === 0) return;

    const markers = [];
    for (const change of list) {
      if (!change) continue;
      const info = inferHeatmap(change);
      if (!info.impact_pct) continue;

      if (change.type === "inject_css") {
        markers.push({ rect: { left: 16, top: 16, width: Math.min(420, window.innerWidth - 32), height: 72 }, info, label: change.label || "고급 CSS" });
        continue;
      }

      const selector = String(change.selector || "").trim();
      if (!selector) continue;
      let els = [];
      try { els = Array.from(document.querySelectorAll(selector)); } catch { els = []; }
      if (els.length === 0) continue;

      const targetEls = els.slice(0, 1);
      for (const el of targetEls) {
        const r = el.getBoundingClientRect();
        if (!r || r.width <= 0 || r.height <= 0) continue;
        markers.push({ rect: r, info, label: change.label || selector });
      }
    }

    markers.forEach((marker, index) => {
      const el = document.createElement("div");
      el.className = "__ve_heatmap_marker";
      el.dataset.direction = marker.info.impact_direction || "neutral";
      const width = Math.max(56, Math.round(marker.rect.width));
      const height = Math.max(28, Math.round(marker.rect.height));
      el.style.left = Math.round(marker.rect.left) + "px";
      el.style.top = Math.round(marker.rect.top) + "px";
      el.style.width = width + "px";
      el.style.height = height + "px";
      el.style.opacity = String(Math.max(0.18, Math.min(0.55, Math.abs(marker.info.impact_pct) / 24)));
      el.innerHTML = `
        <div class="__ve_heatmap_text">
          <span class="__ve_heatmap_pct">${marker.info.impact_pct > 0 ? "+" : ""}${marker.info.impact_pct}%</span>
          <span>${marker.info.impact_label || "예상 반응"}</span>
          <span>${String(marker.label || "").slice(0, 48)}</span>
        </div>`;
      heatmapLayer.appendChild(el);
    });
  }

  function post(type, payload) {
    try {
      window.parent.postMessage({ type, ...(payload || {}) }, window.location.origin);
    } catch { /* ignore */ }
  }

  function rectToFixedBox(el, box) {
    const r = el.getBoundingClientRect();
    box.style.left = Math.round(r.left) + "px";
    box.style.top = Math.round(r.top) + "px";
    box.style.width = Math.round(r.width) + "px";
    box.style.height = Math.round(r.height) + "px";
    return r;
  }

  // ---------- Selector Generator (MVP) ----------
  function cssEscape(v) {
    const value = String(v == null ? "" : v);
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return value
      .replace(/^[0-9]/, (match) => `\\3${match} `)
      .replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  }

  function attrEscape(v) {
    return String(v == null ? "" : v).replace(/"/g, '\\"');
  }

  function buildSelector(el) {
    if (!(el instanceof Element)) return null;

    if (el.id) return `#${cssEscape(el.id)}`;

    const tag = el.tagName.toLowerCase();
    const cls = (el.className || "").toString().trim();
    if (cls) {
      const classes = cls.split(/\s+/).filter(Boolean).slice(0, 3);
      if (classes.length) return `${tag}.${classes.map(cssEscape).join(".")}`;
    }

    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.tagName && depth < 5) {
      const t = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (!parent) { parts.unshift(t); break; }

      const idx = Array.from(parent.children).indexOf(cur) + 1;
      let part = t + `:nth-child(${idx})`;
      parts.unshift(part);

      cur = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  // 특정 요소 하나만 정확히 가리키는 selector 생성
  // 가장 가까운 고유 조상(data-track-id / id)에서 nth-child 경로로 연결
  function buildUniqueSelector(el) {
    if (!(el instanceof Element)) return null;

    const parts = [];
    let cur = el;
    let depth = 0;

    while (cur && cur.tagName && depth < 10) {
      const t = cur.tagName.toLowerCase();
      const parent = cur.parentElement;

      if (!parent) {
        parts.unshift(t);
        break;
      }

      const idx = Array.from(parent.children).indexOf(cur) + 1;
      parts.unshift(`${t}:nth-child(${idx})`);

      // 부모에 id가 있으면 거기서 멈춤
      if (parent.id) {
        parts.unshift(`#${cssEscape(parent.id)}`);
        break;
      }

      cur = parent;
      depth++;
    }

    return parts.join(" > ");
  }

  function getElementInfo(el) {
    const selector = buildSelector(el);
    const uniqueSelector = buildUniqueSelector(el);
    const rect = el.getBoundingClientRect();
    const text = (el.innerText || "").trim().slice(0, 120);
    return {
      selector,
      uniqueSelector,
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      text: text || null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    };
  }

  function isBlockedTarget(el) {
    if (!el) return true;
    if (el === hoverBox || el === selectBox || el === badge) return true;
    if (el.classList?.contains("__ve_box")) return true;
    if (el.classList?.contains("__ve_badge")) return true;
    if (el === document.documentElement || el === document.body) return true;
    return false;
  }

  // ---------- Change Apply Engine ----------
  function qsaSafe(selector) {
    try { return Array.from(document.querySelectorAll(selector)); }
    catch { return []; }
  }

  function snapshotOriginal(selector, el) {
    // selector 단위로 1개 원본만 저장(실무는 node별로 키가 따로 필요할 수 있음)
    if (originalMap.has(selector)) return;

    const attrs = {};
    // 자주 건드는 속성 몇 개만 저장(확장 가능)
    ["href", "src", "aria-label", "title", "value", "placeholder"].forEach((n) => {
      if (el.hasAttribute(n)) attrs[n] = el.getAttribute(n);
    });

    originalMap.set(selector, {
      text: el.textContent,
      display: el.style.display,
      styleAttr: el.getAttribute("style"),
      className: el.className,
      attrs
    });
  }

  function resetAll(options) {
    // CSS 주입 원복
    injectedStyle.textContent = "";
    clearHeatmap();

    // 저장된 원본으로 돌려놓기
    for (const [selector, orig] of originalMap.entries()) {
      const els = qsaSafe(selector);
      els.forEach((el) => {
        if (!(el instanceof Element)) return;
        if (typeof orig.text === "string") el.textContent = orig.text;
        if (orig.styleAttr === null || orig.styleAttr === undefined) el.removeAttribute("style");
        else el.setAttribute("style", orig.styleAttr);
        el.style.display = orig.display || "";
        el.className = orig.className || "";

        // attrs restore
        if (orig.attrs) {
          for (const [k, v] of Object.entries(orig.attrs)) {
            if (v === null || v === undefined) el.removeAttribute(k);
            else el.setAttribute(k, v);
          }
        }
      });
    }

    // 원본맵은 유지(다시 B 적용할 때 재스냅샷 필요 없게)
    if (!options?.silent) {
      post("EDITOR_APPLY_RESULT", { ok: true, message: "reset done" });
    }
  }

  function applyOneChange(change) {
    if (!change) return { ok: false, message: "empty change" };

    // global CSS inject
    if (change.type === "inject_css") {
      injectedStyle.textContent = String(change.css || "");
      return { ok: true, message: "applied global css" };
    }

    const selector = change.selector;
    const actions = Array.isArray(change.actions) ? change.actions : [];
    const els = qsaSafe(selector);

    if (els.length === 0) {
      return { ok: false, message: `selector not found: ${selector}` };
    }

    // 원본 스냅샷(첫 요소 기준)
    snapshotOriginal(selector, els[0]);

    els.forEach((el) => {
      actions.forEach((a) => {
        const t = a.type;

        if (t === "hide") el.style.display = "none";
        else if (t === "show") el.style.display = "";
        else if (t === "set_text") el.textContent = String(a.value ?? "");
        else if (t === "set_style") {
          const styles = a.styles && typeof a.styles === "object" ? a.styles : null;
          if (!styles) return;
          Object.entries(styles).forEach(([name, value]) => {
            const prop = String(name || "").trim();
            if (!prop) return;
            if (value === null || value === undefined || String(value).trim() === "") {
              el.style.removeProperty(prop);
            } else {
              el.style.setProperty(prop, String(value));
            }
          });
        }
        else if (t === "add_class") el.classList.add(String(a.value ?? ""));
        else if (t === "remove_class") el.classList.remove(String(a.value ?? ""));
        else if (t === "set_attr") {
          const name = String(a.name ?? "").trim();
          if (!name) return;
          const val = a.value;
          if (val === null || val === undefined) el.removeAttribute(name);
          else el.setAttribute(name, String(val));
        }
      });
    });

    return { ok: true, message: `applied: ${selector}` };
  }

  function applyChanges(changes) {
    const list = Array.isArray(changes) ? changes : [];
    const results = list.map(applyOneChange);
    const failures = results.filter((result) => !result?.ok);
    if (failures.length > 0) {
      const first = failures[0];
      post("EDITOR_APPLY_RESULT", {
        ok: false,
        message: `${failures.length}개 실패 / ${list.length}개 변경 - ${first?.message || "apply failed"}`,
      });
      return;
    }

    post("EDITOR_APPLY_RESULT", {
      ok: true,
      message: `${list.length}개 변경 적용 완료`,
    });
  }

  // ---------- Picking handlers ----------
  let lastHoverEl = null;
  let selectedEl = null;

  function onMouseMove(e) {
    if (!pickMode) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isBlockedTarget(el)) {
      hideEl(hoverBox);
      badge.style.display = "none";
      lastHoverEl = null;
      return;
    }

    if (el !== lastHoverEl) {
      lastHoverEl = el;
      const info = getElementInfo(el);

      showEl(hoverBox);
      rectToFixedBox(el, hoverBox);

      badge.style.display = "block";
      badge.style.left = Math.min(window.innerWidth - 20, e.clientX + 12) + "px";
      badge.style.top = Math.min(window.innerHeight - 20, e.clientY + 12) + "px";
      badge.textContent = `${info.tag}  ${info.selector}`;

      post("EDITOR_ELEMENT_HOVER", info);
    } else {
      badge.style.left = Math.min(window.innerWidth - 20, e.clientX + 12) + "px";
      badge.style.top = Math.min(window.innerHeight - 20, e.clientY + 12) + "px";
    }
  }

  function onClick(e) {
    if (!pickMode) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isBlockedTarget(el)) return;

    e.preventDefault();
    e.stopPropagation();

    selectedEl = el;
    const info = getElementInfo(el);

    showEl(selectBox);
    rectToFixedBox(el, selectBox);

    post("EDITOR_ELEMENT_SELECTED", info);
  }

  function refreshBoxes() {
    if (lastHoverEl && pickMode) rectToFixedBox(lastHoverEl, hoverBox);
    if (selectedEl) rectToFixedBox(selectedEl, selectBox);
  }

  // Parent messages
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};

    if (data.type === "EDITOR_SET_PICKMODE") {
      pickMode = !!data.pickMode;
      post("EDITOR_LOG", { message: `pickMode=${pickMode}` });

      if (!pickMode) {
        hideEl(hoverBox);
        badge.style.display = "none";
      }
      return;
    }

    if (data.type === "EDITOR_PREVIEW_SET_VARIANT") {
      const v = data.variant;
      const changes = data.changes || [];
      if (v === "A") {
        resetAll();
      } else if (v === "B") {
        // 항상 “A로 리셋 후 B 적용” 방식이 예측 가능
        resetAll({ silent: true });
        applyChanges(changes);
        renderHeatmap(changes);
      }
      refreshBoxes();
      return;
    }
  });

  // Listeners
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("scroll", refreshBoxes, true);
  window.addEventListener("resize", refreshBoxes, true);

  post("EDITOR_LOG", { message: "overlay ready (with preview apply engine)" });
})();
