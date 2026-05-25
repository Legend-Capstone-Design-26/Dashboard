import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";

let catalog;
try {
  catalog = JSON.parse(open("../personas/catalog.generated.json"));
} catch (_) {
  catalog = JSON.parse(open("../personas/catalog.json"));
}
let generatedOverlays = { overlays: [] };
try {
  generatedOverlays = JSON.parse(open("../personas/overlays.generated.json"));
} catch (_) {}
const personas = Array.isArray(catalog.personas) ? catalog.personas : [];

const BASE_URL = (__ENV.K6_BASE_URL || catalog.defaults?.base_url || "http://localhost:3000").replace(/\/$/, "");
const ENDPOINT = `${BASE_URL}${__ENV.K6_ENDPOINT_PATH || "/collect"}`;
const SITE_ID = __ENV.K6_SITE_ID || catalog.defaults?.site_id || "ab-sample";
const BASE_RATE = Math.max(1, Number(__ENV.K6_BASE_RATE || 12));
const PRE_ALLOCATED_VUS = Math.max(1, Number(__ENV.K6_PRE_ALLOCATED_VUS || 24));
const MAX_VUS = Math.max(PRE_ALLOCATED_VUS, Number(__ENV.K6_MAX_VUS || 120));
const RAMP_UP = __ENV.K6_RAMP_UP || "30s";
const STEADY = __ENV.K6_STEADY || "1m";
const RAMP_DOWN = __ENV.K6_RAMP_DOWN || "30s";
const SESSION_PAUSE_MS = Math.max(0, Number(__ENV.K6_SESSION_PAUSE_MS || 500));
const EXPERIMENT_KEY = String(__ENV.K6_EXPERIMENT_KEY || "").trim();
const VARIANT = String(__ENV.K6_VARIANT || "").trim();
const EXPERIMENT_VERSION = Number(__ENV.K6_EXPERIMENT_VERSION || 0) || null;
const EXPERIMENT_GOALS = String(__ENV.K6_EXPERIMENT_GOALS || "checkout_complete").split(",").map((item) => item.trim()).filter(Boolean);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildBase(identity) {
  return {
    schema_version: 1,
    app_id: catalog.defaults?.app_id || "ux-stream-sim",
    site_id: SITE_ID,
    anon_user_id: identity.anon_user_id,
    session_id: identity.session_id,
    url: `${BASE_URL}/`,
    referrer: null,
    user_agent: `k6-persona/${identity.persona_id}`,
    lang: catalog.defaults?.lang || "ko-KR",
    screen: clone(catalog.defaults?.screen || { w: 1920, h: 1080 }),
    viewport: clone(catalog.defaults?.viewport || { w: 1200, h: 800 })
  };
}

function experimentMeta() {
  if (!EXPERIMENT_KEY || !VARIANT) return { experiments: [], experiment_goals: null };
  return {
    experiments: [{ key: EXPERIMENT_KEY, variant: VARIANT, version: EXPERIMENT_VERSION }],
    experiment_goals: EXPERIMENT_GOALS,
  };
}

function sampleDelay(config) {
  if (!config || typeof config !== "object") return 0;
  if (config.type === "range") {
    const min = Number(config.min);
    const max = Number(config.max);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return Math.round(min + ((max - min) * Math.random()));
    }
  }
  const value = Number(config.value);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function applyTransitionWeights(stateId, transitions, persona) {
  const list = Array.isArray(transitions) ? transitions.map((transition) => ({ ...transition })) : [];
  const overlaySet = persona?.state_model?.experiment_overlays || {};
  const overlay = ((EXPERIMENT_KEY && overlaySet[EXPERIMENT_KEY]) || overlaySet.__default__ || {})[VARIANT] || {};
  const external = (Array.isArray(generatedOverlays.overlays) ? generatedOverlays.overlays : []).filter((item) =>
    item && item.experiment_key === EXPERIMENT_KEY && item.variant === VARIANT && (
      item.persona_id === persona.id || item.group_id === persona.group_id || item.style_key === persona?.normalized_persona?.style_key
    )
  );
  const multipliers = {
    ...(overlay.edge_weight_multipliers || {}),
    ...external.reduce((acc, item) => Object.assign(acc, item.edge_weight_multipliers || {}), {}),
  };
  return list.map((transition) => {
    const key = `${stateId}->${transition.to}`;
    const baseWeight = Number(transition.weight);
    const weight = Number.isFinite(baseWeight) && baseWeight > 0 ? baseWeight : 0;
    const multiplier = Number(multipliers[key]);
    return {
      ...transition,
      weight: Number.isFinite(multiplier) && multiplier > 0 ? weight * multiplier : weight,
    };
  }).filter((transition) => Number(transition.weight) > 0 && transition.to);
}

function chooseTransition(transitions) {
  const total = transitions.reduce((sum, transition) => sum + Number(transition.weight || 0), 0);
  if (!(total > 0)) return null;
  let cursor = Math.random() * total;
  for (const transition of transitions) {
    cursor -= Number(transition.weight || 0);
    if (cursor <= 0) return transition;
  }
  return transitions[transitions.length - 1] || null;
}

