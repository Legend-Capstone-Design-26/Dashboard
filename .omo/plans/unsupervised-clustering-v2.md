# unsupervised-clustering-v2 - Work Plan

## TL;DR (For humans)
**What you'll get:** 비지도학습이 Redis live TTL 세션이 아니라 historical session summary로 학습되도록 통일됩니다. 동시에 원본 이동 순서, 확장 feature, 안정적인 한국어 유형명, 고정 seed KMeans, clustering 테스트가 추가됩니다.

**Why this approach:** feature 구조를 바꾸면 기존 centroid와 taxonomy가 깨지므로 v2 schema/key로 분리합니다. 학습은 사이트 단위 historical taxonomy로 안정화하고, 대시보드 기간 선택은 그 taxonomy를 선택 기간 세션에 적용하는 방식으로 유지합니다.

**What it will NOT do:** 기간을 바꿀 때마다 새 taxonomy를 재학습하지 않습니다. 기존 v1 Redis clustering key를 삭제하거나 덮어쓰지 않습니다. Redis/Docker/Kafka/LLM이 있어야만 테스트가 통과하는 구조로 만들지 않습니다.

**Effort:** Medium
**Risk:** Medium - session summary schema와 clustering taxonomy compatibility를 같이 건드리는 변경입니다.
**Decisions to sanity-check:** v2 schema/key 분리, site-level taxonomy 학습, `path_sequence` 추가와 기존 `paths` 호환 유지.

Your next move: `$start-work`로 구현을 시작하거나, 먼저 dual high-accuracy review를 요청하세요. Full execution detail follows below.

---

> TL;DR (machine): Medium-risk backend clustering migration: historical-summary training, path_sequence, v2 features/Redis keys, naming validation, seeded KMeans, node:test regression coverage.

