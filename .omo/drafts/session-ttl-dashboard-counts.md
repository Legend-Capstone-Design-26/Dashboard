---
slug: session-ttl-dashboard-counts
status: awaiting-approval
intent: clear
pending-action: write .omo/plans/session-ttl-dashboard-counts.md
approach: Fix the disappearing dashboard session count/type proportions by separating historical analytics from the 30-minute live Redis session-state TTL: keep Redis session keys as the live read model, but add a durable/historical session+label fallback or aggregate path for dashboard totals and proportions, with regression tests proving counts do not drop solely because session keys expire.
---

# Draft: session-ttl-dashboard-counts

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| C1 Redis session lifecycle | Confirm/update Redis session state TTL behavior without accidentally breaking live session freshness | active | dashboard-be/services/runtime/infra-config.js:27-33; dashboard-be/services/stores/redis-session-store.js:31-87; dashboard-be/workers/event-consumer.js:102-112 |
| C2 Dashboard sessions API | Ensure `/api/sessions` has a stable source for dashboard-visible sessions beyond live-key expiry | active | dashboard-be/server.js:1549-1563; dashboard-be/services/analytics/redis-session-analytics-service.js:88-105 |
| C3 Dashboard label/type summary API | Ensure `/api/labels/summary` and clustering summary do not lose historical counts solely because Redis session keys expired | active | dashboard-be/server.js:1565-1614; dashboard-be/services/analytics/redis-session-analytics-service.js:107-117; dashboard-be/analytics/pipeline.js:138-176 |
| C4 Frontend rendering contract | Keep the existing dashboard UI contract while clarifying/using stable session totals and type shares | active | dashboard-fe/public/dashboard.js:1137-1188; dashboard-fe/public/dashboard.js:2638-2684; dashboard-fe/public/dashboard.js:3038-3129; dashboard-fe/public/dashboard.html:120-167 |
| C5 Regression/QA | Add tests that reproduce key expiry/count loss and prove the chosen fix | active | dashboard-be/test/redis-session-store.test.js:37-80; dashboard-be/test/redis-session-analytics-service.test.js:68-117; dashboard-be/package.json:6-15; package.json:10-19 |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Product meaning of top-card “세션 수” | Treat it as selected-period analytics count, not only currently-live sessions in Redis | User observed disappearance as a bug; dashboard copy says selected period/current site aggregate, and frontend passes `from_ts/to_ts` for period filters | yes |
| Redis session key purpose | Keep 30-minute default TTL for live session state unless explicitly changed | The current default matches live session inactivity semantics and SDK status logic also uses 30 minutes; changing it globally could mask memory/retention decisions | yes |
| Historical source | Prefer existing durable event JSONL analytics path as fallback/bridge if no dedicated persistent session aggregate exists | Repo already retains `events.jsonl` and `analytics/pipeline.js` as legacy historical components; it can derive sessions and labels with period filtering | yes |
| Frontend behavior | Avoid UI redesign; preserve endpoints/rendering shape unless API response fields need a small explanatory `source`/`fallback_used` addition | The bug is data disappearance, not visual layout | yes |
| Test strategy | Tests-after with targeted regression tests, because the cause is now confirmed and repo already has backend node:test coverage | Existing backend tests cover store/list/label summaries but not expiry/fallback behavior | yes |

