const test = require("node:test");
const assert = require("node:assert/strict");

const { summarizeSession } = require("../analytics/sessionSummary");

test("session summary counts canonical explicit commerce events", () => {
  const base = {
    site_id: "legend-ecommerce",
    anon_user_id: "u_test",
    session_id: "s_test",
    path: "/product/1",
    props: {},
  };

  const summary = summarizeSession({
    anon_user_id: "u_test",
    session_id: "s_test",
    events: [
      { ...base, ts: 1000, event_name: "page_view" },
      { ...base, ts: 1100, event_name: "add_to_cart", props: { element_id: "product_add_to_cart" } },
      { ...base, ts: 1200, event_name: "checkout_start", path: "/checkout", props: { element_id: "cart_checkout" } },
      { ...base, ts: 1300, event_name: "payment_attempt", path: "/checkout", props: { element_id: "pay_btn" } },
      { ...base, ts: 1400, event_name: "checkout_complete", path: "/order-complete" },
    ],
  });

  assert.equal(summary.page_views, 1);
  assert.equal(summary.cart_add_count, 1);
  assert.equal(summary.payment_attempt_count, 1);
  assert.equal(summary.checkout_entered, true);
  assert.equal(summary.checkout_complete, true);
  assert.equal(summary.max_step, "payment");
});

test("session summary lifts persona profile context from event props", () => {
  const summary = summarizeSession({
    anon_user_id: "u_profile",
    session_id: "s_profile",
    events: [
      {
        site_id: "legend-ecommerce",
        anon_user_id: "u_profile",
        session_id: "s_profile",
        event_name: "persona_profile_observed",
        path: "/mypage",
        ts: 1000,
        props: {
          user_id: 42,
          age_group: "20s",
          occupation: "직장인",
          persona_group: "20s__직장인",
        },
      },
      {
        site_id: "legend-ecommerce",
        anon_user_id: "u_profile",
        session_id: "s_profile",
        event_name: "page_view",
        path: "/checkout",
        ts: 1200,
        props: {},
      },
    ],
  });

  assert.equal(summary.actor_type, "real_user");
  assert.equal(summary.user_id, 42);
  assert.equal(summary.age_group, "20s");
  assert.equal(summary.occupation, "직장인");
  assert.equal(summary.persona_group, "20s__직장인");
});