## Scope
### Must have
- Background clustering training input must use historical session summaries (`listHistoricalSessionSummaries`) rather than live TTL session keys (`listSessionStates`).
- Historical summaries must preserve ordered duplicate path history for clustering under an explicit field such as `path_sequence` while keeping dashboard-compatible `paths`/`unique_paths` aliases.
- Clustering feature extraction must move to an explicit v2 schema with stable feature order, exported version metadata, feature names, and length checks.
- Clustering Redis persistence must use versioned v2 taxonomy/norm/count/last-count keys and preserve v1 keys/fallback behavior.
- KMeans and optimal-K search must be deterministic when given a seed, including KMeans++ initialization, restarts, tie-breaking, and cluster ordering before naming.
- LLM naming must validate JSON shape/content and use deterministic Korean fallback names; tests must mock LLM calls.
- Add focused `node:test` coverage for historical path preservation, feature v2 extraction, seeded KMeans, v2 cluster store, LLM naming validation, orchestrator historical input, and labeler fallback.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not implement per-selected-period taxonomy retraining unless separately requested; selected period should apply an already-trained site taxonomy.
- Must not remove or rename existing dashboard summary aliases: `paths`, `unique_paths`, `page_views`, `clicks`, `checkout_entered`, `checkout_complete`, `max_step`, `evidence`.
- Must not require live Redis, Docker, Kafka, or OpenAI/UX_INSIGHTS keys for normal tests.
- Must not overwrite or delete existing v1 clustering keys (`cluster:taxonomy:${siteId}`, `cluster:norm:${siteId}`, etc.).
- Must not treat current `paths` as truly raw history unless `path_sequence` is absent and a fallback is explicitly documented.
- Must not change unrelated frontend design or dashboard behavior beyond preserving existing clustering summary behavior.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for pure modules (`featureExtractor`, `kmeans`, `llmNamer`, `clusterStore`); tests-after for integration surfaces (`event-consumer`, orchestrator, labeler). Framework: existing backend `node:test` + `assert`.
- Focused tests: `node --test dashboard-be/test/clustering-*.test.js dashboard-be/test/redis-session-analytics-service.test.js`
- Full backend suite: `npm test --workspace dashboard-be`
- Syntax checks: `node --check` on every changed `.js` file.
- Whitespace check: `git diff --check`.
- Evidence: each todo writes command output and assertions to `.omo/evidence/task-<N>-unsupervised-clustering-v2.txt`.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
- Wave 1: foundation tests and compatibility-safe schema changes (todos 1-3). These can partly parallelize, but path preservation should land before feature v2 final assertions.
- Wave 2: deterministic clustering and versioned persistence (todos 4-5). These depend on feature v2 contracts.
- Wave 3: orchestration/training input and inference fallback (todo 6). Depends on v2 persistence and historical summary schema.
- Wave 4: naming hardening and end-to-end regression sweep (todos 7-8). Naming can begin after feature profile shape is stable; final sweep depends on all prior todos.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 6 | none |
| 2 | 1 | 3, 6 | 4 initial test scaffolding |
| 3 | 1, 2 | 4, 5, 6, 7 | none |
| 4 | none | 5, 6 | 1, 2 |
| 5 | 3, 4 | 6, 8 | 7 after feature profile contract |
| 6 | 2, 3, 5 | 8 | 7 |
| 7 | 3 | 8 | 6 |
| 8 | 5, 6, 7 | final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. `redis-session-store`: preserve `path_sequence` in historical summaries without breaking existing aliases
  What to do / Must NOT do: Add an explicit ordered path history field for historical summaries. Define helper behavior precisely: `path_sequence` should preserve input order and repeated page/path entries available in state; `unique_paths` remains deduped; existing `paths` must remain dashboard-compatible and must not be renamed. If current live state only has capped/deduped `paths`, use it as the best available fallback but do not call it raw. Add schema marker such as `summary_schema_version` without requiring migration of old summaries.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 6
  References (executor has NO interview context - be exhaustive): `dashboard-be/services/stores/redis-session-store.js:19-79` (`normalizePaths`, `normalizeHistoricalSessionSummary`); `dashboard-be/services/stores/redis-session-store.js:103-147` (historical write/list); `dashboard-be/services/analytics/session-state.js:73-95` (current live path capture cap/dedupe); `dashboard-be/test/redis-session-analytics-service.test.js:169` (existing historical listing coverage).
  Acceptance criteria (agent-executable): Add/extend a backend test proving a summary with repeated path data returns `path_sequence` in order, `unique_paths` deduped, `paths` still present, and `depth` compatibility preserved. Run `node --test dashboard-be/test/redis-session-analytics-service.test.js` and targeted new clustering/session-store test.
  QA scenarios (name the exact tool + invocation): Happy: `node --test dashboard-be/test/redis-session-analytics-service.test.js` shows repeated `/product,/cart,/product` preserved in `path_sequence`. Failure: same test asserts `unique_paths` remains `['/product','/cart']` and no existing dashboard alias disappears. Evidence `.omo/evidence/task-1-unsupervised-clustering-v2.txt`.
  Commit: Y | `fix(clustering): preserve historical path sequence`

- [ ] 2. `session-state`: capture better ordered path history for future sessions while keeping live session payload bounded
  What to do / Must NOT do: Update `mergeSessionState()` to maintain a clustering-oriented sequence field, e.g. `path_sequence`, in addition to existing `paths`. Preserve repeated non-empty paths in arrival order and cap it deliberately (document cap, e.g. last 100) to avoid unbounded Redis payloads. Keep existing `paths` behavior if dashboards rely on it; do not expand live state without a cap. Include first/exit path convenience fields only if derived from existing data and additive.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 6
  References (executor has NO interview context - be exhaustive): `dashboard-be/services/analytics/session-state.js:67-121` (`mergeSessionState`); `dashboard-be/services/analytics/session-state.js:23-63` (semantic signals already derived); `dashboard-be/services/stores/redis-session-store.js:27-79` (historical summary consumes state).
  Acceptance criteria (agent-executable): Add a `node:test` case for `mergeSessionState()` showing consecutive/repeated path events populate `path_sequence` while existing `paths` remains compatible and capped. Run `node --test dashboard-be/test/session-state*.test.js dashboard-be/test/clustering-*.test.js` or the exact new file if no existing one exists.
  QA scenarios (name the exact tool + invocation): Happy: three events `/a -> /a -> /b -> /a` preserve order in `path_sequence`. Failure: a long generated sequence confirms cap behavior and no unbounded array. Evidence `.omo/evidence/task-2-unsupervised-clustering-v2.txt`.
  Commit: Y | `fix(session): track ordered path sequence for clustering`