## Findings (cited - path:lines)
- `REDIS_SESSION_TTL_SEC` defaults to 1800 seconds (30 minutes) in `dashboard-be/services/runtime/infra-config.js:27-33`.
- Redis session keys are `session:<siteId>:<sessionId>` and `upsertSessionState()` writes them with `SET ... EX sessionTtlSec` in `dashboard-be/services/stores/redis-session-store.js:5-9` and `dashboard-be/services/stores/redis-session-store.js:82-87`.
- `listSessionStates()` scans existing session keys and reads only non-expired values; expired keys simply disappear from the result set in `dashboard-be/services/stores/redis-session-store.js:31-60`.
- Kafka consumer refreshes the Redis session state on every event by reading current state, merging the event, and calling `upsertSessionState()` in `dashboard-be/workers/event-consumer.js:102-112`.
- `/api/sessions` returns `redisSessionAnalyticsService.getSessions()`, which calls `listSessionStates()` in `dashboard-be/server.js:1549-1563` and `dashboard-be/services/analytics/redis-session-analytics-service.js:88-105`.
- `/api/labels/summary` returns `redisSessionAnalyticsService.getLabelsSummary()`, which also starts from `listSessionStates()` in `dashboard-be/server.js:1565-1579` and `dashboard-be/services/analytics/redis-session-analytics-service.js:107-117`.
- `/api/labels/clustering-summary` also starts from `redisSessionStore.listSessionStates()` before labeling in `dashboard-be/server.js:1581-1614`.
- Type share/proportion is recomputed as `sessions / total` from the current labeled session list in `dashboard-be/analytics/pipeline.js:138-176`.
- Frontend fetches `/api/sessions`, `/api/labels/summary`, or `/api/labels/clustering-summary` and renders session total/proportions from those responses in `dashboard-fe/public/dashboard.js:1137-1188`, `dashboard-fe/public/dashboard.js:2638-2684`, and `dashboard-fe/public/dashboard.js:3038-3129`.
- Existing durable/raw event path can derive historical sessions and labels: file event store appends/reads JSONL in `dashboard-be/services/stores/event-store.js:3-27`; JSONL reader supports `siteId/fromTs/toTs/limit` in `dashboard-be/analytics/events.js:56-83`; pipeline builds sessions/labels/summary in `dashboard-be/analytics/pipeline.js:105-176`.
- Redis event summary has non-expiring Redis aggregates for event totals/trend/session sets, but not full session label/type proportions in `dashboard-be/services/stores/redis-event-summary-store.js:78-197`.
- Current tests cover Redis session listing and Redis analytics summaries but not TTL expiry/fallback behavior: `dashboard-be/test/redis-session-store.test.js:37-80`; `dashboard-be/test/redis-session-analytics-service.test.js:68-117`.

## Decisions (with rationale)
- Root cause diagnosis: the disappearing “세션 수” and “유형별 비중” is expected from the current implementation because both are derived from live Redis session keys that expire after 30 minutes by default.
- Plan should not simply raise `REDIS_SESSION_TTL_SEC` as the only fix. Raising TTL can be a deployment workaround, but it conflates live session-state retention with selected-period analytics and may grow Redis memory without durable history semantics.
- Preferred implementation plan: keep live Redis session TTL behavior, then add a stable selected-period analytics path for dashboard session/label data, using the existing JSONL/pipeline path as the nearest existing durable source unless the worker creates a dedicated persistent aggregate in the plan.
- Verification must include a regression that simulates/forces Redis session expiry and proves dashboard label/session results remain correct from the historical source or clearly documented fallback.

## Scope IN
- Explain and fix the 30-minute disappearance of dashboard “세션 수”.
- Explain and fix the matching disappearance/change of “유형별 비중” because it is recomputed from the same live session set.
- Backend route/service/store changes needed for stable selected-period session and label summaries.
- Tests for Redis TTL behavior, session/label API behavior after live-key expiry, and existing no-regression paths.
- Minimal frontend changes only if needed to preserve a clear source/error/fallback display.

## Scope OUT (Must NOT have)
- Must not redesign the dashboard UI or change visual layout unless required for a tiny status/source label.
- Must not remove Redis/Kafka as the primary live read model.
- Must not remove existing `REDIS_SESSION_TTL_SEC` configurability.
- Must not re-enable unsafe file fallback for `/collect` as the primary ingestion path without explicit approval.
- Must not make LLM/clustering calls part of normal tests.
- Must not edit product code during planning.

## Open questions
- Owner decision: Should the dashboard top-card “세션 수” mean selected-period historical sessions (recommended) or only currently-live Redis sessions? Recommendation: selected-period historical sessions, because the UI already exposes period filtering and the reported behavior is understood as data loss.
- Owner decision: For a quick mitigation, should production also set `REDIS_SESSION_TTL_SEC` higher while the durable analytics fix lands? Recommendation: no code-level assumption; mention as ops workaround only.

## Approval gate
status: awaiting-approval
pending action: fill `.omo/plans/session-ttl-dashboard-counts.md` with an executable implementation plan using the approach above.
approval needed: confirm the recommended meaning of “세션 수” as selected-period historical sessions and approve plan generation. If you skip the question, I will use the recommended default.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
