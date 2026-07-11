# merge-unsupervised-front-design - Work Plan

## TL;DR (For humans)

**What you'll get:** A safe merge path for bringing the unsupervised clustering work into the design branch without losing the dashboard design updates or accidentally committing local machine/planning artifacts. The final branch should keep both the existing rule-based UX labels and the new unsupervised-learning toggle.

**Why this approach:** The safest route is to merge from clean remote refs on a protected merge branch, because the local design branch has an extra artifact-only commit. The only confirmed content conflict is dashboard CSS, so the plan preserves both style blocks instead of choosing one side.

**What it will NOT do:** It will not reset or rewrite the local `front/design` branch, will not push to the remote design branch without a separate explicit approval, and will not require a real OpenAI key for the normal test suite.

**Effort:** Short
**Risk:** Medium - the merge is small, but it touches dashboard UI, backend API, Redis session reads, and test discovery.
**Decisions to sanity-check:** Use clean `origin/front/design` rather than local `front/design`; keep both CSS blocks; rename/gate the manual clustering validation script so `npm test` stays offline-safe.

Your next move: Start work with `$start-work` if you want the worker to execute this plan, or ask for a high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Short/medium-risk guarded git merge plan; protected branch from `origin/front/design`, merge `origin/feature/unsupervised`, resolve CSS by keeping both design and clustering styles, then post-merge CI-safety cleanup and verification.

## Scope
### Must have
- Create and use a protected local merge branch from the clean remote target ref `origin/front/design`.
- Merge `origin/feature/unsupervised` into that protected branch without using local `front/design` as an input.
- Preserve backend clustering additions:
  - `dashboard-be/analytics/CLUSTERING_DESIGN.md`
  - `dashboard-be/analytics/clustering/clusterStore.js`
  - `dashboard-be/analytics/clustering/clusteringOrchestrator.js`
  - `dashboard-be/analytics/clustering/featureExtractor.js`
  - `dashboard-be/analytics/clustering/kmeans.js`
  - `dashboard-be/analytics/clustering/llmNamer.js`
  - `dashboard-be/analytics/clustering/taxonomyMapper.js`
  - `dashboard-be/analytics/clusteringLabeler.js`
- Preserve backend integration points:
  - `dashboard-be/server.js` imports `createClusteringLabeler`, `computeLabelsSummary`, `loadTaxonomy`, and `normalizeRedisSessionStateToSummary`.
  - `dashboard-be/server.js` exposes authenticated `/api/labels/clustering-summary` with Redis-unavailable handling.
  - `dashboard-be/workers/event-consumer.js` triggers background clustering from `dwell_time` session-end events.
  - `dashboard-be/services/analytics/session-state.js` keeps semantic signal detection and `wishlist_count` / cart / search / filter / payment counters.
- Preserve frontend integration points:
  - `dashboard-fe/public/dashboard.html` has the `규칙 기반` / `비지도 학습` toggle in the 유형별 비중 card.
  - `dashboard-fe/public/dashboard.html` has `labelsModeHint` and `clusteringNotice` in the 유형별 지표 card.
  - `dashboard-fe/public/dashboard.js` switches between `/api/labels/summary` and `/api/labels/clustering-summary` based on `state.labelMode`.
  - `dashboard-fe/public/dashboard.css` keeps both front/design's appended design styles and the clustering selectors `.labelModeToggle` and `.clusteringNotice`.
