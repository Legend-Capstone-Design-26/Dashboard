const path = require("path");
const { createLlmClient } = require("../services/llm");
const { readJson, writeJson, ensureJsonFile } = require("../services/data-store");
const { buildOverlayPrompt } = require("./overlay-prompt-builder");

const OVERLAYS_FILE = path.join(__dirname, "overlays.generated.json");

function ensureOverlayStore() {
  ensureJsonFile(OVERLAYS_FILE, { version: 1, generated_at: null, overlays: [] });
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clampMultiplier(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(0.6, Math.min(1.6, Number(num.toFixed(3))));
}

function collectTransitionIds(stateModel) {
  const out = new Set();
  const states = stateModel?.states && typeof stateModel.states === "object" ? stateModel.states : {};
  for (const [stateId, state] of Object.entries(states)) {
    const transitions = Array.isArray(state?.transitions) ? state.transitions : [];
    for (const transition of transitions) {
      if (transition?.to) out.add(`${stateId}->${transition.to}`);
    }
  }
  return out;
}

function collectUiChangeSignals(experiment) {
  const changes = Array.isArray(experiment?.variants?.B) ? experiment.variants.B : [];
  const signals = {
    text: false,
    style: false,
    color: false,
    visibility: false,
    link: false,
    css: false,
  };

  for (const change of changes) {
    if (!change || typeof change !== "object") continue;
    if (change.type === "inject_css") {
      signals.css = true;
      const cssText = String(change.css || "").toLowerCase();
      if (/color|background|border|outline|font|padding|margin|display|visibility|width|height|flex|grid/.test(cssText)) {
        signals.style = true;
      }
      continue;
    }

    const actions = Array.isArray(change.actions) ? change.actions : [];
    for (const action of actions) {
      if (!action || typeof action !== "object") continue;
      if (action.type === "set_text") signals.text = true;
      if (action.type === "hide" || action.type === "show") signals.visibility = true;
      if (action.type === "set_attr" && String(action.name || "").toLowerCase() === "href") signals.link = true;
      if (action.type === "set_style") {
        signals.style = true;
        const styles = action.styles && typeof action.styles === "object" ? action.styles : {};
        for (const key of Object.keys(styles)) {
          if (/color|background|border|outline/i.test(key)) {
            signals.color = true;
            break;
          }
        }
      }
    }
  }

  return signals;
}

function normalizeOverlay(candidate, persona) {
  const validIds = collectTransitionIds(persona?.state_model);
  const multipliers = candidate?.edge_weight_multipliers && typeof candidate.edge_weight_multipliers === "object"
    ? candidate.edge_weight_multipliers
    : {};
  const normalized = {};
  for (const [edgeId, value] of Object.entries(multipliers)) {
    if (!validIds.has(edgeId)) continue;
    const clamped = clampMultiplier(value);
    if (clamped == null || clamped === 1) continue;
    normalized[edgeId] = clamped;
  }
  return {
    reason_summary: typeof candidate?.reason_summary === "string" && candidate.reason_summary.trim()
      ? candidate.reason_summary.trim()
      : "variant 의미를 바탕으로 전이 보정안을 생성했습니다.",
    edge_weight_multipliers: normalized,
  };
}

function deriveFallbackOverlay({ experiment, persona }) {
  const text = [
    String(experiment?.hypothesis || ""),
    JSON.stringify(experiment?.variants?.B || []),
  ].join(" ").toLowerCase();
  const style = persona?.normalized_persona?.style_key || "unknown";
  const signals = collectUiChangeSignals(experiment);
  const edge_weight_multipliers = {};

  const boost = (edgeId, value) => {
    const current = Number(edge_weight_multipliers[edgeId]);
    edge_weight_multipliers[edgeId] = Number.isFinite(current) && current > 0 ? Math.max(current, value) : value;
  };

  if (signals.text || style === "review_oriented" || /review|rating|trust|후기|리뷰|신뢰|평점/.test(text)) {
    boost("review_sort->cart_entry", 1.3);
    boost("trust_check->cart_entry", 1.25);
  }

  if (signals.color || signals.style || signals.css || /color|background|style|layout|css|색|배경|폰트|간격/.test(text)) {
    boost("landing->cta_click", 1.18);
    boost("detail_view->cart_entry", 1.15);
  }

  if (signals.visibility || /hide|show|visible|display|보이기|숨기기|노출/.test(text)) {
    boost("landing->cta_click", 1.12);
    boost("detail_view->cart_entry", 1.12);
    boost("checkout_entry->payment_attempt", 1.08);
  }

  if (signals.link || /href|link|url|링크|이동/.test(text)) {
    boost("landing->cta_click", 1.18);
    boost("checkout_entry->payment_attempt", 1.1);
  }

  if (signals.css || /css|margin|padding|spacing|grid|flex|width|height/.test(text)) {
    boost("compare_click->cart_entry", 1.12);
    boost("detail_view->cart_entry", 1.1);
  }

  if (style === "price_sensitive" || /coupon|discount|price|shipping|배송|할인|쿠폰|가격/.test(text)) {
    boost("shipping_check->cart_entry", 1.25);
    boost("shipping_check->exit", 0.85);
  }
  if (style === "impulsive" || /cta|hero|buy now|긴급|지금|즉시/.test(text)) {
    boost("landing->cta_click", 1.2);
    boost("detail_view->cart_entry", 1.2);
  }
  if (style === "comparison" || /compare|sort|filter|비교|정렬|필터/.test(text)) {
    boost("compare_click->cart_entry", 1.2);
  }
  if (style === "shipping_sensitive" || /배송|shipping|delivery|threshold|무료배송/.test(text)) {
    boost("threshold_check->cart_entry", 1.25);
    boost("threshold_check->exit", 0.85);
  }
  if (style === "brand_loyal" || /brand|story|브랜드/.test(text)) {
    boost("detail_view->cart_entry", 1.15);
  }
  if (style === "fast_decision" || /quick|fast|간편|빠른|즉시/.test(text)) {
    boost("checkout_entry->payment_attempt", 1.1);
    boost("payment_attempt->checkout_complete", 1.15);
  }

  return {
    reason_summary: "variant B의 UI/UX 변경 유형과 페르소나 반응 경향을 바탕으로 기본 오버레이를 생성했습니다.",
    edge_weight_multipliers,
  };
}

async function generateOverlay({ experiment, persona, llmClient }) {
  const prompt = buildOverlayPrompt({ experiment, persona });
  const client = llmClient || createLlmClient();
  const draft = JSON.stringify(deriveFallbackOverlay({ experiment, persona }));
  const result = await client.rewrite({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    draftAnswer: draft,
  });
  const parsed = safeParseJson(result?.text || "") || deriveFallbackOverlay({ experiment, persona });
  const normalized = normalizeOverlay(parsed, persona);
  return {
    provider: client.mode || "mock",
    reason: result?.reason || null,
    prompt,
    overlay: normalized,
  };
}

function overlayId({ experimentKey, variant, personaId }) {
  return `${experimentKey}::${variant}::${personaId}`;
}

function loadOverlayStore() {
  ensureOverlayStore();
  return readJson(OVERLAYS_FILE, { version: 1, generated_at: null, overlays: [] }) || { version: 1, generated_at: null, overlays: [] };
}

function saveOverlayStore(store) {
  writeJson(OVERLAYS_FILE, store);
}

function upsertOverlayRecord({ experiment, persona, generated }) {
  const store = loadOverlayStore();
  const record = {
    overlay_id: overlayId({ experimentKey: experiment.key, variant: "B", personaId: persona.id }),
    experiment_key: experiment.key,
    variant: "B",
    persona_id: persona.id,
    group_id: persona.group_id || null,
    style_key: persona?.normalized_persona?.style_key || null,
    provider: generated.provider,
    provider_reason: generated.reason,
    generated_at: Date.now(),
    reason_summary: generated.overlay.reason_summary,
    edge_weight_multipliers: generated.overlay.edge_weight_multipliers,
  };
  const idx = store.overlays.findIndex((item) => item.overlay_id === record.overlay_id);
  if (idx >= 0) store.overlays[idx] = record;
  else store.overlays.push(record);
  store.generated_at = new Date().toISOString();
  saveOverlayStore(store);
  return record;
}

function listOverlayRecords() {
  return loadOverlayStore().overlays || [];
}

module.exports = {
  OVERLAYS_FILE,
  deriveFallbackOverlay,
  normalizeOverlay,
  generateOverlay,
  upsertOverlayRecord,
  listOverlayRecords,
  loadOverlayStore,
};
