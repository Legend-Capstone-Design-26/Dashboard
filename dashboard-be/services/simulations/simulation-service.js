const crypto = require("crypto");
const { catalog, listPersonas, makeBase, generateSessionEvents } = require("../../personas");
const {
  DEFAULT_FIXED_COHORT_ID,
  loadFixedCohort,
  hasFixedCohort,
  loadPopulationSegments,
} = require("../../personas/cohort-store");
const { compareCohortMembersToPopulationSegments } = require("../../personas/cohort-builder");
const { proportionZTest, srmTest, welchTTest } = require("./statistics");

const POPULATION_SOURCE = catalog.source_dataset || "nvidia/Nemotron-Personas-Korea";
const DEFAULT_POPULATION_SIZE = 7000000;
const FIXED_COHORT_MODE = "fixed_10k_cohort";
const SYNTHETIC_MODE = "synthetic";
const STEP_ORDER = ["home", "browse", "product", "cart", "checkout", "payment", "purchase"];

function hashString(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function numberFromHash(value) {
  return parseInt(hashString(value).slice(0, 8), 16) / 0xffffffff;
}

function seededRng(seed) {
  let cursor = 0;
  return () => {
    cursor += 1;
    return numberFromHash(`${seed}:${cursor}`);
  };
}

function rid(prefix = "sim") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function stepForEvent(event) {
  const name = String(event?.event_name || "");
  const path = String(event?.path || "");
  if (name === "checkout_complete" || path.includes("order-complete")) return "purchase";
  if (name === "payment_attempt") return "payment";
  if (name === "checkout_start" || path.includes("checkout")) return "checkout";
  if (name === "add_to_cart" || path.includes("cart")) return "cart";
  if (path.includes("detail") || path.includes("product")) return "product";
  if (path === "/" || path === "") return "home";
  return "browse";
}

function maxStep(events) {
  let max = "home";
  for (const event of events) {
    const step = stepForEvent(event);
    if (STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(max)) max = step;
  }
  return max;
}

function personaGroupId(persona) {
  return persona.group_id || [persona.age_group || persona.normalized_persona?.age_group || "unknown", persona.normalized_persona?.occupation_group || persona.occupation_group || "unknown", persona.style_key || persona.normalized_persona?.style_key || "unknown"].join("__");
}

function groupMetaById() {
  const map = new Map();
  for (const group of catalog.groups || []) {
    map.set(group.group_id, group);
  }
  return map;
}

function groupPersonas() {
  const groups = groupMetaById();
  const buckets = new Map();
  for (const persona of listPersonas()) {
    const groupId = personaGroupId(persona);
    if (!buckets.has(groupId)) {
      const meta = groups.get(groupId) || {};
      buckets.set(groupId, {
        group_id: groupId,
        age_group: persona.age_group || persona.normalized_persona?.age_group || meta.age_group || null,
        occupation_group: persona.occupation_group || persona.normalized_persona?.occupation_group || meta.occupation_group || null,
        style_key: persona.style_key || persona.normalized_persona?.style_key || meta.style_key || null,
        population_count: Number(meta.count) || 0,
        population_weight: Number(meta.weight) || Number(persona.weight) || 0,
        personas: [],
      });
    }
    buckets.get(groupId).personas.push(persona);
  }
  const list = Array.from(buckets.values());
  const weightTotal = list.reduce((sum, group) => sum + Math.max(0, Number(group.population_weight) || 0), 0);
  if (weightTotal <= 0 && list.length) {
    const even = 1 / list.length;
    list.forEach((group) => { group.population_weight = even; });
  }
  return list;
}

function allocateSamples(groups, sampleSize) {
  const totalWeight = groups.reduce((sum, group) => sum + Math.max(0, Number(group.population_weight) || 0), 0);
  const allocations = groups.map((group) => {
    const exact = totalWeight > 0 ? (Math.max(0, Number(group.population_weight) || 0) / totalWeight) * sampleSize : sampleSize / groups.length;
    return { group, exact, sample_count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let allocated = allocations.reduce((sum, item) => sum + item.sample_count, 0);
  allocations.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; allocated < sampleSize && allocations.length; i += 1) {
    allocations[i % allocations.length].sample_count += 1;
    allocated += 1;
  }
  return allocations.filter((item) => item.sample_count > 0);
}

function pickPersona(group, seed, index) {
  const personas = group.personas || [];
  if (personas.length === 0) return null;
  const pick = Math.floor(numberFromHash(`${seed}:${group.group_id}:${index}`) * personas.length) % personas.length;
  return personas[pick];
}

function roundMetric(value, digits = 6) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function buildCoverageDiagnostics(groups, sampleGroups, sampleSize) {
  const positiveWeightTotal = groups.reduce((sum, group) => sum + Math.max(0, Number(group.population_weight) || 0), 0);
  const sampledById = new Map((sampleGroups || []).map((group) => [group.group_id, group]));
  const targetSegments = groups
    .map((group) => {
      const targetPopulationWeight = positiveWeightTotal > 0 ? Math.max(0, Number(group.population_weight) || 0) / positiveWeightTotal : 0;
      const sampled = sampledById.get(group.group_id);
      const sampleCount = Number(sampled?.sample_count) || 0;
      const sampleWeight = sampleSize > 0 ? sampleCount / sampleSize : 0;
      const representationRate = targetPopulationWeight > 0 ? sampleWeight / targetPopulationWeight : sampleCount > 0 ? 1 : 0;
      const weightError = sampleWeight - targetPopulationWeight;
      const analysisWeight = sampleCount > 0 && sampleWeight > 0 && targetPopulationWeight > 0 ? targetPopulationWeight / sampleWeight : 0;
      return {
        group_id: group.group_id,
        age_group: group.age_group,
        occupation_group: group.occupation_group,
        style_key: group.style_key,
        population_weight: roundMetric(targetPopulationWeight),
        sample_weight: roundMetric(sampleWeight),
        sample_count: sampleCount,
        representation_rate: roundMetric(representationRate),
        weight_error: roundMetric(weightError),
        analysis_weight: roundMetric(analysisWeight),
      };
    })
    .filter((group) => group.population_weight > 0);

  const missingSegments = targetSegments
    .filter((group) => group.sample_count === 0)
    .map((group) => ({
      group_id: group.group_id,
      age_group: group.age_group,
      occupation_group: group.occupation_group,
      style_key: group.style_key,
      population_weight: group.population_weight,
    }));

  const undercoveredSegments = targetSegments
    .filter((group) => group.sample_count > 0 && group.representation_rate < 0.8)
    .map((group) => ({
      group_id: group.group_id,
      age_group: group.age_group,
      occupation_group: group.occupation_group,
      style_key: group.style_key,
      population_weight: group.population_weight,
      sample_weight: group.sample_weight,
      representation_rate: group.representation_rate,
      sample_count: group.sample_count,
    }));

  const coveredPopulationWeight = targetSegments.reduce((sum, group) => sum + (group.sample_count > 0 ? group.population_weight : 0), 0);
  const missingPopulationWeight = targetSegments.reduce((sum, group) => sum + (group.sample_count === 0 ? group.population_weight : 0), 0);
  const coveredSegments = targetSegments.filter((group) => group.sample_count > 0);
  const weightedAbsoluteError = targetSegments.reduce((sum, group) => sum + Math.abs(group.weight_error) * group.population_weight, 0);
  const weightedSquaredError = targetSegments.reduce((sum, group) => sum + (group.weight_error ** 2) * group.population_weight, 0);
  const maxAbsWeightError = targetSegments.reduce((max, group) => Math.max(max, Math.abs(group.weight_error)), 0);
  const analysisWeightSum = coveredSegments.reduce((sum, group) => sum + (group.sample_count * group.analysis_weight), 0);
  const analysisWeightSquaredSum = coveredSegments.reduce((sum, group) => sum + (group.sample_count * (group.analysis_weight ** 2)), 0);
  const effectiveSampleSize = analysisWeightSquaredSum > 0 ? (analysisWeightSum ** 2) / analysisWeightSquaredSum : 0;
  const weightingEfficiency = sampleSize > 0 ? effectiveSampleSize / sampleSize : 0;

  return {
    coverage_rate: roundMetric(coveredPopulationWeight),
    covered_population_weight: roundMetric(coveredPopulationWeight),
    target_population_weight: roundMetric(targetSegments.reduce((sum, group) => sum + group.population_weight, 0)),
    missing_population_weight: roundMetric(missingPopulationWeight),
    covered_segment_count: coveredSegments.length,
    target_segment_count: targetSegments.length,
    missing_segment_count: missingSegments.length,
    undercovered_segment_count: undercoveredSegments.length,
    effective_sample_size: roundMetric(effectiveSampleSize),
    weighting_efficiency: roundMetric(weightingEfficiency),
    weight_mae: roundMetric(weightedAbsoluteError),
    weight_rmse: roundMetric(Math.sqrt(weightedSquaredError)),
    max_abs_weight_error: roundMetric(maxAbsWeightError),
    missing_segments: missingSegments,
    undercovered_segments: undercoveredSegments,
  };
}

function buildSample({ sampleSize, seed }) {
  const groups = groupPersonas();
  const allocations = allocateSamples(groups, sampleSize);
  const samples = [];
  const sampleGroups = [];
  for (const allocation of allocations) {
    const group = allocation.group;
    sampleGroups.push({
      group_id: group.group_id,
      age_group: group.age_group,
      occupation_group: group.occupation_group,
      style_key: group.style_key,
      population_count: group.population_count,
      population_weight: group.population_weight,
      sample_count: allocation.sample_count,
      sample_weight: sampleSize > 0 ? allocation.sample_count / sampleSize : 0,
      oversampled: allocation.sample_count / sampleSize > group.population_weight,
    });
    for (let i = 0; i < allocation.sample_count; i += 1) {
      const persona = pickPersona(group, seed, i);
      if (!persona) continue;
      samples.push({ persona, group, sample_index: samples.length });
    }
  }
  const coverageDiagnostics = buildCoverageDiagnostics(groups, sampleGroups, sampleSize);
  return { samples: samples.slice(0, sampleSize), sampleGroups, coverageDiagnostics };
}

function createPersonaIndexes() {
  const personas = listPersonas();
  const byGroupId = new Map();
  const byStyleKey = new Map();
  const byAgeGroup = new Map();
  for (const persona of personas) {
    const groupId = personaGroupId(persona);
    const styleKey = persona.style_key || persona.normalized_persona?.style_key || "unknown";
    const ageGroup = persona.age_group || persona.normalized_persona?.age_group || "unknown";
    if (!byGroupId.has(groupId)) byGroupId.set(groupId, []);
    if (!byStyleKey.has(styleKey)) byStyleKey.set(styleKey, []);
    if (!byAgeGroup.has(ageGroup)) byAgeGroup.set(ageGroup, []);
    byGroupId.get(groupId).push(persona);
    byStyleKey.get(styleKey).push(persona);
    byAgeGroup.get(ageGroup).push(persona);
  }
  return { personas, byGroupId, byStyleKey, byAgeGroup };
}

function pickDeterministic(list, key) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const pick = Math.floor(numberFromHash(key) * list.length) % list.length;
  return list[pick] || list[0] || null;
}

function pickPersonaTemplate(member, indexes, cohortId) {
  const memberKey = member.uuid || member.row_idx || member.group_id || "member";
  const hashKey = `${cohortId || DEFAULT_FIXED_COHORT_ID}:${memberKey}`;
  const exactGroupMatch = pickDeterministic(indexes.byGroupId.get(member.group_id), `${hashKey}:group`);
  if (exactGroupMatch) return exactGroupMatch;
  const styleMatch = pickDeterministic(indexes.byStyleKey.get(member.style_key), `${hashKey}:style`);
  if (styleMatch) return styleMatch;
  const ageMatch = pickDeterministic(indexes.byAgeGroup.get(member.age_group), `${hashKey}:age`);
  if (ageMatch) return ageMatch;
  return pickDeterministic(indexes.personas, `${hashKey}:fallback`);
}

function groupMembers(members, populationSize, populationProfile) {
  const buckets = new Map();
  const list = Array.isArray(members) ? members.filter(Boolean) : [];
  const sampleSize = list.length;
  const populationById = new Map(
    Array.isArray(populationProfile?.segments)
      ? populationProfile.segments.filter(Boolean).map((segment) => [segment.group_id, segment])
      : [],
  );
  for (const member of list) {
    const groupId = member.group_id || "unknown__unknown__unknown";
    if (!buckets.has(groupId)) {
      buckets.set(groupId, {
        group_id: groupId,
        age_group: member.age_group || "unknown",
        occupation_group: member.occupation_group || "unknown",
        style_key: member.style_key || "unknown",
        sample_count: 0,
      });
    }
    buckets.get(groupId).sample_count += 1;
  }
  return Array.from(buckets.values())
    .map((group) => {
      const populationSegment = populationById.get(group.group_id) || null;
      const sampleWeight = sampleSize > 0 ? group.sample_count / sampleSize : 0;
      return {
        ...group,
        population_count: populationSegment
          ? Math.max(0, Math.trunc(Number(populationSegment.population_count) || 0))
          : populationSize > 0 ? Math.round(sampleWeight * populationSize) : 0,
        sample_weight: sampleWeight,
        population_weight: populationSegment
          ? Math.max(0, Number(populationSegment.population_weight) || 0)
          : sampleWeight,
        oversampled: populationSegment ? sampleWeight > Math.max(0, Number(populationSegment.population_weight) || 0) : false,
      };
    })
    .sort((left, right) => right.sample_count - left.sample_count || left.group_id.localeCompare(right.group_id));
}

function buildFixedCoverageDiagnostics({ sampleGroups, sampleSize, artifact, populationProfile }) {
  const groups = Array.isArray(sampleGroups) ? sampleGroups : [];
  if (populationProfile && Array.isArray(populationProfile.segments) && populationProfile.segments.length > 0) {
    const profileCoverage = compareCohortMembersToPopulationSegments(artifact?.members, populationProfile)
    return {
      ...profileCoverage,
      cohort_member_count: sampleSize,
      cohort_group_count: groups.length,
      cohort_coverage_scope: populationProfile?.metadata?.scan_complete === false ? "scanned_population_segments" : "population_segments",
      fixed_cohort_internal_coverage_rate: 1,
      cohort_id: artifact?.cohort_id || null,
      population_profile_metadata: populationProfile.metadata || null,
    }
  }
  const artifactCoverage = artifact?.coverage_diagnostics && typeof artifact.coverage_diagnostics === "object"
    ? artifact.coverage_diagnostics
    : {};
  const metadata = artifact?.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
  const observedPopulationSize = Number(metadata.observed_num_rows_total) || 0;
  const requestedPopulationSize = Number(metadata.requested_population_size) || DEFAULT_POPULATION_SIZE;
  const observedCoverageRate = Number(artifactCoverage.observed_row_coverage_rate);
  const populationCoverageRate = Number.isFinite(observedCoverageRate) && observedCoverageRate >= 0
    ? observedCoverageRate
    : sampleSize > 0 && observedPopulationSize > 0
      ? sampleSize / observedPopulationSize
      : sampleSize > 0 && requestedPopulationSize > 0
        ? sampleSize / requestedPopulationSize
        : 0;
  const boundedCoverageRate = roundMetric(Math.max(0, Math.min(1, populationCoverageRate)));
  return {
    ...artifactCoverage,
    coverage_rate: boundedCoverageRate,
    covered_population_weight: boundedCoverageRate,
    target_population_weight: 1,
    missing_population_weight: roundMetric(1 - boundedCoverageRate),
    covered_segment_count: groups.length,
    target_segment_count: groups.length,
    missing_segment_count: 0,
    undercovered_segment_count: 0,
    effective_sample_size: sampleSize,
    weighting_efficiency: sampleSize > 0 ? 1 : 0,
    weight_mae: 0,
    weight_rmse: 0,
    max_abs_weight_error: 0,
    missing_segments: [],
    undercovered_segments: [],
    cohort_member_count: sampleSize,
    cohort_group_count: groups.length,
    cohort_coverage_scope: observedPopulationSize > 0 ? "observed_source_rows" : "requested_population",
    fixed_cohort_internal_coverage_rate: 1,
    cohort_id: artifact?.cohort_id || null,
  };
}

function buildFixedCohortSample({ artifact, cohortId, populationProfile }) {
  const metadata = artifact?.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
  const members = Array.isArray(artifact?.members) ? artifact.members.filter(Boolean) : [];
  const indexes = createPersonaIndexes();
  const populationSize = Number(metadata.requested_population_size) || DEFAULT_POPULATION_SIZE;
  const samples = members.map((member, index) => {
    const persona = pickPersonaTemplate(member, indexes, cohortId || artifact?.cohort_id);
    const group = {
      group_id: member.group_id || "unknown__unknown__unknown",
      age_group: member.age_group || "unknown",
      occupation_group: member.occupation_group || "unknown",
      style_key: member.style_key || "unknown",
      population_weight: 0,
      population_count: 0,
    };
    return {
      persona,
      group,
      member,
      sample_index: index,
    };
  }).filter((sample) => sample.persona);
  const sampleGroups = groupMembers(members, populationSize, populationProfile);
  const populationWeightByGroup = new Map(sampleGroups.map((group) => [group.group_id, group.population_weight]));
  for (const sample of samples) {
    sample.group.population_weight = populationWeightByGroup.get(sample.group.group_id) || 0;
    sample.group.population_count = Math.round(sample.group.population_weight * populationSize);
  }
  const coverageDiagnostics = buildFixedCoverageDiagnostics({ sampleGroups, sampleSize: samples.length, artifact, populationProfile });
  return { samples, sampleGroups, coverageDiagnostics };
}

function sessionOutcome({ events, runId, persona, group, variant, experiment, weight }) {
  const goals = Array.isArray(experiment.goals) && experiment.goals.length ? experiment.goals : ["checkout_complete"];
  const paths = new Set();
  let pageViews = 0;
  let clicks = 0;
  let dwellTotalMs = 0;
  let converted = false;
  for (const event of events) {
    if (event.path) paths.add(event.path);
    if (event.event_name === "page_view") pageViews += 1;
    if (event.event_name === "click") clicks += 1;
    if (goals.includes(event.event_name)) converted = true;
    if (event.event_name === "dwell_time") {
      const dwell = Number(event.props?.dwell_ms || 0);
      if (Number.isFinite(dwell) && dwell > 0) dwellTotalMs += dwell;
    }
  }
  return {
    run_id: runId,
    session_id: events[0]?.session_id || `${runId}_${variant}_${persona.id}`,
    persona_id: persona.id,
    group_id: group.group_id,
    actor_type: "synthetic_agent",
    variant,
    converted,
    conversion_event: converted ? goals[0] : null,
    page_views: pageViews,
    clicks,
    dwell_total_ms: dwellTotalMs,
    max_step: maxStep(events),
    revenue: 0,
    weight,
    started_at: events.length ? Math.min(...events.map((event) => Number(event.ts)).filter(Number.isFinite)) : null,
    ended_at: events.length ? Math.max(...events.map((event) => Number(event.ts)).filter(Number.isFinite)) : null,
  };
}

function summarizeVariant(sessions, variant) {
  const list = sessions.filter((session) => session.variant === variant);
  const conversions = list.filter((session) => session.converted).length;
  const pageViews = list.reduce((sum, session) => sum + session.page_views, 0);
  const clicks = list.reduce((sum, session) => sum + session.clicks, 0);
  const dwellTotal = list.reduce((sum, session) => sum + session.dwell_total_ms, 0);
  const depthTotal = list.reduce((sum, session) => sum + STEP_ORDER.indexOf(session.max_step), 0);
  return {
    sessions: list.length,
    conversions,
    cvr: list.length ? conversions / list.length : 0,
    page_views: pageViews,
    clicks,
    ctr: pageViews ? clicks / pageViews : 0,
    avg_dwell_ms: list.length ? dwellTotal / list.length : 0,
    avg_depth: list.length ? depthTotal / list.length : 0,
  };
}

function summarizeSegments(sessions) {
  const byGroup = new Map();
  for (const session of sessions) {
    if (!byGroup.has(session.group_id)) byGroup.set(session.group_id, []);
    byGroup.get(session.group_id).push(session);
  }
  return Array.from(byGroup.entries()).map(([groupId, list]) => {
    const a = summarizeVariant(list, "A");
    const b = summarizeVariant(list, "B");
    return {
      group_id: groupId,
      A: a,
      B: b,
      uplift: a.cvr > 0 ? (b.cvr - a.cvr) / a.cvr : null,
      diff: b.cvr - a.cvr,
    };
  }).sort((a, b) => Math.abs(b.diff || 0) - Math.abs(a.diff || 0)).slice(0, 12);
}

function buildResults(sessions) {
  const A = summarizeVariant(sessions, "A");
  const B = summarizeVariant(sessions, "B");
  const conversion = proportionZTest({ successA: A.conversions, totalA: A.sessions, successB: B.conversions, totalB: B.sessions });
  const srm = srmTest({ totalA: A.sessions, totalB: B.sessions });
  return {
    summary: {
      winner: B.cvr > A.cvr ? "B" : B.cvr < A.cvr ? "A" : "tie",
      uplift: A.cvr > 0 ? (B.cvr - A.cvr) / A.cvr : null,
      significant: Boolean(conversion.ok && conversion.significant),
      caveat: "synthetic_persona_simulation",
    },
    variants: { A, B },
    statistics: {
      conversion,
      srm,
      clicks: welchTTest(sessions.filter((item) => item.variant === "A").map((item) => item.clicks), sessions.filter((item) => item.variant === "B").map((item) => item.clicks)),
      dwell: welchTTest(sessions.filter((item) => item.variant === "A").map((item) => item.dwell_total_ms), sessions.filter((item) => item.variant === "B").map((item) => item.dwell_total_ms)),
    },
    segments: summarizeSegments(sessions),
  };
}

function createSimulationService({ simulationStore, experimentStore, cohortProvider } = {}) {
  const provider = cohortProvider || { loadFixedCohort, hasFixedCohort, loadPopulationSegments };

  function createAndRun({ siteId, experimentKey, sampleSize, sampleSeed, userId, mode = SYNTHETIC_MODE, cohortId }) {
    const experiment = experimentStore.getByKey(siteId, experimentKey);
    if (!experiment) return { ok: false, status: 404, reason: "experiment not found" };

    const normalizedMode = String(mode || SYNTHETIC_MODE).trim() || SYNTHETIC_MODE;
    if (![SYNTHETIC_MODE, FIXED_COHORT_MODE].includes(normalizedMode)) {
      return { ok: false, status: 400, reason: "unsupported simulation mode" };
    }

    let samplePlan = null;
    let populationSource = POPULATION_SOURCE;
    let populationSize = DEFAULT_POPULATION_SIZE;
    let observedPopulationSize = null;
    let normalizedCohortId = null;
    let cohortMetadata = null;

    if (normalizedMode === FIXED_COHORT_MODE) {
      normalizedCohortId = String(cohortId || DEFAULT_FIXED_COHORT_ID).trim() || DEFAULT_FIXED_COHORT_ID;
      if (typeof provider.hasFixedCohort === "function" && !provider.hasFixedCohort()) {
        return {
          ok: false,
          status: 404,
          reason: "fixed cohort artifact not found; run node scripts/build-nemotron-cohort.js --out dashboard-be/personas/cohorts/nemotron-korea-fixed-10k.generated.json",
        };
      }
      const artifact = typeof provider.loadFixedCohort === "function"
        ? provider.loadFixedCohort({ cohortId: normalizedCohortId })
        : null;
      if (!artifact) {
        return { ok: false, status: 404, reason: `fixed cohort not found: ${normalizedCohortId}` };
      }
      cohortMetadata = artifact.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
      const populationProfile = typeof provider.loadPopulationSegments === "function"
        ? provider.loadPopulationSegments()
        : null;
      samplePlan = buildFixedCohortSample({ artifact, cohortId: normalizedCohortId, populationProfile });
      normalizedCohortId = artifact.cohort_id || normalizedCohortId;
      populationSource = cohortMetadata.dataset || POPULATION_SOURCE;
      populationSize = Number(cohortMetadata.requested_population_size) || DEFAULT_POPULATION_SIZE;
      observedPopulationSize = Number(cohortMetadata.observed_num_rows_total) || samplePlan.samples.length;
      if (samplePlan.samples.length === 0) {
        return { ok: false, status: 400, reason: `fixed cohort has no usable members: ${normalizedCohortId}` };
      }
    }

    const runId = rid("sim");
    const now = Date.now();
    const size = normalizedMode === FIXED_COHORT_MODE
      ? samplePlan.samples.length
      : Math.max(20, Math.min(Number(sampleSize) || 1000, 50000));
    const seed = String(sampleSeed || `${runId}:${experimentKey}:${experiment.version || 1}`);
    const run = {
      run_id: runId,
      site_id: siteId,
      experiment_key: experimentKey,
      experiment_version: experiment.version || 1,
      population_source: populationSource,
      population_size: populationSize,
      observed_population_size: observedPopulationSize,
      sample_size: size,
      sample_seed: seed,
      status: "running",
      mode: normalizedMode,
      cohort_id: normalizedCohortId,
      cohort_metadata: cohortMetadata,
      created_by: userId || null,
      created_at: now,
      started_at: now,
      finished_at: null,
      progress: { sampled: 0, processed: 0, failed: 0 },
      sample_groups: [],
      coverage_diagnostics: null,
      sessions: [],
      results: null,
    };
    simulationStore.upsert(run);

    const { samples, sampleGroups, coverageDiagnostics } = samplePlan || buildSample({ sampleSize: size, seed });
    const sessions = [];
    const goals = Array.isArray(experiment.goals) && experiment.goals.length ? experiment.goals : ["checkout_complete"];
    samples.forEach((sample, index) => {
      const variant = index % 2 === 0 ? "A" : "B";
      const sessionId = `${runId}_${variant}_${index}`;
      const base = makeBase({ site_id: siteId, anon_user_id: `${runId}_u_${index}`, session_id: sessionId, base_url: "/" });
      const rng = seededRng(`${seed}:${index}:${variant}:${sample.persona.id}`);
      const events = generateSessionEvents({
        personaId: sample.persona.id,
        base,
        startTs: now + index,
        rng,
        experimentKey,
        variant,
        experimentVersion: experiment.version || 1,
        experimentGoals: goals,
        }).map((event) => ({
          ...event,
          simulation_run_id: runId,
          persona_group_id: sample.group.group_id,
          cohort_id: normalizedCohortId,
        }));
      sessions.push(sessionOutcome({
        events,
        runId,
        persona: sample.persona,
        group: sample.group,
        variant,
        experiment,
        weight: Number(sample.member?.weight) || sample.group.population_weight,
      }));
    });

    const completed = {
      ...run,
      status: "completed",
      finished_at: Date.now(),
      progress: { sampled: samples.length, processed: sessions.length, failed: 0 },
      sample_groups: sampleGroups,
      coverage_diagnostics: coverageDiagnostics,
      sessions,
      results: buildResults(sessions),
    };
    simulationStore.upsert(completed);
    return { ok: true, run: completed };
  }

  function listRuns({ siteId, limit }) {
    return simulationStore.list({ siteId, limit }).map((run) => ({ ...run, sessions: undefined }));
  }

  function getRun(runId) {
    const run = simulationStore.get(runId);
    return run ? { ...run, sessions: undefined } : null;
  }

  function getResults(runId) {
    const run = simulationStore.get(runId);
    if (!run) return null;
    return {
      run_id: run.run_id,
      site_id: run.site_id,
      experiment_key: run.experiment_key,
      status: run.status,
      mode: run.mode,
      cohort_id: run.cohort_id || null,
      cohort_metadata: run.cohort_metadata || null,
      population_source: run.population_source,
      population_size: run.population_size,
      observed_population_size: run.observed_population_size || null,
      sample_size: run.sample_size,
      sample_groups: run.sample_groups || [],
      coverage_diagnostics: run.coverage_diagnostics || null,
      ...(run.results || {}),
    };
  }

  return { createAndRun, listRuns, getRun, getResults };
}

module.exports = {
  FIXED_COHORT_MODE,
  SYNTHETIC_MODE,
  createSimulationService,
  buildSample,
  buildResults,
};
