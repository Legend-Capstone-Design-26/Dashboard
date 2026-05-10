const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  deriveFallbackOverlay,
  normalizeOverlay,
  generateOverlay,
  OVERLAYS_FILE,
  upsertOverlayRecord,
  loadOverlayStore,
} = require("../personas/overlay-generator");
const { generateSessionEvents, makeBase, listPersonas } = require("../personas");

const overlaysFilePath = OVERLAYS_FILE;

function buildPersona() {
  return {
    id: "review-persona",
    group_id: "30s__office_worker__review_oriented",
    normalized_persona: {
      style_key: "review_oriented",
      personality_traits: ["detail-oriented"],
      decision_rules: ["Check reviews before cart"],
    },
    state_model: {
      states: {
        review_sort: { transitions: [{ to: "cart_entry", weight: 0.4 }, { to: "exit", weight: 0.6 }] },
        trust_check: { transitions: [{ to: "cart_entry", weight: 0.5 }, { to: "exit", weight: 0.5 }] },
      },
    },
  };
}

function buildExperiment() {
  return {
    key: "exp_checkout_cta_v1",
    hypothesis: "리뷰와 신뢰 문구를 강화하면 결제 진입이 늘어난다",
    goals: ["checkout_complete"],
    variants: {
      A: [{ selector: ".cta", actions: [{ type: "set_text", value: "구매하기" }] }],
      B: [{ selector: ".review", actions: [{ type: "set_text", value: "후기 2,341개로 검증" }] }],
    },
  };
}

test("overlay fallback generator proposes review-oriented transition boosts", () => {
  const overlay = deriveFallbackOverlay({
    experiment: buildExperiment(),
    persona: buildPersona(),
  });

  assert.equal(typeof overlay.reason_summary, "string");
  assert.equal(overlay.edge_weight_multipliers["review_sort->cart_entry"] > 1, true);
  assert.equal(overlay.edge_weight_multipliers["trust_check->cart_entry"] > 1, true);
});

test("overlay normalization drops unknown edges and clamps multipliers", () => {
  const overlay = normalizeOverlay({
    reason_summary: "test",
    edge_weight_multipliers: {
      "review_sort->cart_entry": 2.2,
      "invalid->edge": 1.4,
      "trust_check->cart_entry": 0.4,
    },
  }, buildPersona());

  assert.equal(overlay.edge_weight_multipliers["review_sort->cart_entry"], 1.6);
  assert.equal(overlay.edge_weight_multipliers["trust_check->cart_entry"], 0.6);
  assert.equal("invalid->edge" in overlay.edge_weight_multipliers, false);
});

test("overlay generator returns deterministic fallback through mock llm client", async () => {
  const result = await generateOverlay({
    experiment: buildExperiment(),
    persona: buildPersona(),
    llmClient: {
      mode: "mock",
      async rewrite({ draftAnswer }) {
        return { ok: true, text: draftAnswer, reason: "mock_mode" };
      },
    },
  });

  assert.equal(result.provider, "mock");
  assert.equal(result.overlay.edge_weight_multipliers["review_sort->cart_entry"] > 1, true);
});

test("generated overlay records are persisted for runtime lookup", async () => {
  const original = fs.existsSync(overlaysFilePath)
    ? fs.readFileSync(overlaysFilePath, "utf8")
    : null;

  try {
    if (fs.existsSync(overlaysFilePath)) fs.unlinkSync(overlaysFilePath);
    const generated = await generateOverlay({
      experiment: buildExperiment(),
      persona: buildPersona(),
      llmClient: {
        mode: "mock",
        async rewrite({ draftAnswer }) {
          return { ok: true, text: draftAnswer, reason: "mock_mode" };
        },
      },
    });
    const record = upsertOverlayRecord({ experiment: buildExperiment(), persona: buildPersona(), generated });
    const store = loadOverlayStore();
    assert.equal(store.overlays.length, 1);
    assert.equal(store.overlays[0].overlay_id, record.overlay_id);
    assert.equal(store.overlays[0].edge_weight_multipliers["review_sort->cart_entry"] > 1, true);
  } finally {
    if (original == null) {
      if (fs.existsSync(overlaysFilePath)) fs.unlinkSync(overlaysFilePath);
    } else {
      fs.writeFileSync(overlaysFilePath, original, "utf8");
    }
  }
});

test("runtime persona runner applies persisted overlay multipliers", async () => {
  const original = fs.existsSync(overlaysFilePath)
    ? fs.readFileSync(overlaysFilePath, "utf8")
    : null;

  try {
    if (fs.existsSync(overlaysFilePath)) fs.unlinkSync(overlaysFilePath);
    const runtimePersona = listPersonas().find((persona) => persona.normalized_persona?.style_key === "review_oriented");
    assert.ok(runtimePersona, "expected a generated review-oriented persona");
    const generated = {
      provider: "mock",
      reason: "test",
      overlay: {
        reason_summary: "force review cart path",
        edge_weight_multipliers: {
          "review_sort->cart_entry": 1.6,
          "review_sort->exit": 0.6,
        },
      },
    };
    upsertOverlayRecord({ experiment: buildExperiment(), persona: runtimePersona, generated });

    const base = makeBase({ site_id: "ab-sample", anon_user_id: "u_overlay", session_id: "s_overlay" });
    const sequence = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
    let cursor = 0;
    const events = generateSessionEvents({
      personaId: runtimePersona.id,
      base,
      startTs: 1000,
      rng: () => sequence[cursor++ % sequence.length],
      experimentKey: "exp_checkout_cta_v1",
      variant: "B",
      experimentGoals: ["checkout_complete"],
    });

    assert.equal(events.some((event) => event.props?.synthetic_transition_id === "review_sort->cart_entry"), true);
  } finally {
    if (original == null) {
      if (fs.existsSync(overlaysFilePath)) fs.unlinkSync(overlaysFilePath);
    } else {
      fs.writeFileSync(overlaysFilePath, original, "utf8");
    }
  }
});