- Keep normal test execution offline-safe: `npm test` must not require `OPENAI_API_KEY` or `UX_INSIGHTS_API_KEY`.
- Remove known trailing whitespace from `dashboard-be/analytics/CLUSTERING_DESIGN.md` so `git diff --check` passes.
- Leave a final branch that passes syntax checks, `npm test`, conflict-marker search, artifact search, and smoke checks.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Must not edit product code outside the merge/conflict-resolution/CI-safety needs listed here.
- Must not reset, delete, or rewrite the local `front/design` branch or its local-only commit.
- Must not commit `.DS_Store`, `.omo/`, `.omo/run-continuation/*`, `.omo/drafts/*`, `.omo/plans/*`, or any planning/evidence files.
- Must not push to `origin/front/design` or any protected remote branch without explicit user approval after verification.
- Must not remove front/design dashboard design changes to make the CSS conflict easier.
- Must not remove the unsupervised clustering UI/API/worker behavior to make the merge easier.
- Must not make real LLM calls from the standard automated test suite.
- Must not change clustering thresholds, K-Means behavior, taxonomy semantics, auth policy, or site-access policy unless a failing verification proves a merge-induced break.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: tests-after. This is a merge/integration plan, so preserve behavior first, then prove the final merged state.
- Evidence directory: `.omo/evidence/merge-unsupervised-front-design/` created by the worker but never committed.
- Required command evidence:
  - `git status --short --branch`
  - `git merge-base --is-ancestor origin/front/design HEAD` after branch setup or recorded branch log proving clean base
  - `git diff --name-only --diff-filter=U`
  - `git diff --check`
  - `npm test`
  - `node --check dashboard-be/server.js`
  - `node --check dashboard-be/workers/event-consumer.js`
  - `node --check dashboard-be/services/analytics/session-state.js`
  - `node --check dashboard-fe/public/dashboard.js`
  - artifact/staged-file check that fails if `.DS_Store` or `.omo/` is staged
  - conflict marker check for `<<<<<<<`, `=======`, `>>>>>>>` in product files
- API smoke must be authenticated because `/api/labels/clustering-summary` is guarded by `requireAuth` and `requireSiteAccess`. The worker may satisfy this with either:
  - an existing repo-supported authenticated browser/session flow, or
  - a temporary local smoke script under `/tmp` or `.omo/evidence/` that uses the app's auth/session mechanism without committing it.
- Browser/UI smoke must be agent-driven, not human-driven: open `/dashboard`, toggle `비지도 학습`, verify the button active state changes and the label summary area renders either clustering data, fallback notice, or empty clustering message without console errors.

## Execution strategy
### Parallel execution waves
- Wave 1 - branch safety and merge mechanics: create protected branch, confirm no artifacts, perform merge without committing until conflicts are understood.
- Wave 2 - conflict resolution and merge commit: resolve CSS, verify auto-merged backend/frontend integration points, create the merge commit.
- Wave 3 - post-merge CI safety cleanup: rename or gate the manual clustering script and remove whitespace; commit separately.
- Wave 4 - verification: run syntax, tests, API smoke, UI smoke, artifact checks, and final plan compliance review.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 8 | none |
| 2 | 1 | 3, 4 | none |
| 3 | 2 | 4, 5 | none |
| 4 | 3 | 5 | none |
| 5 | 4 | 6, 7, 8 | none |
| 6 | 5 | 8 | 7 |
| 7 | 5 | 8 | 6 |
| 8 | 6, 7 | Final verification | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Branch hygiene: Create protected merge branch from clean remote target - expect no local artifact input
  What to do / Must NOT do: Fetch remotes, record current local state, then create a protected local branch from `origin/front/design`, for example `merge/unsupervised-into-front-design`. Do not use local `front/design` as the merge base because it is ahead of origin by an artifact-only commit. Do not delete or reset local `front/design`.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 8
  References (executor has NO interview context - be exhaustive): `.omo/drafts/merge-unsupervised-front-design.md:23`; `.omo/drafts/merge-unsupervised-front-design.md:42`; current discovery showed local `front/design` ahead by `.DS_Store` and `.omo/run-continuation/*.json`.
  Acceptance criteria (agent-executable): Evidence file `.omo/evidence/merge-unsupervised-front-design/task-1-branch.txt` contains outputs for `git fetch --all --prune`, `git status --short --branch`, `git branch -vv`, `git checkout -B merge/unsupervised-into-front-design origin/front/design`, and a final `git status --short --branch` showing the active branch is `merge/unsupervised-into-front-design` with no staged files.
  QA scenarios (name the exact tool + invocation): Happy - run `git rev-parse --abbrev-ref HEAD` and verify it prints `merge/unsupervised-into-front-design`; Failure - run `git diff --name-status origin/front/design..HEAD` immediately after branch creation and verify it is empty before merging. Evidence `.omo/evidence/merge-unsupervised-front-design/task-1-branch.txt`.
  Commit: N | branch setup only.

