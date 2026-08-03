const fs = require("fs");
const path = require("path");

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

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function collectSources() {
  const raw = String(arg("sources", "")).trim();
  if (!raw) throw new Error("Missing --sources dir1,dir2,dir3");
  const sources = raw.split(",").map((item) => item.trim()).filter(Boolean).map((item) => path.resolve(item));
  if (sources.length === 0) throw new Error("No source directories resolved from --sources");
  return sources;
}

function loadSource(dirPath) {
  const eventsPath = path.join(dirPath, "events.jsonl");
  const sessionsPath = path.join(dirPath, "sessions.json");
  const manifestPath = path.join(dirPath, "manifest.json");
  if (!fs.existsSync(eventsPath)) throw new Error(`Missing events.jsonl in ${dirPath}`);
  if (!fs.existsSync(sessionsPath)) throw new Error(`Missing sessions.json in ${dirPath}`);
  const sessionsPayload = readJson(sessionsPath);
  const sessions = Array.isArray(sessionsPayload.sessions) ? sessionsPayload.sessions : [];
  return {
    dirPath,
    eventsPath,
    sessionsPath,
    manifest: fs.existsSync(manifestPath) ? readJson(manifestPath) : null,
    events: readJsonLines(eventsPath),
    sessions,
  };
}

function safeSlug(text, fallback) {
  const normalized = String(text || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function sourceNamespace(source, index) {
  const benchmarkId = source.manifest?.benchmark_id || `source-${index + 1}`;
  const shard = source.manifest?.shard;
  if (shard && Number.isFinite(Number(shard.shard_index))) {
    return `${safeSlug(benchmarkId, `source-${index + 1}`)}-shard-${Number(shard.shard_index) + 1}`;
  }
  return safeSlug(benchmarkId, `source-${index + 1}`);
}

function namespaceSession(session, namespace) {
  return {
    ...session,
    session_id: `${namespace}__${String(session.session_id || "")}`,
    anon_user_id: `${namespace}__${String(session.anon_user_id || "")}`,
  };
}

function namespaceEvent(event, namespace) {
  const sessionId = `${namespace}__${String(event.session_id || "")}`;
  const anonUserId = `${namespace}__${String(event.anon_user_id || "")}`;
  return {
    ...event,
    session_id: sessionId,
    anon_user_id: anonUserId,
    request_id: `${namespace}__${String(event.request_id || "")}`,
  };
}

function main() {
  const sourceDirs = collectSources();
  const outputDir = path.resolve(arg("output-dir", path.join("benchmark", "output", "merged-7500")));
  const benchmarkId = String(arg("benchmark-id", "llm-ecommerce-merged-7500-v1")).trim();
  ensureDir(outputDir);

  const loaded = sourceDirs.map(loadSource);
  const sessionIds = new Set();
  const mergedEvents = [];
  const mergedSessions = [];

  loaded.forEach((source, index) => {
    const namespace = sourceNamespace(source, index);
    for (const rawSession of source.sessions) {
      const session = namespaceSession(rawSession, namespace);
      const sessionId = String(session.session_id || "").trim();
      if (!sessionId) throw new Error(`Encountered empty session_id in ${source.dirPath}`);
      if (sessionIds.has(sessionId)) throw new Error(`Duplicate session_id detected during merge: ${sessionId}`);
      sessionIds.add(sessionId);
      mergedSessions.push(session);
    }
    for (const rawEvent of source.events) {
      const event = namespaceEvent(rawEvent, namespace);
      const sessionId = String(event.session_id || "").trim();
      if (!sessionId) throw new Error(`Encountered event without session_id in ${source.dirPath}`);
      mergedEvents.push(event);
    }
  });

  mergedEvents.sort((left, right) => {
    const tsDiff = Number(left.ts || 0) - Number(right.ts || 0);
    if (tsDiff !== 0) return tsDiff;
    const sessionDiff = String(left.session_id || "").localeCompare(String(right.session_id || ""));
    if (sessionDiff !== 0) return sessionDiff;
    return String(left.request_id || "").localeCompare(String(right.request_id || ""));
  });

  const eventsPath = path.join(outputDir, "events.jsonl");
  const sessionsPath = path.join(outputDir, "sessions.json");
  const manifestPath = path.join(outputDir, "manifest.json");

  fs.writeFileSync(eventsPath, `${mergedEvents.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
  writeJson(sessionsPath, { benchmark_id: benchmarkId, sessions: mergedSessions });
  writeJson(manifestPath, {
    benchmark_id: benchmarkId,
    description: "Merged benchmark dataset built from pre-generated balanced shards and hard-only sessions.",
    generated_at: new Date().toISOString(),
    counts: {
      sessions: mergedSessions.length,
      events: mergedEvents.length,
      source_count: loaded.length,
    },
    sources: loaded.map((source) => ({
      dir_path: source.dirPath,
      namespace: sourceNamespace(source, loaded.indexOf(source)),
      benchmark_id: source.manifest?.benchmark_id || null,
      sessions: source.sessions.length,
      events: source.events.length,
      shard: source.manifest?.shard || null,
      dataset_shape: source.manifest?.dataset_shape || null,
    })),
    dataset_shape: {
      benchmark_type: "merged_balanced_plus_hard",
      total_sessions: mergedSessions.length,
      requested_sessions: mergedSessions.length,
      generated_sessions: mergedSessions.length,
    },
  });

  console.log(`Merged sources=${loaded.length} sessions=${mergedSessions.length} events=${mergedEvents.length}`);
  console.log(`events: ${eventsPath}`);
  console.log(`sessions: ${sessionsPath}`);
  console.log(`manifest: ${manifestPath}`);
}

main();
