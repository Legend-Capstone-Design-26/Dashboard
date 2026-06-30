const { inferStepFromEvent, stepIndex } = require("../../analytics/funnel");

// ─── Semantic Signal Detection ────────────────────────────────────────────────
// SDK가 click 이벤트와 함께 보내는 모든 텍스트 신호를 합쳐서 의미를 추론한다.
// data-track-id(element_id)에만 의존하지 않고 버튼 텍스트·aria-label·
// CSS 클래스·HTML id·URL 경로까지 사용하므로 SDK 수정 없이 커버율을 높인다.

function buildClickSignal(props, path) {
  return [
    String(props.element_id  || ""),
    String(props.text        || ""),
    String(props.aria_label  || ""),
    String(props.class       || ""),
    String(props.id          || ""),
    String(path              || ""),
  ].join(" ").toLowerCase();
}

function matchesAny(signal, tokens) {
  return tokens.some((t) => signal.includes(t));
}

function inferSemanticSignals(event) {
  const props   = event.props || {};
  const isClick = event.event_name === "click";
  const path    = String(event.path || "").toLowerCase();
  const signal  = isClick ? buildClickSignal(props, path) : "";

  return {
    isCartAdd: event.event_name === "add_to_cart"
      || (isClick && matchesAny(signal, [
        "add_to_cart", "cart_add", "장바구니", "담기", "add to cart", "addtocart",
      ]))
      || path.includes("/cart/add"),

    isCartRemove: event.event_name === "remove_from_cart"
      || (isClick && matchesAny(signal, [
        "remove_from_cart", "cart_remove", "삭제", "제거", "remove from cart",
      ])),

    isPriceInteraction: isClick && matchesAny(signal, [
      "price", "coupon", "discount", "shipping", "fee",
      "가격", "쿠폰", "할인", "배송비", "적립",
    ]),

    isFilter: event.event_name === "filter_change"
      || (isClick && matchesAny(signal, [
        "filter", "sort", "필터", "정렬",
      ])),

    isSearch: event.event_name === "search"
      || (isClick && matchesAny(signal, ["search", "검색"])),

    isPaymentAttempt: event.event_name === "payment_attempt"
      || (isClick && matchesAny(signal, [
        "pay_btn", "결제", "구매하기", "주문하기", "payment",
      ])),

    isWishlist: isClick && matchesAny(signal, [
      "wishlist", "찜", "찜하기", "favorite", "wish",
    ]),
  };
}

// ─── Session State Merger ─────────────────────────────────────────────────────

function mergeSessionState(currentState, event) {
  const current = currentState && typeof currentState === "object" ? currentState : {};
  const nextStep = inferStepFromEvent(event);
  const currentMaxStep = typeof current.max_step === "string" ? current.max_step : "home";
  const maxStep = stepIndex(nextStep) >= stepIndex(currentMaxStep) ? nextStep : currentMaxStep;

  const path  = event.path || current.last_path || null;
  const paths = Array.isArray(current.paths) ? current.paths.slice() : [];
  if (path && paths[paths.length - 1] !== path) paths.push(path);

  const sig     = inferSemanticSignals(event);
  const isClick = event.event_name === "click";
  const props   = event.props || {};

  const isError = event.event_name === "error"
    || typeof props.message === "string"
    || typeof props.code    === "string";

  return {
    site_id:      event.site_id      || current.site_id      || null,
    session_id:   event.session_id   || current.session_id   || null,
    anon_user_id: event.anon_user_id || current.anon_user_id || null,

    started_at:      typeof current.started_at === "number" ? current.started_at : (event.ts || Date.now()),
    last_ts:         event.ts || Date.now(),
    last_event_name: event.event_name || current.last_event_name || null,
    last_path:       path,
    paths:           paths.slice(-25),
    ui_variant:      event.ui_variant || current.ui_variant || null,

    event_count:     (Number(current.event_count)     || 0) + 1,
    page_view_count: (Number(current.page_view_count) || 0) + (event.event_name === "page_view" ? 1 : 0),
    click_count:     (Number(current.click_count)     || 0) + (isClick ? 1 : 0),

    checkout_started:   Boolean(current.checkout_started)   || event.event_name === "checkout_start",
    checkout_completed: Boolean(current.checkout_completed) || event.event_name === "checkout_complete",

    error_count:              (Number(current.error_count)              || 0) + (isError          ? 1 : 0),
    price_interaction_count:  (Number(current.price_interaction_count)  || 0) + (sig.isPriceInteraction ? 1 : 0),
    filter_count:             (Number(current.filter_count)             || 0) + (sig.isFilter     ? 1 : 0),
    search_count:             (Number(current.search_count)             || 0) + (sig.isSearch     ? 1 : 0),
    cart_add_count:           (Number(current.cart_add_count)           || 0) + (sig.isCartAdd    ? 1 : 0),
    cart_remove_count:        (Number(current.cart_remove_count)        || 0) + (sig.isCartRemove ? 1 : 0),
    wishlist_count:           (Number(current.wishlist_count)           || 0) + (sig.isWishlist   ? 1 : 0),
    payment_attempt_count:    (Number(current.payment_attempt_count)    || 0) + (sig.isPaymentAttempt ? 1 : 0),

    last_dwell_ms:  typeof props.dwell_ms === "number" ? props.dwell_ms : (current.last_dwell_ms || null),
    dwell_total_ms: (Number(current.dwell_total_ms) || 0)
      + (typeof props.dwell_ms === "number" ? Math.max(0, props.dwell_ms) : 0),

    max_step:    maxStep,
    experiments: Array.isArray(event.experiments)
      ? event.experiments
      : (Array.isArray(current.experiments) ? current.experiments : []),
  };
}

// ─── Variant Assignment Extraction ───────────────────────────────────────────

function extractVariantAssignments(event) {
  const experiments = Array.isArray(event?.experiments) ? event.experiments : [];
  return experiments
    .filter((item) => item && item.key && item.variant)
    .map((item) => ({
      siteId:        event.site_id,
      anonUserId:    event.anon_user_id,
      experimentKey: item.key,
      variant:       item.variant,
      version:       item.version || null,
    }))
    .filter((item) => item.siteId && item.anonUserId && item.experimentKey);
}

module.exports = {
  mergeSessionState,
  extractVariantAssignments,
  inferSemanticSignals,
};
