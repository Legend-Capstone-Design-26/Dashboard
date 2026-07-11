const { listPersonas } = require("./index");
const { generateOverlay } = require("./overlay-generator");

const OVERLAY_GENERATION_CONCURRENCY = 4;

function safeString(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeFilters(filters = {}) {
  return {
    age_group: safeString(filters.age_group),
    occupation_group: safeString(filters.occupation_group),
    style_key: safeString(filters.style_key),
    province: safeString(filters.province),
    sex: safeString(filters.sex),
  };
}

function matchesFilters(member, filters) {
  if (filters.age_group && member.age_group !== filters.age_group) return false;
  if (filters.occupation_group && member.occupation_group !== filters.occupation_group) return false;
  if (filters.style_key && member.style_key !== filters.style_key) return false;
  if (filters.province && member.province !== filters.province) return false;
  if (filters.sex && member.sex !== filters.sex) return false;
  return true;
}

function personaGroupId(persona) {
  return persona.group_id || [
    persona.age_group || persona.normalized_persona?.age_group || "unknown",
    persona.occupation_group || persona.normalized_persona?.occupation_group || "unknown",
    persona.style_key || persona.normalized_persona?.style_key || "unknown",
  ].join("__");
}

function buildPersonaIndexes(personas) {
  const indexes = {
    personas: Array.isArray(personas) ? personas.filter(Boolean) : [],
    byGroupId: new Map(),
    byStyleKey: new Map(),
    byAgeGroup: new Map(),
  };
  for (const persona of indexes.personas) {
    const groupId = personaGroupId(persona);
    const styleKey = persona.style_key || persona.normalized_persona?.style_key || "unknown";
    const ageGroup = persona.age_group || persona.normalized_persona?.age_group || "unknown";
    if (!indexes.byGroupId.has(groupId)) indexes.byGroupId.set(groupId, []);
    if (!indexes.byStyleKey.has(styleKey)) indexes.byStyleKey.set(styleKey, []);
    if (!indexes.byAgeGroup.has(ageGroup)) indexes.byAgeGroup.set(ageGroup, []);
    indexes.byGroupId.get(groupId).push(persona);
    indexes.byStyleKey.get(styleKey).push(persona);
    indexes.byAgeGroup.get(ageGroup).push(persona);
  }
  return indexes;
}

function hashNumber(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickDeterministic(list, key) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[hashNumber(key) % list.length] || list[0] || null;
}

function pickPersonaTemplate(member, indexes, cohortId) {
  const memberKey = member.uuid || member.row_idx || member.group_id || "member";
  const hashKey = `${cohortId || "fixed_10k_cohort"}:${memberKey}`;
  const exactGroupMatch = pickDeterministic(indexes.byGroupId.get(member.group_id), `${hashKey}:group`);
  if (exactGroupMatch) return exactGroupMatch;
  const styleMatch = pickDeterministic(indexes.byStyleKey.get(member.style_key), `${hashKey}:style`);
  if (styleMatch) return styleMatch;
  const ageMatch = pickDeterministic(indexes.byAgeGroup.get(member.age_group), `${hashKey}:age`);
  if (ageMatch) return ageMatch;
  return pickDeterministic(indexes.personas, `${hashKey}:fallback`);
}

function roundMetric(value, digits = 6) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function normalizeTransitions(transitions) {
  const list = Array.isArray(transitions) ? transitions.filter(Boolean) : [];
  const total = list.reduce((sum, transition) => {
    const weight = Number(transition.weight);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 0);
  }, 0);
  if (total <= 0) return [];
  return list
    .map((transition) => {
      const weight = Number(transition.weight);
      const normalizedWeight = Number.isFinite(weight) && weight > 0 ? weight : 0;
      return {
        to: safeString(transition.to),
        probability: normalizedWeight / total,
        weight: normalizedWeight,
      };
    })
    .filter((transition) => transition.to && transition.probability > 0);
}