- [ ] 2. Merge mechanics: Merge origin/feature/unsupervised without committing - expect only known conflict surface
  What to do / Must NOT do: Run `git merge --no-ff --no-commit origin/feature/unsupervised` from the protected merge branch. If Git reports conflicts, do not commit yet. Do not stage `.DS_Store`, `.omo/`, or evidence files. If unexpected conflicts appear outside `dashboard-fe/public/dashboard.css`, stop and record them in evidence before resolving.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 3, 4
  References (executor has NO interview context - be exhaustive): `.omo/drafts/merge-unsupervised-front-design.md:31-33`; `.omo/drafts/merge-unsupervised-front-design.md:45-49`; merge-tree discovery reported `dashboard-fe/public/dashboard.css` as the only content conflict while HTML/JS auto-merge.
  Acceptance criteria (agent-executable): Evidence `.omo/evidence/merge-unsupervised-front-design/task-2-merge.txt` records the merge command, `git status --short`, and `git diff --name-only --diff-filter=U`. The only allowed unresolved path at this stage is `dashboard-fe/public/dashboard.css`; if there are more, the worker must stop for user guidance instead of guessing.
  QA scenarios (name the exact tool + invocation): Happy - `git diff --name-only --diff-filter=U` prints only `dashboard-fe/public/dashboard.css`; Failure - if the command prints any backend file, abort the merge with `git merge --abort`, preserve evidence, and report the unexpected conflict list. Evidence `.omo/evidence/merge-unsupervised-front-design/task-2-merge.txt`.
  Commit: N | merge is intentionally uncommitted.

- [ ] 3. CSS conflict: Preserve front/design styles and clustering styles - expect no conflict markers and both selector families present
  What to do / Must NOT do: Resolve `dashboard-fe/public/dashboard.css` by keeping the front/design appended design styles and appending the feature branch clustering styles after them. Required clustering block starts with `/* ===== 분류 방식 토글 ===== */` and includes `.labelModeToggle`, `.labelModeToggle .toggleBtn`, `.labelModeToggle .toggleBtn.active`, `/* ===== 클러스터링 알림 배너 ===== */`, and `.clusteringNotice`. Do not delete front/design trend/period/opportunity styles that were adjacent to the conflict. Do not leave conflict markers.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 4, 5
  References (executor has NO interview context - be exhaustive): `dashboard-fe/public/dashboard.css:4587-4630` contains the clustering selectors on the feature branch; `.omo/drafts/merge-unsupervised-front-design.md:25`; `.omo/drafts/merge-unsupervised-front-design.md:38`; merge-tree conflict showed the feature clustering CSS competing with front/design's appended CSS block near EOF.
  Acceptance criteria (agent-executable): `git diff --name-only --diff-filter=U` is empty after resolution; `dashboard-fe/public/dashboard.css` contains `.labelModeToggle` and `.clusteringNotice`; product files contain no `<<<<<<<`, `=======`, or `>>>>>>>`; the CSS file still contains front/design's appended design selectors from the conflict region.
  QA scenarios (name the exact tool + invocation): Happy - run a conflict-marker search over `dashboard-be` and `dashboard-fe` and save no-match output; run a selector assertion script such as `node -e "const fs=require('fs');const s=fs.readFileSync('dashboard-fe/public/dashboard.css','utf8');for (const x of ['.labelModeToggle','.clusteringNotice']) if(!s.includes(x)) throw new Error(x);"`; Failure - if a selector is missing or conflict markers remain, do not proceed to commit. Evidence `.omo/evidence/merge-unsupervised-front-design/task-3-css.txt`.
  Commit: N | stage only after todo 4 confirms all integration points.

