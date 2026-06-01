const { inferStepFromEvent, stepIndex } = require("../../analytics/funnel");

function mergeSessionState(currentState, event) {
  const current = currentState && typeof currentState === "object" ? currentState : {};
  const nextStep = inferStepFromEvent(event);
  const currentMaxStep = typeof current.max_step === "string" ? current.max_step : "home";
  const maxStep = stepIndex(nextStep) >= stepIndex(currentMaxStep) ? nextStep : currentMaxStep;
  const path = event.path || current.last_path || null;
  const paths = Array.isArray(current.paths) ? current.paths.slice() : [];
  if (path && paths[paths.length - 1] !== path) paths.push(path);
  const props = event.props || {};
  const elementId = String(props.element_id || "").toLowerCase();
  const isClick = event.event_name === "click";

  return {
    site_id: event.site_id || current.site_id || null,
    session_id: event.session_id || current.session_id || null,
    anon_user_id: event.anon_user_id || current.anon_user_id || null,
    started_at: typeof current.started_at === "number" ? current.started_at : (event.ts || Date.now()),
    last_ts: event.ts || Date.now(),
    last_event_name: event.event_name || current.last_event_name || null,
    last_path: path,
    paths: paths.slice(-25),
    ui_variant: event.ui_variant || current.ui_variant || null,
    event_count: (Number(current.event_count) || 0) + 1,
    page_view_count: (Number(current.page_view_count) || 0) + (event.event_name === "page_view" ? 1 : 0),
    click_count: (Number(current.click_count) || 0) + (isClick ? 1 : 0),
    checkout_started: Boolean(current.checkout_started) || event.event_name === "checkout_start",
    checkout_completed: Boolean(current.checkout_completed) || event.event_name === "checkout_complete",
    error_count: (Number(current.error_count) || 0) + (event.event_name === "error" || typeof props.message === "string" || typeof props.code === "string" ? 1 : 0),
    price_interaction_count: (Number(current.price_interaction_count) || 0) + (isClick && (elementId.includes("price") || elementId.includes("coupon") || elementId.includes("discount") || elementId.includes("shipping") || elementId.includes("fee")) ? 1 : 0),
    filter_count: (Number(current.filter_count) || 0) + (event.event_name === "filter_change" || (isClick && (elementId.includes("filter") || elementId.includes("sort"))) ? 1 : 0),
    search_count: (Number(current.search_count) || 0) + (event.event_name === "search" || (isClick && elementId.includes("search")) ? 1 : 0),
    cart_add_count: (Number(current.cart_add_count) || 0) + (event.event_name === "add_to_cart" || (isClick && (elementId.includes("add_to_cart") || elementId.includes("cart_add"))) ? 1 : 0),
    cart_remove_count: (Number(current.cart_remove_count) || 0) + (event.event_name === "remove_from_cart" || (isClick && (elementId.includes("remove_from_cart") || elementId.includes("cart_remove"))) ? 1 : 0),
    payment_attempt_count: (Number(current.payment_attempt_count) || 0) + (event.event_name === "payment_attempt" || (isClick && (elementId.includes("pay_btn") || elementId === "pay")) ? 1 : 0),
    last_dwell_ms: typeof event.props?.dwell_ms === "number" ? event.props.dwell_ms : (current.last_dwell_ms || null),
    dwell_total_ms: (Number(current.dwell_total_ms) || 0) + (typeof event.props?.dwell_ms === "number" ? Math.max(0, event.props.dwell_ms) : 0),
    max_step: maxStep,
    experiments: Array.isArray(event.experiments) ? event.experiments : (Array.isArray(current.experiments) ? current.experiments : []),
  };
}

function extractVariantAssignments(event) {
  const experiments = Array.isArray(event?.experiments) ? event.experiments : [];
  return experiments
    .filter((item) => item && item.key && item.variant)
    .map((item) => ({
      siteId: event.site_id,
      anonUserId: event.anon_user_id,
      experimentKey: item.key,
      variant: item.variant,
      version: item.version || null,
    }))
    .filter((item) => item.siteId && item.anonUserId && item.experimentKey);
}

module.exports = {
  mergeSessionState,
  extractVariantAssignments,
};
