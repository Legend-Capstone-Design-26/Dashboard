# LLM / Agent Mode Work Log

## Goal

챗봇을 단순 질의응답 도구가 아니라 Dashboard 데이터를 조회하고, 인사이트를 해석하고, A/B 실험 초안을 만들고, 승인 후 실행까지 연결할 수 있는 UX 운영 에이전트로 확장한다.

## Current Direction

기존 구조를 새로 갈아엎지 않고, 이미 존재하는 Agent Mode 구조를 중심으로 확장한다.

```text
Chat UI
  ├─ 일반 질문 -> /api/chat
  └─ Agent Mode ON -> /api/agent/message

/api/agent/message
  -> intent parser
  -> agent orchestrator
  -> tool registry
  -> read/write 분기
  -> approval gate
  -> action log
```

## Agent Layers

### 1. Read-only Agent

데이터 조회와 요약만 수행한다. 승인 없이 자동 실행 가능하다.

예시 명령:

```text
최근 가장 많은 이탈 유형 알려줘
checkout 실험 결과 요약해줘
지금 인사이트 기준으로 문제 구간 알려줘
```

지원 intent:

```text
summarize_insights
summarize_labels
list_experiments
summarize_experiment
get_preview_targets
```

### 2. Draft Agent

실제 사용자에게 노출되지 않는 실험 초안을 생성한다. `experiments.json`을 변경하는 write 작업이지만 `draft` 상태이므로 자동 실행 가능하다. 단, 반드시 action log를 남긴다.

예시 명령:

```text
checkout 페이지 CTA를 더 강하게 바꾸는 실험 초안 만들어줘
ux-friction 인사이트 기반으로 A/B 테스트 하나 제안해줘
```

지원 intent:

```text
create_experiment_draft
create_experiment_draft_from_insight
```

### 3. Action Agent

실제 사용자에게 영향을 줄 수 있는 작업을 수행한다. 반드시 approval gate를 거친다.

예시 명령:

```text
방금 만든 초안 배포해줘
checkout 실험 running으로 바꿔줘
이전 버전으로 롤백해줘
```

승인 필요 작업:

```text
publish_experiment
pause_experiment
rollback_experiment
archive_experiment
change_traffic
overwrite_variant
change_goals
```

## Important Rules

LLM은 직접 데이터를 변경하지 않는다. LLM은 의도 해석, 설명, 계획, 문구 제안까지만 담당한다. 실제 실행은 서버의 deterministic tool만 수행한다.

```text
LLM 판단:
"checkout CTA 개선 초안을 만들자"

서버 tool 실행:
createExperimentDraft(...)
validateDraftChanges(...)
appendAgentActionLog(...)
```

## Existing Code To Reuse

```text
dashboard-fe/public/analytics-chat.js
dashboard-be/routes/agent-routes.js
dashboard-be/routes/chat-routes.js
dashboard-be/services/agent/agent-orchestrator.js
dashboard-be/services/agent/intent-parser.js
dashboard-be/services/agent/tool-registry.js
dashboard-be/services/agent/approval-gate.js
dashboard-be/services/agent/approval-store.js
dashboard-be/services/agent/agent-action-log.js
dashboard-be/services/agent/agent-response.js
dashboard-be/services/agent/tools/*
dashboard-be/analytics/pipeline.js
dashboard-be/insights/generator.js
```

## Work Queue

1. Define and refine Agent intent list.
2. Keep `/api/chat` and `/api/agent/message` responsibilities separate.
3. Add insight-to-draft tool.
4. Connect insight-based draft intent in `agent-orchestrator`.
5. Return editor/preview actions after draft creation.
6. Keep publish/pause/rollback behind approval gate.
7. Add tests for intent parsing, draft creation, approval, and insight-to-draft flow.
8. Use scenario CLI data for end-to-end demonstration.
9. Make Agent Mode draft creation plan-first, then require explicit confirm before mutating drafts.

## First Implementation Target

Implement the flow:

```text
User: 지금 인사이트 기반으로 개선 실험 하나 만들어줘

Agent:
1. 현재 site_id 확인
2. labeled session summary 조회
3. insight summary 생성
4. top insight 선택
5. target page 결정
6. Variant B 변경안 생성
7. experiment draft 저장
8. editor/preview 버튼 제공
```

## Update Log

### 2026-05-31

- Created this work log.
- Decided to build on existing `/api/agent` structure instead of expanding `/api/chat` with unsafe write behavior.
- First implementation target is `insight-to-draft` Agent flow.

### 2026-05-31 - Insight-to-draft Agent Flow

Implemented the first Agent Mode execution flow.

New behavior:

```text
사용자: 지금 인사이트 기반으로 개선 실험 하나 만들어줘

Agent:
1. create_experiment_draft_from_insight intent로 분기
2. 현재 site_id의 labeled session summary 조회
3. insight summary 생성
4. top insight와 label bucket 선택
5. insight를 안전한 draft instruction으로 변환
6. 기존 editor-tools의 deterministic draft builder 사용
7. validateDraftChanges로 변경안 검증
8. draft experiment 저장
9. editor/preview action 반환
10. agent_actions.jsonl에 성공/실패 로그 기록
```