- [ ] 4. Integration audit: Confirm auto-merged backend and frontend keep both branches' behavior - expect API, worker, session signals, and UI toggle present
  What to do / Must NOT do: Inspect auto-merged files and make minimal merge-resolution corrections only if an integration point is missing. Confirm backend clustering additions, Redis/session-store compatibility changes, dashboard toggle HTML, dashboard fetch/render logic, and auth-guarded API endpoint all survived. Do not redesign UI or clustering logic.
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `dashboard-be/server.js:1479-1513`; `dashboard-be/workers/event-consumer.js:45-73`; `dashboard-fe/public/dashboard.html:165-174`; `dashboard-fe/public/dashboard.html:287-292`; `dashboard-fe/public/dashboard.js:1043-1075`; `.omo/drafts/merge-unsupervised-front-design.md:34-38`.
  Acceptance criteria (agent-executable): Node assertion script verifies all required strings are present: `app.get("/api/labels/clustering-summary"`, `createClusteringLabeler`, `loadTaxonomy`, `normalizeRedisSessionStateToSummary`, `runClustering`, `shouldRecluster`, `labelModeToggle`, `clusteringNotice`, `/api/labels/clustering-summary`, and `/api/labels/summary`. `git diff --name-only --diff-filter=U` remains empty.
  QA scenarios (name the exact tool + invocation): Happy - run `node --check dashboard-be/server.js`, `node --check dashboard-be/workers/event-consumer.js`, `node --check dashboard-be/services/analytics/session-state.js`, and `node --check dashboard-fe/public/dashboard.js`; Failure - any syntax check failure blocks staging/commit until fixed. Evidence `.omo/evidence/merge-unsupervised-front-design/task-4-integration.txt`.
  Commit: N | audit before staging and committing in todo 5.

- [ ] 5. Merge commit: Commit only intended merge files - expect no artifacts or plan files staged
  What to do / Must NOT do: Stage resolved product/test files from the merge only. Before committing, verify staged names do not include `.DS_Store`, `.omo/`, `.omo/run-continuation/*`, `.omo/drafts/*`, `.omo/plans/*`, or `.omo/evidence/*`. Create the merge commit after todo 4 passes. Do not include post-merge CI-safety cleanup in this merge commit unless Git requires it to complete the merge.
  Parallelization: Wave 2 | Blocked by: 4 | Blocks: 6, 7, 8
  References (executor has NO interview context - be exhaustive): `.omo/drafts/merge-unsupervised-front-design.md:58-63`; Metis gap analysis flagged artifact exclusion and commit boundaries as required hard criteria.
  Acceptance criteria (agent-executable): `git diff --cached --name-only` contains no path matching `(^|/)\.DS_Store$` and no path beginning `.omo/`; `git status --short` before commit shows only intended merge paths staged/unmerged none; `git log --oneline -1` after commit shows a merge commit with two parents.
  QA scenarios (name the exact tool + invocation): Happy - run `node -e "const {execSync}=require('child_process');const names=execSync('git diff --cached --name-only',{encoding:'utf8'}).trim().split(/\n/).filter(Boolean);const bad=names.filter(n=>/(^|\/)\.DS_Store$/.test(n)||n.startsWith('.omo/'));if(bad.length) throw new Error('forbidden staged paths: '+bad.join(','));"`; Failure - if forbidden paths are staged, unstage them before commit and rerun the check. Evidence `.omo/evidence/merge-unsupervised-front-design/task-5-commit.txt`.
  Commit: Y | merge: merge origin/feature/unsupervised into front/design baseline.

