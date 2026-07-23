---
slug: unsupervised-clustering-v2
status: plan-written
intent: clear
pending-action: optional dual high-accuracy review or explicit start-work execution
approach: make clustering training/read paths historical-summary based, preserve raw path sequence for clustering, introduce versioned v2 clustering features and taxonomy keys, harden Korean LLM naming with validation/fallbacks, add seeded KMeans determinism and clustering tests. Default to site-level historical taxonomy with selected-period application, not per-period retraining.
---

# Draft: unsupervised-clustering-v2

## Components (topology ledger)
| id | outcome (one line) | status | evidence path |
| --- | --- | --- | --- |
| C1 | Historical training source: background clustering trains from Redis historical session summaries, not live TTL session keys | active | `dashboard-be/workers/event-consumer.js:52-69`; `dashboard-be/services/stores/redis-session-store.js:121-147` |
| C2 | Raw path preservation: historical summaries keep ordered duplicate path history for clustering while retaining unique-path aliases for dashboards | active | `dashboard-be/services/stores/redis-session-store.js:19-79`; `dashboard-be/services/analytics/session-state.js:73-95` |
| C3 | Feature schema v2: clustering uses expanded, versioned feature vectors without corrupting existing v1 taxonomy/norm Redis keys | active | `dashboard-be/analytics/clustering/featureExtractor.js:1-91`; `dashboard-be/analytics/clustering/clusterStore.js:1-77`; `dashboard-be/analytics/clustering/clusteringOrchestrator.js:45-115` |
| C4 | Naming hardening: LLM prompts, JSON validation, deterministic fallbacks, and ambiguous mapping behavior produce stable useful Korean names | active | `dashboard-be/analytics/clustering/llmNamer.js:36-104`; `dashboard-be/analytics/clustering/clusteringOrchestrator.js:73-90` |
| C5 | Deterministic clustering: KMeans accepts a fixed seed and produces repeatable assignments/centroids for tests and production runs | active | `dashboard-be/analytics/clustering/kmeans.js:37-97`; `dashboard-be/analytics/clustering/clusteringOrchestrator.js:56-60` |
| C6 | Regression tests: add node:test coverage for path preservation, feature v2, historical input, naming validation, seeded KMeans, and orchestration | active | `dashboard-be/package.json:12`; no `dashboard-be/test/*clustering*` files currently found |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
| --- | --- | --- | --- |
| Taxonomy scope | Train a site-level taxonomy from historical summaries, then apply it to the user's selected dashboard period | More stable labels, lower LLM cost, avoids names changing whenever date range changes | yes |
| Redis key migration | Add versioned v2 taxonomy/norm/count keys rather than overwriting v1 keys | `FEATURE_KEYS` order/length is the centroid contract; v1 keys are incompatible with v2 features | yes |
| Feature set | Include commerce/funnel/friction counters in v2, using capped/log-scaled values where needed instead of excluding checkout/payment entirely | Current 4 features are too weak for useful behavioral naming; raw counters already exist in session state/historical summaries | yes |
| Path fields | Preserve `paths` compatibility if possible, but add explicit `path_sequence` and `unique_paths`; feature extraction must prefer `path_sequence` | Minimizes API/UI breakage while restoring oscillation/transition signals for clustering | yes |
| Test strategy | TDD for pure modules where practical, tests-after for integration points, all QA agent-executable via `node --test` and syntax checks | Repo already uses `node --test`; no Redis/Docker dependency should be required for core regression tests | yes |

## Findings (cited - path:lines)
- Current training trigger still uses live TTL sessions: `event-consumer.js:59` calls `redisSessionStore.listSessionStates({ siteId, limit: 2000 })`, then `runClustering(sessions, ...)` at `event-consumer.js:63`.
- Historical summaries are already queryable by `started_at` via `listHistoricalSessionSummaries({ siteId, limit, fromTs, toTs })` in `redis-session-store.js:121-147`.
- Historical summary normalization currently dedupes paths: `normalizePaths()` builds a `Set` at `redis-session-store.js:19-25`; `normalizeHistoricalSessionSummary()` then sets `depth`, `paths`, and `unique_paths` from that unique list at `redis-session-store.js:52-54`.
- Live session state also avoids consecutive duplicate paths and caps to 25 entries: `session-state.js:73-75` and `session-state.js:94`.
- Redis session state already derives many candidate feature counters: `page_view_count`, `click_count`, `error_count`, `price_interaction_count`, `filter_count`, `search_count`, `cart_add_count`, `cart_remove_count`, `wishlist_count`, `payment_attempt_count`, `dwell_total_ms`, `checkout_started`, `checkout_completed`, and `max_step` in `session-state.js:97-118`.
- Current clustering feature schema is only four dimensions: `depth`, `path_diversity`, `dwell_per_page`, `oscillation_rate` in `featureExtractor.js:10-15`; comments note feature order invalidates saved taxonomy at `featureExtractor.js:2-3`.
- Taxonomy/norm/count keys are unversioned and 30-day TTL: `clusterStore.js:3-10`, with `saveTaxonomy()` and `saveNormParams()` at `clusterStore.js:34-47`.
- KMeans uses `Math.random()` for centroid initialization at `kmeans.js:37-55`, and `stableKMeans()` repeats nondeterministic runs at `kmeans.js:91-97`.
- LLM naming currently asks for a short Korean JSON name but only parses `JSON.parse(result.content)` and defaults to `알 수 없는 유형` on failure at `llmNamer.js:78-89`.
- Ambiguous mapping returns `keepExisting`, but `runClustering()` ignores it and directly uses `decision.name` at `clusteringOrchestrator.js:75-82`.
- No dedicated clustering tests exist under `dashboard-be/test`; backend test script is `node --test` at `dashboard-be/package.json:12`.

## Scope IN
- Change background clustering training input from live session keys to historical session summaries.
- Preserve clustering-specific raw ordered path history and maintain dashboard-compatible unique path fields/aliases.
- Expand and version clustering features and Redis taxonomy/norm/count/last-count keys.
- Harden LLM cluster naming prompt, parser, validator, duplicate handling, ambiguous mapping handling, and fallback names.
- Add seedable KMeans and pass deterministic seeds through orchestrator/K search.
- Add focused `node:test` regression coverage for clustering modules and historical-summary path behavior.

## Scope OUT (Must NOT have)
- Must not implement per-dashboard-selected-period retraining unless the user explicitly vetoes the site-level taxonomy default.
- Must not remove or rename existing dashboard summary aliases such as `paths`, `unique_paths`, `page_views`, `clicks`, `checkout_entered`, `checkout_complete`.
- Must not require Redis, Docker, Kafka, or a real LLM/API key for the normal test suite.
- Must not overwrite or delete existing v1 clustering Redis keys without version isolation or an explicit migration decision.
- Must not change unrelated dashboard UI/UX beyond whatever is necessary for existing clustering summary behavior to keep working.

## Open questions
- None blocking. Recommended defaults above are safe and reversible; user can veto them before approval.

## Approval gate
status: approved-and-plan-written
pending action: user chooses `$start-work` execution or optional dual high-accuracy review.
approval received: user said "승인, 계획 작성해줘".
plan written: `.omo/plans/unsupervised-clustering-v2.md`
metis review folded in: plan now explicitly covers historical summary eligibility, path_sequence semantics, v2 feature schema/key compatibility, KMeans deterministic restarts/tie-breaking, Korean naming validation/fallbacks, old summary tolerance, inference fallback, and no-live-infra tests.
