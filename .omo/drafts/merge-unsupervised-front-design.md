---
slug: merge-unsupervised-front-design
status: plan-written
intent: clear
pending-action: complete .omo/plans/merge-unsupervised-front-design.md with executable merge todos
approach: create a guarded merge plan that starts from origin/front/design or a protected merge branch, preserves front/design UI changes, merges feature/unsupervised, resolves the only real content conflict in dashboard-fe/public/dashboard.css by keeping both style blocks, excludes local artifact files, and verifies backend/API/UI/test behavior before any final commit.
---

# Draft: merge-unsupervised-front-design

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
| C1 | Branch/worktree hygiene: merge without accidentally committing local artifacts or overwriting the local front/design-only commit | active | `git branch -vv`; `git diff --name-status origin/front/design..front/design` |
| C2 | Backend clustering integration: keep new clustering modules, Redis taxonomy state, API endpoint, and worker trigger while preserving Redis runtime/store fixes from main/front/design | active | `dashboard-be/server.js:1479-1513`; `dashboard-be/workers/event-consumer.js:45-73`; merge-tree backend sections |
| C3 | Frontend dashboard integration: keep front/design dashboard layout and add rule-based/unsupervised toggle, clustering notice, and clustering fetch/render path | active | `dashboard-fe/public/dashboard.html:165-174,287-292`; `dashboard-fe/public/dashboard.js:1043-1075`; `dashboard-fe/public/dashboard.css:4587-4630` |
| C4 | Conflict resolution: resolve the merge-tree conflict in dashboard CSS without dropping front/design's large design update or the clustering toggle styles | active | `git merge-tree $(git merge-base HEAD origin/front/design) origin/front/design HEAD`; `git merge-tree --write-tree origin/front/design HEAD` |
| C5 | Verification and CI safety: run syntax/tests/diff checks and account for the LLM-backed clustering script being unintentionally picked up by `node --test` | active | `package.json:10-19`; `dashboard-be/package.json:6-15`; `dashboard-be/scripts/test-clustering.js:1-10` |

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
<!-- assumption | adopted default | rationale | reversible? -->
| Merge target | Plan against `origin/front/design` via a protected local merge branch, not by directly rewriting local `front/design` | Local `front/design` is ahead of origin by one commit containing `.DS_Store` and `.omo/run-continuation/*`; using a protected merge branch avoids destructive reset and avoids committing artifacts | yes |
| First merge direction | Bring current `origin/main`/front-design fixes into the target baseline before or as part of the `feature/unsupervised` merge, rather than cherry-picking only clustering files | `feature/unsupervised` is based on `origin/main`; `origin/front/design` lacks Redis runtime/store/test fixes that are already in main and interact with clustering session reads | yes |
| CSS conflict policy | Keep both front/design's existing style block and feature/unsupervised's `.labelModeToggle` / `.clusteringNotice` styles, placing clustering styles after the front/design section | Merge-tree reports only `dashboard-fe/public/dashboard.css` as a content conflict; the two sides append non-overlapping UI styling near EOF | yes |
| Test strategy | Use tests-after plus explicit syntax checks and UI/API smoke checks | The task is a merge plan, not new feature design; behavior already exists on feature branch but merge conflicts can break integration | yes |
| LLM test risk | Do not let normal `npm test` require a real OpenAI/UX_INSIGHTS key; either keep `scripts/test-clustering.js` out of node:test discovery or gate it as a manual script | The file name matches `node --test` discovery and its header says it calls the real OpenAI API | yes |

