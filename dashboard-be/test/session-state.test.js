const test = require("node:test");
const assert = require("node:assert/strict");

const { mergeSessionState, extractVariantAssignments, PATH_SEQUENCE_CAP } = require("../services/analytics/session-state");

test("mergeSessionState rolls forward key session fields", () => {
  const first = mergeSessionState(null, {
    site_id: "legend-ecommerce",
    session_id: "s1",
    anon_user_id: "u1",
    ts: 1000,
    path: "/product/1",
    event_name: "page_view",
    ui_variant: "U",
    experiments: [{ key: "exp_checkout_cta_v1", variant: "B", version: 1 }],
    props: {},
  });

  const second = mergeSessionState(first, {
    site_id: "legend-ecommerce",
    session_id: "s1",
    anon_user_id: "u1",
    ts: 1200,
    path: "/checkout",
    event_name: "checkout_start",
    props: {},
  });

  assert.equal(second.event_count, 2);
  assert.equal(second.page_view_count, 1);
  assert.equal(second.checkout_started, true);
  assert.equal(second.max_step, "checkout");
});

test("extractVariantAssignments maps experiment metadata into redis assignment writes", () => {
  const assignments = extractVariantAssignments({
    site_id: "legend-ecommerce",
    anon_user_id: "u1",
    experiments: [
      { key: "exp_checkout_cta_v1", variant: "B", version: 3 },
      { key: "exp_home_cta_v1", variant: "A" },
    ],
  });

  assert.deepEqual(assignments, [
    { siteId: "legend-ecommerce", anonUserId: "u1", experimentKey: "exp_checkout_cta_v1", variant: "B", version: 3 },
    { siteId: "legend-ecommerce", anonUserId: "u1", experimentKey: "exp_home_cta_v1", variant: "A", version: null },
  ]);
});

test("mergeSessionState preserves ordered repeated path_sequence while keeping paths compact", () => {
  let state = null;
  for (const path of ["/a", "/a", "/b", "/a"]) {
    state = mergeSessionState(state, { site_id: "site_a", session_id: "s1", event_name: "page_view", path, ts: 1000 });
  }

  assert.deepEqual(state.path_sequence, ["/a", "/a", "/b", "/a"]);
  assert.deepEqual(state.paths, ["/a", "/b", "/a"]);
});

test("mergeSessionState caps path_sequence", () => {
  let state = null;
  for (let i = 0; i < PATH_SEQUENCE_CAP + 5; i += 1) {
    state = mergeSessionState(state, { site_id: "site_a", session_id: "s1", event_name: "page_view", path: `/p${i}`, ts: 1000 + i });
  }

  assert.equal(state.path_sequence.length, PATH_SEQUENCE_CAP);
  assert.equal(state.path_sequence[0], "/p5");
});
