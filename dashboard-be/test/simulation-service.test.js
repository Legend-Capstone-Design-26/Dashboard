const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FIXED_COHORT_MODE,
  SYNTHETIC_MODE,
  createSimulationService,
  buildSample,
} = require("../services/simulations/simulation-service");

function createMemorySimulationStore() {
  const runs = new Map();
  return {
    list() { return Array.from(runs.values()); },
    get(runId) { return runs.get(runId) || null; },
    upsert(run) { runs.set(run.run_id, run); return run; },
  };
}

function createExperimentStore() {
  return {
    getByKey(siteId, key) {
      if (siteId !== "legend-ecommerce" || key !== "exp_checkout_cta_v1") return null;
      return {
        id: "exp1",
        site_id: siteId,
        key,
        version: 1,
        status: "running",
        goals: ["checkout_complete"],
        variants: { A: [], B: [] },
      };
    },
  };
}

test("buildSample returns deterministic representative sample", () => {
  const first = buildSample({ sampleSize: 40, seed: "seed-1" });
  const second = buildSample({ sampleSize: 40, seed: "seed-1" });

  assert.equal(first.samples.length, 40);
  assert.equal(first.sampleGroups.length > 0, true);
  assert.equal(typeof first.coverageDiagnostics, "object");
  assert.equal(first.coverageDiagnostics.target_population_weight, 1);
  assert.equal(first.coverageDiagnostics.covered_segment_count, first.sampleGroups.length);
  assert.equal(Array.isArray(first.coverageDiagnostics.missing_segments), true);
  assert.equal(Array.isArray(first.coverageDiagnostics.undercovered_segments), true);
  assert.equal(first.coverageDiagnostics.effective_sample_size <= first.samples.length, true);
  assert.deepEqual(
    first.samples.map((item) => item.persona.id),
    second.samples.map((item) => item.persona.id),
  );
  assert.deepEqual(first.coverageDiagnostics, second.coverageDiagnostics);
});

test("createAndRun stores completed A/B synthetic run with statistics", () => {
  const service = createSimulationService({
    simulationStore: createMemorySimulationStore(),
    experimentStore: createExperimentStore(),
  });

  const result = service.createAndRun({
    siteId: "legend-ecommerce",
    experimentKey: "exp_checkout_cta_v1",
    sampleSize: 40,
    sampleSeed: "seed-2",
    userId: "admin",
  });

  assert.equal(result.ok, true);
  assert.equal(result.run.mode, SYNTHETIC_MODE);
  assert.equal(result.run.status, "completed");
  assert.equal(result.run.sessions.length, 40);
  assert.equal(typeof result.run.coverage_diagnostics, "object");
  assert.equal(result.run.coverage_diagnostics.target_population_weight, 1);
  assert.equal(Array.isArray(result.run.coverage_diagnostics.missing_segments), true);
  assert.equal(result.run.results.variants.A.sessions, 20);
  assert.equal(result.run.results.variants.B.sessions, 20);
  assert.equal(result.run.results.statistics.conversion.ok, true);
  assert.equal(Array.isArray(result.run.results.segments), true);

  const fetched = service.getResults(result.run.run_id);
  assert.equal(fetched.run_id, result.run.run_id);
  assert.deepEqual(fetched.sample_groups, result.run.sample_groups);
  assert.deepEqual(fetched.coverage_diagnostics, result.run.coverage_diagnostics);
});

