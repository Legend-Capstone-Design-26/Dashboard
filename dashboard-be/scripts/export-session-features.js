const {
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_DIR,
  exportFeatureDataset,
  parseExportFormat,
  resolveBuilderPath,
} = require("../services/research/feature-exporter");

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    format: "both",
    skipInvalid: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--skip-invalid") {
      args.skipInvalid = true;
      continue;
    }
    if (token === "--input" && argv[index + 1]) {
      args.input = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--output-dir" && argv[index + 1]) {
      args.outputDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--format" && argv[index + 1]) {
      args.format = parseExportFormat(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolveBuilderPath(args.input, DEFAULT_INPUT_PATH);
  const outputDir = resolveBuilderPath(args.outputDir, DEFAULT_OUTPUT_DIR);
  const result = await exportFeatureDataset(inputPath, outputDir, {
    format: args.format,
    skipInvalid: args.skipInvalid,
  });
  console.log(JSON.stringify(result.stats, null, 2));
}

main().catch((error) => {
  console.error(String(error && error.message ? error.message : error));
  process.exitCode = 1;
});
