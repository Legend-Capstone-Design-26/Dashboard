/**
 * 유형군(archetype)별 더미 세션을 Redis에 직접 채워 넣고, 바로 클러스터링 + LLM 작명까지
 * 실행해보는 스크립트. K6로 /collect 엔드포인트를 매번 때려 세션을 쌓는 대신,
 * 실제 프로덕션 코드(redis-session-store, clusteringOrchestrator)를 그대로 재사용해서
 * Redis에 세션 상태를 만든다.
 *
 * 유형별 특징은 analytics/labeler.js 의 라벨링 규칙, scripts/validate-clustering.js 의
 * 더미 세션 정의를 참고해 구성했다 (window_shopper, ux_friction_dropper,
 * checkout_abandoner, price_sensitive_dropper, over_explorer).
 *
 * 실행:
 *   node scripts/seed-archetype-sessions.js [siteId] [--per-type=30] [--no-cluster]
 *
 *   siteId       기본값 "ab-sample"
 *   --per-type   유형당 생성할 세션 수 (기본 30 → 5유형 x 30 = 150개, COLD_START_THRESHOLD=100 충족)
 *   --no-cluster 세션만 채우고 클러스터링/LLM 작명은 실행하지 않음
 *
 * 주의: 이 스크립트는 Redis에 실제로 쓰기 작업을 한다. 테스트용 siteId(운영과 분리된 값)를
 * 쓰는 걸 권장한다.
 */

"use strict";

const { createRedisRuntime } = require("../services/runtime/redis");
const { getInfraConfig } = require("../services/runtime/infra-config");
const { createRedisSessionStore } = require("../services/stores/redis-session-store");
const { runClustering } = require("../analytics/clustering/clusteringOrchestrator");
const { loadEnvFromFile, getLlmConfig } = require("../services/llm/config");
const { callOpenAIChat } = require("../insights/openaiProvider");

loadEnvFromFile();

// ─── 유형별 프로필 정의 ─────────────────────────────────────────────────────
// analytics/labeler.js 의 분류 기준(clicks, error_count, price_interaction_count 등)과
// featureExtractor.js 가 보는 필드(paths, dwell_total_ms)를 동시에 만족하도록 구성.

function jitter(base, pct = 0.25) {
  return Math.max(0, Math.round(base * (1 + (Math.random() - 0.5) * pct)));
}

function pick(arr, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[i % arr.length]);
  return out;
}

const ARCHETYPES = {
  window_shopper: {
    // labeler.js: page_views<=2, clicks<=1, depth<=2, duration_ms<=20000
    paths: () => pick(["/", "/collection"], 2),
    dwellTotalMs: () => jitter(12000),
    pageViews: () => jitter(2, 0.4),
    clicks: () => jitter(1, 0.6),
    errorCount: () => 0,
    priceInteraction: () => 0,
    checkoutStarted: false,
    checkoutCompleted: false,
    maxStep: "browse",
  },
  ux_friction_dropper: {
    // labeler.js: error_count>=1 또는 rage_clicks_count>=1 또는 clicks>=25 & max_step 초반
    paths: () => pick(["/", "/product", "/cart", "/product"], 4),
    dwellTotalMs: () => jitter(90000),
    pageViews: () => jitter(6, 0.3),
    clicks: () => jitter(28, 0.2),
    errorCount: () => jitter(3, 0.5) || 1,
    rageClicks: () => jitter(2, 0.5),
    priceInteraction: () => 0,
    checkoutStarted: false,
    checkoutCompleted: false,
    maxStep: "product",
  },
  checkout_abandoner: {
    // labeler.js: checkout_started=true, checkout_completed=false
    paths: () => pick(["/", "/product", "/cart", "/checkout"], 4),
    dwellTotalMs: () => jitter(120000),
    pageViews: () => jitter(5, 0.3),
    clicks: () => jitter(10, 0.3),
    errorCount: () => 0,
    priceInteraction: () => jitter(1, 0.5),
    paymentAttempt: () => jitter(1, 0.5) || 1,
    checkoutStarted: true,
    checkoutCompleted: false,
    maxStep: "checkout",
  },
  price_sensitive_dropper: {
    // labeler.js: checkout_completed=false, price_interaction_count>=2
    paths: () => pick(["/", "/collection", "/product", "/search", "/product", "/collection"], 6),
    dwellTotalMs: () => jitter(200000),
    pageViews: () => jitter(9, 0.3),
    clicks: () => jitter(18, 0.3),
    errorCount: () => 0,
    priceInteraction: () => jitter(6, 0.3) || 2,
    filterCount: () => jitter(4, 0.4),
    searchCount: () => jitter(3, 0.4),
    checkoutStarted: false,
    checkoutCompleted: false,
    maxStep: "product",
  },
  over_explorer: {
    // labeler.js: page_views>=6, depth>=3, duration_ms>=90000, checkout 진입 없음
    paths: () => pick(["/", "/collection", "/category", "/product", "/collection", "/category", "/product"], 7),
    dwellTotalMs: () => jitter(180000),
    pageViews: () => jitter(8, 0.3),
    clicks: () => jitter(4, 0.5),
    errorCount: () => 0,
    priceInteraction: () => 0,
    checkoutStarted: false,
    checkoutCompleted: false,
    maxStep: "browse",
  },
};