- [ ] 3. `featureExtractor`: introduce explicit v2 feature schema with expanded, stable feature set
  What to do / Must NOT do: Replace the implicit four-feature contract with an explicit exported v2 contract: `FEATURE_SCHEMA_VERSION = 2`, `FEATURE_KEYS`, feature labels, vector length checks, and helpers that prefer `path_sequence` over `paths`. Include expanded features from existing fields: path depth/diversity/oscillation/backtracking/transition signals, page/click/event intensity, dwell metrics, error/friction counts, search/filter/price/cart/payment counts, checkout booleans, and `max_step` ordinal. Use capped/log-scaled transforms for skewed counts and document each transform. Must not include user identifiers, session IDs, experiment IDs, or raw text in the centroid vector.
  Parallelization: Wave 2 foundation | Blocked by: 1, 2 | Blocks: 4, 5, 6, 7
  References (executor has NO interview context - be exhaustive): `dashboard-be/analytics/clustering/featureExtractor.js:1-91` (current four-feature extractor); `dashboard-be/services/analytics/session-state.js:97-118` (available counters); `dashboard-be/analytics/funnel.js` (`inferStepFromEvent`, `stepIndex` semantics); `dashboard-be/analytics/clustering/clusteringOrchestrator.js:50-69` (normalization/raw mean consumers); `dashboard-be/analytics/clusteringLabeler.js:46-48` (assignment uses extractor).
  Acceptance criteria (agent-executable): Add `dashboard-be/test/clustering-feature-extractor.test.js` covering: v2 feature key order snapshot, `path_sequence` preference, fallback to old `paths`, capped/log transforms, zero/empty input, `normalizeAll()` vector length consistency, and `applyNorm()` clamp behavior. Run `node --test dashboard-be/test/clustering-feature-extractor.test.js`.
  QA scenarios (name the exact tool + invocation): Happy: synthetic commerce/friction sessions produce distinguishable vectors with expected feature names/order. Failure: missing `path_sequence` and missing counters produce finite zero/default vectors, never `NaN`. Evidence `.omo/evidence/task-3-unsupervised-clustering-v2.txt`.
  Commit: Y | `feat(clustering): add versioned v2 feature schema`

- [ ] 4. `kmeans`: add seeded deterministic KMeans, restart seeds, tie-breaking, and cluster ordering
  What to do / Must NOT do: Replace direct `Math.random()` use with an injected deterministic RNG/seed option. Thread seed options through `initCentroids`, `kMeans`, `stableKMeans`, and `findOptimalK`. Ensure restarts derive deterministic sub-seeds, nearest-centroid ties choose the lower index, empty clusters are stable, and final cluster ordering is deterministic before taxonomy naming/persistence. Do not add external dependencies unless unavoidable; a small local seeded PRNG is preferred.
  Parallelization: Wave 2 | Blocked by: none | Blocks: 5, 6
  References (executor has NO interview context - be exhaustive): `dashboard-be/analytics/clustering/kmeans.js:37-55` (`Math.random()` KMeans++ init); `dashboard-be/analytics/clustering/kmeans.js:60-97` (`kMeans`, `stableKMeans`); `dashboard-be/analytics/clustering/kmeans.js:137-167` (`findOptimalK`); `dashboard-be/analytics/clustering/clusteringOrchestrator.js:56-60` (caller).
  Acceptance criteria (agent-executable): Add `dashboard-be/test/clustering-kmeans.test.js` covering exact deterministic assignments/centroids for a fixed seed, repeated stableKMeans equality, different seed allowed to differ, `k > sample count` error, degenerate silhouette behavior, and small-sample `findOptimalK`. Run `node --test dashboard-be/test/clustering-kmeans.test.js`.
  QA scenarios (name the exact tool + invocation): Happy: two consecutive runs with same seed deep-equal. Failure: monkey-patch `Math.random` to throw during seeded path and prove code does not call it. Evidence `.omo/evidence/task-4-unsupervised-clustering-v2.txt`.
  Commit: Y | `fix(clustering): make kmeans deterministic with seed`

