const fs = require("fs");
const path = require("path");
const readline = require("readline");

function getDashboardBackendDir() {
  return path.join(__dirname, "..", "..");
}

function resolveBuilderPath(filePath, fallbackPath) {
  return path.resolve(getDashboardBackendDir(), String(filePath || fallbackPath));
}

function createLineError(lineNumber, message) {
  const error = new Error(`line ${lineNumber}: ${message}`);
  error.lineNumber = lineNumber;
  error.code = "RESEARCH_JSONL_INVALID_LINE";
  return error;
}

async function streamJsonlRecords(filePath, options = {}) {
  const skipInvalid = options.skipInvalid === true;
  const parseRecord = typeof options.parseRecord === "function"
    ? options.parseRecord
    : ((value) => value);
  const onRecord = typeof options.onRecord === "function"
    ? options.onRecord
    : (() => {});

  const stats = {
    input_lines: 0,
    parsed_rows: 0,
    invalid_lines: 0,
    skipped_rows: 0,
  };

  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const rawLine of reader) {
      stats.input_lines += 1;
      const lineNumber = stats.input_lines;
      if (!rawLine.trim()) continue;

      let parsed;
      try {
        parsed = JSON.parse(rawLine);
      } catch {
        const error = createLineError(lineNumber, "invalid JSON");
        if (!skipInvalid) throw error;
        stats.invalid_lines += 1;
        stats.skipped_rows += 1;
        continue;
      }

      let record;
      try {
        record = parseRecord(parsed, lineNumber);
      } catch (error) {
        if (!skipInvalid) throw error;
        stats.invalid_lines += 1;
        stats.skipped_rows += 1;
        continue;
      }

      try {
        await onRecord(record, lineNumber);
      } catch (error) {
        if (!skipInvalid) throw error;
        stats.invalid_lines += 1;
        stats.skipped_rows += 1;
        continue;
      }

      stats.parsed_rows += 1;
    }
  } finally {
    reader.close();
  }

  return stats;
}

module.exports = {
  createLineError,
  getDashboardBackendDir,
  resolveBuilderPath,
  streamJsonlRecords,
};
