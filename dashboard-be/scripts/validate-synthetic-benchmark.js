const fs = require("fs");
const path = require("path");

const DEFAULT_OUTPUT_DIR = path.join(__dirname, "..", "benchmark", "output");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      const next = new Error(`Invalid JSONL at line ${index + 1}: ${String(error.message || error)}`);
      next.cause = error;
      throw next;
    }
  });
}

function groupBySession(events) {
  const map = new Map();
  for (const event of events) {
    const sessionId = String(event.session_id || "");
    if (!map.has(sessionId)) map.set(sessionId, []);
    map.get(sessionId).push(event);
  }
  for (const list of map.values()) {
    list.sort((left, right) => Number(left.ts || 0) - Number(right.ts || 0));
  }
  return map;
}

function hasRequiredFields(event) {
  const required = [
    "schema_version",
    "app_id",
    "site_id",
    "anon_user_id",
    "session_id",
    "ts",
    "url",
    "path",
    "user_agent",
    "lang",
    "screen",
    "viewport",
    "event_name",
    "props",
    "received_at",
    "request_id",
  ];
  return required.every((field) => event[field] !== undefined && event[field] !== null && event[field] !== "");
}

function deriveSessionMetrics(events) {
  let searchCount = 0;
  let filterCount = 0;
  let addToCartCount = 0;
  let removeFromCartCount = 0;
  let checkoutEntered = false;
  let purchaseCompleted = false;
  let productViews = 0;
  let reviewViews = 0;
  let categoryViews = 0;
  for (const event of events) {
    const name = String(event.event_name || "");
    const pathName = String(event.path || "");
    if (name === "search") searchCount += 1;
    if (name === "filter_change") filterCount += 1;
    if (name === "add_to_cart") addToCartCount += 1;
    if (name === "remove_from_cart") removeFromCartCount += 1;
    if (name === "checkout_start" || pathName.startsWith("/checkout")) checkoutEntered = true;
    if (name === "checkout_complete" || pathName.startsWith("/order-complete")) purchaseCompleted = true;
    if (pathName.startsWith("/product")) productViews += 1;
    if (pathName.startsWith("/review")) reviewViews += 1;
    if (pathName.startsWith("/category")) categoryViews += 1;
  }
  return {
    searchCount,
    filterCount,
    addToCartCount,
    removeFromCartCount,
    checkoutEntered,
    purchaseCompleted,
    productViews,
    reviewViews,
    categoryViews,
    eventCount: events.length,
  };
}

function validateTransitions(events) {
  let sawProduct = false;
  let sawCart = false;
  let sawCheckout = false;
  let violations = 0;
  for (const event of events) {
    const name = String(event.event_name || "");
    const pathName = String(event.path || "");
    if (pathName.startsWith("/product")) sawProduct = true;
    if (name === "add_to_cart" && !sawProduct) violations += 1;
    if (name === "add_to_cart") sawCart = true;
    if (pathName.startsWith("/cart")) sawCart = true;
    if (name === "checkout_start" && !sawCart) violations += 1;
    if (name === "checkout_start" || pathName.startsWith("/checkout")) sawCheckout = true;
    if (name === "payment_attempt" && !sawCheckout) violations += 1;
    if (name === "checkout_complete" && !sawCheckout) violations += 1;
  }
  return violations;
}

function personaConstraintSatisfied(session, metrics) {
  switch (session.persona_id) {
    case "goal_oriented_buyer":
      return metrics.checkoutEntered && metrics.purchaseCompleted && metrics.eventCount <= 12;
    case "explorer":
      return !metrics.checkoutEntered && !metrics.purchaseCompleted && metrics.productViews >= 2 && metrics.categoryViews >= 1;
    case "price_comparison":
      return !metrics.purchaseCompleted && metrics.searchCount >= 1 && metrics.filterCount >= 1 && metrics.reviewViews >= 1;
    case "impulse_buyer":
      return metrics.checkoutEntered && metrics.purchaseCompleted && metrics.searchCount === 0 && metrics.eventCount <= 9;
    case "cart_abandoner":
      return metrics.addToCartCount >= 1 && metrics.checkoutEntered && !metrics.purchaseCompleted;
    default:
      return false;
  }
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(6));
}

function main() {
  const outputDir = path.resolve(arg("output-dir", DEFAULT_OUTPUT_DIR));
  const eventsPath = path.join(outputDir, "events.jsonl");
  const sessionsPath = path.join(outputDir, "sessions.json");
  const reportPath = path.join(outputDir, "validation-report.json");

  const events = readJsonLines(eventsPath);
  const sessionsPayload = readJson(sessionsPath);
  const sessions = Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [];
  const eventsBySession = groupBySession(events);
  const sessionMap = new Map(sessions.map((session) => [session.session_id, session]));

  let schemaValidSessions = 0;
  let temporalViolationSessions = 0;
  let impossibleFunnelSessions = 0;
  let hardConstraintSessions = 0;
  let matchedSessionRows = 0;

  for (const session of sessions) {
    const sessionEvents = eventsBySession.get(session.session_id) || [];
    if (sessionEvents.length > 0) matchedSessionRows += 1;
    const schemaValid = sessionEvents.length > 0 && sessionEvents.every(hasRequiredFields);
    if (schemaValid) schemaValidSessions += 1;

    let temporalValid = true;
    for (let index = 1; index < sessionEvents.length; index += 1) {
      if (Number(sessionEvents[index].ts || 0) < Number(sessionEvents[index - 1].ts || 0)) {
        temporalValid = false;
        break;
      }
    }
    if (!temporalValid) temporalViolationSessions += 1;

    const transitionViolations = validateTransitions(sessionEvents);
    if (transitionViolations > 0) impossibleFunnelSessions += 1;

    const metrics = deriveSessionMetrics(sessionEvents);
    if (personaConstraintSatisfied(session, metrics)) hardConstraintSessions += 1;
  }

  const parseSuccessRate = 1;
  const schemaValidRate = rate(schemaValidSessions, sessions.length);
  const temporalViolationRate = rate(temporalViolationSessions, sessions.length);
  const transitionValidityRate = rate(sessions.length - impossibleFunnelSessions, sessions.length);
  const hardConstraintSatisfactionRate = rate(hardConstraintSessions, sessions.length);

  const report = {
    generated_at: new Date().toISOString(),
    input: {
      output_dir: outputDir,
      events_path: eventsPath,
      sessions_path: sessionsPath,
    },
    counts: {
      sessions: sessions.length,
      events: events.length,
      sessions_with_events: matchedSessionRows,
      orphan_event_sessions: Array.from(eventsBySession.keys()).filter((sessionId) => !sessionMap.has(sessionId)).length,
    },
    metrics: {
      parse_success_rate: parseSuccessRate,
      schema_valid_rate: schemaValidRate,
      temporal_violation_rate: temporalViolationRate,
      transition_validity_rate: transitionValidityRate,
      hard_constraint_satisfaction_rate: hardConstraintSatisfactionRate,
    },
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Validation report written to ${reportPath}`);
  console.log(JSON.stringify(report.metrics, null, 2));
}

main();