- [ ] 5. `clusterStore` and taxonomy consumers: version v2 Redis keys and enforce schema compatibility
  What to do / Must NOT do: Add v2 key helpers for taxonomy, norm params, session count, and last clustered count (for example `cluster:v2:taxonomy:${siteId}`, `cluster:v2:norm:${siteId}`, `cluster:v2:count:${siteId}`, `cluster:v2:last_count:${siteId}`), preserving v1 helpers for fallback where needed. Store schema metadata (`schemaVersion`, `featureKeys`, `createdAt/updatedAt`) with taxonomy/norm params or adjacent metadata. Labeler/orchestrator must reject mismatched feature lengths/schema versions and fall back safely rather than assigning with incompatible centroids. Keep TTL policy explicit and compatible with current 30-day TTL unless there is a reason to change it.
  Parallelization: Wave 2 | Blocked by: 3, 4 | Blocks: 6, 8
  References (executor has NO interview context - be exhaustive): `dashboard-be/analytics/clustering/clusterStore.js:1-77` (unversioned keys and TTL); `dashboard-be/analytics/clustering/clusteringOrchestrator.js:52-115` (load/save taxonomy/norm/last count); `dashboard-be/analytics/clusteringLabeler.js:63-88` (load/cache taxonomy/norm); `dashboard-be/analytics/clustering/taxonomyMapper.js:30-57` (taxonomy entry shape); `dashboard-be/test/redis-session-store.test.js` and `dashboard-be/test/redis-metrics-store.test.js` for fake Redis patterns.
  Acceptance criteria (agent-executable): Add `dashboard-be/test/clustering-store.test.js` and extend labeler/orchestrator tests proving v2 key round-trip, v1 keys not overwritten, schema mismatch returns fallback/no clustering assignment, parse failure returns null/0 safely, and cache invalidation still works. Run `node --test dashboard-be/test/clustering-store.test.js dashboard-be/test/clustering-labeler.test.js`.
  QA scenarios (name the exact tool + invocation): Happy: fake Redis contains only v2 keys after v2 save and labeler assigns with matching schema. Failure: fake Redis has v1-only or mismatched length taxonomy; labeler falls back to rule-base/unclassified without throwing. Evidence `.omo/evidence/task-5-unsupervised-clustering-v2.txt`.
  Commit: Y | `feat(clustering): version taxonomy storage`

