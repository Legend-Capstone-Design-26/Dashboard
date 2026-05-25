const ALLOWED_ACTION_TYPES = new Set(["set_text", "set_style", "inject_css"]);

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function indigoCtaStyle() {
  return {
    background: "#4f46e5",
    color: "#ffffff",
    "font-weight": "700",
    "border-radius": "14px",
    "box-shadow": "0 12px 24px rgba(79, 70, 229, 0.28)",
  };
}

function buildDraftChangesFromInstruction(input = {}, context = {}) {
  const message = String(input.message || "").toLowerCase();
  const targetType = String(input.targetType || context.targetType || "").toLowerCase();
  const targetPage = String(input.targetPage || context.targetPage || "/");

  if (includesAny(message, ["배송비", "배송", "shipping"])) {
    return {
      ok: true,
      changes: [{
        selector: "[data-track-id='shipping_notice']",
        label: "배송 안내 강조",
        actions: [{
          type: "set_style",
          styles: {
            background: "#ecfeff",
            color: "#0f172a",
            "border-color": "#06b6d4",
            "font-weight": "700",
            "border-radius": "12px",
          },
        }],
      }],
      goals: ["checkout_complete"],
      purpose: "shipping",
      hypothesis: "배송비 안내를 더 명확하게 강조하면 결제 단계의 불안을 줄여 checkout_complete 전환율이 증가할 것이다.",
      targetPage,
      targetType: targetType || "checkout",
    };
  }

  if (includesAny(message, ["상품", "product", "구매 버튼", "장바구니", "add to cart"])) {
    return {
      ok: true,
      changes: [{
        selector: "[data-track-id='add_to_cart']",
        label: "구매 버튼 강조",
        actions: [
          { type: "set_text", value: "장바구니에 바로 담기" },
          { type: "set_style", styles: indigoCtaStyle() },
        ],
      }],
      goals: ["add_to_cart"],
      purpose: "product_cta",
      hypothesis: "상품 구매 버튼의 문구와 시각적 강조를 개선하면 add_to_cart 전환율이 증가할 것이다.",
      targetPage,
      targetType: targetType || "product",
    };
  }

  if (includesAny(message, ["결제", "checkout", "cta", "버튼", "강조"]) || targetType === "checkout") {
    return {
      ok: true,
      changes: [{
        selector: "[data-track-id='pay_btn']",
        label: "결제 CTA 강조",
        actions: [
          { type: "set_text", value: "지금 바로 주문하기" },
          { type: "set_style", styles: indigoCtaStyle() },
        ],
      }],
      goals: ["checkout_complete"],
      purpose: "cta",
      hypothesis: "결제 CTA 문구와 시각적 강조를 개선하면 checkout_complete 전환율이 증가할 것이다.",
      targetPage,
      targetType: targetType || "checkout",
    };
  }

  return {
    ok: true,
    changes: [{
      selector: "[data-track-id='primary_cta']",
      label: "기본 CTA 강조",
      actions: [
        { type: "set_text", value: "지금 확인하기" },
        { type: "set_style", styles: indigoCtaStyle() },
      ],
    }],
    goals: ["checkout_complete"],
    purpose: "cta",
    hypothesis: "주요 CTA의 문구와 시각적 강조를 개선하면 핵심 전환율이 증가할 것이다.",
    targetPage,
    targetType: targetType || "default",
  };
}

function isDangerousSelector(selector) {
  const normalized = String(selector || "").trim().toLowerCase();
  return normalized === "body" || normalized === "html" || normalized === "*" || normalized === "body *" || normalized === "html *";
}

function hasDangerousCss(action, selector) {
  if (action.type === "inject_css") {
    const css = String(action.css || "").toLowerCase();
    return (/position\s*:\s*fixed/.test(css) && /(inset\s*:\s*0|width\s*:\s*100vw|height\s*:\s*100vh)/.test(css))
      || /(body|html|\*)\s*\{[^}]*display\s*:\s*none/.test(css)
      || /(body|html|\*)\s*\{[^}]*visibility\s*:\s*hidden/.test(css);
  }
  if (action.type !== "set_style") return false;
  const styles = action.styles || {};
  const position = String(styles.position || "").toLowerCase();
  const display = String(styles.display || "").toLowerCase();
  const visibility = String(styles.visibility || "").toLowerCase();
  if (isDangerousSelector(selector) && (display === "none" || visibility === "hidden")) return true;
  return position === "fixed" && (styles.inset === "0" || styles.width === "100vw" || styles.height === "100vh");
}

function validateDraftChanges(changes) {
  if (!Array.isArray(changes)) return { ok: false, reason: "changes must be an array" };
  for (const change of changes) {
    const selector = String(change?.selector || "").trim();
    if (!selector) return { ok: false, reason: "selector must be a non-empty string" };
    if (!Array.isArray(change?.actions)) return { ok: false, reason: "actions must be an array" };
    for (const action of change.actions) {
      if (!ALLOWED_ACTION_TYPES.has(action?.type)) return { ok: false, reason: `unsupported action type: ${action?.type || "missing"}` };
      if (action.type === "set_style" && (!action.styles || typeof action.styles !== "object" || Array.isArray(action.styles))) {
        return { ok: false, reason: "set_style.styles must be an object" };
      }
      if (action.type === "set_text" && typeof action.value !== "string") return { ok: false, reason: "set_text.value must be a string" };
      if (action.type === "inject_css" && typeof action.css !== "string") return { ok: false, reason: "inject_css.css must be a string" };
      if (hasDangerousCss(action, selector)) return { ok: false, reason: "dangerous css is not allowed" };
    }
  }
  return { ok: true };
}

module.exports = {
  buildDraftChangesFromInstruction,
  validateDraftChanges,
};