Changed files:

```text
dashboard-be/services/agent/intent-parser.js
dashboard-be/services/agent/agent-orchestrator.js
dashboard-be/services/agent/tools/insight-tools.js
dashboard-be/services/agent/agent-response.js
dashboard-be/test/agent-intent-parser.test.js
dashboard-be/test/agent-orchestrator.test.js
```

Implementation notes:

- Added `create_experiment_draft_from_insight` as a separate write intent.
- Kept plain insight summaries on the read-only `summarize_insights` path.
- Narrowed the write intent trigger so `인사이트 + 실험` alone does not create a draft; it requires draft/create wording such as `초안`, `만들`, `생성`, `draft`, or `create`.
- Reused existing `runDraftFlow` instead of creating a parallel mutation path.
- Insight context only creates an instruction message and optional hypothesis/goal; actual UI mutations still come from `buildDraftChangesFromInstruction` and `validateDraftChanges`.
- Added Agent status capability for `create_experiment_draft_from_insight`.

Review follow-up:

- Aligned Agent Mode UI traffic with the design doc by routing `agent_mode: true` requests through `/api/chat` and delegating to Agent Orchestrator inside `chat-routes`.
- Kept `/api/agent/message` as the standalone testing/future split endpoint.
- Added the frontend capability label for `create_experiment_draft_from_insight`.
- Standardized this document on the implemented intent name: `create_experiment_draft_from_insight`.

Verification:

```text
node --check services/agent/intent-parser.js
node --check services/agent/agent-orchestrator.js
node --check services/agent/tools/insight-tools.js
node --check services/agent/agent-response.js
node --check routes/chat-routes.js
node --check server.js
node --check dashboard-fe/public/analytics-chat.js
node --test test/agent-intent-parser.test.js test/agent-orchestrator.test.js
npm test
temporary Express smoke: POST /api/chat with agent_mode=true delegates to Agent Orchestrator and returns intent=list_experiments
```

Results:

```text
focused agent tests: 13/13 passing
full backend tests: 54/54 passing
```

Known environment limitation:

```text
LSP diagnostics could not run because typescript-language-server is not installed.
No Markdown LSP is configured for llm.md.
```

### 2026-05-31 - Plan-first Draft Confirmation

Adjusted Agent Mode draft creation to match the design doc's action-plan-first flow.

New behavior:

```text
사용자: checkout CTA 실험 초안 만들어줘

Agent Mode:
1. intent 파싱 후 deterministic draft plan만 생성
2. 아직 draft는 저장하지 않음
3. type=action_plan 응답과 confirm_create_draft action_id 반환
4. 프런트는 확인 버튼을 표시
5. 확인 시 /api/chat agent_mode=true + action_id로 재호출
6. 서버는 메모리에 저장한 pending plan을 다시 읽음
7. 클라이언트 계획 데이터는 신뢰하지 않고 기존 deterministic createExperimentDraft 흐름으로 draft 생성
8. 응답은 draft_created로 전환되고 editor/preview 후속 동작을 그대로 재사용
```

Changed files:

```text
dashboard-be/services/agent/agent-orchestrator.js
dashboard-be/services/agent/agent-response.js
dashboard-be/routes/agent-routes.js
dashboard-be/routes/chat-routes.js
dashboard-be/test/agent-orchestrator.test.js
dashboard-fe/public/analytics-chat.js
llm.md
```

Implementation notes:

- Added `planFirstDrafts` option to `createAgentOrchestrator`; default stays `false` for backward compatibility.
- Enabled `planFirstDrafts: true` only for Agent Mode route instances in `/api/agent/message` and `/api/chat` when `agent_mode === true`.
- Split draft planning from draft mutation so planning is non-mutating and confirmation uses only server-stored pending plan data.
- Added `actionPlanResponse()` with `type: "action_plan"` and `confirm_create_draft` action metadata.
- Included `planned_changes` and side-effect notes in the plan card data so the plan is reviewable before confirmation.
- Added `action_id` / `confirmed_action_id` handling in both agent-mode routes so confirm requests do not require a message body.
- Kept publish approval endpoints and pause/rollback blocking behavior unchanged.
- Updated the dashboard widget so `confirm_create_draft` posts to `/api/chat`, renders the returned card, and feeds `draft_created` into the existing draft/editor callbacks.

Verification:

```text
node --check dashboard-be/services/agent/agent-response.js
node --check dashboard-be/services/agent/agent-orchestrator.js
node --check dashboard-be/routes/agent-routes.js
node --check dashboard-be/routes/chat-routes.js
node --check dashboard-fe/public/analytics-chat.js
node --test dashboard-be/test/agent-orchestrator.test.js
npm test
temporary Express smoke: /api/chat agent_mode=true returns action_plan, then confirmed action_id returns draft_created
```

Results:

```text
focused orchestrator tests: 11/11 passing
full backend tests: 57/57 passing
chat plan/confirm smoke: passing
```

Known limitation:

```text
Pending draft plans are stored in process memory. They are server-side and not trusted from the client, but they do not survive server restart.
```