function buildSession({ siteId, archetypeKey, profile, index }) {
  const now = Date.now();
  const durationMs = profile.dwellTotalMs() + jitter(5000, 0.5);
  const startedAt = now - durationMs - jitter(60000);
  const paths = profile.paths();

  return {
    site_id: siteId,
    session_id: `seed_${archetypeKey}_${index}_${Math.random().toString(16).slice(2, 8)}`,
    anon_user_id: `seed_user_${archetypeKey}_${index}`,
    started_at: startedAt,
    last_ts: startedAt + durationMs,
    last_event_name: "dwell_time",
    last_path: paths[paths.length - 1],
    paths,
    event_count: paths.length + (profile.clicks() || 0),
    page_view_count: profile.pageViews(),
    click_count: profile.clicks(),
    checkout_started: Boolean(profile.checkoutStarted),
    checkout_completed: Boolean(profile.checkoutCompleted),
    error_count: profile.errorCount ? profile.errorCount() : 0,
    rage_clicks_count: profile.rageClicks ? profile.rageClicks() : 0,
    price_interaction_count: profile.priceInteraction ? profile.priceInteraction() : 0,
    filter_count: profile.filterCount ? profile.filterCount() : 0,
    search_count: profile.searchCount ? profile.searchCount() : 0,
    cart_add_count: 0,
    cart_remove_count: 0,
    wishlist_count: 0,
    payment_attempt_count: profile.paymentAttempt ? profile.paymentAttempt() : 0,
    last_dwell_ms: jitter(3000),
    dwell_total_ms: profile.dwellTotalMs(),
    max_step: profile.maxStep || "home",
    ui_variant: null,
    experiments: [],
    _seed_archetype: archetypeKey, // 확인용 메타 필드 (클러스터링 로직에는 영향 없음)
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const siteId = args.find((a) => !a.startsWith("--")) || "ab-sample";
  const noCluster = args.includes("--no-cluster");
  const perTypeArg = args.find((a) => a.startsWith("--per-type="));
  const perType = perTypeArg ? Math.max(1, Number(perTypeArg.split("=")[1]) || 30) : 30;

  const infra = getInfraConfig();
  const redisRuntime = createRedisRuntime({
    url: infra.redis.url,
    keyPrefix: infra.redis.keyPrefix,
  });
  const sessionStore = createRedisSessionStore({
    redisRuntime,
    sessionTtlSec: infra.redis.sessionTtlSec,
    assignmentTtlSec: infra.redis.assignmentTtlSec,
  });

  console.log(`[seed-archetype-sessions] site_id="${siteId}" 유형당 ${perType}개, 총 ${perType * Object.keys(ARCHETYPES).length}개 세션 생성`);

  const allSessions = [];
  for (const [archetypeKey, profile] of Object.entries(ARCHETYPES)) {
    for (let i = 0; i < perType; i++) {
      const session = buildSession({ siteId, archetypeKey, profile, index: i });
      allSessions.push(session);
      await sessionStore.upsertSessionState({
        siteId,
        sessionId: session.session_id,
        state: session,
      });
    }
    console.log(`  - ${archetypeKey}: ${perType}개 완료`);
  }

  console.log(`[seed-archetype-sessions] Redis 적재 완료 (session:${siteId}:*, session_summary:${siteId}:*)`);

  if (noCluster) {
    console.log("[seed-archetype-sessions] --no-cluster 지정됨. 클러스터링은 실행하지 않습니다.");
    await redisRuntime.disconnect();
    return;
  }

  const apiKey = process.env.UX_INSIGHTS_API_KEY || getLlmConfig().openaiApiKey;
  if (!apiKey) {
    console.warn("[seed-archetype-sessions] OPENAI_API_KEY / UX_INSIGHTS_API_KEY 가 없어 클러스터링(LLM 작명)을 건너뜁니다.");
    await redisRuntime.disconnect();
    return;
  }
  const callLlm = async (prompt) => callOpenAIChat(prompt, { apiKey });

  console.log("[seed-archetype-sessions] 클러스터링 + LLM 작명 실행 중...");
  const result = await runClustering(allSessions, siteId, redisRuntime, callLlm, { forceK: Object.keys(ARCHETYPES).length });

  if (result.skipped) {
    console.log(`[seed-archetype-sessions] 클러스터링 스킵됨: ${result.reason} (count=${result.count})`);
  } else {
    console.log(`[seed-archetype-sessions] 완료. K=${result.k}`);
    for (const [name, info] of Object.entries(result.taxonomy)) {
      console.log(`  - "${name}" (status=${info.status}, rawCentroid=[${info.rawCentroid.map((v) => v.toFixed(1)).join(", ")}])`);
    }
  }

  await redisRuntime.disconnect();
}

main().catch((err) => {
  console.error("[seed-archetype-sessions] 오류:", err);
  process.exit(1);
});