- [ ] 6. `event-consumer` and orchestrator: train from historical summaries and count v2-eligible summaries
  What to do / Must NOT do: Change background clustering input to `redisSessionStore.listHistoricalSessionSummaries({ siteId, limit })`. Define v2 eligibility: summaries must have enough timestamp/path/counter data to produce a finite v2 vector; old summaries without `path_sequence` should be tolerated via fallback to `paths`, not dropped unless vector extraction fails. Update count semantics so `shouldRecluster()` uses total v2-eligible historical summaries or a versioned count derived from summary writes, not live TTL count. Preserve non-blocking background behavior and Redis unavailable handling. Do not make ingestion await long LLM/KMeans work.
  Parallelization: Wave 3 | Blocked by: 2, 3, 5 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `dashboard-be/workers/event-consumer.js:52-69` (current trigger/input); `dashboard-be/workers/event-consumer.js:102-117` (upsert + dwell trigger); `dashboard-be/services/stores/redis-session-store.js:121-147` (historical listing); `dashboard-be/analytics/clustering/clusteringOrchestrator.js:21-24` (`shouldRecluster`); `dashboard-be/analytics/clustering/clusteringOrchestrator.js:45-121` (`runClustering`); `dashboard-be/analytics/clustering/clusterStore.js:50-66` (count/last count).
  Acceptance criteria (agent-executable): Add/extend `dashboard-be/test/clustering-orchestrator.test.js` and a worker-adjacent injected/fake test if practical, proving `runClustering()` receives historical summaries, skips insufficient data, persists v2 taxonomy/norm/last count after threshold, and does not call `listSessionStates()` for training. Run `node --test dashboard-be/test/clustering-orchestrator.test.js` plus any worker test.
  QA scenarios (name the exact tool + invocation): Happy: fake store with 100+ historical summaries triggers v2 clustering and saves v2 keys. Failure: fake store throws if `listSessionStates()` is called; test passes, proving live TTL training is removed. Evidence `.omo/evidence/task-6-unsupervised-clustering-v2.txt`.
  Commit: Y | `fix(clustering): train from historical summaries`

- [ ] 7. `llmNamer`: harden prompt, JSON validation, ambiguous mapping, and deterministic Korean fallbacks
  What to do / Must NOT do: Expand naming prompt to include v2 feature profile, dominant signals, representative path/funnel facts if available, and strict output schema. Add parser/validator rules: JSON object only; `name` 2-10 visible chars after trim; mostly Hangul/Korean UX-friendly characters; no raw feature names/internal keys/English-only names; no duplicates after normalized comparison; required `reason`/dominant signals. Implement deterministic fallback hierarchy: keep valid existing mapped name when appropriate, otherwise feature-derived Korean fallback such as `결제 이탈형`, `가격 탐색형`, `반복 탐색형`, `오류 마찰형`, ending with generic only as last resort. Fix ambiguous mapping so `keep_existing` is respected.
  Parallelization: Wave 4 | Blocked by: 3 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `dashboard-be/analytics/clustering/llmNamer.js:36-104` (current prompts/parse fallback); `dashboard-be/analytics/clustering/clusteringOrchestrator.js:73-90` (ambiguous mapping use); `dashboard-be/analytics/clustering/clusteringOrchestrator.js:66-99` (taxonomy entry creation); `dashboard-be/analytics/clustering/featureExtractor.js` after v2 changes (feature profile labels).
  Acceptance criteria (agent-executable): Add `dashboard-be/test/clustering-llm-namer.test.js` covering valid Korean response, malformed JSON, duplicate name, English/internal-key name, too-long/empty name, ambiguous keep-existing true/false, and deterministic fallback from feature profile. Run `node --test dashboard-be/test/clustering-llm-namer.test.js`.
  QA scenarios (name the exact tool + invocation): Happy: mock LLM returns valid Korean JSON and name/reason survive validation. Failure: mock LLM returns `{"name":"depth_high_user"}` or malformed text; deterministic Korean fallback is used and no `알 수 없는 유형` appears unless all fallback inputs are impossible. Evidence `.omo/evidence/task-7-unsupervised-clustering-v2.txt`.
  Commit: Y | `fix(clustering): validate llm cluster names`

