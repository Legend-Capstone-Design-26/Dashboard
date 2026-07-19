const fs = require("fs");
const path = require("path");

const { mergeSessionState } = require("../analytics/session-state");
const { normalizeHistoricalSessionSummary } = require("../stores/redis-session-store");
const { extractRawVector, FEATURE_KEYS } = require("../../analytics/clustering/featureExtractor");
const { createLineError, resolveBuilderPath, streamJsonlRecords } = require("./jsonl-stream");

const DEFAULT_INPUT_PATH = "data/research/raw/events.jsonl";
const DEFAULT_OUTPUT_PATH = "data/research/processed/sessions.jsonl";
const RESEARCH_METADATA_KEYS = ["source", "generation_run_id", "ground_truth_type"];

function toRequiredText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function toFiniteNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function resolveEventTimestamp(event) {
  return toFiniteNumber(event?.ts) ?? toFiniteNumber(event?.received_at);
}

function extractResearchMetadata(event) {
  const metadata = {};
  for (const key of RESEARCH_METADATA_KEYS) {
    if (event?.[key] !== undefined && event?.[key] !== null) metadata[key] = event[key];
  }
  return metadata;
}

function mergeResearchMetadata(currentMetadata, nextMetadata, lineNumber) {
  const current = currentMetadata && typeof currentMetadata === "object" ? currentMetadata : {};
  const next = nextMetadata && typeof nextMetadata === "object" ? nextMetadata : {};
  for (const key of RESEARCH_METADATA_KEYS) {
    if (!(key in current) || !(key in next)) continue;
    if (current[key] !== next[key]) {
      throw createLineError(lineNumber, `conflicting research metadata for ${key}`);
    }
  }
  return { ...current, ...next };
}

function normalizeEventRecord(event, lineNumber) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw createLineError(lineNumber, "event must be a JSON object");
  }

  const siteId = toRequiredText(event.site_id);
  if (!siteId) throw createLineError(lineNumber, "missing site_id");

  const sessionId = toRequiredText(event.session_id);
  if (!sessionId) throw createLineError(lineNumber, "missing session_id");

  const eventName = toRequiredText(event.event_name);
  if (!eventName) throw createLineError(lineNumber, "missing event_name");

  const timestamp = resolveEventTimestamp(event);
  if (timestamp === null) throw createLineError(lineNumber, "missing or invalid timestamp");

  return {
    ...event,
    site_id: siteId,
    session_id: sessionId,
    event_name: eventName,
    ts: timestamp,
    __line_number: lineNumber,
    __received_at_sort: toFiniteNumber(event.received_at) ?? timestamp,
  };
}

function sortSessionEvents(events) {
  return [...(Array.isArray(events) ? events : [])].sort((left, right) => {
    if (left.ts !== right.ts) return left.ts - right.ts;
    if (left.__received_at_sort !== right.__received_at_sort) return left.__received_at_sort - right.__received_at_sort;
    return left.__line_number - right.__line_number;
  });
}

function sortSessionSummaries(summaries) {
  return [...summaries].sort((left, right) => {
    if (left.site_id !== right.site_id) return left.site_id.localeCompare(right.site_id);
    return left.session_id.localeCompare(right.session_id);
  });
}

async function readAndGroupEventsFromJsonl(filePath, options = {}) {
  const skipInvalid = options.skipInvalid === true;
  const sessions = new Map();
  const stats = await streamJsonlRecords(filePath, {
    skipInvalid,
    parseRecord: normalizeEventRecord,
    onRecord: async (event, lineNumber) => {
      const sessionKey = `${event.site_id}::${event.session_id}`;
      const current = sessions.get(sessionKey) || {
        site_id: event.site_id,
        session_id: event.session_id,
        first_line_number: lineNumber,
        input_event_count: 0,
        events: [],
        research_metadata: {},
      };

      current.research_metadata = mergeResearchMetadata(current.research_metadata, extractResearchMetadata(event), lineNumber);
      current.input_event_count += 1;
      current.events.push(event);
      sessions.set(sessionKey, current);
    },
  });

  return {
    sessions: [...sessions.values()],
    stats: {
      input_lines: stats.input_lines,
      parsed_events: stats.parsed_rows,
      invalid_lines: stats.invalid_lines,
      skipped_events: stats.skipped_rows,
    },
  };
}

function buildHistoricalSummaryRecord(sessionGroup) {
  const orderedEvents = sortSessionEvents(sessionGroup.events);
  let state = null;
  for (const event of orderedEvents) {
    state = mergeSessionState(state, event);
  }

  const normalized = normalizeHistoricalSessionSummary({
    ...(state || {}),
    site_id: sessionGroup.site_id,
    session_id: sessionGroup.session_id,
  });

  return {
    ...normalized,
    research_metadata: { ...(sessionGroup.research_metadata || {}) },
    input_event_count: sessionGroup.input_event_count,
  };
}

function validateFeatureCompatibility(summary) {
  const vector = extractRawVector(summary);
  if (!Array.isArray(vector) || vector.length !== FEATURE_KEYS.length || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`feature compatibility failed for ${summary.site_id}/${summary.session_id}`);
  }
  return vector;
}

async function buildSessionSummariesFromFile(inputPath, options = {}) {
  const grouped = await readAndGroupEventsFromJsonl(inputPath, options);
  const summaries = [];
  let featureCompatibleSessions = 0;
  let featureFailedSessions = 0;

  for (const sessionGroup of grouped.sessions) {
    const summary = buildHistoricalSummaryRecord(sessionGroup);
    try {
      validateFeatureCompatibility(summary);
      featureCompatibleSessions += 1;
    } catch (error) {
      featureFailedSessions += 1;
      throw error;
    }
    summaries.push(summary);
  }

  return {
    summaries: sortSessionSummaries(summaries),
    stats: {
      ...grouped.stats,
      session_count: grouped.sessions.length,
      feature_compatible_sessions: featureCompatibleSessions,
      feature_failed_sessions: featureFailedSessions,
    },
  };
}

function writeSessionSummariesJsonl(outputPath, summaries) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  const payload = summaries.map((summary) => JSON.stringify(summary)).join("\n");
  fs.writeFileSync(tempPath, payload ? `${payload}\n` : "", "utf8");
  fs.renameSync(tempPath, outputPath);
}

module.exports = {
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_PATH,
  FEATURE_KEYS,
  RESEARCH_METADATA_KEYS,
  buildHistoricalSummaryRecord,
  buildSessionSummariesFromFile,
  createLineError,
  extractResearchMetadata,
  mergeResearchMetadata,
  normalizeEventRecord,
  readAndGroupEventsFromJsonl,
  resolveBuilderPath,
  resolveEventTimestamp,
  sortSessionEvents,
  sortSessionSummaries,
  validateFeatureCompatibility,
  writeSessionSummariesJsonl,
};
