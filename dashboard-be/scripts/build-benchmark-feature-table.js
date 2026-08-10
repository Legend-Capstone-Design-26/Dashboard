const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT_DIR = path.join(__dirname, "..", "benchmark", "output", "merged-7500");

const FEATURE_GROUPS = {
  F0: [
    "session_duration_ms",
    "event_count",
    "page_view_count",
    "click_count",
    "depth",
    "unique_page_ratio",
    "revisit_rate",
    "backtrack_count",
    "loop_rate",
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
    "cart_add_count",
    "cart_remove_count",
    "checkout_entered",
    "payment_attempt_count",
    "purchase_completed",
    "error_count",
  ],
  F2: [
    "depth",
    "unique_page_ratio",
    "revisit_rate",
    "backtrack_count",
    "loop_rate",
  ],
  F3: [
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
  ],
  F4: [
    "cart_add_count",
    "cart_remove_count",
    "checkout_entered",
    "payment_attempt_count",
    "purchase_completed",
  ],
  F6: [
    "depth",
    "unique_page_ratio",
    "revisit_rate",
    "backtrack_count",
    "loop_rate",
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
  ],
  F7: [
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
    "cart_add_count",
    "cart_remove_count",
    "checkout_entered",
    "payment_attempt_count",
    "purchase_completed",
  ],
  F11: [
    "depth",
    "unique_page_ratio",
    "revisit_rate",
    "backtrack_count",
    "loop_rate",
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
    "cart_add_count",
    "cart_remove_count",
    "checkout_entered",
    "payment_attempt_count",
    "purchase_completed",
  ],
  F13: [
    "session_duration_ms",
    "event_count",
    "page_view_count",
    "click_count",
    "depth",
    "unique_page_ratio",
    "revisit_rate",
    "backtrack_count",
    "loop_rate",
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
    "error_count",
  ],
  F15: [
    "session_duration_ms",
    "event_count",
    "page_view_count",
    "click_count",
    "search_count",
    "filter_count",
    "product_detail_count",
    "review_view_count",
    "cart_add_count",
    "cart_remove_count",
    "checkout_entered",
    "payment_attempt_count",
    "purchase_completed",
    "error_count",
  ],
};

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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function groupEventsBySession(events) {
  const map = new Map();
  for (const event of events) {
    const sessionId = String(event.session_id || "").trim();
    if (!sessionId) continue;
    if (!map.has(sessionId)) map.set(sessionId, []);
    map.get(sessionId).push(event);
  }
  for (const list of map.values()) {
    list.sort((left, right) => Number(left.ts || 0) - Number(right.ts || 0));
  }
  return map;
}

function buildFeatureRow(session, events) {
  const safeEvents = Array.isArray(events) ? events : [];
  const startTs = Number(safeEvents[0]?.ts || 0);
  const endTs = Number(safeEvents[safeEvents.length - 1]?.ts || startTs);
  const sessionDurationMs = Math.max(0, endTs - startTs);

  let pageViewCount = 0;
  let clickCount = 0;
  let backtrackCount = 0;
  let searchCount = 0;
  let filterCount = 0;
  let productDetailCount = 0;
  let reviewViewCount = 0;
  let cartAddCount = 0;
  let cartRemoveCount = 0;
  let checkoutEntered = 0;
  let paymentAttemptCount = 0;
  let purchaseCompleted = 0;
  let errorCount = 0;
  const pathSequence = [];
  const visitedCounts = new Map();

  for (const event of safeEvents) {
    const eventName = String(event.event_name || "");
    const pathName = String(event.path || "").trim();
    if (eventName === "page_view") pageViewCount += 1;
    if (eventName === "click") clickCount += 1;
    if (eventName === "search") searchCount += 1;
    if (eventName === "filter_change") filterCount += 1;
    if (eventName === "add_to_cart") cartAddCount += 1;
    if (eventName === "remove_from_cart") cartRemoveCount += 1;
    if (eventName === "payment_attempt") paymentAttemptCount += 1;
    if (eventName === "error") errorCount += 1;
    if (eventName === "checkout_start" || pathName.startsWith("/checkout")) checkoutEntered = 1;
    if (eventName === "checkout_complete" || pathName.startsWith("/order-complete")) purchaseCompleted = 1;
    if (pathName.startsWith("/product")) productDetailCount += 1;
    if (pathName.startsWith("/review")) reviewViewCount += 1;
    if (pathName) {
      pathSequence.push(pathName);
      visitedCounts.set(pathName, (visitedCounts.get(pathName) || 0) + 1);
    }
  }

  for (let index = 2; index < pathSequence.length; index += 1) {
    const current = pathSequence[index];
    const previous = pathSequence[index - 1];
    const beforePrevious = pathSequence[index - 2];
    if (current === beforePrevious && current !== previous) backtrackCount += 1;
  }

  const eventCount = safeEvents.length;
  const uniquePathCount = visitedCounts.size;
  const depth = uniquePathCount;
  const revisitEvents = Array.from(visitedCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const revisitRate = pathSequence.length > 0 ? revisitEvents / pathSequence.length : 0;
  const uniquePageRatio = pathSequence.length > 0 ? uniquePathCount / pathSequence.length : 0;
  const loopRate = pathSequence.length > 2 ? backtrackCount / (pathSequence.length - 2) : 0;

  return {
    session_id: session.session_id,
    source: String(session.session_id || "").split("__")[0] || "unknown_source",
    persona_id: session.persona_id,
    ground_truth_label: session.ground_truth_label,
    difficulty: session.difficulty,
    split: session.split,
    session_duration_ms: sessionDurationMs,
    event_count: eventCount,
    page_view_count: pageViewCount,
    click_count: clickCount,
    depth,
    unique_page_ratio: Number(uniquePageRatio.toFixed(6)),
    revisit_rate: Number(revisitRate.toFixed(6)),
    backtrack_count: backtrackCount,
    loop_rate: Number(loopRate.toFixed(6)),
    search_count: searchCount,
    filter_count: filterCount,
    product_detail_count: productDetailCount,
    review_view_count: reviewViewCount,
    cart_add_count: cartAddCount,
    cart_remove_count: cartRemoveCount,
    checkout_entered: checkoutEntered,
    payment_attempt_count: paymentAttemptCount,
    purchase_completed: purchaseCompleted,
    error_count: errorCount,
  };
}

function stratifiedSplit(rows, ratio, seed) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.persona_id}::${row.difficulty}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const out = { train: [], val: [], test: [] };
  for (const list of groups.values()) {
    const sorted = list.slice().sort((left, right) => String(left.session_id).localeCompare(String(right.session_id)));
    const rotated = sorted.slice(seed % Math.max(1, sorted.length)).concat(sorted.slice(0, seed % Math.max(1, sorted.length)));
    const total = rotated.length;
    const trainCount = Math.floor(total * ratio.train);
    const valCount = Math.floor(total * ratio.val);
    const testCount = total - trainCount - valCount;
    out.train.push(...rotated.slice(0, trainCount));
    out.val.push(...rotated.slice(trainCount, trainCount + valCount));
    out.test.push(...rotated.slice(trainCount + valCount, trainCount + valCount + testCount));
  }
  return out;
}