- [ ] 8. Integration regression sweep: prove v2 clustering works end-to-end without live infra or LLM
  What to do / Must NOT do: Tie together v2 feature extraction, seeded KMeans, v2 Redis keys, historical-summary training, labeler assignment, and fallback behavior. Use fake Redis and mock LLM only. Update any validation/seed scripts only if they break normal `npm test`; do not make routine tests call real OpenAI. Ensure `/api/labels/clustering-summary` existing behavior remains compatible if covered by service tests, but do not introduce browser/UI work unless current backend changes require it.
  Parallelization: Wave 4 final | Blocked by: 5, 6, 7 | Blocks: final verification
  References (executor has NO interview context - be exhaustive): `dashboard-be/analytics/clusteringLabeler.js:40-106` (assignment/fallback/cache); `dashboard-be/server.js` clustering summary route (existing route using clustering labeler); `dashboard-be/services/analytics/redis-session-analytics-service.js` (historical analytics source); `dashboard-be/package.json:12` (`node --test`); `dashboard-be/scripts/validate-clustering.js` and `dashboard-be/scripts/seed-archetype-sessions.js` if normal test discovery touches them.
  Acceptance criteria (agent-executable): Run focused suite `node --test dashboard-be/test/clustering-*.test.js dashboard-be/test/redis-session-analytics-service.test.js`, full suite `npm test --workspace dashboard-be`, syntax checks for all changed files, and `git diff --check`. All must pass.
  QA scenarios (name the exact tool + invocation): Happy: fake historical summaries produce taxonomy, labeler assigns at least one session with `source: "clustering"`, and selected-period summary uses historical sessions. Failure: v2 taxonomy absent/mismatched or mock LLM broken falls back to rule-base/deterministic names without throwing. Evidence `.omo/evidence/task-8-unsupervised-clustering-v2.txt`.
  Commit: Y | `test(clustering): cover historical v2 pipeline`

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: read this plan and final diff; verify every Must Have is implemented and every Must NOT is preserved. Evidence `.omo/evidence/f1-unsupervised-clustering-v2-plan-compliance.md`.
- [ ] F2. Code quality review: inspect clustering/session changes for overcoupling, hidden globals, unbounded Redis payloads, schema mismatch risks, and flaky randomness. Evidence `.omo/evidence/f2-unsupervised-clustering-v2-code-quality.md`.
- [ ] F3. Real manual QA: execute agent-driven backend smoke with fake Redis/mock LLM or local test harness; prove historical summaries can train and label without live Redis/Kafka/OpenAI. Evidence `.omo/evidence/f3-unsupervised-clustering-v2-manual-qa.md`.
- [ ] F4. Scope fidelity: verify no unrelated UI redesign, no v1 key deletion, no per-period retraining, no live infra requirement in tests. Evidence `.omo/evidence/f4-unsupervised-clustering-v2-scope.md`.

## Commit strategy
- Prefer 4-6 atomic commits if the worker is asked to commit:
  1. `fix(session): preserve historical path sequence`
  2. `feat(clustering): add v2 feature schema`
  3. `fix(clustering): make kmeans deterministic`
  4. `feat(clustering): version taxonomy storage`
  5. `fix(clustering): train from historical summaries`
  6. `test(clustering): cover historical v2 pipeline`
- Before committing: inspect `git status`, `git diff`, `git log --oneline -10`; stage only intended product/test files, not `.omo/evidence` unless explicitly requested.
- Do not amend, force-push, or push unless explicitly requested.

## Success criteria
- Live TTL session expiration no longer prevents clustering training when historical summaries exist.
- Historical summaries preserve ordered repeated path information via `path_sequence` while existing dashboard aliases remain available.
- Clustering taxonomy/norm persistence is v2 schema-aware and does not corrupt or delete v1 Redis keys.
- Same input + same seed produces identical KMeans assignments/centroids and stable taxonomy naming order.
- LLM naming rejects malformed/low-quality names and falls back to deterministic Korean names.
- Normal backend tests pass without Redis, Docker, Kafka, or real LLM/API keys.
- Full verification commands pass: focused clustering tests, full `npm test --workspace dashboard-be`, changed-file `node --check`, and `git diff --check`.