- [ ] 6. CI safety cleanup: Rename or gate manual clustering script and remove whitespace - expect npm test does not call real LLM
  What to do / Must NOT do: Pick the concrete default: rename `dashboard-be/scripts/test-clustering.js` to `dashboard-be/scripts/validate-clustering.js` and update the script header usage text from `node scripts/test-clustering.js` to `node scripts/validate-clustering.js`. If rename is impossible, add a top-level `node:test` guard that prevents automatic test discovery from executing real LLM calls; rename remains preferred. Remove trailing whitespace in `dashboard-be/analytics/CLUSTERING_DESIGN.md`. Do not change clustering math or prompts.
  Parallelization: Wave 3 | Blocked by: 5 | Blocks: 8 | Can parallelize with: 7 after merge commit exists, but run before final full test if possible.
  References (executor has NO interview context - be exhaustive): `package.json:16`; `dashboard-be/package.json:12`; `dashboard-be/scripts/test-clustering.js:1-10`; `.omo/drafts/merge-unsupervised-front-design.md:39-41`; Metis recommended choosing rename over ambiguous guard/rename.
  Acceptance criteria (agent-executable): `npm test` can run without `OPENAI_API_KEY` and without `UX_INSIGHTS_API_KEY`; `git diff --check` reports no trailing whitespace; repository has `dashboard-be/scripts/validate-clustering.js` and no tracked `dashboard-be/scripts/test-clustering.js` unless a guard alternative is documented in evidence.
  QA scenarios (name the exact tool + invocation): Happy - run `env -u OPENAI_API_KEY -u UX_INSIGHTS_API_KEY npm test` and `git diff --check`; Failure - if `npm test` fails asking for an API key or calling OpenAI, fix discovery/gating before proceeding. Evidence `.omo/evidence/merge-unsupervised-front-design/task-6-ci-safety.txt`.
  Commit: Y | test(clustering): keep manual clustering validation out of node test discovery.

- [ ] 7. API and UI smoke: Prove rule-base and clustering label modes render after merge - expect auth-safe smoke evidence
  What to do / Must NOT do: Start the app in a controlled local process, authenticate through the repo-supported flow, and exercise `/dashboard`. Toggle from `규칙 기반` to `비지도 학습`. Verify the UI updates active button state and renders either clustering data, fallback notice, or empty clustering message. Smoke `/api/labels/clustering-summary?site_id=<accessible-site>` with an authenticated request. Do not weaken `requireAuth` or `requireSiteAccess` to make the smoke pass.
  Parallelization: Wave 4 | Blocked by: 5 | Blocks: 8 | Can parallelize with: 6 after merge commit, but final pass must occur after 6 if scripts changed.
  References (executor has NO interview context - be exhaustive): `dashboard-be/server.js:1479-1513`; `dashboard-fe/public/dashboard.html:171-174`; `dashboard-fe/public/dashboard.html:290-292`; `dashboard-fe/public/dashboard.js:1043-1075`; `.omo/drafts/merge-unsupervised-front-design.md:55`.
  Acceptance criteria (agent-executable): Evidence includes an authenticated API response JSON with `ok: true` or a documented Redis-unavailable response if Redis is intentionally unavailable; browser automation evidence shows `비지도 학습` button `aria-pressed="true"` after click and no uncaught console errors from `dashboard.js`.
  QA scenarios (name the exact tool + invocation): Happy - use Playwright/browser automation to open `/dashboard`, click `[data-mode="clustering"]`, assert active state, and save screenshot/console log under `.omo/evidence/merge-unsupervised-front-design/task-7-ui.*`; Failure - if redirected to login or site access fails, fix the auth/session setup in the smoke harness, not product auth. Evidence `.omo/evidence/merge-unsupervised-front-design/task-7-ui.txt` plus screenshot/log.
  Commit: N | smoke/evidence only unless a merge-induced bug fix is required; if a bug fix is required, commit separately with `fix(dashboard): repair clustering mode after merge`.

