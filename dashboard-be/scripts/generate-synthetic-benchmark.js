const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { loadEnvFromFile, getLlmConfig } = require("../services/llm/config");
const { callOpenAIChat } = require("../insights/openaiProvider");

const DEFAULT_MANIFEST = path.join(__dirname, "..", "benchmark", "manifests", "balanced-7500.template.json");
const PERSONA_CARDS_PATH = path.join(__dirname, "..", "benchmark", "persona-cards.json");
const FEW_SHOT_EXAMPLES_PATH = path.join(__dirname, "..", "benchmark", "few-shot-examples.json");
const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const DEFAULT_BATCH_SIZE = 5;
const MAX_RETRIES = 2;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function intArg(name, fallback) {
  const value = Number(arg(name, fallback));
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;
}

function nonNegativeIntArg(name, fallback) {
  const value = Number(arg(name, fallback));
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function boolArg(name, fallback = false) {
  const exact = process.argv.includes(`--${name}`);
  const negated = process.argv.includes(`--no-${name}`);
  if (negated) return false;
  if (exact) return true;
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return readJson(filePath);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function resolveWorkspacePath(relativePath) {
  return path.resolve(path.join(__dirname, "..", ".."), relativePath);
}

function hashNumber(text) {
  const hash = crypto.createHash("sha256").update(String(text)).digest("hex");
  return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

function createRng(seed) {
  let cursor = 0;
  return () => {
    cursor += 1;
    return hashNumber(`${seed}:${cursor}`);
  };
}

function pick(list, rng) {
  const values = Array.isArray(list) ? list : [];
  if (values.length === 0) return null;
  const index = Math.floor(rng() * values.length) % values.length;
  return values[index];
}

function chance(rng, probability) {
  return rng() < probability;
}

function shuffle(values, rng) {
  const list = values.slice();
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = list[i];
    list[i] = list[j];
    list[j] = temp;
  }
  return list;
}

function screenForDevice(device) {
  if (device === "mobile") {
    return {
      screen: { w: 390, h: 844 },
      viewport: { w: 390, h: 740 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    };
  }
  return {
    screen: { w: 1920, h: 1080 },
    viewport: { w: 1440, h: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
  };
}

function pageTitleFromPath(pathName) {
  if (pathName === "/") return "Home";
  if (pathName.startsWith("/search")) return "Search";
  if (pathName.startsWith("/category")) return "Category";
  if (pathName.startsWith("/product")) return "Product";
  if (pathName.startsWith("/review")) return "Review";
  if (pathName.startsWith("/cart")) return "Cart";
  if (pathName.startsWith("/checkout")) return "Checkout";
  if (pathName.startsWith("/order-complete")) return "Complete";
  return "Page";
}

function normalizePath(rawPath, category, productId) {
  const text = String(rawPath || "").trim();
  if (!text) return "/";
  if (text.startsWith("/")) return text;
  const normalized = text.toLowerCase();
  if (normalized === "home") return "/";
  if (normalized === "search" || normalized === "search_result") return "/search";
  if (normalized === "category") return `/category/${category}`;
  if (normalized === "product_detail" || normalized === "product") return `/product/${productId}`;
  if (normalized === "review") return `/review/${productId}`;
  if (normalized === "cart") return "/cart";
  if (normalized === "checkout") return "/checkout";
  if (normalized === "complete" || normalized === "order_complete") return "/order-complete";
  return text.startsWith("/") ? text : `/${text}`;
}

function allowedEventNames() {
  return [
    "page_view",
    "click",
    "dwell_time",
    "error",
    "add_to_cart",
    "remove_from_cart",
    "search",
    "filter_change",
    "checkout_start",
    "payment_attempt",
    "checkout_complete",
  ];
}

function deriveDifficulty(split, rng) {
  if (split === "hard") return "hard";
  if (split === "stress") return chance(rng, 0.5) ? "hard" : "medium";
  if (split === "eval") return chance(rng, 0.5) ? "medium" : "easy";
  return chance(rng, 0.2) ? "medium" : "easy";
}

function createSplitAssignments(splitCounts) {
  const assignments = [];
  for (const [split, count] of Object.entries(splitCounts || {})) {
    for (let index = 0; index < count; index += 1) assignments.push(split);
  }
  return assignments;
}

function buildSessionSpecs(manifest, personaCardsById) {
  const specs = [];
  const siteId = manifest.site?.site_id || "legend-ecommerce";
  const benchmarkSeed = `${manifest.benchmark_id}:${manifest.generator?.generator_version || "v1"}:${manifest.generator?.prompt_version || "v1"}`;
  let globalIndex = 0;

  for (const personaConfig of manifest.personas || []) {
    const card = personaCardsById.get(personaConfig.persona_id);
    if (!card) throw new Error(`Missing persona card for ${personaConfig.persona_id}`);
    const splitAssignments = createSplitAssignments(personaConfig.split_counts);
    if (splitAssignments.length !== personaConfig.session_count) {
      throw new Error(`Split counts do not match session_count for ${personaConfig.persona_id}`);
    }

    splitAssignments.forEach((split, personaIndex) => {
      globalIndex += 1;
      const seed = Math.floor(hashNumber(`${benchmarkSeed}:${personaConfig.persona_id}:${personaIndex + 1}`) * 1_000_000_000);
      const rng = createRng(seed);
      const contextVars = manifest.context_variables || {};
      const device = pick(contextVars.device || ["desktop"], rng) || "desktop";
      const trafficSource = pick(contextVars.traffic_source || ["direct"], rng) || "direct";
      const category = pick(contextVars.category || ["general"], rng) || "general";
      const promotionExposed = Boolean(pick(contextVars.promotion_exposed || [false], rng));
      const newUser = Boolean(pick(contextVars.new_user || [true], rng));
      const loggedIn = Boolean(pick(contextVars.logged_in || [false], rng));
      const errorInjected = split === "stress"
        ? true
        : split === "hard"
          ? (chance(rng, 0.6) || Boolean(pick(contextVars.error_injected || [false], rng)))
          : Boolean(pick(contextVars.error_injected || [false], rng));
      const sessionId = `bench_${personaConfig.persona_id}_${String(personaIndex + 1).padStart(4, "0")}`;
      const anonUserId = `bench_user_${String(globalIndex).padStart(6, "0")}`;
      const difficulty = deriveDifficulty(split, rng);
      specs.push({
        session_id: sessionId,
        anon_user_id: anonUserId,
        site_id: siteId,
        persona_id: personaConfig.persona_id,
        ground_truth_label: personaConfig.ground_truth_label,
        split,
        difficulty,
        category,
        device,
        traffic_source: trafficSource,
        promotion_exposed: promotionExposed,
        new_user: newUser,
        logged_in: loggedIn,
        error_injected: errorInjected,
        seed,
        card,
      });
    });
  }
  return specs;
}

function buildBatchPrompt(batch, baseUrl) {
  const fewShotExamples = (readJson(FEW_SHOT_EXAMPLES_PATH).examples || []).slice(0, 2);
  const allowedEvents = allowedEventNames();
  const sanitizedBatch = batch.map((item) => ({
    session_id: item.session_id,
    persona_id: item.persona_id,
    ground_truth_label: item.ground_truth_label,
    split: item.split,
    difficulty: item.difficulty,
    device: item.device,
    traffic_source: item.traffic_source,
    category: item.category,
    promotion_exposed: item.promotion_exposed,
    new_user: item.new_user,
    logged_in: item.logged_in,
    error_injected: item.error_injected,
    seed: item.seed,
    persona_card: item.card,
  }));

  return {
    system: [
      "You generate synthetic ecommerce behavior sessions for clustering benchmark research.",
      "You must generate raw event sequences, not final feature vectors.",
      "Return valid JSON only.",
      "Self-validate before answering:",
      "1. timestamps must be strictly increasing within each session via positive after_ms values",
      "2. only allowed event types may be used",
      "3. do not leak persona id or label into event props",
      "4. cart and checkout transitions must be logically possible",
      "5. make sessions varied and non-template-like while still matching the persona card",
    ].join("\n"),
    user: [
      "Generate synthetic ecommerce sessions as JSON.",
      `Base URL: ${baseUrl}`,
      `Allowed event types: ${allowedEvents.join(", ")}`,
      "Allowed logical pages: /, /search, /category/{category}, /product/{product_id}, /review/{product_id}, /cart, /checkout, /order-complete",
      "Use realistic event sequences with event-specific props.",
      "Output schema:",
      JSON.stringify({
        sessions: [
          {
            session_id: "...",
            scenario_id: "short_machine_readable_name",
            expected_behavior_summary: "one sentence",
            outcome: {
              checkout_entered: true,
              purchase_completed: false,
            },
            events: [
              {
                event_name: "page_view",
                path: "/",
                after_ms: 0,
                props: { title: "Home", reason: "load" },
              },
            ],
          },
        ],
      }, null, 2),
      "Few-shot examples:",
      JSON.stringify(fewShotExamples, null, 2),
      "Session generation requests:",
      JSON.stringify(sanitizedBatch, null, 2),
      "Rules:",
      "- page_view should usually include a title",
      "- dwell_time should include dwell_ms and reason",
      "- click should include element_id and can include text",
      "- search should usually include query",
      "- filter_change should include filter",
      "- add_to_cart/remove_from_cart should include product_id",
      "- payment_attempt should never appear before checkout_start or /checkout",
      "- checkout_complete should only appear when purchase_completed is true",
      "- if purchase_completed is false, do not emit checkout_complete",
      "- price_comparison should usually include repeated search/filter/review/revisit behavior",
      "- impulse_buyer should usually avoid repeated search/filter behavior",
      "- explorer should avoid purchase completion",
      "- cart_abandoner should reach cart and usually checkout, but exit before purchase completion",
      "- goal_oriented_buyer should be efficient and conversion-oriented",
    ].join("\n\n"),
  };
}

function buildCallLlm() {
  loadEnvFromFile();
  const cfg = getLlmConfig();
  const apiKey = String(process.env.UX_INSIGHTS_API_KEY || cfg.openaiApiKey || "").trim();
  const model = String(process.env.UX_INSIGHTS_MODEL || cfg.openaiModel || "gpt-4.1-mini").trim();
  if (!apiKey) {
    throw new Error("Missing LLM API key. Set UX_INSIGHTS_API_KEY or OPENAI_API_KEY in Dashboard/.env.");
  }
  return async (prompt) => callOpenAIChat(prompt, { apiKey, model });
}

function createCollectorEvents(spec, generatedSession, manifest, baseUrl) {
  const deviceShape = screenForDevice(spec.device);
  const events = [];
  let currentTs = 1_720_000_000_000 + (spec.seed % 10_000_000) + (events.length * 10_000);
  let lastPath = null;
  let requestCounter = 0;
  const category = spec.category;
  const fallbackProductId = `prd-${String(spec.seed).slice(-6)}`;

  for (const item of Array.isArray(generatedSession.events) ? generatedSession.events : []) {
    const eventName = String(item.event_name || item.type || "").trim();
    if (!allowedEventNames().includes(eventName)) continue;
    const props = item.props && typeof item.props === "object" ? { ...item.props } : {};
    const productId = String(props.product_id || fallbackProductId).trim() || fallbackProductId;
    const pathName = normalizePath(item.path, category, productId);
    const afterMsRaw = Number(item.after_ms);
    const stepMs = Number.isFinite(afterMsRaw) ? Math.max(events.length === 0 ? 0 : 1, Math.trunc(afterMsRaw)) : 1000;
    currentTs += stepMs;
    requestCounter += 1;
    if (eventName === "page_view" && !props.title) props.title = pageTitleFromPath(pathName);
    if (eventName === "dwell_time") {
      if (!Number.isFinite(Number(props.dwell_ms))) props.dwell_ms = Math.max(1000, stepMs);
      if (!props.reason) props.reason = "pagehide";
      if (!props.title) props.title = pageTitleFromPath(pathName);
    }
    if ((eventName === "add_to_cart" || eventName === "remove_from_cart") && !props.product_id) props.product_id = productId;
    if (eventName === "click" && !props.element_id) props.element_id = "generic_click_target";
    if (eventName === "search" && !props.query) props.query = `${category} search`;
    if (eventName === "filter_change" && !props.filter) props.filter = "price_low_to_high";

    events.push({
      schema_version: 1,
      app_id: "benchmark-generator",
      site_id: manifest.site?.site_id || spec.site_id,
      anon_user_id: spec.anon_user_id,
      session_id: spec.session_id,
      ts: currentTs,
      event_name: eventName,
      url: `${baseUrl}${pathName}`,
      path: pathName,
      referrer: lastPath ? `${baseUrl}${lastPath}` : (spec.traffic_source === "direct" ? null : `source://${spec.traffic_source}`),
      user_agent: deviceShape.userAgent,
      lang: "ko-KR",
      screen: deviceShape.screen,
      viewport: deviceShape.viewport,
      ui_variant: null,
      experiments: [],
      props,
      received_at: currentTs + 20,
      request_id: `${spec.session_id}_${requestCounter}`,
      device: spec.device,
      traffic_source: spec.traffic_source,
      source_type: manifest.site?.source_type || "synthetic",
      generator_version: manifest.generator?.generator_version || "v1",
    });
    lastPath = pathName;
  }
  return events;
}

function summarizeOutcomes(events) {
  let checkoutEntered = false;
  let purchaseCompleted = false;
  for (const event of events) {
    const eventName = String(event.event_name || "");
    const pathName = String(event.path || "");
    if (eventName === "checkout_start" || pathName.startsWith("/checkout")) checkoutEntered = true;
    if (eventName === "checkout_complete" || pathName.startsWith("/order-complete")) purchaseCompleted = true;
  }
  return { checkoutEntered, purchaseCompleted };
}

function validateGeneratedBatch(batch, llmJson) {
  const sessions = Array.isArray(llmJson?.sessions) ? llmJson.sessions : [];
  const byId = new Map(sessions.map((session) => [String(session.session_id || ""), session]));
  const failedSessionIds = [];
  for (const spec of batch) {
    const session = byId.get(spec.session_id);
    if (!session) {
      failedSessionIds.push(spec.session_id);
      continue;
    }
    if (!Array.isArray(session.events) || session.events.length === 0) {
      failedSessionIds.push(spec.session_id);
      continue;
    }
    let last = -1;
    for (const event of session.events) {
      const name = String(event.event_name || event.type || "").trim();
      if (!allowedEventNames().includes(name)) {
        failedSessionIds.push(spec.session_id);
        break;
      }
      const afterMs = Number(event.after_ms);
      if (!Number.isFinite(afterMs) || afterMs < 0) {
        failedSessionIds.push(spec.session_id);
        break;
      }
      if (last >= 0 && afterMs <= 0) {
        failedSessionIds.push(spec.session_id);
        break;
      }
      last = afterMs;
    }
  }
  const uniqueFailedSessionIds = Array.from(new Set(failedSessionIds));
  if (uniqueFailedSessionIds.length > 0) {
    return {
      ok: false,
      reason: `failed sessions: ${uniqueFailedSessionIds.join(", ")}`,
      failedSessionIds: uniqueFailedSessionIds,
      sessions,
    };
  }
  return { ok: true, sessions, failedSessionIds: [] };
}

function buildRepairPrompt(batch, baseUrl, previousSessions, failedSessionIds, reason) {
  return {
    system: [
      "You repair invalid synthetic ecommerce sessions.",
      "Return valid JSON only.",
      "Only regenerate the failed sessions.",
    ].join("\n"),
    user: [
      `Base URL: ${baseUrl}`,
      `Allowed event types: ${allowedEventNames().join(", ")}`,
      `Validation failure: ${reason}`,
      "Only regenerate these session ids:",
      JSON.stringify(failedSessionIds, null, 2),
      "Original session requests:",
      JSON.stringify(batch.map((item) => ({
        session_id: item.session_id,
        persona_id: item.persona_id,
        ground_truth_label: item.ground_truth_label,
        split: item.split,
        difficulty: item.difficulty,
        device: item.device,
        traffic_source: item.traffic_source,
        category: item.category,
        promotion_exposed: item.promotion_exposed,
        new_user: item.new_user,
        logged_in: item.logged_in,
        error_injected: item.error_injected,
        seed: item.seed,
        persona_card: item.card,
      })), null, 2),
      "Previous invalid output for reference:",
      JSON.stringify(previousSessions, null, 2),
      "Return schema:",
      JSON.stringify({ sessions: [{ session_id: "...", scenario_id: "...", expected_behavior_summary: "...", outcome: { checkout_entered: true, purchase_completed: false }, events: [] }] }, null, 2),
    ].join("\n\n"),
  };
}

function mergeRepairedSessions(previousSessions, repairedSessions) {
  const map = new Map((Array.isArray(previousSessions) ? previousSessions : []).map((session) => [session.session_id, session]));
  for (const session of Array.isArray(repairedSessions) ? repairedSessions : []) map.set(session.session_id, session);
  return Array.from(map.values());
}

async function generateBatchWithRetries(batch, callLlm, baseUrl) {
  let lastError = null;
  let lastSessions = [];
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const prompt = attempt === 0
        ? buildBatchPrompt(batch, baseUrl)
        : buildRepairPrompt(batch, baseUrl, lastSessions, lastError?.failedSessionIds || batch.map((item) => item.session_id), lastError?.reason || "repair requested");
      const result = await callLlm(prompt);
      const parsed = JSON.parse(result.content);
      const candidate = attempt === 0
        ? parsed
        : { sessions: mergeRepairedSessions(lastSessions, parsed.sessions) };
      const validation = validateGeneratedBatch(batch, candidate);
      if (validation.ok) return validation.sessions;
      lastSessions = validation.sessions || [];
      const next = new Error(validation.reason);
      next.failedSessionIds = validation.failedSessionIds || [];
      lastError = next;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("LLM batch generation failed");
}

async function generateBatchAdaptive(batch, callLlm, baseUrl) {
  try {
    return await generateBatchWithRetries(batch, callLlm, baseUrl);
  } catch (error) {
    if (batch.length <= 1) throw error;
    const midpoint = Math.ceil(batch.length / 2);
    const left = await generateBatchAdaptive(batch.slice(0, midpoint), callLlm, baseUrl);
    const right = await generateBatchAdaptive(batch.slice(midpoint), callLlm, baseUrl);
    return left.concat(right);
  }
}

function createBatches(specs, batchSize) {
  const out = [];
  for (let index = 0; index < specs.length; index += batchSize) out.push(specs.slice(index, index + batchSize));
  return out;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function shardConfig() {
  const shardCount = intArg("shard-count", 1);
  const shardIndex = nonNegativeIntArg("shard-index", 0);
  if (shardIndex >= shardCount) {
    throw new Error(`Invalid shard index ${shardIndex}. It must be between 0 and ${shardCount - 1}.`);
  }
  return { shardCount, shardIndex };
}

function createOutputPaths(manifest) {
  const outputs = manifest.outputs || {};
  const { shardCount, shardIndex } = shardConfig();
  const shardSuffix = shardCount > 1 ? `shards\${shardCount}-way\shard-${shardIndex + 1}` : "";
  const eventsBase = outputs.events_jsonl || "dashboard-be/benchmark/output/events.jsonl";
  const sessionsBase = outputs.sessions_json || "dashboard-be/benchmark/output/sessions.json";
  const manifestBase = outputs.manifest_json || "dashboard-be/benchmark/output/manifest.json";
  const eventsPath = resolveWorkspacePath(shardSuffix ? path.join(path.dirname(eventsBase), shardSuffix, path.basename(eventsBase)) : eventsBase);
  const sessionsPath = resolveWorkspacePath(shardSuffix ? path.join(path.dirname(sessionsBase), shardSuffix, path.basename(sessionsBase)) : sessionsBase);
  const manifestOutPath = resolveWorkspacePath(shardSuffix ? path.join(path.dirname(manifestBase), shardSuffix, path.basename(manifestBase)) : manifestBase);
  const outputDir = path.dirname(eventsPath);
  return {
    eventsPath,
    sessionsPath,
    manifestOutPath,
    progressPath: path.join(outputDir, "generation-progress.json"),
    sessionsJsonlPath: path.join(outputDir, "sessions.partial.jsonl"),
  };
}

function resetOutputFiles(paths) {
  [paths.eventsPath, paths.sessionsPath, paths.manifestOutPath, paths.progressPath, paths.sessionsJsonlPath].forEach((filePath) => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
}

function loadProgress(paths, benchmarkId) {
  return readJsonIfExists(paths.progressPath, {
    benchmark_id: benchmarkId,
    completed_batches: 0,
    completed_sessions: 0,
    completed_events: 0,
    total_batches: 0,
    total_sessions: 0,
  });
}

function appendBatchOutputs(paths, batchSessions, batchEvents) {
  if (batchEvents.length > 0) fs.appendFileSync(paths.eventsPath, `${batchEvents.join("\n")}\n`, "utf8");
  if (batchSessions.length > 0) {
    const lines = batchSessions.map((session) => JSON.stringify(session)).join("\n");
    fs.appendFileSync(paths.sessionsJsonlPath, `${lines}\n`, "utf8");
  }
}

function readSessionsJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function materializeSessionsJson(paths, benchmarkId) {
  const sessions = readSessionsJsonl(paths.sessionsJsonlPath);
  writeJson(paths.sessionsPath, { benchmark_id: benchmarkId, sessions });
  return sessions;
}

function buildOutputManifest(manifest, batchSize, sessionsCount, eventCount, requestedSessions) {
  return {
    benchmark_id: manifest.benchmark_id,
    description: manifest.description,
    generated_at: new Date().toISOString(),
    site: manifest.site,
    dataset_shape: {
      ...manifest.dataset_shape,
      requested_sessions: requestedSessions,
      generated_sessions: sessionsCount,
    },
    generator: {
      ...manifest.generator,
      actual_mode: "llm_direct_generation",
      model: String(process.env.UX_INSIGHTS_MODEL || getLlmConfig().openaiModel || "gpt-4.1-mini"),
      batch_size: batchSize,
    },
    outputs: manifest.outputs,
    counts: {
      sessions: sessionsCount,
      events: eventCount,
    },
    personas: manifest.personas,
    validation_targets: manifest.validation_targets,
  };
}

async function generateBenchmark(manifest, paths) {
  const personaCards = readJson(PERSONA_CARDS_PATH).personas || [];
  const personaCardsById = new Map(personaCards.map((card) => [card.persona_id, card]));
  const specs = buildSessionSpecs(manifest, personaCardsById);
  const maxSessions = Number(arg("max-sessions", "0"));
  const { shardCount, shardIndex } = shardConfig();
  const shardedSpecs = shardCount > 1 ? specs.filter((_, index) => index % shardCount === shardIndex) : specs;
  const limitedSpecs = maxSessions > 0 ? shardedSpecs.slice(0, maxSessions) : shardedSpecs;
  const batchSize = intArg("batch-size", DEFAULT_BATCH_SIZE);
  const baseUrl = arg("base-url", DEFAULT_BASE_URL).replace(/\/$/, "");
  const callLlm = buildCallLlm();
  const batches = createBatches(limitedSpecs, batchSize);
  const resume = boolArg("resume", true);

  if (!resume) resetOutputFiles(paths);
  ensureDir(path.dirname(paths.eventsPath));
  ensureDir(path.dirname(paths.sessionsPath));
  ensureDir(path.dirname(paths.manifestOutPath));

  const progress = resume ? loadProgress(paths, manifest.benchmark_id) : loadProgress(paths, manifest.benchmark_id);
  const startBatchIndex = resume ? Math.max(0, Number(progress.completed_batches) || 0) : 0;
  let completedSessions = resume ? Math.max(0, Number(progress.completed_sessions) || 0) : 0;
  let completedEvents = resume ? Math.max(0, Number(progress.completed_events) || 0) : 0;

  for (let batchIndex = startBatchIndex; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const generatedSessions = await generateBatchAdaptive(batch, callLlm, baseUrl);
    const byId = new Map(generatedSessions.map((item) => [item.session_id, item]));
    const batchSessionRows = [];
    const batchEventLines = [];
    for (const spec of batch) {
      const generated = byId.get(spec.session_id);
      const collectorEvents = createCollectorEvents(spec, generated, manifest, baseUrl);
      const outcomes = summarizeOutcomes(collectorEvents);
      collectorEvents.forEach((event) => batchEventLines.push(JSON.stringify(event)));
      batchSessionRows.push({
        session_id: spec.session_id,
        anon_user_id: spec.anon_user_id,
        site_id: spec.site_id,
        persona_id: spec.persona_id,
        ground_truth_label: spec.ground_truth_label,
        split: spec.split,
        difficulty: spec.difficulty,
        scenario_id: String(generated.scenario_id || `${spec.persona_id}_${spec.difficulty}`).trim(),
        device: spec.device,
        traffic_source: spec.traffic_source,
        category: spec.category,
        promotion_exposed: spec.promotion_exposed,
        new_user: spec.new_user,
        logged_in: spec.logged_in,
        error_injected: spec.error_injected,
        checkout_entered: outcomes.checkoutEntered,
        purchase_completed: outcomes.purchaseCompleted,
        event_count: collectorEvents.length,
        expected_behavior_summary: String(generated.expected_behavior_summary || spec.card.goal || "").trim(),
        generator_model: String(process.env.UX_INSIGHTS_MODEL || getLlmConfig().openaiModel || "gpt-4.1-mini"),
        prompt_version: manifest.generator?.prompt_version || "v1",
        generator_version: manifest.generator?.generator_version || "v1",
        seed: spec.seed,
      });
    }
    appendBatchOutputs(paths, batchSessionRows, batchEventLines);
    completedSessions += batchSessionRows.length;
    completedEvents += batchEventLines.length;
    writeJson(paths.progressPath, {
      benchmark_id: manifest.benchmark_id,
      completed_batches: batchIndex + 1,
      completed_sessions: completedSessions,
      completed_events: completedEvents,
      total_batches: batches.length,
      total_sessions: limitedSpecs.length,
      updated_at: new Date().toISOString(),
    });
    console.log(`Generated batch ${batchIndex + 1}/${batches.length} (${completedSessions}/${limitedSpecs.length} sessions)`);
  }

  const sessions = materializeSessionsJson(paths, manifest.benchmark_id);
  const outputManifest = {
    ...buildOutputManifest(manifest, batchSize, sessions.length, completedEvents, limitedSpecs.length),
    shard: {
      shard_count: shardCount,
      shard_index: shardIndex,
      shard_session_target: limitedSpecs.length,
    },
  };
  writeJson(paths.manifestOutPath, outputManifest);

  return {
    sessions,
    outputManifest,
    completedEvents,
  };
}

async function main() {
  const manifestPath = path.resolve(arg("manifest", DEFAULT_MANIFEST));
  const manifest = readJson(manifestPath);
  const paths = createOutputPaths(manifest);
  const generated = await generateBenchmark(manifest, paths);

  console.log(`Generated benchmark with LLM: sessions=${generated.sessions.length}, events=${generated.completedEvents}`);
  console.log(`events: ${paths.eventsPath}`);
  console.log(`sessions: ${paths.sessionsPath}`);
  console.log(`manifest: ${paths.manifestOutPath}`);
}

main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