test("createAndRun supports fixed cohort mode with injected cohort provider", () => {
  const cohort = {
    cohort_id: "nemotron-korea-fixed-test",
    metadata: {
      dataset: "nvidia/Nemotron-Personas-Korea",
      requested_population_size: 7000000,
      observed_num_rows_total: 1000000,
      generated_at: "2026-06-26T00:00:00.000Z",
    },
    members: [
      { uuid: "m1", row_idx: 10, group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", weight: 700 },
      { uuid: "m2", row_idx: 20, group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", weight: 700 },
      { uuid: "m3", row_idx: 30, group_id: "20s__student__impulsive", age_group: "20s", occupation_group: "student", style_key: "impulsive", weight: 700 },
      { uuid: "m4", row_idx: 40, group_id: "50s__self_employed__fast_decision", age_group: "50s", occupation_group: "self_employed", style_key: "fast_decision", weight: 700 },
    ],
    coverage_diagnostics: {
      total_members: 4,
      unique_group_count: 3,
      observed_row_coverage_rate: 0.000004,
    },
  };
  const service = createSimulationService({
    simulationStore: createMemorySimulationStore(),
    experimentStore: createExperimentStore(),
    cohortProvider: {
      hasFixedCohort() { return true; },
      loadFixedCohort({ cohortId }) {
        return cohortId === "fixed_10k_cohort" || cohortId === cohort.cohort_id ? JSON.parse(JSON.stringify(cohort)) : null;
      },
      loadPopulationSegments() { return null; },
    },
  });

  const result = service.createAndRun({
    siteId: "legend-ecommerce",
    experimentKey: "exp_checkout_cta_v1",
    mode: FIXED_COHORT_MODE,
    cohortId: "fixed_10k_cohort",
    sampleSeed: "seed-fixed",
    userId: "admin",
  });

  assert.equal(result.ok, true);
  assert.equal(result.run.mode, FIXED_COHORT_MODE);
  assert.equal(result.run.cohort_id, cohort.cohort_id);
  assert.equal(result.run.population_size, 7000000);
  assert.equal(result.run.observed_population_size, 1000000);
  assert.equal(result.run.sessions.length, cohort.members.length);
  assert.equal(result.run.sample_groups.length, 3);
  assert.equal(result.run.coverage_diagnostics.coverage_rate, 0.000004);
  assert.equal(result.run.coverage_diagnostics.fixed_cohort_internal_coverage_rate, 1);
  assert.equal(result.run.coverage_diagnostics.cohort_coverage_scope, "observed_source_rows");
  assert.equal(result.run.coverage_diagnostics.missing_segment_count, 0);
  assert.equal(result.run.coverage_diagnostics.undercovered_segment_count, 0);
  assert.equal(Array.isArray(result.run.coverage_diagnostics.missing_segments), true);
  assert.equal(Array.isArray(result.run.coverage_diagnostics.undercovered_segments), true);
  assert.deepEqual(result.run.sample_groups.map((group) => group.group_id), [
    "30s__professional__comparison",
    "20s__student__impulsive",
    "50s__self_employed__fast_decision",
  ]);

  const fetched = service.getResults(result.run.run_id);
  assert.equal(fetched.mode, FIXED_COHORT_MODE);
  assert.equal(fetched.cohort_id, cohort.cohort_id);
  assert.equal(fetched.cohort_metadata.generated_at, cohort.metadata.generated_at);
  assert.equal(fetched.sample_groups[0].sample_count, 2);
});

test("createAndRun uses population segment profile for fixed cohort diagnostics when available", () => {
  const cohort = {
    cohort_id: "nemotron-korea-fixed-test",
    metadata: {
      dataset: "nvidia/Nemotron-Personas-Korea",
      requested_population_size: 7000000,
      observed_num_rows_total: 1000000,
      generated_at: "2026-06-26T00:00:00.000Z",
    },
    members: [
      { uuid: "m1", row_idx: 10, group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", weight: 700 },
      { uuid: "m2", row_idx: 20, group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", weight: 700 },
      { uuid: "m3", row_idx: 30, group_id: "20s__student__impulsive", age_group: "20s", occupation_group: "student", style_key: "impulsive", weight: 700 },
      { uuid: "m4", row_idx: 40, group_id: "20s__student__impulsive", age_group: "20s", occupation_group: "student", style_key: "impulsive", weight: 700 },
    ],
    coverage_diagnostics: {
      total_members: 4,
      unique_group_count: 2,
      observed_row_coverage_rate: 0.000004,
    },
  };
  const populationProfile = {
    metadata: {
      scan_complete: true,
      scanned_row_count: 1000,
    },
    segments: [
      { group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", population_count: 500, population_weight: 0.5 },
      { group_id: "20s__student__impulsive", age_group: "20s", occupation_group: "student", style_key: "impulsive", population_count: 250, population_weight: 0.25 },
      { group_id: "50s__self_employed__fast_decision", age_group: "50s", occupation_group: "self_employed", style_key: "fast_decision", population_count: 250, population_weight: 0.25 },
    ],
  };
  const service = createSimulationService({
    simulationStore: createMemorySimulationStore(),
    experimentStore: createExperimentStore(),
    cohortProvider: {
      hasFixedCohort() { return true; },
      loadFixedCohort() { return JSON.parse(JSON.stringify(cohort)); },
      loadPopulationSegments() { return JSON.parse(JSON.stringify(populationProfile)); },
    },
  });

  const result = service.createAndRun({
    siteId: "legend-ecommerce",
    experimentKey: "exp_checkout_cta_v1",
    mode: FIXED_COHORT_MODE,
    cohortId: "fixed_10k_cohort",
    sampleSeed: "seed-fixed-profile",
    userId: "admin",
  });

  assert.equal(result.ok, true);
  assert.equal(result.run.coverage_diagnostics.population_weight_coverage, 0.75);
  assert.equal(result.run.coverage_diagnostics.coverage_loss, 0.25);
  assert.equal(result.run.coverage_diagnostics.distribution_loss_total_variation, 0.25);
  assert.equal(result.run.coverage_diagnostics.missing_segment_count, 1);
  assert.equal(result.run.coverage_diagnostics.missing_segments[0].group_id, "50s__self_employed__fast_decision");
  assert.equal(result.run.coverage_diagnostics.cohort_coverage_scope, "population_segments");
  assert.equal(result.run.coverage_diagnostics.fixed_cohort_internal_coverage_rate, 1);
  assert.equal(result.run.sample_groups.find((group) => group.group_id === "20s__student__impulsive").population_weight, 0.25);
});

test("createAndRun filters fixed cohort members before simulation", () => {
  const cohort = {
    cohort_id: "nemotron-korea-fixed-test",
    metadata: {
      dataset: "nvidia/Nemotron-Personas-Korea",
      requested_population_size: 7000000,
      observed_num_rows_total: 1000000,
      generated_at: "2026-06-26T00:00:00.000Z",
    },
    members: [
      { uuid: "m1", row_idx: 10, group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", weight: 700 },
      { uuid: "m2", row_idx: 20, group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", weight: 700 },
      { uuid: "m3", row_idx: 30, group_id: "20s__student__impulsive", age_group: "20s", occupation_group: "student", style_key: "impulsive", weight: 700 },
      { uuid: "m4", row_idx: 40, group_id: "50s__self_employed__fast_decision", age_group: "50s", occupation_group: "self_employed", style_key: "fast_decision", weight: 700 },
    ],
  };
  const service = createSimulationService({
    simulationStore: createMemorySimulationStore(),
    experimentStore: createExperimentStore(),
    cohortProvider: {
      hasFixedCohort() { return true; },
      loadFixedCohort() { return JSON.parse(JSON.stringify(cohort)); },
      loadPopulationSegments() { return null; },
    },
  });

  const result = service.createAndRun({
    siteId: "legend-ecommerce",
    experimentKey: "exp_checkout_cta_v1",
    mode: FIXED_COHORT_MODE,
    cohortId: "fixed_10k_cohort",
    filters: {
      age_group: "30s",
      occupation_group: "professional",
      style_key: "comparison",
    },
    sampleSeed: "seed-fixed-filtered",
    userId: "admin",
  });

  assert.equal(result.ok, true);
  assert.equal(result.run.cohort_total_members, 4);
  assert.equal(result.run.cohort_matched_members, 2);
  assert.deepEqual(result.run.filters_applied, {
    age_group: "30s",
    occupation_group: "professional",
    style_key: "comparison",
    province: "",
    sex: "",
  });
  assert.equal(result.run.sessions.length, 2);
  assert.equal(result.run.results.variants.A.sessions, 1);
  assert.equal(result.run.results.variants.B.sessions, 1);

  const fetched = service.getResults(result.run.run_id);
  assert.equal(fetched.cohort_matched_members, 2);
  assert.deepEqual(fetched.filters_applied, result.run.filters_applied);
});

test("createAndRun rejects fixed cohort filters with no matches", () => {
  const cohort = {
    cohort_id: "nemotron-korea-fixed-test",
    metadata: {
      dataset: "nvidia/Nemotron-Personas-Korea",
      requested_population_size: 7000000,
      observed_num_rows_total: 1000000,
    },
    members: [
      { uuid: "m1", row_idx: 10, group_id: "30s__professional__comparison", age_group: "30s", occupation_group: "professional", style_key: "comparison", weight: 700 },
    ],
  };
  const service = createSimulationService({
    simulationStore: createMemorySimulationStore(),
    experimentStore: createExperimentStore(),
    cohortProvider: {
      hasFixedCohort() { return true; },
      loadFixedCohort() { return JSON.parse(JSON.stringify(cohort)); },
      loadPopulationSegments() { return null; },
    },
  });

  const result = service.createAndRun({
    siteId: "legend-ecommerce",
    experimentKey: "exp_checkout_cta_v1",
    mode: FIXED_COHORT_MODE,
    cohortId: "fixed_10k_cohort",
    filters: { age_group: "20s" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.reason, "no fixed cohort members match selected filters");
});

test("createAndRun reports missing fixed cohort artifact clearly", () => {
  const service = createSimulationService({
    simulationStore: createMemorySimulationStore(),
    experimentStore: createExperimentStore(),
    cohortProvider: {
      hasFixedCohort() { return false; },
      loadFixedCohort() { return null; },
    },
  });

  const result = service.createAndRun({
    siteId: "legend-ecommerce",
    experimentKey: "exp_checkout_cta_v1",
    mode: FIXED_COHORT_MODE,
    cohortId: "fixed_10k_cohort",
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.match(result.reason, /fixed cohort artifact not found/);
  assert.match(result.reason, /build-nemotron-cohort/);
});

test("createAndRun reports missing experiment", () => {
  const service = createSimulationService({
    simulationStore: createMemorySimulationStore(),
    experimentStore: createExperimentStore(),
  });

  const result = service.createAndRun({ siteId: "legend-ecommerce", experimentKey: "missing" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});
