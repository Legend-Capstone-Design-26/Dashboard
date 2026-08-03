const fs = require("fs");
const path = require("path");

const DEFAULT_OUTPUT_DIR = path.join(__dirname, "..", "benchmark", "output", "merged-7500");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function groupBy(array, keyFn) {
  const map = new Map();
  for (const item of array) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(6));
}

function stats(numbers) {
  const values = numbers.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!values.length) return { count: 0, min: 0, p50: 0, mean: 0, p95: 0, max: 0 };
  const sum = values.reduce((acc, value) => acc + value, 0);
  const pick = (q) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * q))];
  return {
    count: values.length,
    min: values[0],
    p50: pick(0.5),
    mean: Number((sum / values.length).toFixed(3)),
    p95: pick(0.95),
    max: values[values.length - 1],
  };
}

function sourceFromSessionId(sessionId) {
  const text = String(sessionId || "");
  const split = text.split("__");
  return split.length > 1 ? split[0] : "unknown_source";
}

function groupEventsBySession(events) {
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

function deriveMetrics(events) {
  let searchCount = 0;
  let filterCount = 0;
  let addToCartCount = 0;
  let removeFromCartCount = 0;
  let checkoutEntered = false;
  let purchaseCompleted = false;
  let productViews = 0;
  let reviewViews = 0;
  let categoryViews = 0;
  let errorCount = 0;
  const paths = [];
  for (const event of events) {
    const name = String(event.event_name || "");
    const pathName = String(event.path || "");
    paths.push(pathName);
    if (name === "search") searchCount += 1;
    if (name === "filter_change") filterCount += 1;
    if (name === "add_to_cart") addToCartCount += 1;
    if (name === "remove_from_cart") removeFromCartCount += 1;
    if (name === "error") errorCount += 1;
    if (name === "checkout_start" || pathName.startsWith("/checkout")) checkoutEntered = true;
    if (name === "checkout_complete" || pathName.startsWith("/order-complete")) purchaseCompleted = true;
    if (pathName.startsWith("/product")) productViews += 1;
    if (pathName.startsWith("/review")) reviewViews += 1;
    if (pathName.startsWith("/category")) categoryViews += 1;
  }
  let revisitCount = 0;
  const seen = new Set();
  for (const pathName of paths) {
    if (seen.has(pathName)) revisitCount += 1;
    seen.add(pathName);
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
    errorCount,
    eventCount: events.length,
    uniquePathCount: seen.size,
    revisitRate: events.length > 0 ? revisitCount / events.length : 0,
  };
}

function transitionViolations(events) {
  let sawProduct = false;
  let sawCart = false;
  let sawCheckout = false;
  let violations = 0;
  for (const event of events) {
    const name = String(event.event_name || "");
    const pathName = String(event.path || "");
    if (pathName.startsWith("/product")) sawProduct = true;
    if (name === "add_to_cart" && !sawProduct) violations += 1;
    if (name === "add_to_cart" || pathName.startsWith("/cart")) sawCart = true;
    if (name === "checkout_start" && !sawCart) violations += 1;
    if (name === "checkout_start" || pathName.startsWith("/checkout")) sawCheckout = true;
    if (name === "payment_attempt" && !sawCheckout) violations += 1;
    if (name === "checkout_complete" && !sawCheckout) violations += 1;
  }
  return violations;
}

function constraintSatisfied(session, metrics) {
  switch (session.persona_id) {
    case "goal_oriented_buyer":
      return metrics.checkoutEntered && metrics.purchaseCompleted && metrics.eventCount <= 14 && metrics.searchCount <= 2;
    case "explorer":
      return !metrics.purchaseCompleted && metrics.productViews >= 2 && metrics.uniquePathCount >= 3;
    case "price_comparison":
      return !metrics.purchaseCompleted && metrics.searchCount >= 1 && metrics.filterCount >= 1 && (metrics.reviewViews >= 1 || metrics.revisitRate > 0.1);
    case "impulse_buyer":
      return metrics.checkoutEntered && metrics.purchaseCompleted && metrics.searchCount <= 1 && metrics.filterCount === 0 && metrics.eventCount <= 12;
    case "cart_abandoner":
      return metrics.addToCartCount >= 1 && metrics.checkoutEntered && !metrics.purchaseCompleted;
    default:
      return false;
  }
}

function canonicalSequence(events) {
  return events.map((event) => {
    const name = String(event.event_name || "");
    const pathName = String(event.path || "");
    return `${name}:${pathName}`;
  }).join("|");
}

function aggregateBy(label, sessions, eventMap) {
  const rows = [];
  for (const [key, items] of groupBy(sessions, (session) => session[label] || sourceFromSessionId(session.session_id)).entries()) {
    let constraintsOk = 0;
    let transitionOk = 0;
    const eventCounts = [];
    const uniquePaths = [];
    const revisitRates = [];
    let purchaseCount = 0;
    let checkoutCount = 0;
    let errorSessions = 0;
    for (const session of items) {
      const events = eventMap.get(session.session_id) || [];
      const metrics = deriveMetrics(events);
      const violations = transitionViolations(events);
      if (constraintSatisfied(session, metrics)) constraintsOk += 1;
      if (violations === 0) transitionOk += 1;
      if (metrics.purchaseCompleted) purchaseCount += 1;
      if (metrics.checkoutEntered) checkoutCount += 1;
      if (metrics.errorCount > 0) errorSessions += 1;
      eventCounts.push(metrics.eventCount);
      uniquePaths.push(metrics.uniquePathCount);
      revisitRates.push(metrics.revisitRate);
    }
    rows.push({
      key,
      sessions: items.length,
      constraint_satisfaction_rate: rate(constraintsOk, items.length),
      transition_validity_rate: rate(transitionOk, items.length),
      checkout_rate: rate(checkoutCount, items.length),
      purchase_rate: rate(purchaseCount, items.length),
      error_session_rate: rate(errorSessions, items.length),
      event_count_stats: stats(eventCounts),
      unique_path_stats: stats(uniquePaths),
      revisit_rate_stats: stats(revisitRates),
    });
  }
  rows.sort((left, right) => right.sessions - left.sessions || String(left.key).localeCompare(String(right.key)));
  return rows;
}

function topDuplicates(sessions, eventMap, limit = 10) {
  const bySeq = new Map();
  for (const session of sessions) {
    const events = eventMap.get(session.session_id) || [];
    const key = canonicalSequence(events);
    if (!bySeq.has(key)) bySeq.set(key, []);
    bySeq.get(key).push(session.session_id);
  }
  return Array.from(bySeq.entries())
    .filter(([, ids]) => ids.length > 1)
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, limit)
    .map(([sequence, sessionIds]) => ({
      duplicate_count: sessionIds.length,
      sample_session_ids: sessionIds.slice(0, 5),
      sequence,
    }));
}

