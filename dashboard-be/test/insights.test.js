const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { computeLabeledSessionSummaries, buildInsightsInput, isInsightEligibleSummary } = require("../analytics/pipeline");
const { generateInsights, mergeInsights } = require("../insights/generator");
const { buildInsightsPrompt } = require("../insights/promptBuilder");

test("generateInsights returns fallback insight output matching labeled data", async () => {
  const fixture = path.join(__dirname, "..", "eval", "sample-events.jsonl");
  const labeled = await computeLabeledSessionSummaries(fixture, {
    site_id: "ab-sample",
    session_ttl_ms: 30 * 60 * 1000
  });

  const input = buildInsightsInput("ab-sample", labeled, { perLabelRepresentatives: 2 });
  const result = await generateInsights(input, { provider: "fallback" });

  assert.equal(result.provider, "fallback");
  assert.equal(result.output.site_id, "ab-sample");
  assert.equal(Array.isArray(result.output.insights), true);
  assert.equal(result.output.insights.length > 0, true);

  for (const insight of result.output.insights) {
    assert.equal(typeof insight.label, "string");
    assert.equal(typeof insight.where, "string");
    assert.equal(Array.isArray(insight.possible_causes), true);
    assert.equal(Array.isArray(insight.validation_methods), true);
    assert.equal(Array.isArray(insight.recommended_experiments), true);
    assert.equal(typeof insight.title, "string");
    assert.equal(typeof insight.priority_reason, "string");
    assert.equal(typeof insight.impact, "object");
    assert.equal(Array.isArray(insight.evidence), true);
    assert.equal(Array.isArray(insight.recommended_actions), true);
    assert.match(insight.evidence_level, /^(strong|moderate|weak)$/);
  }
});

test("buildInsightsInput excludes login-only low-signal sessions", () => {
  const loginOnly = {
    summary: {
      session_id: "s_login",
      anon_user_id: "u_login",
      duration_ms: 72,
      page_views: 0,
      clicks: 0,
      depth: 1,
      unique_paths: ["/login"],
      checkout_entered: false,
      checkout_complete: false,
      error_count: 0,
      rage_clicks_count: 0,
      price_interaction_count: 0,
      filter_count: 0,
      search_count: 0,
      cart_add_count: 0,
      cart_remove_count: 0,
      payment_attempt_count: 0,
      max_step: "browse",
    },
    label: { label: "window_shopper", confidence: 0.8, evidence: [{ path: "/login" }] },
  };
  const valid = {
    summary: {
      session_id: "s_real",
      anon_user_id: "u_real",
      duration_ms: 17745,
      page_views: 1,
      clicks: 0,
      depth: 2,
      unique_paths: ["/", "/cart"],
      checkout_entered: false,
      checkout_complete: false,
      error_count: 0,
      rage_clicks_count: 0,
      price_interaction_count: 0,
      filter_count: 0,
      search_count: 0,
      cart_add_count: 0,
      cart_remove_count: 0,
      payment_attempt_count: 0,
      max_step: "cart",
    },
    label: { label: "window_shopper", confidence: 0.55, evidence: [{ path: "/" }, { path: "/cart" }] },
  };

  assert.equal(isInsightEligibleSummary(loginOnly.summary), false);
  assert.equal(isInsightEligibleSummary(valid.summary), true);

  const input = buildInsightsInput("legend-ecommerce", [loginOnly, valid], { perLabelRepresentatives: 2 });
  const bucket = input.labels.find((label) => label.label === "window_shopper");
  assert.ok(bucket);
  assert.equal(bucket.sessions, 1);
  assert.deepEqual(bucket.allowed_paths, ["/", "/cart"]);
  assert.equal(typeof bucket.metrics, "object");
  assert.equal(bucket.representatives.length, 1);
  assert.deepEqual(bucket.representatives[0].summary.unique_paths, ["/", "/cart"]);
});

test("mergeInsights falls back when where is not grounded in allowed paths", () => {
  const input = {
    site_id: "legend-ecommerce",
    generated_at: Date.now(),
    labels: [{
      label: "window_shopper",
      sessions: 1,
      share: 1,
      path_summary: "/, /cart",
      representative_steps: ["cart"],
      allowed_paths: ["/", "/cart"],
      representatives: [{
        session_id: "s_real",
        anon_user_id: "u_real",
        summary: { duration_ms: 17745, depth: 2, unique_paths: ["/", "/cart"] },
        evidence: [{ path: "/" }, { path: "/cart" }],
      }],
    }],
  };

  const merged = mergeInsights(input, {
    insights: [{
      label: "window_shopper",
      where: "browse and cart pages",
      possible_causes: ["x"],
      validation_methods: ["y"],
      recommended_experiments: [{
        hypothesis: "h",
        change: "c",
        primary_metric: "not_a_real_metric",
      }],
      priority: "high",
    }],
  });

  const insight = merged.insights[0];
  assert.notEqual(insight.where, "browse and cart pages");
  assert.equal(insight.where.includes("/cart") || insight.where.includes("/") , true);
  assert.equal(insight.recommended_experiments[0].primary_metric, "checkout_complete / sessions");
});

