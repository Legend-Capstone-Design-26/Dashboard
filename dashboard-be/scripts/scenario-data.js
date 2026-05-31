const fs = require("fs");
const path = require("path");

const { computeLabeledSessionSummaries, buildInsightsInput } = require("../analytics/pipeline");
const { generateInsights } = require("../insights/generator");

const DATA_DIR = path.join(__dirname, "..", "data");
const DEFAULT_OUTPUT = path.join(DATA_DIR, "events.jsonl");
const DEFAULT_SITE_ID = "legend-ecommerce";
const BASE_URL = "http://127.0.0.1:8080";

const SCENARIO_DESCRIPTIONS = {
  "checkout-abandonment": "결제 진입과 결제 버튼 클릭은 많지만 checkout_complete 없이 이탈하는 상황",
  "price-sensitive": "가격, 쿠폰, 배송비를 반복 확인한 뒤 결제로 진입하지 않는 상황",
  "ux-friction": "동일 요소 rage click과 error 이벤트가 반복되는 마찰 상황",
  "over-explorer": "여러 화면을 오래 탐색하지만 CTA/결제 행동으로 수렴하지 않는 상황",
  "window-shopper": "랜딩/상품을 짧게 둘러보고 빠르게 이탈하는 상황",
  mixed: "여러 유형이 섞여 있지만 checkout 이탈과 UX 마찰이 우선순위가 되도록 구성한 상황",
};