function main() {
  const outputDir = path.resolve(arg("output-dir", DEFAULT_OUTPUT_DIR));
  const eventsPath = path.join(outputDir, "events.jsonl");
  const sessionsPath = path.join(outputDir, "sessions.json");
  const reportPath = path.join(outputDir, "quality-analysis.json");
  const sessionsPayload = readJson(sessionsPath);
  const sessions = Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [];
  const events = readJsonLines(eventsPath);
  const eventMap = groupEventsBySession(events);

  let transitionsOk = 0;
  let constraintsOk = 0;
  const eventCounts = [];
  const uniquePaths = [];
  const revisitRates = [];
  let purchaseCount = 0;
  let checkoutCount = 0;
  let hardCount = 0;
  let errorInjectedCount = 0;

  for (const session of sessions) {
    const sessionEvents = eventMap.get(session.session_id) || [];
    const metrics = deriveMetrics(sessionEvents);
    const violations = transitionViolations(sessionEvents);
    if (violations === 0) transitionsOk += 1;
    if (constraintSatisfied(session, metrics)) constraintsOk += 1;
    if (metrics.purchaseCompleted) purchaseCount += 1;
    if (metrics.checkoutEntered) checkoutCount += 1;
    if (session.difficulty === "hard") hardCount += 1;
    if (session.error_injected) errorInjectedCount += 1;
    eventCounts.push(metrics.eventCount);
    uniquePaths.push(metrics.uniquePathCount);
    revisitRates.push(metrics.revisitRate);
  }

  const duplicates = topDuplicates(sessions, eventMap);
  const exactDuplicateSessionCount = duplicates.reduce((sum, row) => sum + row.duplicate_count, 0);

  const report = {
    generated_at: new Date().toISOString(),
    input: {
      output_dir: outputDir,
      events_path: eventsPath,
      sessions_path: sessionsPath,
    },
    overall: {
      sessions: sessions.length,
      events: events.length,
      difficulty_hard_sessions: hardCount,
      error_injected_sessions: errorInjectedCount,
      checkout_rate: rate(checkoutCount, sessions.length),
      purchase_rate: rate(purchaseCount, sessions.length),
      transition_validity_rate: rate(transitionsOk, sessions.length),
      hard_constraint_satisfaction_rate: rate(constraintsOk, sessions.length),
      event_count_stats: stats(eventCounts),
      unique_path_stats: stats(uniquePaths),
      revisit_rate_stats: stats(revisitRates),
      exact_duplicate_group_count: duplicates.length,
      exact_duplicate_session_count: exactDuplicateSessionCount,
      exact_duplicate_session_rate: rate(exactDuplicateSessionCount, sessions.length),
    },
    by_persona: aggregateBy("persona_id", sessions, eventMap),
    by_source: aggregateBy("source", sessions.map((session) => ({ ...session, source: sourceFromSessionId(session.session_id) })), eventMap),
    by_difficulty: aggregateBy("difficulty", sessions, eventMap),
    duplicate_examples: duplicates,
  };

  writeJson(reportPath, report);
  console.log(`Quality analysis written to ${reportPath}`);
  console.log(JSON.stringify(report.overall, null, 2));
}

main();