function mapMembersToPersonas({ members, personas, cohortId }) {
  const indexes = buildPersonaIndexes(personas);
  return (Array.isArray(members) ? members : [])
    .map((member) => ({ member, persona: pickPersonaTemplate(member, indexes, cohortId) }))
    .filter((item) => item.member && item.persona?.state_model?.states);
}

function summarizeMappedCohortMembers({ artifact, filters = {}, personas = listPersonas() }) {
  const members = Array.isArray(artifact?.members) ? artifact.members.filter(Boolean) : [];
  const normalizedFilters = normalizeFilters(filters);
  const matchedMembers = members.filter((member) => matchesFilters(member, normalizedFilters));
  const mappedMembers = mapMembersToPersonas({ members: matchedMembers, personas, cohortId: artifact?.cohort_id });
  return {
    total_members: members.length,
    matched_count: matchedMembers.length,
    mapped_agent_count: mappedMembers.length,
    filters: normalizedFilters,
  };
}

function aggregateBaselineTransitions(mappedMembers) {
  const edgeSums = new Map();
  const stateCounts = new Map();
  const personaCounts = new Map();

  for (const { persona } of mappedMembers) {
    personaCounts.set(persona.id, (personaCounts.get(persona.id) || 0) + 1);
    const states = persona.state_model?.states && typeof persona.state_model.states === "object" ? persona.state_model.states : {};
    for (const [from, state] of Object.entries(states)) {
      const normalized = normalizeTransitions(state?.transitions);
      if (normalized.length === 0) continue;
      stateCounts.set(from, (stateCounts.get(from) || 0) + 1);
      for (const transition of normalized) {
        const edgeId = `${from}->${transition.to}`;
        edgeSums.set(edgeId, (edgeSums.get(edgeId) || 0) + transition.probability);
      }
    }
  }

  const transitions = Array.from(edgeSums.entries())
    .map(([edge_id, probabilitySum]) => {
      const [from, to] = edge_id.split("->");
      const denominator = Number(stateCounts.get(from)) || 0;
      const probability = denominator > 0 ? probabilitySum / denominator : 0;
      return {
        edge_id,
        from,
        to,
        probability: roundMetric(probability),
        agent_count: denominator,
      };
    })
    .filter((transition) => transition.probability > 0)
    .sort((left, right) => left.from.localeCompare(right.from) || right.probability - left.probability || left.to.localeCompare(right.to));

  const representativePersonaId = Array.from(personaCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || null;

  return {
    transitions,
    state_count: stateCounts.size,
    edge_count: transitions.length,
    mapped_agent_count: mappedMembers.length,
    representative_persona_id: representativePersonaId,
  };
}

function applyMultipliersToBaseline(transitions, multipliers = {}) {
  const byFrom = new Map();
  for (const transition of Array.isArray(transitions) ? transitions : []) {
    const multiplier = Number(multipliers[transition.edge_id]);
    const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
    const raw = (Number(transition.probability) || 0) * safeMultiplier;
    if (!byFrom.has(transition.from)) byFrom.set(transition.from, []);
    byFrom.get(transition.from).push({ ...transition, multiplier: safeMultiplier, changed_raw_probability: raw });
  }

  return Array.from(byFrom.values()).flatMap((group) => {
    const total = group.reduce((sum, transition) => sum + transition.changed_raw_probability, 0);
    return group.map((transition) => {
      const changed = total > 0 ? transition.changed_raw_probability / total : 0;
      const baseline = Number(transition.probability) || 0;
      return {
        edge_id: transition.edge_id,
        from: transition.from,
        to: transition.to,
        baseline_probability: roundMetric(baseline),
        changed_probability: roundMetric(changed),
        delta: roundMetric(changed - baseline),
        multiplier: roundMetric(transition.multiplier, 3),
        agent_count: transition.agent_count,
      };
    });
  }).sort((left, right) => left.from.localeCompare(right.from) || Math.abs(right.delta) - Math.abs(left.delta) || left.to.localeCompare(right.to));
}

function normalizeChangedTransitionsForPersona(persona, multipliers = {}) {
  const states = persona?.state_model?.states && typeof persona.state_model.states === "object" ? persona.state_model.states : {};
  const out = [];
  for (const [from, state] of Object.entries(states)) {
    const baseline = normalizeTransitions(state?.transitions);
    const adjusted = baseline.map((transition) => {
      const edgeId = `${from}->${transition.to}`;
      const multiplier = Number(multipliers[edgeId]);
      const safeMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
      return {
        edge_id: edgeId,
        from,
        to: transition.to,
        baseline_probability: transition.probability,
        multiplier: safeMultiplier,
        raw: transition.probability * safeMultiplier,
      };
    });
    const total = adjusted.reduce((sum, transition) => sum + transition.raw, 0);
    if (total <= 0) continue;
    for (const transition of adjusted) {
      out.push({
        edge_id: transition.edge_id,
        from: transition.from,
        to: transition.to,
        changed_probability: transition.raw / total,
        multiplier: transition.multiplier,
      });
    }
  }
  return out;
}

async function buildOverlayByPersona({ mappedMembers, experiment, llmClient }) {
  const byPersona = new Map();
  for (const { persona } of mappedMembers) {
    if (!byPersona.has(persona.id)) byPersona.set(persona.id, { persona, count: 0 });
    byPersona.get(persona.id).count += 1;
  }

  const groups = Array.from(byPersona.values());
  const overlays = new Map();
  const interpretations = [];

  for (let start = 0; start < groups.length; start += OVERLAY_GENERATION_CONCURRENCY) {
    const chunk = groups.slice(start, start + OVERLAY_GENERATION_CONCURRENCY);
    const generatedChunk = await Promise.all(chunk.map(async ({ persona, count }) => {
      const generated = await generateOverlay({ experiment, persona, llmClient });
      return { persona, count, generated };
    }));
    for (const { persona, count, generated } of generatedChunk) {
      const multipliers = generated.overlay?.edge_weight_multipliers || {};
      overlays.set(persona.id, { generated, multipliers });
      interpretations.push({
        persona_id: persona.id || null,
        group_id: persona.group_id || null,
        group_label: persona.group_label || persona.description || persona.id || null,
        agent_count: count,
        provider: generated.provider,
        provider_reason: generated.reason,
        reason_summary: generated.overlay?.reason_summary || "B안 변경사항을 기준으로 전이 보정안을 생성했습니다.",
        changed_edge_count: Object.keys(multipliers).length,
      });
    }
  }
  interpretations.sort((left, right) => right.agent_count - left.agent_count || String(left.persona_id).localeCompare(String(right.persona_id)));
  return { overlays, interpretations };
}

function aggregateChangedTransitions(mappedMembers, overlayByPersona, baselineTransitions) {
  const baselineByEdge = new Map((Array.isArray(baselineTransitions) ? baselineTransitions : []).map((transition) => [transition.edge_id, transition]));
  const edgeSums = new Map();
  const edgeMultiplierSums = new Map();
  const edgeCounts = new Map();

  for (const { persona } of mappedMembers) {
    const multipliers = overlayByPersona.get(persona.id)?.multipliers || {};
    const changed = normalizeChangedTransitionsForPersona(persona, multipliers);
    for (const transition of changed) {
      edgeSums.set(transition.edge_id, (edgeSums.get(transition.edge_id) || 0) + transition.changed_probability);
      edgeMultiplierSums.set(transition.edge_id, (edgeMultiplierSums.get(transition.edge_id) || 0) + transition.multiplier);
      edgeCounts.set(transition.edge_id, (edgeCounts.get(transition.edge_id) || 0) + 1);
    }
  }

  return Array.from(edgeSums.entries())
    .map(([edge_id, probabilitySum]) => {
      const [from, to] = edge_id.split("->");
      const baseline = baselineByEdge.get(edge_id);
      const denominator = Number(baseline?.agent_count) || Number(edgeCounts.get(edge_id)) || 0;
      const changedProbability = denominator > 0 ? probabilitySum / denominator : 0;
      const baselineProbability = Number(baseline?.probability) || 0;
      const multiplierDenominator = Number(edgeCounts.get(edge_id)) || denominator;
      const multiplier = multiplierDenominator > 0 ? (Number(edgeMultiplierSums.get(edge_id)) || 0) / multiplierDenominator : 1;
      return {
        edge_id,
        from,
        to,
        baseline_probability: roundMetric(baselineProbability),
        changed_probability: roundMetric(changedProbability),
        delta: roundMetric(changedProbability - baselineProbability),
        multiplier: roundMetric(multiplier, 3),
        agent_count: denominator,
      };
    })
    .filter((transition) => transition.changed_probability > 0 || transition.baseline_probability > 0)
    .sort((left, right) => left.from.localeCompare(right.from) || Math.abs(right.delta) - Math.abs(left.delta) || left.to.localeCompare(right.to));
}

function summarizeRepresentativePersona(persona) {
  if (!persona) return null;
  return {
    id: persona.id || null,
    group_id: persona.group_id || null,
    group_label: persona.group_label || persona.description || persona.id || null,
    age_group: persona.age_group || persona.normalized_persona?.age_group || null,
    occupation_group: persona.occupation_group || persona.normalized_persona?.occupation_group || null,
    style_key: persona.style_key || persona.normalized_persona?.style_key || null,
    style_label: persona.style_label || persona.normalized_persona?.style_label || null,
  };
}

async function buildTransitionAnalysis({ artifact, experiment, filters = {}, llmClient, personas = listPersonas() }) {
  const members = Array.isArray(artifact?.members) ? artifact.members.filter(Boolean) : [];
  const normalizedFilters = normalizeFilters(filters);
  const matchedMembers = members.filter((member) => matchesFilters(member, normalizedFilters));
  if (matchedMembers.length === 0) {
    return { ok: false, status: 422, reason: "no fixed cohort members match selected filters" };
  }

  const mappedMembers = mapMembersToPersonas({ members: matchedMembers, personas, cohortId: artifact?.cohort_id });
  if (mappedMembers.length === 0) {
    return { ok: false, status: 422, reason: "matching cohort members have no usable state transition persona template" };
  }

  const baseline = aggregateBaselineTransitions(mappedMembers);
  const representativePersona = personas.find((persona) => persona.id === baseline.representative_persona_id) || mappedMembers[0]?.persona || null;
  const { overlays, interpretations } = await buildOverlayByPersona({ mappedMembers, experiment, llmClient });
  const changedTransitions = aggregateChangedTransitions(mappedMembers, overlays, baseline.transitions);
  const primaryInterpretation = interpretations[0] || null;
  const multipliers = Object.fromEntries(Array.from(overlays.entries()).flatMap(([personaId, item]) => {
    return Object.entries(item.multipliers || {}).map(([edgeId, multiplier]) => [`${personaId}:${edgeId}`, multiplier]);
  }));

  return {
    ok: true,
    cohort: {
      cohort_id: artifact?.cohort_id || "fixed_10k_cohort",
      total_members: members.length,
      matched_count: matchedMembers.length,
      mapped_agent_count: mappedMembers.length,
      filters: normalizedFilters,
    },
    representative_persona: summarizeRepresentativePersona(representativePersona),
    a_baseline: baseline,
    b_interpretation: {
      provider: primaryInterpretation?.provider || "fallback",
      provider_reason: primaryInterpretation?.provider_reason || null,
      reason_summary: primaryInterpretation?.reason_summary || "B안 변경사항을 기준으로 전이 보정안을 생성했습니다.",
      interpretation_count: interpretations.length,
      interpretations: interpretations.slice(0, 12),
    },
    edge_weight_multipliers: multipliers,
    b_changed: {
      transitions: changedTransitions,
      changed_edge_count: changedTransitions.filter((transition) => transition.multiplier !== 1 || transition.delta !== 0).length,
    },
  };
}

module.exports = {
  normalizeFilters,
  normalizeTransitions,
  mapMembersToPersonas,
  summarizeMappedCohortMembers,
  aggregateBaselineTransitions,
  applyMultipliersToBaseline,
  normalizeChangedTransitionsForPersona,
  aggregateChangedTransitions,
  buildTransitionAnalysis,
};
