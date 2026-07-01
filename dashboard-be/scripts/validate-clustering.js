/**
 * 클러스터링 파이프라인 검증 스크립트
 *
 * Redis / Kafka 없이 더미 세션 데이터만으로 전체 흐름을 실행한다.
 *   1. 다양한 행동 유형의 더미 세션 생성
 *   2. 피처 추출 + Min-Max 정규화
 *   3. K-Means 클러스터링 (Elbow + Silhouette 로 최적 K 탐색)
 *   4. 실제 OpenAI API 호출로 클러스터 명칭 부여
 *
 * 실행: node scripts/validate-clustering.js
 * 필요: dashboard-be/.env 에 OPENAI_API_KEY 설정
 */

"use strict";

const { loadEnvFromFile, getLlmConfig } = require("../services/llm/config");
const { callOpenAIChat }                = require("../insights/openaiProvider");
const { normalizeAll, computeRawMean, FEATURE_KEYS } = require("../analytics/clustering/featureExtractor");
const { findOptimalK, stableKMeans }    = require("../analytics/clustering/kmeans");
const { mapClustersToTaxonomy }         = require("../analytics/clustering/taxonomyMapper");
const { buildFeatureProfile, nameCluster, resolveMappingDecision } = require("../analytics/clustering/llmNamer");

loadEnvFromFile();

// ─── 더미 세션 생성 헬퍼 ─────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  const now = Date.now();
  return {
    site_id:      "test-site",
    session_id:   `sess_${Math.random().toString(16).slice(2)}`,
    anon_user_id: `user_${Math.random().toString(16).slice(2)}`,
    started_at:   now - (overrides.duration_ms || 10000),
    last_ts:      now,
    paths:        overrides.paths || ["/"],
    page_view_count:         0,
    click_count:             0,
    dwell_total_ms:          0,
    error_count:             0,
    price_interaction_count: 0,
    filter_count:            0,
    search_count:            0,
    cart_add_count:          0,
    cart_remove_count:       0,
    wishlist_count:          0,
    payment_attempt_count:   0,
    checkout_started:        false,
    checkout_completed:      false,
    max_step:                "home",
    ...overrides,
  };
}

function jitter(base, pct = 0.3) {
  return Math.max(0, Math.round(base * (1 + (Math.random() - 0.5) * pct)));
}

// ─── 유형별 더미 세션 정의 ───────────────────────────────────────────────────
// 각 유형당 30~40개를 생성해 총 150+ 세션을 만든다.

function generateSessions() {
  const sessions = [];

  // 1. 구매 완료형 (Converted Buyer)
  for (let i = 0; i < 35; i++) {
    sessions.push(makeSession({
      duration_ms:             jitter(300000),
      paths:                   ["/", "/collection", "/product", "/cart", "/checkout", "/order-complete"],
      page_view_count:         jitter(7),
      click_count:             jitter(20),
      dwell_total_ms:          jitter(250000),
      cart_add_count:          jitter(3),
      payment_attempt_count:   jitter(2),
      checkout_started:        true,
      checkout_completed:      true,
      max_step:                "payment",
    }));
  }

  // 2. 가격 비교형 (Price Comparator)
  for (let i = 0; i < 35; i++) {
    sessions.push(makeSession({
      duration_ms:             jitter(200000),
      paths:                   ["/", "/collection", "/product", "/search", "/product", "/collection"],
      page_view_count:         jitter(9),
      click_count:             jitter(18),
      dwell_total_ms:          jitter(180000),
      price_interaction_count: jitter(6),
      filter_count:            jitter(4),
      search_count:            jitter(3),
      cart_add_count:          jitter(1),
      cart_remove_count:       jitter(1),
      checkout_started:        false,
      checkout_completed:      false,
      max_step:                "product",
    }));
  }

  // 3. 찜하기·관심형 (Wishlist Browser)
  for (let i = 0; i < 30; i++) {
    sessions.push(makeSession({
      duration_ms:             jitter(180000),
      paths:                   ["/", "/collection", "/product", "/product", "/product"],
      page_view_count:         jitter(8),
      click_count:             jitter(12),
      dwell_total_ms:          jitter(160000),
      wishlist_count:          jitter(5),
      filter_count:            jitter(2),
      cart_add_count:          0,
      checkout_started:        false,
      checkout_completed:      false,
      max_step:                "product",
    }));
  }

  // 4. 체크아웃 이탈형 (Checkout Abandoner)
  for (let i = 0; i < 30; i++) {
    sessions.push(makeSession({
      duration_ms:             jitter(120000),
      paths:                   ["/", "/product", "/cart", "/checkout"],
      page_view_count:         jitter(5),
      click_count:             jitter(10),
      dwell_total_ms:          jitter(100000),
      cart_add_count:          jitter(2),
      payment_attempt_count:   jitter(1),
      checkout_started:        true,
      checkout_completed:      false,
      max_step:                "checkout",
    }));
  }

  // 5. 빠른 이탈형 (Window Shopper)
  for (let i = 0; i < 30; i++) {
    sessions.push(makeSession({
      duration_ms:             jitter(15000),
      paths:                   ["/", "/collection"],
      page_view_count:         jitter(2),
      click_count:             jitter(1),
      dwell_total_ms:          jitter(12000),
      checkout_started:        false,
      checkout_completed:      false,
      max_step:                "browse",
    }));
  }

  // 6. UX 불편형 (UX Friction)
  for (let i = 0; i < 20; i++) {
    sessions.push(makeSession({
      duration_ms:             jitter(90000),
      paths:                   ["/", "/product", "/cart", "/product"],
      page_view_count:         jitter(6),
      click_count:             jitter(25),
      dwell_total_ms:          jitter(80000),
      error_count:             jitter(3),
      cart_add_count:          jitter(1),
      checkout_started:        false,
      checkout_completed:      false,
      max_step:                "cart",
    }));
  }

  return sessions;
}