function pickColumns(row, featureId) {
  const columns = FEATURE_GROUPS[featureId];
  const base = {
    session_id: row.session_id,
    source: row.source,
    persona_id: row.persona_id,
    ground_truth_label: row.ground_truth_label,
    difficulty: row.difficulty,
    split: row.split,
  };
  for (const column of columns) base[column] = row[column];
  return base;
}

function summarizeSplit(splitRows) {
  const by = { train: splitRows.train.length, val: splitRows.val.length, test: splitRows.test.length };
  return {
    counts: by,
    total: by.train + by.val + by.test,
  };
}

function main() {
  const inputDir = path.resolve(arg("input-dir", DEFAULT_INPUT_DIR));
  const outputDir = path.resolve(arg("output-dir", path.join(inputDir, "feature-study")));
  const seed = Number(arg("split-seed", "1"));
  ensureDir(outputDir);

  const events = readJsonLines(path.join(inputDir, "events.jsonl"));
  const sessionsPayload = readJson(path.join(inputDir, "sessions.json"));
  const sessions = Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [];
  const eventMap = groupEventsBySession(events);
  const featureRows = sessions.map((session) => buildFeatureRow(session, eventMap.get(session.session_id) || []));
  featureRows.sort((left, right) => String(left.session_id).localeCompare(String(right.session_id)));

  const splitRows = stratifiedSplit(featureRows, { train: 0.7, val: 0.15, test: 0.15 }, seed);
  const splitBySessionId = new Map();
  splitRows.train.forEach((row) => splitBySessionId.set(row.session_id, "train"));
  splitRows.val.forEach((row) => splitBySessionId.set(row.session_id, "val"));
  splitRows.test.forEach((row) => splitBySessionId.set(row.session_id, "test"));

  const enrichedRows = featureRows.map((row) => ({ ...row, data_split: splitBySessionId.get(row.session_id) || "unknown" }));

  writeJson(path.join(outputDir, "session-features-all.json"), {
    benchmark_id: sessionsPayload.benchmark_id || null,
    feature_order: FEATURE_GROUPS.F0,
    rows: enrichedRows,
  });

  for (const featureId of Object.keys(FEATURE_GROUPS)) {
    writeJson(path.join(outputDir, `${featureId.toLowerCase()}-features.json`), {
      benchmark_id: sessionsPayload.benchmark_id || null,
      feature_subset: featureId,
      feature_order: FEATURE_GROUPS[featureId],
      rows: enrichedRows.map((row) => pickColumns(row, featureId)).map((row) => ({
        ...row,
        data_split: splitBySessionId.get(row.session_id) || "unknown",
      })),
    });
  }

  writeJson(path.join(outputDir, "split-summary.json"), {
    benchmark_id: sessionsPayload.benchmark_id || null,
    split_seed: seed,
    feature_subsets: Object.keys(FEATURE_GROUPS),
    summary: summarizeSplit(splitRows),
  });

  console.log(`Built feature tables for ${featureRows.length} sessions`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Train=${splitRows.train.length}, Val=${splitRows.val.length}, Test=${splitRows.test.length}`);
}

main();
