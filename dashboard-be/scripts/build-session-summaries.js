const {
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_PATH,
  buildSessionSummariesFromFile,
  resolveBuilderPath,
  writeSessionSummariesJsonl,
} = require("../services/research/session-builder");

function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT_PATH, output: DEFAULT_OUTPUT_PATH, skipInvalid: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--skip-invalid") {
      args.skipInvalid = true;
      continue;
    }
    if ((value === "--input" || value === "--output") && argv[i + 1]) {
      const key = value === "--input" ? "input" : "output";
      args[key] = argv[i + 1];
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${value}`);
  }
  return args;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = resolveBuilderPath(options.input, DEFAULT_INPUT_PATH);
  const outputPath = resolveBuilderPath(options.output, DEFAULT_OUTPUT_PATH);
  const result = await buildSessionSummariesFromFile(inputPath, { skipInvalid: options.skipInvalid });
  writeSessionSummariesJsonl(outputPath, result.summaries);
  console.log(JSON.stringify({ ...result.stats, output_path: outputPath }, null, 2));
}

main().catch((error) => {
  console.error(String(error && error.message ? error.message : error));
  process.exitCode = 1;
});