// ─── 클러스터 요약 출력 ───────────────────────────────────────────────────────

function printClusterSummary(sessions, assignments, k, taxonomy) {
  console.log("\n─────────────────────────────────────────");
  console.log(`  클러스터 구성 (K=${k}, 총 ${sessions.length}개 세션)`);
  console.log("─────────────────────────────────────────");

  const names = Object.keys(taxonomy).filter((n) => taxonomy[n].status === "active");

  for (let c = 0; c < k; c++) {
    const clusterSessions = sessions.filter((_, i) => assignments[i] === c);
    const name = names[c] || `클러스터 ${c}`;
    console.log(`\n[${name}] — ${clusterSessions.length}개 세션`);

    // 클러스터 내 평균값 출력 (대표 피처만)
    const avg = (field) => {
      const vals = clusterSessions.map((s) => {
        if (field === "duration_ms") return Math.max(0, (s.last_ts || 0) - (s.started_at || 0));
        if (field === "depth")       return Array.isArray(s.paths) ? s.paths.length : 0;
        if (field === "checkout_completed") return s.checkout_completed ? 1 : 0;
        if (field === "checkout_started")   return s.checkout_started   ? 1 : 0;
        return Number(s[field]) || 0;
      });
      return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
    };

    const highlights = [
      `  세션시간: ${(Number(avg("duration_ms")) / 1000).toFixed(0)}초`,
      `  페이지뷰: ${avg("page_view_count")}`,
      `  클릭수:   ${avg("click_count")}`,
      `  장바구니: ${avg("cart_add_count")}`,
      `  찜하기:   ${avg("wishlist_count")}`,
      `  가격클릭: ${avg("price_interaction_count")}`,
      `  에러:     ${avg("error_count")}`,
      `  구매완료: ${avg("checkout_completed")} (비율)`,
    ];
    console.log(highlights.join("   "));
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  // UX_INSIGHTS_API_KEY 우선, 없으면 OPENAI_API_KEY 사용
  const apiKey = process.env.UX_INSIGHTS_API_KEY || getLlmConfig().openaiApiKey;
  if (!apiKey) {
    console.error("❌  UX_INSIGHTS_API_KEY 또는 OPENAI_API_KEY 가 .env 에 설정되지 않았습니다.");
    process.exit(1);
  }

  const callLlm = async (prompt) => callOpenAIChat(prompt, { apiKey });

  console.log("✅  더미 세션 생성 중...");
  const sessions = generateSessions();
  console.log(`   총 ${sessions.length}개 세션 (6개 유형)`);

  // ── 피처 추출 + 정규화 ──
  console.log("\n✅  피처 추출 + 정규화 중...");
  const { vectors, normParams } = normalizeAll(sessions);
  const globalRawMean           = computeRawMean(sessions);
  console.log(`   피처 차원: ${FEATURE_KEYS.length}개`);

  // ── 최적 K 탐색 ──
  console.log("\n✅  Elbow + Silhouette 로 최적 K 탐색 중 (K=3~8)...");
  const { chosenK, candidates } = findOptimalK(vectors, 3, 8);

  console.log("\n   K별 점수:");
  for (const c of candidates) {
    const mark = c.k === chosenK ? " ← 선택" : "";
    console.log(`   K=${c.k}  WCSS=${c.wcss.toFixed(2)}  Silhouette=${c.silhouette.toFixed(3)}${mark}`);
  }

  // ── K-Means 실행 ──
  console.log(`\n✅  K=${chosenK} 로 K-Means 실행 중...`);
  const clusterResult = stableKMeans(vectors, chosenK);
  console.log(`   WCSS: ${clusterResult.wcss.toFixed(2)}`);

  // ── LLM 명칭 부여 ──
  console.log("\n✅  LLM 으로 클러스터 명칭 부여 중...");
  const taxonomy   = {};
  const usedNames  = new Set();
  const mappings   = mapClustersToTaxonomy(clusterResult.centroids, taxonomy);

  for (let ci = 0; ci < chosenK; ci++) {
    const centroid    = clusterResult.centroids[ci];
    const rawCentroid = centroid.map((v, i) => v * normParams.ranges[i] + normParams.mins[i]);
    const featureProfile = buildFeatureProfile(rawCentroid, globalRawMean);
    const existingNames  = [...usedNames];

    process.stdout.write(`   클러스터 ${ci} 명칭 요청 중... `);
    const { name, reason } = await nameCluster({ featureProfile, existingNames, callLlm });

    let uniqueName = name;
    let suffix = 2;
    while (usedNames.has(uniqueName)) uniqueName = `${name} ${suffix++}`;
    usedNames.add(uniqueName);

    taxonomy[uniqueName] = { centroid, rawCentroid, status: "active", clusterIndex: ci };
    console.log(`→ "${uniqueName}"  (${reason})`);
  }

  // ── 결과 출력 ──
  printClusterSummary(sessions, clusterResult.assignments, chosenK, taxonomy);

  console.log("\n─────────────────────────────────────────");
  console.log("  최종 Taxonomy");
  console.log("─────────────────────────────────────────");
  for (const [name, entry] of Object.entries(taxonomy)) {
    const count = clusterResult.assignments.filter((a) => a === entry.clusterIndex).length;
    console.log(`  "${name}" — ${count}개 세션`);
  }
  console.log("\n✅  완료\n");
}

main().catch((err) => {
  console.error("❌  오류:", err.message || err);
  process.exit(1);
});