- [ ] 8. Final local verification: Prove final branch is clean, complete, and not pushed - expect worker-ready handoff
  What to do / Must NOT do: Run final checks after all commits. Confirm no conflict markers, no forbidden artifacts, no unstaged product edits, and no accidental remote push. Do not declare completion from test logs alone; verify exact assertions and branch state.
  Parallelization: Wave 4 | Blocked by: 6, 7 | Blocks: Final verification
  References (executor has NO interview context - be exhaustive): `.omo/drafts/merge-unsupervised-front-design.md:51-63`; `package.json:10-19`; `dashboard-be/package.json:6-15`.
  Acceptance criteria (agent-executable): Evidence contains final outputs of `git status --short --branch`, `git log --oneline --decorate -5`, `git diff --check`, `npm test`, syntax checks, conflict-marker check, forbidden artifact check over tracked/staged names, and a note that no `git push` was run.
  QA scenarios (name the exact tool + invocation): Happy - run all commands listed in Verification strategy and archive outputs under `.omo/evidence/merge-unsupervised-front-design/task-8-final.txt`; Failure - if any command fails, create a fix commit only for the failing issue, then rerun all final checks. Evidence `.omo/evidence/merge-unsupervised-front-design/task-8-final.txt`.
  Commit: N | verification only.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit - A read-only reviewer compares final diff/commits against this plan and confirms all Must have and Must NOT have items. Evidence `.omo/evidence/merge-unsupervised-front-design/f1-plan-compliance.md`.
- [ ] F2. Code quality review - A read-only reviewer checks merge-result code quality for accidental dead imports, broken auth/site access, brittle Redis error handling, and accidental LLM calls in tests. Evidence `.omo/evidence/merge-unsupervised-front-design/f2-code-quality.md`.
- [ ] F3. Real manual QA by agent automation - Browser/API automation repeats the dashboard toggle and clustering-summary smoke on the final branch. Evidence `.omo/evidence/merge-unsupervised-front-design/f3-ui-api-qa.md` plus screenshot/log.
- [ ] F4. Scope fidelity - A read-only reviewer confirms no unrelated files, `.DS_Store`, `.omo/`, or local `front/design` artifact commit entered the final branch and confirms no push occurred. Evidence `.omo/evidence/merge-unsupervised-front-design/f4-scope-fidelity.md`.

## Commit strategy
- Use a protected local branch: `merge/unsupervised-into-front-design` from `origin/front/design`.
- Expected commits:
  1. Merge commit: `merge: merge origin/feature/unsupervised into front/design baseline`.
  2. Post-merge cleanup commit if needed: `test(clustering): keep manual clustering validation out of node test discovery`.
  3. Optional bug-fix commit only if verification exposes a merge-induced issue: `fix(dashboard): repair clustering mode after merge`.
- Stage only intended product/test files. Never stage `.DS_Store`, `.omo/`, `.omo/evidence/`, or planning files.
- Do not squash the merge commit into a handcrafted non-merge commit; preserve merge ancestry for reviewability.
- Do not push to `origin/front/design` or any remote branch until the user explicitly approves after seeing final verification results.
- Recommended post-verification handoff: report the protected branch name, commit SHAs, final command results, and ask whether to push/open PR/merge into `front/design`.

## Success criteria
- The final local protected branch contains the unsupervised clustering implementation and front/design dashboard changes together.
- `dashboard-fe/public/dashboard.css` has no conflict markers and contains both front/design design styles and `.labelModeToggle` / `.clusteringNotice` styles.
- `dashboard-fe/public/dashboard.html` and `dashboard-fe/public/dashboard.js` support switching between rule-based and unsupervised label summaries.
- `dashboard-be/server.js` exposes `/api/labels/clustering-summary` behind existing auth/site-access controls and returns Redis-unavailable errors without crashing when Redis is unavailable.
- `dashboard-be/workers/event-consumer.js` keeps background clustering trigger behavior without blocking Kafka event processing.
- `npm test`, syntax checks, `git diff --check`, conflict-marker checks, and artifact checks pass without requiring real LLM credentials.
- No `.DS_Store`, `.omo/`, local run-continuation JSON, or evidence files are committed.
- No remote branch is pushed or updated without explicit user approval.
