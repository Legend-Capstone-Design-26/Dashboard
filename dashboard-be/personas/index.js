const fs = require("fs");
const path = require("path");
const { listOverlayRecords } = require("./overlay-generator");

function loadCatalog() {
  const generatedPath = path.join(__dirname, "catalog.generated.json");
  if (fs.existsSync(generatedPath)) {
    return JSON.parse(fs.readFileSync(generatedPath, "utf8"));
  }
  return require("./catalog.json");
}

const catalog = loadCatalog();

function loadGeneratedOverlayMap() {
  const map = new Map();
  for (const record of listOverlayRecords()) {
    if (!record || !record.experiment_key || !record.variant) continue;
    const key = `${record.experiment_key}::${record.variant}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listPersonas() {
  return catalog.personas.map((persona) => clone(persona));
}

function getPersona(personaId) {
  return catalog.personas.find((persona) => persona.id === personaId) || null;
}

function normalizeWeight(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function samplePersonaId(rng) {
  const random = typeof rng === "function" ? rng : Math.random;
  const personas = catalog.personas;
  const totalWeight = personas.reduce((sum, persona) => sum + normalizeWeight(persona.weight), 0);
  if (totalWeight <= 0) return personas[0]?.id || null;

  let cursor = random() * totalWeight;
  for (const persona of personas) {
    cursor -= normalizeWeight(persona.weight);
    if (cursor <= 0) return persona.id;
  }

  return personas[personas.length - 1]?.id || null;
}

function makeBase(identity) {
  const defaults = catalog.defaults || {};
  const baseUrl = String(identity?.base_url || defaults.base_url || "http://localhost:3000/");

  return {
    schema_version: 1,
    app_id: defaults.app_id || "ux-stream-sim",
    site_id: String(identity?.site_id || defaults.site_id || "ab-sample"),
    anon_user_id: String(identity?.anon_user_id || ""),
    session_id: String(identity?.session_id || ""),
    url: baseUrl,
    referrer: null,
    user_agent: String(identity?.user_agent || "ux-stream-sim"),
    lang: defaults.lang || "ko-KR",
    screen: clone(defaults.screen || { w: 1920, h: 1080 }),
    viewport: clone(defaults.viewport || { w: 1200, h: 800 })
  };
}

function cloneProps(value) {
  return value && typeof value === "object" ? clone(value) : {};
}

function sampleDelay(config, random) {
  if (!config || typeof config !== "object") return 0;
  if (config.type === "range") {
    const min = Number(config.min);
    const max = Number(config.max);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return Math.round(min + ((max - min) * random()));
    }
  }
  const value = Number(config.value);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function buildExperimentMetadata(input) {
  const experimentKey = String(input?.experimentKey || "").trim();
  const variant = String(input?.variant || "").trim();
  if (!experimentKey || !variant) return { experiments: [], experimentGoals: null };
  return {
    experiments: [{ key: experimentKey, variant, version: input?.experimentVersion ?? null }],
    experimentGoals: Array.isArray(input?.experimentGoals) && input.experimentGoals.length
      ? input.experimentGoals.slice()
      : ["checkout_complete"],
  };
}

function emitEvent({ base, persona, ts, event, runnerType, stateId, transitionId, experimentMeta }) {
  if (!event || typeof event !== "object") return null;
  const props = {
    ...cloneProps(event.props),
    synthetic_state_id: stateId || null,
    synthetic_transition_id: transitionId || null,
    synthetic_state_name: stateId || null,
    synthetic_transition_name: transitionId || null,
  };
  if (String(event.event_name || "") === "click" && props.element_id && !props.element_selector) {
    props.element_selector = `#${String(props.element_id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  }
  if (String(event.event_name || "") === "page_view" && event.path) {
    props.synthetic_page_path = String(event.path);
  }
  return {
    ...base,
    actor_type: "synthetic_agent",
    persona_id: persona.id,
    runner_type: runnerType,
    ...(experimentMeta.experiments.length ? { experiments: clone(experimentMeta.experiments) } : {}),
    ...(experimentMeta.experimentGoals ? { experiment_goals: clone(experimentMeta.experimentGoals) } : {}),
    event_name: String(event.event_name || ""),
    ts,
    path: String(event.path || "/"),
    props,
  };
}

function resolveOverlay(persona, input) {
  const variant = String(input?.variant || "").trim();
  const experimentKey = String(input?.experimentKey || "").trim();
  const overlayRecordMap = loadGeneratedOverlayMap();
  const external = overlayRecordMap.get(`${experimentKey}::${variant}`) || [];
  const externalMatches = external.filter((record) => {
    if (record.persona_id && record.persona_id === persona.id) return true;
    if (record.group_id && record.group_id === persona.group_id) return true;
    if (record.style_key && record.style_key === persona?.normalized_persona?.style_key) return true;
    return false;
  });

  const merged = { edge_weight_multipliers: {} };
  for (const record of externalMatches) {
    Object.assign(merged.edge_weight_multipliers, record.edge_weight_multipliers || {});
  }

  if (!variant) return Object.keys(merged.edge_weight_multipliers).length ? merged : null;
  const overlays = persona?.state_model?.experiment_overlays;
  const byExperiment = overlays && typeof overlays === "object"
    ? ((experimentKey && overlays[experimentKey]) || overlays.__default__ || null)
    : null;
  const builtIn = byExperiment && typeof byExperiment === "object" ? (byExperiment[variant] || null) : null;
  const mergedBuiltIn = {
    ...(builtIn || {}),
    edge_weight_multipliers: {
      ...((builtIn && builtIn.edge_weight_multipliers) || {}),
      ...merged.edge_weight_multipliers,
    },
  };
  return Object.keys(mergedBuiltIn.edge_weight_multipliers || {}).length ? mergedBuiltIn : builtIn;
}

function applyTransitionWeights(transitions, overlay) {
  const list = Array.isArray(transitions) ? transitions.map((transition) => ({ ...transition })) : [];
  const multipliers = overlay?.edge_weight_multipliers && typeof overlay.edge_weight_multipliers === "object"
    ? overlay.edge_weight_multipliers
    : {};

  return list.map((transition) => {
    const key = `${transition.from || ""}->${transition.to || ""}`;
    const baseWeight = Number(transition.weight);
    const normalizedWeight = Number.isFinite(baseWeight) && baseWeight > 0 ? baseWeight : 0;
    const multiplier = Number(multipliers[key]);
    const nextWeight = Number.isFinite(multiplier) && multiplier > 0 ? normalizedWeight * multiplier : normalizedWeight;
    return {
      ...transition,
      weight: nextWeight,
    };
  }).filter((transition) => Number(transition.weight) > 0 && transition.to);
}

function sampleTransition(transitions, random) {
  const total = transitions.reduce((sum, transition) => sum + Number(transition.weight || 0), 0);
  if (!(total > 0)) return null;
  let cursor = random() * total;
  for (const transition of transitions) {
    cursor -= Number(transition.weight || 0);
    if (cursor <= 0) return transition;
  }
  return transitions[transitions.length - 1] || null;
}

function runTimelinePersona(persona, input) {
  const random = typeof input?.rng === "function" ? input.rng : Math.random;
  const base = input?.base || makeBase(input || {});
  const startTs = typeof input?.startTs === "number" ? input.startTs : Date.now();
  const experimentMeta = buildExperimentMetadata(input);

  let ts = startTs;
  const events = [];
  for (const step of persona.timeline || []) {
    const afterMs = Number(step.after_ms);
    ts += Number.isFinite(afterMs) ? afterMs : 0;

    const probability = Number(step.probability);
    if (Number.isFinite(probability) && probability >= 0 && probability < 1 && random() > probability) {
      continue;
    }

    const emitted = emitEvent({
      base,
      persona,
      ts,
      event: step,
      runnerType: "timeline",
      stateId: null,
      transitionId: null,
      experimentMeta,
    });
    if (emitted) events.push(emitted);
  }

  return events;
}

function runStateTransitionPersona(persona, input) {
  const random = typeof input?.rng === "function" ? input.rng : Math.random;
  const base = input?.base || makeBase(input || {});
  const stateModel = persona?.state_model || {};
  const states = stateModel.states || {};
  const terminalStates = new Set(Array.isArray(stateModel.terminal_states) ? stateModel.terminal_states : []);
  const maxSteps = Math.max(1, Number(stateModel.max_steps) || 12);
  const experimentMeta = buildExperimentMetadata(input);
  const overlay = resolveOverlay(persona, input);
  let currentStateId = String(stateModel.entry_state || "").trim();
  let ts = typeof input?.startTs === "number" ? input.startTs : Date.now();
  const events = [];
  let lastTransitionId = null;

  for (let stepIndex = 0; stepIndex < maxSteps && currentStateId; stepIndex += 1) {
    const state = states[currentStateId];
    if (!state) break;
    ts += sampleDelay(state.after_ms, random);

    const emitted = emitEvent({
      base,
      persona,
      ts,
      event: state.emit,
      runnerType: "state_transition",
      stateId: currentStateId,
      transitionId: lastTransitionId,
      experimentMeta,
    });
    if (emitted) events.push(emitted);

    if (terminalStates.has(currentStateId)) break;

    const preparedTransitions = applyTransitionWeights(
      (state.transitions || []).map((transition) => ({ ...transition, from: currentStateId })),
      overlay,
    );
    const chosen = sampleTransition(preparedTransitions, random);
    if (!chosen) break;
    const nextStateId = String(chosen.to || "").trim();
    const nextState = states[nextStateId];
    const currentPath = String(state.emit?.path || "/");
    const nextPath = String(nextState?.emit?.path || currentPath || "/");
    const navigationEvent = emitEvent({
      base,
      persona,
      ts: ts + 1,
      event: {
        event_name: "navigation",
        path: nextPath,
        props: {
          from_state: currentStateId,
          to_state: nextStateId,
          from_path: currentPath,
          to_path: nextPath,
        },
      },
      runnerType: "state_transition",
      stateId: currentStateId,
      transitionId: `${currentStateId}->${nextStateId}`,
      experimentMeta,
    });
    if (navigationEvent) events.push(navigationEvent);
    lastTransitionId = `${currentStateId}->${nextStateId}`;
    currentStateId = nextStateId;
  }

  return events;
}

function generateSessionEvents(input) {
  const persona = getPersona(input?.personaId);
  if (!persona) {
    throw new Error(`unknown persona: ${String(input?.personaId || "")}`);
  }

  if (persona.runner_type === "state_transition" && persona.state_model) {
    return runStateTransitionPersona(persona, input);
  }
  return runTimelinePersona(persona, input);
}

module.exports = {
  catalog,
  listPersonas,
  getPersona,
  samplePersonaId,
  makeBase,
  generateSessionEvents
};
