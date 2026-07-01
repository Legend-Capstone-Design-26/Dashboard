const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FIXED_COHORT_ID = "fixed_10k_cohort";
const DEFAULT_FIXED_COHORT_FILENAME = "nemotron-korea-fixed-10k.generated.json";
const DEFAULT_FIXED_COHORT_PATH = path.join(__dirname, "cohorts", DEFAULT_FIXED_COHORT_FILENAME);
const DEFAULT_POPULATION_SEGMENTS_FILENAME = "nemotron-korea-population-segments.generated.json";
const DEFAULT_POPULATION_SEGMENTS_PATH = path.join(__dirname, "cohorts", DEFAULT_POPULATION_SEGMENTS_FILENAME);

let cachedArtifactPath = null;
let cachedArtifact = null;
let cachedPopulationArtifactPath = null;
let cachedPopulationArtifact = null;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function hasFixedCohort() {
  return fs.existsSync(DEFAULT_FIXED_COHORT_PATH);
}

function readFixedCohortArtifact() {
  if (!hasFixedCohort()) return null;
  if (cachedArtifact && cachedArtifactPath === DEFAULT_FIXED_COHORT_PATH) {
    return cachedArtifact;
  }
  cachedArtifact = JSON.parse(fs.readFileSync(DEFAULT_FIXED_COHORT_PATH, "utf8"));
  cachedArtifactPath = DEFAULT_FIXED_COHORT_PATH;
  return cachedArtifact;
}

function cohortIdMatches(requestedCohortId, artifact) {
  if (!requestedCohortId) return true;
  const normalized = String(requestedCohortId).trim();
  if (!normalized) return true;
  return normalized === DEFAULT_FIXED_COHORT_ID || normalized === artifact?.cohort_id;
}

function loadFixedCohort({ cohortId } = {}) {
  const artifact = readFixedCohortArtifact();
  if (!artifact) return null;
  if (!cohortIdMatches(cohortId, artifact)) return null;
  return clone(artifact);
}

function hasPopulationSegments() {
  return fs.existsSync(DEFAULT_POPULATION_SEGMENTS_PATH);
}

function readPopulationSegmentsArtifact() {
  if (!hasPopulationSegments()) return null;
  if (cachedPopulationArtifact && cachedPopulationArtifactPath === DEFAULT_POPULATION_SEGMENTS_PATH) {
    return cachedPopulationArtifact;
  }
  cachedPopulationArtifact = JSON.parse(fs.readFileSync(DEFAULT_POPULATION_SEGMENTS_PATH, "utf8"));
  cachedPopulationArtifactPath = DEFAULT_POPULATION_SEGMENTS_PATH;
  return cachedPopulationArtifact;
}

function loadPopulationSegments() {
  const artifact = readPopulationSegmentsArtifact();
  return artifact ? clone(artifact) : null;
}

function compactString(value) {
  return String(value == null ? "" : value).trim();
}

function toPositiveInt(value, fallback, max) {
  const numeric = Math.trunc(Number(value));
  const bounded = Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  return Math.max(1, Math.min(max, bounded));
}

function buildFacet(values) {
  return Array.from(values.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function increment(map, value) {
  const key = compactString(value);
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function memberMatchesFilters(member, filters) {
  if (filters.age_group && member.age_group !== filters.age_group) return false;
  if (filters.occupation_group && member.occupation_group !== filters.occupation_group) return false;
  if (filters.style_key && member.style_key !== filters.style_key) return false;
  if (filters.province && member.province !== filters.province) return false;
  if (filters.sex && member.sex !== filters.sex) return false;
  return true;
}

function publicMember(member, populationByGroup) {
  const segment = populationByGroup.get(member.group_id) || null;
  return {
    uuid: member.uuid || null,
    row_idx: Number.isFinite(Number(member.row_idx)) ? Number(member.row_idx) : null,
    age: Number.isFinite(Number(member.age)) ? Number(member.age) : null,
    age_group: member.age_group || "unknown",
    sex: member.sex || null,
    province: member.province || null,
    occupation: member.occupation || null,
    occupation_group: member.occupation_group || "unknown",
    style_key: member.style_key || "unknown",
    group_id: member.group_id || "unknown__unknown__unknown",
    weight: Number(member.weight) || null,
    persona_summary: member.persona_summary || null,
    population_count: segment ? Math.max(0, Math.trunc(Number(segment.population_count) || 0)) : null,
    population_weight: segment ? Math.max(0, Number(segment.population_weight) || 0) : null,
  };
}

function listFixedCohortMembers({ cohortId, filters = {}, limit = 24, offset = 0 } = {}) {
  const artifact = loadFixedCohort({ cohortId });
  if (!artifact) return null;
  const members = Array.isArray(artifact.members) ? artifact.members.filter(Boolean) : [];
  const populationProfile = loadPopulationSegments();
  const populationByGroup = new Map(
    Array.isArray(populationProfile?.segments)
      ? populationProfile.segments.filter(Boolean).map((segment) => [segment.group_id, segment])
      : [],
  );
  const normalizedFilters = {
    age_group: compactString(filters.age_group),
    occupation_group: compactString(filters.occupation_group),
    style_key: compactString(filters.style_key),
    province: compactString(filters.province),
    sex: compactString(filters.sex),
  };
  const matched = members.filter((member) => memberMatchesFilters(member, normalizedFilters));
  const safeLimit = toPositiveInt(limit, 24, 100);
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0));
  const facets = {
    age_groups: new Map(),
    occupation_groups: new Map(),
    style_keys: new Map(),
    provinces: new Map(),
    sexes: new Map(),
  };
  for (const member of members) {
    increment(facets.age_groups, member.age_group);
    increment(facets.occupation_groups, member.occupation_group);
    increment(facets.style_keys, member.style_key);
    increment(facets.provinces, member.province);
    increment(facets.sexes, member.sex);
  }

  return {
    cohort_id: artifact.cohort_id || DEFAULT_FIXED_COHORT_ID,
    cohort_metadata: artifact.metadata || {},
    population_profile_metadata: populationProfile?.metadata || null,
    total_members: members.length,
    matched_count: matched.length,
    limit: safeLimit,
    offset: safeOffset,
    filters: normalizedFilters,
    facets: {
      age_groups: buildFacet(facets.age_groups),
      occupation_groups: buildFacet(facets.occupation_groups),
      style_keys: buildFacet(facets.style_keys),
      provinces: buildFacet(facets.provinces),
      sexes: buildFacet(facets.sexes),
    },
    members: matched.slice(safeOffset, safeOffset + safeLimit).map((member) => publicMember(member, populationByGroup)),
  };
}

module.exports = {
  DEFAULT_FIXED_COHORT_ID,
  DEFAULT_FIXED_COHORT_FILENAME,
  DEFAULT_FIXED_COHORT_PATH,
  DEFAULT_POPULATION_SEGMENTS_FILENAME,
  DEFAULT_POPULATION_SEGMENTS_PATH,
  loadFixedCohort,
  loadPopulationSegments,
  listFixedCohortMembers,
  hasFixedCohort,
  hasPopulationSegments,
};