function arg(name, fallback) {
  const longIdx = process.argv.indexOf(`--${name}`);
  if (longIdx >= 0 && process.argv[longIdx + 1]) return process.argv[longIdx + 1];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function intArg(name, fallback) {
  const value = Number(arg(name, fallback));
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;
}

function usage() {
  return [
    "Usage:",
    "  npm run scenario list",
    "  npm run scenario dry-run checkout-abandonment 3",
    "  npm run scenario apply checkout-abandonment 12",
    "  npm run scenario insights ux-friction 12 fallback",
    "",
    "Flag style is also supported when your shell/npm version passes flags through:",
    "  npm run scenario -- --list",
    "  npm run scenario -- --scenario checkout-abandonment --site legend-ecommerce",
    "  npm run scenario -- --scenario ux-friction --sessions 12 --insights --provider openai",
    "",
    "Options:",
    "  --scenario <name>   Scenario to apply",
    "  --site <site_id>    Site id to write into events (default: legend-ecommerce)",
    "  --sessions <n>      Number of sessions to generate (default: 12)",
    "  --output <path>     JSONL output path (default: data/events.jsonl)",
    "  --dry-run          Print summary without writing",
    "  --insights         Run generateInsights after writing",
    "  --provider <name>   insights provider for --insights (default: fallback)",
  ].join("\n");
}

function positionalOptions() {
  const args = process.argv.slice(2);
  const command = args[0] || "";
  if (command === "list" || command === "help") return { command };
  if (["apply", "dry-run", "insights"].includes(command)) {
    return {
      command,
      scenario: args[1],
      sessions: args[2],
      provider: command === "insights" ? args[3] : undefined,
      output: command !== "insights" ? args[3] : args[4],
    };
  }
  if (command && !command.startsWith("--")) {
    return {
      command: "apply",
      scenario: args[0],
      sessions: args[1],
      output: args[2],
    };
  }
  return { command: "" };
}

function event(base, eventName, pathName, offsetMs, props) {
  const url = `${BASE_URL}${pathName}`;
  return {
    event_name: eventName,
    schema_version: 1,
    app_id: "scenario-cli",
    site_id: base.siteId,
    ts: base.startTs + offsetMs,
    url,
    path: pathName,
    referrer: base.referrer || null,
    user_agent: "ScenarioCLI/1.0",
    lang: "ko-KR",
    screen: { w: 1440, h: 900 },
    viewport: { w: 1280, h: 800 },
    anon_user_id: base.anonUserId,
    session_id: base.sessionId,
    ui_variant: base.variant,
    experiments: [],
    experiment_goals: [],
    props: props || {},
    received_at: base.startTs + offsetMs + 20,
    request_id: `${base.sessionId}_${offsetMs}`,
  };
}

function pageView(base, pathName, offsetMs) {
  return event(base, "page_view", pathName, offsetMs, { title: `scenario ${pathName}`, reason: "scenario" });
}

function click(base, pathName, offsetMs, elementId) {
  return event(base, "click", pathName, offsetMs, { element_id: elementId });
}

function dwell(base, pathName, offsetMs, dwellMs) {
  return event(base, "dwell_time", pathName, offsetMs, { dwell_ms: dwellMs, reason: "scenario" });
}

function errorEvent(base, pathName, offsetMs, code, message) {
  return event(base, "error", pathName, offsetMs, { code, message });
}

function checkoutStart(base, offsetMs) {
  return event(base, "checkout_start", "/checkout", offsetMs, { source: "scenario" });
}

function paymentAttempt(base, offsetMs) {
  return event(base, "payment_attempt", "/checkout", offsetMs, { element_id: "pay_btn", result: "abandoned" });
}

function makeBase({ siteId, scenario, index, startTs }) {
  return {
    siteId,
    scenario,
    startTs,
    anonUserId: `scenario_${scenario}_u_${index}`,
    sessionId: `scenario_${scenario}_s_${index}`,
    variant: index % 2 === 0 ? "A" : "B",
  };
}

function checkoutAbandonment(base) {
  return [
    pageView(base, "/", 0),
    pageView(base, "/product/runner", 4_000),
    click(base, "/product/runner", 9_000, "add_to_cart_btn"),
    event(base, "add_to_cart", "/product/runner", 10_000, { element_id: "add_to_cart_btn" }),
    pageView(base, "/cart", 18_000),
    checkoutStart(base, 28_000),
    pageView(base, "/checkout", 30_000),
    click(base, "/checkout", 45_000, "pay_btn"),
    paymentAttempt(base, 47_000),
    dwell(base, "/checkout", 72_000, 42_000),
  ];
}

function priceSensitive(base) {
  return [
    pageView(base, "/", 0),
    pageView(base, "/product/jacket", 8_000),
    click(base, "/product/jacket", 15_000, "price_box"),
    click(base, "/product/jacket", 22_000, "coupon_toggle"),
    click(base, "/product/jacket", 30_000, "shipping_fee_info"),
    pageView(base, "/cart", 46_000),
    click(base, "/cart", 60_000, "discount_code_input"),
    dwell(base, "/cart", 82_000, 36_000),
  ];
}

function uxFriction(base) {
  return [
    pageView(base, "/", 0),
    pageView(base, "/product/bag", 6_000),
    click(base, "/product/bag", 12_000, "size_selector"),
    click(base, "/product/bag", 12_500, "size_selector"),
    click(base, "/product/bag", 13_000, "size_selector"),
    errorEvent(base, "/product/bag", 14_000, "SIZE_OPTION_TIMEOUT", "size option did not update"),
    click(base, "/product/bag", 20_000, "add_to_cart_btn"),
    errorEvent(base, "/product/bag", 21_000, "CART_ADD_FAILED", "cart add failed"),
    dwell(base, "/product/bag", 46_000, 40_000),
  ];
}

function overExplorer(base) {
  return [
    pageView(base, "/", 0),
    pageView(base, "/collection", 25_000),
    event(base, "filter_change", "/collection", 45_000, { filter: "price" }),
    pageView(base, "/product/shoes", 70_000),
    pageView(base, "/product/bag", 105_000),
    pageView(base, "/collection/sale", 145_000),
    dwell(base, "/collection/sale", 190_000, 185_000),
  ];
}

function windowShopper(base) {
  return [
    pageView(base, "/", 0),
    click(base, "/", 4_000, "hero_cta"),
    pageView(base, "/product/runner", 7_000),
    dwell(base, "/product/runner", 14_000, 7_000),
  ];
}

const BUILDERS = {
  "checkout-abandonment": checkoutAbandonment,
  "price-sensitive": priceSensitive,
  "ux-friction": uxFriction,
  "over-explorer": overExplorer,
  "window-shopper": windowShopper,
};

function scenarioForMixed(index) {
  if (index % 6 < 2) return "checkout-abandonment";
  if (index % 6 === 2) return "ux-friction";
  if (index % 6 === 3) return "price-sensitive";
  if (index % 6 === 4) return "over-explorer";
  return "window-shopper";
}

function buildEvents({ scenario, siteId, sessions }) {
  const now = Date.now();
  const firstStart = now - 2 * 24 * 60 * 60 * 1000;
  const events = [];
  for (let i = 0; i < sessions; i++) {
    const effectiveScenario = scenario === "mixed" ? scenarioForMixed(i) : scenario;
    const builder = BUILDERS[effectiveScenario];
    if (!builder) throw new Error(`unknown scenario: ${scenario}`);
    const base = makeBase({ siteId, scenario: effectiveScenario, index: i, startTs: firstStart + i * 10 * 60 * 1000 });
    events.push(...builder(base));
  }
  return events.sort((a, b) => a.ts - b.ts);
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

function summarizeEvents(events) {
  const byName = new Map();
  const sessions = new Set();
  for (const item of events) {
    byName.set(item.event_name, (byName.get(item.event_name) || 0) + 1);
    sessions.add(item.session_id);
  }
  return {
    events: events.length,
    sessions: sessions.size,
    event_names: Object.fromEntries(Array.from(byName.entries()).sort((a, b) => a[0].localeCompare(b[0]))),
  };
}

async function printInsights({ outputPath, siteId, provider }) {
  const labeled = await computeLabeledSessionSummaries(outputPath, {
    site_id: siteId,
    session_ttl_ms: 30 * 60 * 1000,
  });
  const input = buildInsightsInput(siteId, labeled, { perLabelRepresentatives: 3 });
  const result = await generateInsights(input, { provider });
  const insights = Array.isArray(result.output?.insights) ? result.output.insights : [];
  console.log(JSON.stringify({
    provider: result.provider,
    model: result.model,
    fallback_reason: result.fallbackReason || null,
    summary: result.output?.summary || null,
    labels: input.labels.map((label) => ({ label: label.label, sessions: label.sessions, share: label.share })),
    insights: insights.slice(0, 3).map((item) => ({
      title: item.title,
      label: item.label,
      priority: item.priority,
      where: item.where,
      primary_metric: item.impact?.primary_metric || item.recommended_experiments?.[0]?.primary_metric || null,
    })),
  }, null, 2));
}

async function main() {
  const positional = positionalOptions();
  if (hasFlag("help") || positional.command === "help") {
    console.log(usage());
    return;
  }
  if (hasFlag("list") || positional.command === "list") {
    for (const [name, description] of Object.entries(SCENARIO_DESCRIPTIONS)) {
      console.log(`${name}\t${description}`);
    }
    return;
  }

  const scenario = arg("scenario", positional.scenario || "");
  if (!scenario || !Object.prototype.hasOwnProperty.call(SCENARIO_DESCRIPTIONS, scenario)) {
    console.error(`unknown or missing scenario: ${scenario || "(empty)"}`);
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const siteId = arg("site", DEFAULT_SITE_ID);
  const positionalSessions = positional.sessions ? Number(positional.sessions) : 12;
  const sessions = intArg("sessions", Number.isFinite(positionalSessions) ? positionalSessions : 12);
  const outputPath = path.resolve(arg("output", positional.output || DEFAULT_OUTPUT));
  const provider = arg("provider", positional.provider || "fallback");
  const events = buildEvents({ scenario, siteId, sessions });
  const summary = summarizeEvents(events);
  const dryRun = hasFlag("dry-run") || positional.command === "dry-run";
  const shouldRunInsights = hasFlag("insights") || positional.command === "insights";

  if (!dryRun) {
    writeJsonl(outputPath, events);
  }

  console.log(JSON.stringify({
    ok: true,
    dry_run: dryRun,
    scenario,
    description: SCENARIO_DESCRIPTIONS[scenario],
    site_id: siteId,
    output: outputPath,
    replaced: !dryRun,
    summary,
  }, null, 2));

  if (shouldRunInsights) {
    await printInsights({ outputPath, siteId, provider });
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