test("mergeInsights preserves valid rich LLM fields", () => {
  const input = {
    site_id: "legend-ecommerce",
    generated_at: Date.now(),
    labels: [{
      label: "window_shopper",
      sessions: 12,
      share: 0.3,
      path_summary: "/, /cart",
      representative_steps: ["cart"],
      allowed_paths: ["/", "/cart"],
      representatives: [{
        session_id: "s_real",
        anon_user_id: "u_real",
        summary: { duration_ms: 17745, depth: 2, unique_paths: ["/", "/cart"], max_step: "cart" },
        evidence: [{ path: "/" }, { path: "/cart" }],
      }],
    }],
  };

  const merged = mergeInsights(input, {
    summary: { headline: "초기 탐색 이탈을 먼저 확인하세요.", top_priority_reason: "비중이 높습니다." },
    insights: [{
      label: "window_shopper",
      title: "초기 탐색 직후 이탈이 높습니다",
      where: "/cart",
      priority: "high",
      priority_reason: "전체 세션의 30%로 높습니다.",
      impact: { affected_sessions: 999, share: 0.01, primary_metric: "page_view_to_click_rate" },
      evidence: ["대표 세션에서 /cart 경로가 반복되었습니다."],
      possible_causes: ["첫 CTA가 약합니다."],
      validation_methods: ["첫 페이지 CTA 클릭률을 확인합니다."],
      recommended_actions: ["랜딩 CTA 문구를 명확히 합니다."],
      recommended_experiments: [{
        hypothesis: "첫 CTA를 명확히 하면 클릭률이 오른다",
        change: "랜딩 CTA 문구와 위치를 개선",
        primary_metric: "page_view_to_click_rate",
      }],
      evidence_level: "strong",
    }],
  });

  assert.equal(merged.summary.headline, "초기 탐색 이탈을 먼저 확인하세요.");
  assert.equal(merged.insights[0].title, "초기 탐색 직후 이탈이 높습니다");
  assert.equal(merged.insights[0].impact.affected_sessions, 12);
  assert.equal(merged.insights[0].impact.share, 0.3);
  assert.equal(merged.insights[0].impact.primary_metric, "page_view_to_click_rate");
  assert.deepEqual(merged.insights[0].recommended_actions, ["랜딩 CTA 문구를 명확히 합니다."]);
  assert.equal(merged.insights[0].evidence_level, "strong");
});

test("mergeInsights rejects unsupported pathless evidence from LLM", () => {
  const input = {
    site_id: "legend-ecommerce",
    generated_at: Date.now(),
    labels: [{
      label: "window_shopper",
      sessions: 2,
      share: 0.2,
      path_summary: "/cart",
      representative_steps: ["cart"],
      metrics: { avg_duration_ms: 1000 },
      allowed_paths: ["/cart"],
      representatives: [{
        session_id: "s_real",
        anon_user_id: "u_real",
        summary: { duration_ms: 1000, depth: 1, unique_paths: ["/cart"], max_step: "cart" },
        evidence: [{ path: "/cart" }],
      }],
    }],
  };

  const merged = mergeInsights(input, {
    insights: [{
      label: "window_shopper",
      evidence: ["VIP 고객이 쿠폰 배너를 찾지 못했습니다."],
    }],
  });

  assert.equal(merged.insights[0].evidence.includes("VIP 고객이 쿠폰 배너를 찾지 못했습니다."), false);
  assert.equal(merged.insights[0].evidence.some((item) => item.includes("/cart")), true);
});

test("fallback insight evidence excludes auth subpaths", async () => {
  const input = buildInsightsInput("legend-ecommerce", [{
    summary: {
      session_id: "s_real",
      anon_user_id: "u_real",
      duration_ms: 3000,
      page_views: 1,
      clicks: 1,
      depth: 2,
      unique_paths: ["/login/callback", "/cart"],
      checkout_entered: false,
      checkout_complete: false,
      error_count: 0,
      rage_clicks_count: 0,
      price_interaction_count: 0,
      max_step: "cart",
    },
    label: { label: "window_shopper", confidence: 0.55, evidence: [{ path: "/cart" }] },
  }], { perLabelRepresentatives: 1 });
  const result = await generateInsights(input, { provider: "fallback" });
  const serialized = JSON.stringify(result.output.insights[0]);
  assert.equal(serialized.includes("/login/callback"), false);
  assert.equal(serialized.includes("/cart"), true);
});

test("buildInsightsPrompt asks for rich insight fields", () => {
  const prompt = buildInsightsPrompt({ site_id: "legend-ecommerce", labels: [] });
  assert.match(prompt.system, /title/);
  assert.match(prompt.system, /priority_reason/);
  assert.match(prompt.system, /impact/);
  assert.match(prompt.system, /evidence/);
  assert.match(prompt.system, /recommended_actions/);
  assert.match(prompt.system, /evidence_level/);
});