## Findings (cited - path:lines)
- Current branch is `feature/unsupervised` at `136e15a [Modify] 비지도학습 가중치 제거`; working tree has `.omo/` untracked after planning.
- `origin/front/design...HEAD` includes 22 changed files: clustering modules/docs/script, backend server/session/worker changes, Redis runtime/store/test changes from main, and dashboard CSS/HTML/JS changes.
- `git merge-tree --write-tree origin/front/design HEAD` reports one content conflict in `dashboard-fe/public/dashboard.css`; `dashboard-fe/public/dashboard.html` and `dashboard-fe/public/dashboard.js` auto-merge.
- Full merge-tree output confirms backend files merge cleanly while adding `/api/labels/clustering-summary`, clustering labeler construction, semantic session signals, and background clustering trigger.
- `dashboard-be/server.js:1479-1513` exposes `/api/labels/clustering-summary` using Redis session states, `createClusteringLabeler`, taxonomy load, and fallback flag.
- `dashboard-be/workers/event-consumer.js:50-73` increments a clustering session count on dwell-time session end and runs clustering in the background when `shouldRecluster` permits it.
- `dashboard-fe/public/dashboard.html:171-174` adds the `규칙 기반` / `비지도 학습` toggle; `dashboard-fe/public/dashboard.html:290-292` adds a mode hint and clustering notice.
- `dashboard-fe/public/dashboard.js:1043-1075` switches the labels summary endpoint based on `state.labelMode`, using `/api/labels/clustering-summary` in clustering mode and preserving `/api/labels/summary` in rule-base mode.
- `dashboard-fe/public/dashboard.css:4587-4630` currently contains the clustering toggle and notice styles; merge-tree against the older `origin/front/design` shows these conflict with front/design's appended CSS updates, so the resolution must retain both.
- `git diff --check origin/front/design...HEAD` reports trailing whitespace only in `dashboard-be/analytics/CLUSTERING_DESIGN.md` lines 38, 64, 72, 73, 89, 111, 125.
- Root `package.json:10-19` delegates `npm test` to the backend workspace; `dashboard-be/package.json:12` runs `node --test`.
- `dashboard-be/scripts/test-clustering.js:1-10` describes a manual clustering validation script that requires an OpenAI API key; because its basename starts with `test-`, it can be discovered by `node --test` and should be guarded/renamed or excluded in the merge work.
- Local `front/design` is ahead of `origin/front/design` by one commit and that local-only diff contains `.DS_Store` and `.omo/run-continuation/*.json`; the merge plan must not commit those artifacts.

## Decisions (with rationale)
- Use a protected merge branch/worktree for the actual merge and keep final target updates explicit. Rationale: local `front/design` contains unpushed artifacts, so direct checkout/merge risks polluting the branch or forcing a destructive cleanup decision.
- Treat `origin/front/design` + current `feature/unsupervised` as the intended branch pair unless the user vetoes this in the approval gate. Rationale: the user's stated future merge is feature into front/design, and origin refs are the clean shared baseline.
- Resolve the CSS conflict by preserving front/design's design styles and appending the clustering styles after them. Rationale: merge-tree shows both sides add independent CSS blocks; deleting either would regress a branch-specific feature.
- Keep backend Redis runtime/store/test changes that come from main/current feature history. Rationale: clustering depends on Redis session reads, and main already contains compatibility fixes for Redis connection/session reads.
- Add a CI-safety todo for the clustering script before relying on `npm test`. Rationale: the current script can make a real LLM call and is discoverable by `node --test`.

## Scope IN
- A step-by-step executable plan for safely merging `feature/unsupervised` into `front/design`.
- Branch hygiene and artifact protection for `.DS_Store`, `.omo/`, and the local `front/design` ahead commit.
- Conflict-resolution instructions for `dashboard-fe/public/dashboard.css` and verification that auto-merged HTML/JS keep both design and clustering behavior.
- Backend/API/worker verification for Redis session-state clustering, taxonomy fallback, and `/api/labels/clustering-summary`.
- Test/syntax/diff verification, including avoiding accidental real LLM calls in routine tests.

## Scope OUT (Must NOT have)
- Must not implement the merge now; execution starts only after explicit `$start-work` or equivalent.
- Must not reset, drop, or rewrite the local `front/design` ahead commit without a separate explicit user decision.
- Must not commit `.DS_Store`, `.omo/run-continuation/*`, `.omo/drafts/*`, or planning artifacts into product/history unless the user separately asks to version `.omo` plans.
- Must not redesign the clustering feature, change K-Means behavior, or change product UX beyond preserving the existing toggle/notice behavior through the merge.
- Must not require a real OpenAI/UX_INSIGHTS API key for the normal test suite.

## Open questions
- None blocking. Recommended defaults are recorded above; the user can veto them at the approval gate.

## Approval gate
status: awaiting-approval
pending action: complete `.omo/plans/merge-unsupervised-front-design.md` with decision-complete todos using the approach above.
approval requested: user explicitly approves the recommended merge-planning approach or vetoes one of the announced defaults.
plan written: `.omo/plans/merge-unsupervised-front-design.md`
metis review folded in: branch refs made explicit, artifact exclusion hardened, CSS selector acceptance specified, LLM test risk resolved to rename/gate default, auth-aware API smoke added, commit/push boundaries filled.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
