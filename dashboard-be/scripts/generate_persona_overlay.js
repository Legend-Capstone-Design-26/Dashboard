const fs = require("fs");
const path = require("path");
const { createFileExperimentStore } = require("../services/stores/experiment-store");
const { listPersonas } = require("../personas");
const { generateOverlay, upsertOverlayRecord } = require("../personas/overlay-generator");

function arg(name, def) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return def;
}

async function main() {
  const siteId = String(arg("site", "legend-ecommerce")).trim();
  const experimentKey = String(arg("experiment-key", "")).trim();
  const personaId = String(arg("persona-id", "")).trim();
  const experimentFile = String(arg("experiment-file", "")).trim();
  if (!experimentKey || !personaId) {
    throw new Error("missing --experiment-key or --persona-id");
  }

  let experiment = null;
  if (experimentFile) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(experimentFile), "utf8"));
    experiment = raw?.experiment || raw;
  } else {
    const experimentStore = createFileExperimentStore({ experimentsFile: path.join(__dirname, "..", "data", "experiments.json") });
    experiment = experimentStore.getByKey(siteId, experimentKey);
  }
  if (!experiment) throw new Error(`experiment not found: ${experimentKey}. Pass --experiment-file <path> or create the experiment first.`);

  const persona = listPersonas().find((item) => item.id === personaId);
  if (!persona) throw new Error(`persona not found: ${personaId}`);

  const generated = await generateOverlay({ experiment, persona });
  const record = upsertOverlayRecord({ experiment, persona, generated });
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