function emitEvent(base, persona, ts, event, runnerType, stateId, transitionId) {
  const meta = experimentMeta();
  const props = {
    ...clone(event.props || {}),
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
    ...(meta.experiments.length ? { experiments: meta.experiments } : {}),
    ...(meta.experiment_goals ? { experiment_goals: meta.experiment_goals } : {}),
    event_name: String(event.event_name || ""),
    ts,
    path: String(event.path || "/"),
    props,
  };
}

function generateTimelineEvents(persona, startTs, base) {
  let ts = startTs;
  const events = [];
  for (const step of persona.timeline || []) {
    const afterMs = Number(step.after_ms);
    ts += Number.isFinite(afterMs) ? afterMs : 0;

    const probability = Number(step.probability);
    if (Number.isFinite(probability) && probability >= 0 && probability < 1 && Math.random() > probability) {
      continue;
    }

    events.push(emitEvent(base, persona, ts, step, "timeline", null, null));
  }
  return events;
}

function generateStateTransitionEvents(persona, startTs, base) {
  const stateModel = persona.state_model || {};
  const states = stateModel.states || {};
  const terminalStates = new Set(Array.isArray(stateModel.terminal_states) ? stateModel.terminal_states : []);
  const maxSteps = Math.max(1, Number(stateModel.max_steps) || 12);
  let currentStateId = String(stateModel.entry_state || "").trim();
  let ts = startTs;
  let lastTransitionId = null;
  const events = [];

  for (let index = 0; index < maxSteps && currentStateId; index += 1) {
    const state = states[currentStateId];
    if (!state) break;
    ts += sampleDelay(state.after_ms);
    events.push(emitEvent(base, persona, ts, state.emit || {}, "state_transition", currentStateId, lastTransitionId));
    if (terminalStates.has(currentStateId)) break;
    const transitions = applyTransitionWeights(currentStateId, state.transitions || [], persona);
    const chosen = chooseTransition(transitions);
    if (!chosen) break;
    const nextStateId = String(chosen.to || "").trim();
    const nextState = states[nextStateId];
    const currentPath = String(state.emit?.path || "/");
    const nextPath = String(nextState?.emit?.path || currentPath || "/");
    events.push(emitEvent(base, persona, ts + 1, {
      event_name: "navigation",
      path: nextPath,
      props: {
        from_state: currentStateId,
        to_state: nextStateId,
        from_path: currentPath,
        to_path: nextPath,
      },
    }, "state_transition", currentStateId, `${currentStateId}->${nextStateId}`));
    lastTransitionId = `${currentStateId}->${nextStateId}`;
    currentStateId = nextStateId;
  }

  return events;
}

function generateEvents(persona, startTs) {
  const base = buildBase({
    anon_user_id: `k6_u_${exec.vu.idInTest}_${exec.scenario.iterationInTest}`,
    session_id: `k6_s_${persona.id}_${exec.vu.idInTest}_${exec.scenario.iterationInTest}`,
    persona_id: persona.id
  });

  if (persona.runner_type === "state_transition" && persona.state_model) {
    return generateStateTransitionEvents(persona, startTs, base);
  }
  return generateTimelineEvents(persona, startTs, base);
}

function weightedTarget(weight) {
  return Math.max(1, Math.round(BASE_RATE * weight));
}

function preAllocatedFor(weight) {
  return Math.max(1, Math.round(PRE_ALLOCATED_VUS * weight));
}

function maxVusFor(weight) {
  return Math.max(preAllocatedFor(weight), Math.round(MAX_VUS * weight));
}

const scenarios = {};
for (const persona of personas) {
  const weight = Number(persona.weight) || 0;
  scenarios[persona.id] = {
    executor: "ramping-arrival-rate",
    exec: "runPersonaScenario",
    timeUnit: "1s",
    startRate: 1,
    preAllocatedVUs: preAllocatedFor(weight),
    maxVUs: maxVusFor(weight),
    stages: [
      { target: weightedTarget(weight), duration: RAMP_UP },
      { target: weightedTarget(weight), duration: STEADY },
      { target: 0, duration: RAMP_DOWN }
    ],
    tags: {
      persona: persona.id,
      kind: "collect"
    }
  };
}

export const options = {
  scenarios,
  thresholds: {
    "http_req_failed{kind:collect}": ["rate<0.05"],
    "http_req_duration{kind:collect}": ["p(95)<1500"]
  }
};

export function runPersonaScenario() {
  const persona = personas.find((item) => item.id === exec.scenario.name);
  if (!persona) {
    throw new Error(`unknown scenario persona: ${exec.scenario.name}`);
  }

  const response = http.post(
    ENDPOINT,
    JSON.stringify({ events: generateEvents(persona, Date.now()) }),
    {
      headers: { "content-type": "application/json" },
      tags: { persona: persona.id, kind: "collect" },
      timeout: "30s"
    }
  );

  check(response, {
    "collect returns 200": (res) => res.status === 200,
    "collect acknowledges events": (res) => {
      try {
        const body = JSON.parse(res.body || "{}");
        return body.ok === true && Number(body.received) > 0;
      } catch {
        return false;
      }
    }
  });

  sleep(SESSION_PAUSE_MS / 1000);
}

export function handleSummary(data) {
  return {
    "load/k6-summary.json": JSON.stringify(
      {
        generated_at: Date.now(),
        endpoint: ENDPOINT,
        site_id: SITE_ID,
        scenarios: Object.keys(scenarios),
        metrics: data.metrics
      },
      null,
      2
    )
  };
}
