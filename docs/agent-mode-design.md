# UX-Stream Agent Mode 설계서

## 1. 문서 목적

본 문서는 `Dashboard` 레포지토리에 추가할 **UX-Stream Agent Mode** 기능의 설계 기준을 정의한다.

Agent Mode는 기존 챗봇 기능을 단순 질의응답형 UX 인사이트 도구에서 확장하여, 관리자의 자연어 명령을 바탕으로 Dashboard 내부 기능을 실행하는 **UX 운영 에이전트**를 구현하는 것을 목표로 한다.

기존 챗봇이 "무엇이 문제인지 설명하는 역할"에 머물렀다면, Agent Mode는 다음 단계까지 연결한다.

```text
UX 데이터 조회
-> 문제 상황 이해
-> 개선 작업 계획 생성
-> UI 변경안 생성
-> A/B 실험 초안 생성
-> 관리자 승인
-> 실험 배포 또는 롤백
```

즉, Agent Mode는 분석, 개선안, 실험 실행 사이의 단절을 줄이는 기능이다.

## 2. 기능 개요

### 2.1 기능명

기능명은 **UX-Stream Agent Mode**로 정의한다.

UI에서는 다음 표현을 사용할 수 있다.

- `Agent Mode`
- `UX Agent`
- `UX 운영 에이전트`

### 2.2 핵심 목표

Agent Mode의 핵심 목표는 다음과 같다.

- 관리자가 자연어로 UX 개선 작업을 요청할 수 있게 한다.
- 챗봇이 현재 사이트의 실험, 세션, 지표, 인사이트 데이터를 조회한다.
- 챗봇이 실행 가능한 작업 계획을 생성한다.
- 챗봇이 화면 편집기에서 수행 가능한 변경사항을 구조화된 action으로 변환한다.
- 챗봇이 A/B 실험 초안을 생성한다.
- 실제 사용자에게 영향을 주는 작업은 관리자 승인 후 실행한다.
- 실행 결과를 챗봇 메시지와 대시보드 UI에 명확히 표시한다.

### 2.3 한 줄 정의

Agent Mode는 관리자가 자연어로 UX 개선 작업을 지시하면, 챗봇이 Dashboard의 분석 데이터와 화면 편집 기능을 활용해 A/B 실험 초안을 만들고, 관리자 승인 후 배포까지 연결하는 UX 운영 자동화 기능이다.

## 3. 배경 및 필요성

기존 UX 분석 도구는 사용자의 행동 로그, 클릭 수, 전환율, 이탈률 등을 보여주는 데 강점이 있다. 그러나 대부분의 도구는 문제를 발견한 이후 실제 개선 실험을 만드는 과정까지 자동으로 연결하지 못한다.

현재 UX-Stream Dashboard는 다음 기능들을 이미 보유하고 있다.

- SDK 기반 사용자 행동 이벤트 수집
- 세션 단위 행동 요약
- 이탈 유형 라벨링
- A/B 실험 생성 및 관리
- Visual Editor 기반 UI 변경
- 실험별 metrics 조회
- AI 인사이트 생성
- Persona Lab 기반 synthetic UX 실험
- 사이트별 권한 관리

Agent Mode는 위 기능들을 자연어 인터페이스로 연결하는 상위 기능이다.

관리자는 더 이상 다음 과정을 수동으로 반복하지 않아도 된다.

1. 대시보드에서 문제 지표 확인
2. 인사이트 읽기
3. 화면 편집기 이동
4. 수정할 요소 직접 찾기
5. 실험 key와 목표 이벤트 설정
6. Variant B 변경사항 작성
7. 실험 저장
8. 실험 배포

Agent Mode는 이 흐름을 다음처럼 단축한다.

```text
관리자: 결제 페이지 CTA를 더 강조해서 A/B 테스트 만들어줘.

UX Agent:
- checkout 페이지의 기존 데이터를 확인합니다.
- 결제 CTA 개선안을 생성합니다.
- Variant B 변경사항을 구성합니다.
- 실험 초안을 생성합니다.
- 배포 전 미리보기와 승인 단계를 제공합니다.
```

## 4. 기존 Dashboard 구조와의 연결

Agent Mode는 완전히 독립된 신규 시스템으로 만들지 않는다. 기존 Dashboard 구조를 최대한 재사용한다.

### 4.1 기존 구조

현재 Dashboard는 크게 다음 구조를 가진다.

```text
Dashboard
├─ dashboard-fe
│  └─ public
│     ├─ dashboard.html
│     ├─ dashboard.js
│     ├─ dashboard.css
│     ├─ editor.html
│     ├─ editor.js
│     ├─ analytics-chat.js
│     ├─ persona-lab.html
│     ├─ persona-lab.js
│     └─ persona-lab.css
│
├─ dashboard-be
│  ├─ server.js
│  ├─ routes
│  │  └─ chat-routes.js
│  ├─ analytics
│  │  ├─ sessionSummary.js
│  │  ├─ labeler.js
│  │  ├─ funnel.js
│  │  └─ pipeline.js
│  ├─ services
│  │  ├─ chat
│  │  ├─ llm
│  │  ├─ stores
│  │  ├─ read-models
│  │  ├─ runtime
│  │  └─ analytics
│  ├─ personas
│  └─ data
│     ├─ events.jsonl
│     ├─ experiments.json
│     ├─ sites.json
│     ├─ users.json
│     └─ user_site_access.json
```

### 4.2 Agent Mode가 재사용해야 할 기존 기능

| 기존 기능 | 재사용 방식 |
| --- | --- |
| 인증 / 권한 | `requireAuth`, `requireSiteAccess` 재사용 |
| 사이트 선택 | 현재 `site_id` 기준으로 Agent 작업 범위 제한 |
| 실험 저장소 | 기존 experiment store를 통해 실험 조회/생성/상태 변경 |
| Metrics read model | 실험 결과 및 A/B 지표 조회 |
| Analytics pipeline | 세션 요약, 라벨 분포, 인사이트 입력 생성 |
| Chat route | 기존 챗봇 API를 Agent Mode로 확장 |
| Editor draft | Agent가 만든 UI 변경안을 화면 편집기에서 이어서 수정 가능하게 연결 |
| Preview target | 수정 대상 페이지와 experiment key 추론에 활용 |
| Persona Lab | synthetic agent 결과와 overlay를 후속 실험 제안에 활용 |

### 4.3 설계 원칙

- Agent Mode는 기존 Dashboard 구조를 깨지 않아야 한다.
- `server.js`에 Agent 로직을 직접 몰아넣지 않는다.
- Agent 관련 로직은 `dashboard-be/services/agent` 하위에 분리한다.
- 기존 `chat-routes`는 Agent Orchestrator를 호출하는 얇은 라우트 역할을 한다.
- 실험 생성/수정/배포는 기존 experiment store와 status transition 규칙을 재사용한다.
- 실제 배포, 중지, 롤백, 삭제 같은 위험 작업은 승인 단계를 거친다.
- 모든 Agent 작업은 현재 로그인 사용자와 `site_id` 권한 범위 안에서만 실행된다.

## 5. Agent Mode의 동작 범위

Agent Mode는 단계적으로 구현한다.

### 5.1 Phase 1: Read-only Agent

Read-only Agent는 Dashboard 데이터를 조회하고 요약한다.

지원 명령 예시는 다음과 같다.

- 최근 7일간 가장 많이 발생한 이탈 유형 알려줘.
- checkout 실험 결과 요약해줘.
- 현재 진행 중인 A/B 테스트 목록 보여줘.
- 결제 페이지에서 문제가 되는 행동 패턴 알려줘.
- Variant B가 A보다 나은지 설명해줘.

가능한 작업은 다음과 같다.

- 실험 목록 조회
- 실험 상세 조회
- 실험 metrics 조회
- 세션 요약 조회
- 라벨 분포 조회
- AI 인사이트 조회
- 현재 사이트 설정 조회
- preview target 조회

읽기 작업은 승인 없이 자동 실행할 수 있다.

### 5.2 Phase 2: Draft Agent

Draft Agent는 실제 운영에 반영하지 않고 실험 초안을 생성한다.

지원 명령 예시는 다음과 같다.

- 결제 페이지 CTA 문구를 더 강하게 바꾸는 실험 초안 만들어줘.
- 상품 상세 페이지의 구매 버튼을 더 눈에 띄게 하는 Variant B 만들어줘.
- checkout 페이지에서 배송비 안내를 강조하는 A/B 테스트 초안 만들어줘.
- 최근 인사이트를 바탕으로 개선 실험 하나 제안해줘.

가능한 작업은 다음과 같다.

- 자연어 명령을 UI 변경 action으로 변환
- Variant B 변경사항 생성
- A/B 실험 초안 생성
- editor draft로 전달
- 미리보기 URL 제공
- 실험 목표 이벤트 추천
- 실험 key 추천

초안 생성은 실서비스 노출을 발생시키지 않으므로 자동 실행할 수 있다. 다만 `experiments.json`을 변경하는 write 작업이므로 다음 조건을 반드시 따른다.

- Agent 응답에서 "초안이 저장됨"을 명확히 표시한다.
- `agent_actions.jsonl`에 action log를 남긴다.
- 생성한 experiment id/key/version/status를 응답에 포함한다.
- 이후 배포는 별도 approval 단계를 거친다.

### 5.3 Phase 3: Action Agent

Action Agent는 관리자 승인 후 실제 Dashboard 상태를 변경한다.

지원 명령 예시는 다음과 같다.

- 방금 만든 초안을 실험 버전 2로 배포해줘.
- checkout CTA 실험을 running 상태로 바꿔줘.
- 현재 checkout 실험을 중지해줘.
- 이전 버전으로 롤백해줘.
- 성과가 안 좋은 실험을 보관 처리해줘.

가능한 작업은 다음과 같다.

- 실험 running 전환
- 실험 paused 전환
- 실험 archived 전환
- 실험 rollback
- 실험 새 버전 생성
- 기존 draft를 실험으로 발행
- 실험 결과 확인 후 후속 작업 제안

승인 필요 여부는 다음 기준을 따른다.

| 작업 | 승인 필요 |
| --- | --- |
| 실험 running 배포 | 필요 |
| 실험 paused 전환 | 필요 |
| 실험 rollback | 필요 |
| 실험 archived 전환 | 필요 |
| 실험 삭제 | 필요 |
| 실험 traffic 변경 | 필요 |
| 실험 goal 변경 | 필요 |
| Variant B 변경사항 덮어쓰기 | 필요 |
| draft 생성 | 불필요, 단 action log 필수 |
| metrics 조회 | 불필요 |
| 인사이트 조회 | 불필요 |

## 6. Draft Publish 모델

### 6.1 현재 코드 구조

현재 Dashboard의 실험 관련 API는 다음 역할로 나뉜다.

| API | 현재 역할 |
| --- | --- |
| `POST /api/experiments/real-apply` | `variants`, `goals`, `traffic`, `url_prefix` payload를 받아 running 실험을 생성/갱신한다. |
| `PATCH /api/experiments/:id` | 기존 실험의 status 전환만 처리한다. |
| `POST /api/experiments/:id/rollback` | history에 있는 특정 version으로 복원한다. |
| `POST /api/experiments/draft` | chat route를 통해 draft 실험을 저장한다. |

### 6.2 MVP publish 정책

Agent Mode MVP에서는 다음 방식을 우선 사용한다.

1. Agent가 자연어 요청을 바탕으로 draft experiment를 생성한다.
2. draft는 `variants`, `goals`, `traffic`, `url_prefix`, `hypothesis`, `source`를 포함한다.
3. 관리자가 배포를 요청하면 approval을 생성한다.
4. approval 승인 시 해당 draft record의 현재 상태와 version을 재검증한다.
5. 검증이 통과하면 draft record를 `running`으로 전환한다.

이 방식은 MVP에서 구현 범위를 줄이기 위한 우선 정책이다. 단, draft payload 구조는 `real-apply` 입력과 호환되도록 유지한다.

### 6.3 향후 publish adapter

향후에는 `publish adapter`를 추가할 수 있다.

```text
draft experiment
-> publish adapter
-> real-apply compatible payload
-> POST /api/experiments/real-apply
```

publish adapter의 역할은 다음과 같다.

- draft record에서 `key`, `url_prefix`, `traffic`, `goals`, `variants`를 추출한다.
- `real-apply`가 기대하는 payload로 변환한다.
- live record와 draft record의 version/history 정책을 일관되게 유지한다.
- 향후 "draft를 running으로 직접 전환" 방식에서 "real-apply를 통한 발행" 방식으로 전환할 수 있게 한다.

### 6.4 version 의미

Agent 문맥에서 "버전 2로 배포"라는 표현은 기본적으로 `experiment.version === 2`를 의미한다. `exp_checkout_cta_v2` 같은 key suffix와 혼동하지 않도록 UI에는 다음 정보를 함께 표시한다.

- experiment key
- experiment id
- current status
- current version
- target version
- 적용 경로
- traffic 비율

## 7. 사용자 경험 설계

### 7.1 Agent Mode 활성화 표시

Agent Mode가 활성화되면 챗봇 UI 상단 또는 메시지 영역에 명확한 표시를 제공한다.

표시 문구 예시는 다음과 같다.

```text
Agent Mode ON
UX Agent가 현재 사이트의 실험, 세션, 인사이트 데이터를 바탕으로 작업을 수행합니다.
배포/삭제/롤백 작업은 실행 전 관리자 확인 단계를 거칩니다.
```

또는 다음처럼 표시할 수 있다.

```text
Agent Mode 활성화됨
이제 챗봇이 대시보드 데이터를 조회하고, 실험 초안 생성·수정·배포 작업을 수행할 수 있습니다.
실제 사용자에게 영향을 주는 작업은 승인 후 진행됩니다.
```

### 7.2 Agent 메시지 유형

| 메시지 유형 | 설명 |
| --- | --- |
| `agent_mode_on` | Agent Mode 활성화 안내 |
| `analysis_summary` | 조회 결과 요약 |
| `action_plan` | 실행 계획 |
| `draft_created` | 실험 초안 생성 완료 |
| `approval_required` | 승인 필요 작업 안내 |
| `action_executed` | 작업 실행 완료 |
| `action_failed` | 작업 실패 |
| `safety_blocked` | 안전 정책상 차단 |

### 7.3 실행 계획 표시

Agent가 실제 작업을 하기 전, 다음과 같은 실행 계획을 보여준다.

```text
다음 작업을 수행하려고 합니다.

1. 현재 checkout 페이지에 연결된 실험을 확인합니다.
2. Variant B에 CTA 강조 스타일을 추가합니다.
3. 실험 key는 exp_checkout_cta_v2로 생성합니다.
4. 목표 이벤트는 checkout_complete로 설정합니다.
5. 트래픽은 A 50%, B 50%로 설정합니다.
6. 먼저 초안으로 저장한 뒤 미리보기를 제공합니다.
```

### 7.4 승인 UI

승인이 필요한 작업은 챗봇 메시지 내부에 action button을 제공한다.

```text
[초안으로 저장]
[미리보기 열기]
[배포 승인]
[취소]
```

Phase 1에서는 실제 버튼 대신 confirm API 호출 구조만 먼저 구현해도 된다.

## 8. 백엔드 설계

### 8.1 신규 디렉터리 구조

Agent 관련 코드는 다음 구조로 추가한다.

```text
dashboard-be/
├─ services/
│  └─ agent/
│     ├─ agent-orchestrator.js
│     ├─ intent-parser.js
│     ├─ tool-registry.js
│     ├─ approval-gate.js
│     ├─ agent-response.js
│     ├─ agent-session-store.js
│     └─ tools/
│        ├─ experiment-tools.js
│        ├─ editor-tools.js
│        ├─ metrics-tools.js
│        ├─ insight-tools.js
│        └─ site-tools.js
│
├─ routes/
│  └─ agent-routes.js
```

기존 `chat-routes`에 모든 기능을 넣지 않는다. 기존 chat route에서는 Agent Orchestrator를 호출하는 방식으로 확장한다.

### 8.2 Agent Orchestrator

`agent-orchestrator.js`는 Agent Mode의 중심 컨트롤러다.

역할은 다음과 같다.

- 사용자 메시지 수신
- 현재 인증 사용자와 `site_id` 확인
- intent parser 호출
- 필요한 tool 목록 결정
- 승인 필요 여부 판단
- tool 실행
- Agent 응답 생성
- 실행 로그 저장

함수 예시는 다음과 같다.

```js
async function runAgentTurn({
  message,
  siteId,
  user,
  conversationId,
  selectedExperimentKey,
  context,
}) {
  // 1. intent parsing
  // 2. planning
  // 3. approval check
  // 4. tool execution
  // 5. response generation
}
```

### 8.3 Intent Parser

`intent-parser.js`는 사용자의 자연어 명령을 구조화된 intent로 변환한다.

| Intent | 설명 |
| --- | --- |
| `summarize_insights` | UX 인사이트 요약 |
| `list_experiments` | 실험 목록 조회 |
| `summarize_experiment` | 특정 실험 결과 요약 |
| `create_experiment_draft` | 실험 초안 생성 |
| `modify_experiment_draft` | 기존 draft 수정 |
| `publish_experiment` | 실험 배포 |
| `pause_experiment` | 실험 중지 |
| `rollback_experiment` | 실험 롤백 |
| `archive_experiment` | 실험 보관 |
| `open_editor` | 편집기로 이동 |
| `unknown` | 처리 불가 또는 모호한 명령 |

Intent 출력 예시는 다음과 같다.

```json
{
  "intent": "create_experiment_draft",
  "confidence": 0.82,
  "target_page": "/checkout",
  "experiment_key": "exp_checkout_cta_v2",
  "goal": "checkout_complete",
  "changes_request": "결제 CTA를 더 눈에 띄게 강조",
  "requires_approval": false
}
```

### 8.4 Tool Registry

`tool-registry.js`는 Agent가 사용할 수 있는 내부 도구를 등록한다.

Tool 정의 예시는 다음과 같다.

```js
const tools = {
  listExperiments,
  getExperimentMetrics,
  createExperimentDraft,
  publishExperiment,
  pauseExperiment,
  rollbackExperiment,
  getLabelsSummary,
  getSessions,
  getInsights,
  getPreviewTargets,
  buildEditorDraft,
};
```

모든 tool은 다음 형식을 따른다.

```js
async function toolName(input, context) {
  return {
    ok: true,
    data: {},
    summary: "작업 요약",
  };
}
```

실패 시 다음 형식을 반환한다.

```js
return {
  ok: false,
  reason: "실패 이유",
};
```

### 8.5 Approval Gate

`approval-gate.js`는 작업이 즉시 실행 가능한지, 승인이 필요한지 판단한다.

승인이 필요한 작업은 다음과 같다.

```js
const DANGEROUS_ACTIONS = [
  "publish_experiment",
  "pause_experiment",
  "rollback_experiment",
  "archive_experiment",
  "delete_experiment",
  "change_traffic",
  "overwrite_variant",
];
```

승인 요청 객체는 다음 필드를 가진다.

```json
{
  "approval_id": "apv_123456",
  "site_id": "legend-ecommerce",
  "intent": "publish_experiment",
  "summary": "exp_checkout_cta_v2 실험을 running 상태로 배포합니다.",
  "payload": {
    "experiment_id": "exp_123",
    "status": "running"
  },
  "expected_experiment_id": "exp_123",
  "expected_experiment_key": "exp_checkout_cta_v2",
  "expected_experiment_version": 2,
  "expected_status": "draft",
  "payload_hash": "sha256:...",
  "status": "pending",
  "risk_level": "high",
  "created_at": 1770000000000,
  "updated_at": 1770000000000,
  "expires_at": 1770000900000,
  "created_by_user_id": "user_123",
  "approved_by_user_id": null,
  "cancelled_at": null,
  "executed_at": null,
  "idempotency_key": "publish:legend-ecommerce:exp_123:v2"
}
```

승인 요청은 초기 구현에서는 JSON 파일에 저장한다.

권장 파일은 다음과 같다.

```text
dashboard-be/data/agent_approvals.json
```

### 8.6 승인 실행 전 재검증 절차

승인 API는 실제 tool 실행 전에 다음을 재검증해야 한다.

1. approval이 존재하는지 확인한다.
2. approval status가 `pending`인지 확인한다.
3. `expires_at`이 현재 시각보다 미래인지 확인한다.
4. 요청 사용자에게 approval의 `site_id` 접근 권한이 있는지 확인한다.
5. `expected_experiment_id`와 현재 experiment id가 일치하는지 확인한다.
6. `expected_experiment_key`와 현재 experiment key가 일치하는지 확인한다.
7. `expected_experiment_version`과 현재 experiment version이 일치하는지 확인한다.
8. `expected_status`와 현재 experiment status가 일치하는지 확인한다.
9. 저장된 payload의 hash가 `payload_hash`와 일치하는지 확인한다.
10. 동일한 `idempotency_key`로 이미 실행된 action이 없는지 확인한다.
11. 모든 검증이 통과하면 `approved_by_user_id`, `executed_at`, `status`를 갱신한다.
12. 실행 결과를 `agent_actions.jsonl`에 기록한다.

검증 실패 시 tool을 실행하지 않고 `safety_blocked` 또는 `action_failed` 응답을 반환한다.

## 9. Agent Tool 설계

### 9.1 Experiment Tools

파일 위치는 다음과 같다.

```text
dashboard-be/services/agent/tools/experiment-tools.js
```

제공 함수는 다음과 같다.

- `listExperiments(context)`
- `getExperimentByKey(input, context)`
- `createExperimentDraft(input, context)`
- `publishExperiment(input, context)`
- `pauseExperiment(input, context)`
- `rollbackExperiment(input, context)`
- `archiveExperiment(input, context)`

`createExperimentDraft` 입력 예시는 다음과 같다.

```json
{
  "site_id": "legend-ecommerce",
  "key": "exp_checkout_cta_v2",
  "url_prefix": "/checkout",
  "traffic": { "A": 50, "B": 50 },
  "goals": ["checkout_complete"],
  "variants": {
    "A": [],
    "B": [
      {
        "selector": "[data-track-id='pay_btn']",
        "actions": [
          { "type": "set_text", "value": "지금 바로 주문하기" },
          {
            "type": "set_style",
            "styles": {
              "background": "#4f46e5",
              "color": "#ffffff",
              "font-weight": "700"
            }
          }
        ]
      }
    ]
  },
  "hypothesis": "결제 CTA 문구와 시각적 강조를 개선하면 checkout_complete 전환율이 증가할 것이다.",
  "source": "agent_mode"
}
```

출력 예시는 다음과 같다.

```json
{
  "ok": true,
  "experiment": {
    "id": "exp_123",
    "site_id": "legend-ecommerce",
    "key": "exp_checkout_cta_v2",
    "status": "draft",
    "version": 1
  }
}
```

### 9.2 Editor Tools

파일 위치는 다음과 같다.

```text
dashboard-be/services/agent/tools/editor-tools.js
```

역할은 자연어 UI 수정 요청을 Visual Editor가 이해할 수 있는 action으로 변환하는 것이다.

우선 지원 action은 다음과 같다.

| Action | 설명 |
| --- | --- |
| `set_text` | 요소 텍스트 변경 |
| `set_style` | CSS style 변경 |
| `hide` | 요소 숨김 |
| `show` | 요소 표시 |
| `add_class` | class 추가 |
| `remove_class` | class 제거 |
| `set_attr` | 속성 변경 |
| `inject_css` | CSS 직접 주입 |

변경사항 객체 예시는 다음과 같다.

```json
{
  "selector": "[data-track-id='pay_btn']",
  "label": "결제 CTA 강조",
  "actions": [
    { "type": "set_text", "value": "지금 바로 주문하기" },
    {
      "type": "set_style",
      "styles": {
        "background": "#4f46e5",
        "color": "#ffffff",
        "border-radius": "14px",
        "font-weight": "700"
      }
    }
  ]
}
```

### 9.3 Metrics Tools

파일 위치는 다음과 같다.

```text
dashboard-be/services/agent/tools/metrics-tools.js
```

제공 함수는 다음과 같다.

- `getExperimentMetrics(input, context)`
- `summarizeExperimentPerformance(input, context)`
- `compareVariants(input, context)`

요약 출력 예시는 다음과 같다.

```json
{
  "ok": true,
  "summary": {
    "winner": "B",
    "reason": "Variant B의 전환율이 A보다 높고 이탈률이 낮습니다.",
    "cvr_delta": 0.032,
    "bounce_rate_delta": -0.041,
    "confidence_note": "현재는 통계적 유의성 검정 없이 관찰 지표 기준으로만 판단합니다."
  }
}
```

### 9.4 Insight Tools

파일 위치는 다음과 같다.

```text
dashboard-be/services/agent/tools/insight-tools.js
```

제공 함수는 다음과 같다.

- `getLabelsSummary(input, context)`
- `getSessions(input, context)`
- `getInsights(input, context)`
- `suggestExperimentFromInsight(input, context)`

역할은 기존 세션 라벨, 인사이트, 대표 세션 evidence를 바탕으로 실험 아이디어를 생성하는 것이다.

### 9.5 Site Tools

파일 위치는 다음과 같다.

```text
dashboard-be/services/agent/tools/site-tools.js
```

제공 함수는 다음과 같다.

- `getCurrentSite(input, context)`
- `getPreviewTargets(input, context)`
- `resolveTargetPage(input, context)`
- `resolveExperimentKey(input, context)`

역할은 자연어로 언급된 "결제 페이지", "상품 상세", "메인 CTA" 등을 현재 사이트의 `preview_targets`, `url_prefix`, `experiment_key`와 연결하는 것이다.

## 10. API 설계

### 10.1 `/api/chat`와 `/api/agent/message`의 관계

초기 MVP에서는 기존 챗봇 UI와 `/api/chat` 흐름을 유지한다.

- 기존 챗봇 UI는 계속 `/api/chat`를 호출한다.
- 요청 body에 `agent_mode: true`가 포함되면 `chat-routes` 내부에서 Agent Orchestrator로 위임한다.
- `agent_mode`가 없거나 false이면 기존 analytics copilot 응답 흐름을 유지한다.
- `/api/agent/message`는 독립 테스트, API 검증, 향후 챗봇 API와 Agent API 분리를 위한 별도 진입점으로 둘 수 있다.

즉 MVP 우선순위는 다음과 같다.

1. `/api/chat` 유지
2. `agent_mode=true`일 때 내부 위임
3. `/api/agent/message`는 테스트 및 향후 분리용 API

### 10.2 Agent 메시지 처리 API

```text
POST /api/agent/message
```

Request 예시는 다음과 같다.

```json
{
  "site_id": "legend-ecommerce",
  "conversation_id": "conv_123",
  "message": "결제 페이지 CTA를 더 강조해서 A/B 테스트 초안 만들어줘.",
  "selected_experiment_key": "exp_checkout_cta_v1",
  "agent_mode": true
}
```

읽기 작업 response 예시는 다음과 같다.

```json
{
  "ok": true,
  "type": "analysis_summary",
  "agent_mode": true,
  "message": "최근 7일 기준 checkout 단계 이탈이 가장 높습니다.",
  "data": {
    "top_label": "checkout_abandoner",
    "sessions": 42
  }
}
```

초안 생성 response 예시는 다음과 같다.

```json
{
  "ok": true,
  "type": "draft_created",
  "agent_mode": true,
  "message": "결제 CTA 개선 실험 초안을 생성했습니다.",
  "experiment": {
    "id": "exp_123",
    "key": "exp_checkout_cta_v2",
    "status": "draft",
    "version": 1
  },
  "actions": [
    {
      "label": "편집기에서 열기",
      "type": "open_editor",
      "url": "/editor?site_id=legend-ecommerce&experiment_key=exp_checkout_cta_v2"
    },
    {
      "label": "미리보기",
      "type": "open_preview",
      "url": "/preview/legend-ecommerce/checkout?__ab_force=B"
    }
  ]
}
```

승인 필요 response 예시는 다음과 같다.

```json
{
  "ok": true,
  "type": "approval_required",
  "agent_mode": true,
  "message": "이 작업은 실제 사용자에게 노출될 수 있으므로 관리자 승인이 필요합니다.",
  "approval": {
    "approval_id": "apv_123",
    "intent": "publish_experiment",
    "summary": "exp_checkout_cta_v2 실험을 running 상태로 배포합니다.",
    "risk_level": "high"
  },
  "actions": [
    {
      "label": "배포 승인",
      "type": "approve_agent_action",
      "approval_id": "apv_123"
    },
    {
      "label": "취소",
      "type": "cancel_agent_action",
      "approval_id": "apv_123"
    }
  ]
}
```

### 10.3 Agent 승인 API

```text
POST /api/agent/approvals/:approvalId/approve
```

Request 예시는 다음과 같다.

```json
{
  "site_id": "legend-ecommerce"
}
```

Response 예시는 다음과 같다.

```json
{
  "ok": true,
  "type": "action_executed",
  "message": "실험이 running 상태로 배포되었습니다.",
  "result": {
    "experiment_id": "exp_123",
    "status": "running"
  }
}
```

### 10.4 Agent 승인 취소 API

```text
POST /api/agent/approvals/:approvalId/cancel
```

Request 예시는 다음과 같다.

```json
{
  "site_id": "legend-ecommerce"
}
```

Response 예시는 다음과 같다.

```json
{
  "ok": true,
  "type": "action_cancelled",
  "message": "요청한 작업을 취소했습니다."
}
```

### 10.5 Agent 상태 조회 API

```text
GET /api/agent/status?site_id=legend-ecommerce
```

Response 예시는 다음과 같다.

```json
{
  "ok": true,
  "agent_mode": true,
  "capabilities": [
    "read_metrics",
    "summarize_insights",
    "create_experiment_draft",
    "publish_experiment_with_approval",
    "rollback_experiment_with_approval"
  ],
  "pending_approvals": 1
}
```

## 11. 프론트엔드 설계

### 11.1 수정 대상 파일

Agent Mode UI는 기존 챗봇 파일을 중심으로 확장한다.

- `dashboard-fe/public/analytics-chat.js`
- `dashboard-fe/public/dashboard.html`
- `dashboard-fe/public/dashboard.js`
- `dashboard-fe/public/dashboard.css`

### 11.2 UI 요소

Agent Mode에는 다음 UI 요소가 필요하다.

- Agent Mode Toggle
- Agent Mode 활성화 Badge
- 실행 계획 카드
- 승인 필요 카드
- 작업 결과 카드
- 편집기 열기 버튼
- 미리보기 버튼
- 배포 승인 버튼
- 취소 버튼

### 11.3 Agent Mode Toggle

챗봇 상단에 Agent Mode 활성화 버튼을 추가한다.

```text
[ Agent Mode OFF ]
```

활성화 시 다음처럼 표시한다.

```text
[ Agent Mode ON ]
```

### 11.4 Agent Mode 안내 메시지

Agent Mode가 켜지면 다음 시스템 메시지를 출력한다.

```text
Agent Mode가 활성화되었습니다.
UX Agent는 현재 사이트의 실험, 세션, 인사이트 데이터를 조회하고 실험 초안을 생성할 수 있습니다.
실제 배포, 중지, 롤백 작업은 관리자 승인 후 실행됩니다.
```

### 11.5 승인 카드 UI

승인 필요 작업은 일반 텍스트가 아니라 카드 형태로 표시한다.

```text
실행 승인 필요

작업:
exp_checkout_cta_v2 실험을 running 상태로 배포합니다.

영향:
실제 사용자에게 Variant A/B가 노출됩니다.

[배포 승인] [취소]
```

### 11.6 Editor 연동

Agent가 실험 초안을 만들면 다음 링크를 제공한다.

```text
/editor?site_id={site_id}&experiment_key={experiment_key}
```

또한 기존 dashboard의 draft staging 구조와 연결할 수 있다면, localStorage 기반 draft 전달 구조를 재사용한다.

## 12. 데이터 모델 설계

### 12.1 Agent Approval

저장 파일은 다음과 같다.

```text
dashboard-be/data/agent_approvals.json
```

구조는 다음과 같다.

```json
{
  "approvals": [
    {
      "id": "apv_123456",
      "site_id": "legend-ecommerce",
      "intent": "publish_experiment",
      "summary": "exp_checkout_cta_v2 실험을 running 상태로 배포합니다.",
      "payload": {
        "experiment_id": "exp_123",
        "status": "running"
      },
      "expected_experiment_id": "exp_123",
      "expected_experiment_key": "exp_checkout_cta_v2",
      "expected_experiment_version": 2,
      "expected_status": "draft",
      "payload_hash": "sha256:...",
      "status": "pending",
      "risk_level": "high",
      "created_at": 1770000000000,
      "updated_at": 1770000000000,
      "expires_at": 1770000900000,
      "created_by_user_id": "user_123",
      "approved_by_user_id": null,
      "cancelled_at": null,
      "executed_at": null,
      "idempotency_key": "publish:legend-ecommerce:exp_123:v2"
    }
  ]
}
```

### 12.2 Agent Action Log

저장 파일은 다음과 같다.

```text
dashboard-be/data/agent_actions.jsonl
```

각 line은 다음 구조를 가진다.

```json
{
  "ts": 1770000000000,
  "site_id": "legend-ecommerce",
  "user_id": "user_123",
  "conversation_id": "conv_123",
  "intent": "create_experiment_draft",
  "status": "success",
  "summary": "checkout CTA 개선 실험 초안 생성",
  "result_ref": {
    "experiment_key": "exp_checkout_cta_v2"
  },
  "before": null,
  "after": {
    "experiment_id": "exp_123",
    "status": "draft",
    "version": 1
  }
}
```

Action log는 디버깅과 발표 시 "에이전트가 어떤 작업을 수행했는지 추적 가능하다"는 근거가 된다.

## 13. 안전 정책

Agent Mode는 실제 운영 중인 사이트에 영향을 줄 수 있으므로 안전 정책을 반드시 포함한다.

### 13.1 권한 제한

Agent는 현재 로그인 사용자의 권한 범위 안에서만 동작한다.

- 사용자가 접근 가능한 `site_id`만 조회 가능
- 사용자가 접근 가능한 `site_id`에 대해서만 실험 생성 가능
- admin이 아닌 사용자의 사용자 관리 작업은 허용하지 않음
- 추후 role이 세분화되면 viewer, editor, owner 권한에 따라 Agent capability를 다르게 적용

### 13.2 승인 필요 작업

다음 작업은 반드시 승인이 필요하다.

- 실험 배포
- 실험 중지
- 실험 롤백
- 실험 보관
- 실험 삭제
- traffic 변경
- goal 변경
- Variant 변경사항 덮어쓰기

### 13.3 자동 실행 가능 작업

다음 작업은 자동 실행 가능하다.

- 실험 목록 조회
- metrics 조회
- 세션 요약 조회
- 라벨 분포 조회
- 인사이트 조회
- 실험 초안 생성
- editor draft 생성
- 미리보기 링크 생성

단, 실험 초안 생성은 write 작업이므로 action log를 반드시 남기고 사용자에게 명확히 표시한다.

### 13.4 위험 작업 차단

Agent는 다음 요청을 거부하거나 승인 단계로 전환한다.

- 모든 실험 삭제
- 모든 사용자에게 Variant B 100% 즉시 적용
- 사이트 권한 변경
- 사용자 계정 생성/삭제
- 인증 우회
- SDK 수집 중단
- 데이터 파일 삭제

### 13.5 사용자에게 명확히 알려야 하는 내용

실제 사용자에게 영향을 줄 수 있는 작업 전에는 반드시 다음 정보를 표시한다.

- 어떤 실험이 변경되는가
- 어떤 페이지에 적용되는가
- 어떤 Variant가 노출되는가
- traffic 비율은 무엇인가
- 목표 이벤트는 무엇인가
- 되돌릴 방법이 있는가

## 14. LLM 사용 방식

### 14.1 LLM이 담당하는 것

LLM은 다음 작업을 담당한다.

- 자연어 명령 intent 분류
- UX 개선안 문장 생성
- UI 변경 action 초안 생성
- 실험 hypothesis 생성
- 실험 결과 요약 문장 생성
- 사용자에게 보여줄 Agent 응답 생성

### 14.2 LLM이 직접 하면 안 되는 것

LLM은 다음을 직접 결정하거나 실행하면 안 된다.

- 승인 없이 실험 배포
- 승인 없이 실험 롤백
- 권한 체크 우회
- 파일 직접 삭제
- 사용자 계정 변경
- 임의의 사이트에 대한 작업 수행
- 검증되지 않은 selector를 확정 적용

### 14.3 Deterministic Tool 우선 원칙

가능한 작업은 LLM의 자유 생성에 의존하지 않고 deterministic tool을 우선 사용한다.

예시는 다음과 같다.

| 작업 | 우선 사용 |
| --- | --- |
| 실험 목록 조회 | `experimentStore.list()` |
| metrics 조회 | `metricsReadModel` |
| 세션 요약 | analytics pipeline |
| 실험 상태 변경 | 기존 experiment status transition 규칙 |

LLM은 "무엇을 할지 결정하고 설명하는 역할"을 맡고, 실제 데이터 변경은 내부 tool이 수행한다.

## 15. Selector 및 action 검증 책임

LLM이 생성한 selector, action, experiment key는 바로 신뢰하지 않는다.

### 15.1 서버 책임

서버는 저장 또는 approval 생성 전에 다음 형식 검증을 수행한다.

- selector가 문자열인지 확인
- selector가 비어 있지 않은지 확인
- action type이 허용 목록에 있는지 확인
- style object가 plain object인지 확인
- `url_prefix`가 현재 site의 preview target과 호환되는지 확인
- goal이 문자열 배열인지 확인
- traffic 합이 100인지 확인
- experiment key가 허용된 문자 규칙을 따르는지 확인

서버는 DOM 접근 권한이 없으므로 selector가 실제 페이지에 존재하는지 최종 확정하지 않는다.

### 15.2 프론트/editor/preview iframe 책임

프론트는 실제 DOM 존재 여부를 검증한다.

- preview iframe에서 selector matching 여부 확인
- matching element가 없으면 UI에 경고 표시
- DOM 검증 결과를 `대상 요소 확인됨` 또는 `대상 요소를 찾지 못함`으로 명확히 표시
- editor에서 적용 가능한 변경인지 미리보기로 검증
- 사용자가 편집기에서 직접 수정할 수 있는 진입점 제공

최종 배포 전에는 가능한 한 editor preview를 거치도록 유도한다.

## 16. 예시 시나리오

### 16.1 실험 결과 요약

사용자 요청은 다음과 같다.

```text
checkout 실험 결과 요약해줘.
```

Agent 동작은 다음과 같다.

1. 현재 `site_id` 확인
2. checkout 관련 experiment key 탐색
3. metrics 조회
4. Variant A/B 비교
5. 요약 응답 생성

응답 예시는 다음과 같다.

```text
checkout 실험을 확인했습니다.

현재 수집된 데이터 기준으로 Variant B가 A보다 전환율이 높습니다.
다만 통계적 유의성 검정은 아직 적용되지 않았으므로, 최종 승자 판단보다는 관찰 지표 기준의 개선 가능성으로 해석하는 것이 적절합니다.

- Variant A 전환율: 3.2%
- Variant B 전환율: 4.8%
- 이탈률: B가 A보다 낮음
- 추천: 실험을 조금 더 유지하거나, 표본 수 기준을 충족하면 최종 배포 판단을 진행할 수 있습니다.
```

### 16.2 실험 초안 생성

사용자 요청은 다음과 같다.

```text
결제 페이지 CTA를 더 강조해서 A/B 테스트 초안 만들어줘.
```

Agent 동작은 다음과 같다.

1. target page를 `/checkout`으로 추론
2. checkout preview target 확인
3. pay button selector 후보 생성
4. Variant B 변경사항 생성
5. experiment draft 생성
6. editor link 제공

응답 예시는 다음과 같다.

```text
결제 페이지 CTA 개선 실험 초안을 생성했습니다.

실험 key: exp_checkout_cta_v2
상태: draft
목표 이벤트: checkout_complete

변경 내용:
- 결제 버튼 문구를 더 직접적인 표현으로 변경
- 버튼 배경색과 글자 두께를 강조
- 클릭 유도 영역을 더 명확하게 조정

다음 단계:
[편집기에서 열기] [미리보기] [배포 승인 요청]
```

### 16.3 배포 승인

사용자 요청은 다음과 같다.

```text
방금 만든 초안을 배포해줘.
```

Agent 동작은 다음과 같다.

1. 최근 생성 draft 확인
2. 배포 작업이 위험 작업인지 판단
3. approval 생성
4. `approval_required` 응답 생성
5. 사용자가 승인하면 현재 draft 상태와 version을 재검증
6. 검증 통과 시 running 상태로 전환

승인 전 응답은 다음과 같다.

```text
이 작업은 실제 사용자에게 영향을 줄 수 있어 승인 후 진행됩니다.

작업 내용:
exp_checkout_cta_v2 실험을 running 상태로 배포합니다.

노출 방식:
A 50% / B 50%

목표 이벤트:
checkout_complete

[배포 승인] [취소]
```

### 16.4 롤백

사용자 요청은 다음과 같다.

```text
checkout 실험 이전 버전으로 롤백해줘.
```

Agent 동작은 다음과 같다.

1. checkout 실험 검색
2. history에서 이전 version 확인
3. rollback 가능 여부 확인
4. approval 생성
5. `approval_required` 응답 생성
6. 승인 후 rollback API 실행

응답 예시는 다음과 같다.

```text
checkout 실험의 이전 버전 v1을 찾았습니다.

현재 버전: v2
롤백 대상: v1

이 작업은 현재 실험 설정을 이전 버전으로 되돌리므로 승인 후 진행됩니다.

[롤백 승인] [취소]
```

## 17. 구현 단계

### 17.1 1단계: Agent 기본 구조 추가

목표는 다음과 같다.

- `services/agent` 구조 생성
- `agent-routes` 추가
- Agent Mode message API 추가
- Read-only intent 처리

작업은 다음과 같다.

1. `dashboard-be/services/agent` 디렉터리 생성
2. `agent-orchestrator.js` 생성
3. `intent-parser.js` 생성
4. `tool-registry.js` 생성
5. `tools/metrics-tools.js` 생성
6. `tools/experiment-tools.js` 생성
7. `routes/agent-routes.js` 생성
8. `server.js`에 `/api/agent` 라우트 연결

검증은 다음과 같다.

```text
POST /api/agent/message
-> "실험 목록 보여줘"
-> 현재 site_id의 experiment list 요약 반환
```

### 17.2 2단계: Agent Mode UI 추가

목표는 챗봇 UI에 Agent Mode toggle과 Agent 응답 카드를 추가하는 것이다.

작업은 다음과 같다.

1. `analytics-chat.js`에 `agentMode` 상태 추가
2. Agent Mode toggle UI 추가
3. `/api/chat` 요청에 `agent_mode` 포함
4. `/api/chat`에서 agent mode일 때 orchestrator 위임
5. `action_plan` 카드 렌더링
6. `draft_created` 카드 렌더링
7. `approval_required` 카드 렌더링

검증은 다음과 같다.

```text
Agent Mode ON 상태에서 메시지 입력
-> /api/chat 호출(agent_mode=true)
-> Agent 응답 카드 표시
```

### 17.3 3단계: 실험 초안 생성 기능

목표는 자연어 명령으로 A/B 실험 draft를 생성하는 것이다.

작업은 다음과 같다.

1. `createExperimentDraft` tool 구현
2. target page 추론 구현
3. experiment key 생성 규칙 구현
4. UI change action 생성 규칙 구현
5. draft experiment 저장
6. action log 기록
7. editor link 반환

검증은 다음과 같다.

```text
"결제 버튼 문구를 바꾸는 실험 초안 만들어줘"
-> experiments.json에 draft 생성
-> agent_actions.jsonl에 로그 기록
-> dashboard 실험 목록에 표시
-> editor에서 열기 가능
```

### 17.4 4단계: 승인 기반 배포

목표는 배포, 중지, 롤백 등 위험 작업에 승인 단계를 추가하는 것이다.

작업은 다음과 같다.

1. `approval-gate.js` 구현
2. `agent_approvals.json` 저장소 구현
3. `/api/agent/approvals/:id/approve` 구현
4. `/api/agent/approvals/:id/cancel` 구현
5. `approval_required` UI 카드 구현
6. 승인 실행 전 expected 상태 재검증
7. 승인 후 기존 experiment status API 또는 store 재사용

검증은 다음과 같다.

```text
"방금 만든 실험 배포해줘"
-> approval_required 반환
-> 승인 버튼 클릭
-> expected 상태 재검증
-> 실험 status running 변경
```

### 17.5 5단계: 결과 추적 및 후속 제안

목표는 배포된 실험의 결과를 Agent가 추적하고 후속 액션을 제안하는 것이다.

작업은 다음과 같다.

1. 실험 metrics 요약 tool 강화
2. 실험별 결과 해석 템플릿 추가
3. "이 실험 계속할까?" 질문 처리
4. 표본 수 부족 경고 추가
5. 후속 실험 제안 기능 추가

검증은 다음과 같다.

```text
"방금 배포한 실험 결과 어때?"
-> metrics 조회
-> A/B 차이 요약
-> 유지/중지/추가 실험 제안
```

## 18. 구현 시 주의사항

### 18.1 `server.js` 비대화 방지

Agent Mode 관련 핵심 로직을 `server.js`에 직접 작성하지 않는다.

`server.js`에는 다음 정도만 추가한다.

```js
const { createAgentRoutes } = require("./routes/agent-routes");

app.use(
  "/api/agent",
  createAgentRoutes({
    stores,
    middlewares: {
      requireAuth,
      requireSiteAccess,
    },
  })
);
```

### 18.2 기존 실험 status 규칙 재사용

실험 상태 변경은 기존 status transition 규칙을 재사용해야 한다. 임의로 `status = "running"`을 직접 덮어쓰지 않는다.

### 18.3 `site_id` 권한 체크 필수

모든 Agent API는 `site_id`를 기준으로 권한 체크를 수행한다.

사용자가 접근할 수 없는 `site_id`에 대해서는 다음 작업을 차단한다.

- 실험 조회
- 실험 생성
- metrics 조회
- 배포

### 18.4 기존 chat 코드의 hardcoded site id 제거

기존 chat 관련 코드에는 `siteId = "ab-sample"`처럼 고정된 site id가 있을 수 있다. Agent Mode 구현 시 반드시 제거해야 한다.

체크리스트는 다음과 같다.

- `chat-orchestrator.js`의 hardcoded `siteId` 제거
- `/api/chat` request context에서 `site_id` 전달
- `requireSiteAccess`가 검증한 `site_id`를 tool context로 전달
- 모든 chat/agent tool이 context의 `siteId`만 사용
- fallback site id가 필요한 경우에도 사용자 권한 범위 내 default site만 사용

### 18.5 LLM 결과 검증

LLM이 생성한 selector, action, experiment key는 바로 신뢰하지 않는다. 검증 책임은 15장의 서버/프론트 분리 원칙을 따른다.

### 18.6 MVP에서는 과도한 자동화를 피한다

초기 구현에서는 완전 자동 배포보다 다음 흐름을 우선한다.

```text
자연어 명령
-> 초안 생성
-> 미리보기
-> 관리자 승인
-> 배포
```

## 19. 실험 key 생성 규칙

### 19.1 기본 형식

```text
exp_{page}_{purpose}_v{number}
```

### 19.2 예시

| 페이지 | 목적 | key |
| --- | --- | --- |
| `/checkout` | CTA 개선 | `exp_checkout_cta_v2` |
| `/product` | 구매 버튼 강조 | `exp_product_cta_v1` |
| `/cart` | 배송비 안내 | `exp_cart_shipping_notice_v1` |
| `/collection` | 상품 탐색 개선 | `exp_collection_browse_v1` |

### 19.3 중복 처리

동일 key가 이미 있으면 version number를 증가시킨다.

```text
exp_checkout_cta_v1 존재
-> exp_checkout_cta_v2 생성
```

## 20. UI 변경 action 생성 규칙

Agent가 자연어를 action으로 변환할 때는 MVP에서 안전한 변경만 우선 지원한다.

### 20.1 CTA 강조

입력은 다음과 같다.

```text
결제 버튼을 더 눈에 띄게 해줘.
```

출력은 다음과 같다.

```json
{
  "selector": "[data-track-id='pay_btn']",
  "label": "결제 CTA 강조",
  "actions": [
    {
      "type": "set_style",
      "styles": {
        "background": "#4f46e5",
        "color": "#ffffff",
        "font-weight": "700",
        "border-radius": "14px"
      }
    }
  ]
}
```

### 20.2 CTA 문구 변경

입력은 다음과 같다.

```text
결제 버튼 문구를 지금 바로 주문하기로 바꿔줘.
```

출력은 다음과 같다.

```json
{
  "selector": "[data-track-id='pay_btn']",
  "label": "결제 CTA 문구 변경",
  "actions": [
    {
      "type": "set_text",
      "value": "지금 바로 주문하기"
    }
  ]
}
```

### 20.3 안내 문구 강조

입력은 다음과 같다.

```text
배송비 안내를 더 잘 보이게 해줘.
```

출력은 다음과 같다.

```json
{
  "selector": "[data-track-id='shipping_notice']",
  "label": "배송비 안내 강조",
  "actions": [
    {
      "type": "set_style",
      "styles": {
        "background": "#eef2ff",
        "border": "1px solid #c7d2fe",
        "padding": "12px",
        "border-radius": "12px"
      }
    }
  ]
}
```

## 21. 테스트 계획

### 21.1 단위 테스트

추가 대상은 다음과 같다.

- `test/agent-intent-parser.test.js`
- `test/agent-approval-gate.test.js`
- `test/agent-experiment-tools.test.js`

테스트 항목은 다음과 같다.

- 읽기 intent 분류
- 실험 초안 생성 intent 분류
- 배포 intent가 approval required로 분류되는지
- 권한 없는 `site_id` 차단
- 중복 experiment key 처리
- invalid action type 차단
- approval 만료 차단
- expected experiment version 불일치 차단
- idempotency key 중복 실행 차단

### 21.2 통합 테스트

시나리오는 다음과 같다.

1. 로그인된 사용자 context 준비
2. Agent Mode message API 호출
3. 실험 초안 생성
4. `experiments.json` 확인
5. `agent_actions.jsonl` 확인
6. 승인 요청 생성
7. approve API 호출
8. 실험 status running 확인

### 21.3 수동 테스트

브라우저에서 확인할 것은 다음과 같다.

- Agent Mode toggle 동작
- Agent Mode ON 메시지 표시
- 실험 초안 생성 응답 표시
- 편집기 링크 이동
- 미리보기 링크 이동
- 승인 카드 표시
- 승인 후 실험 상태 변경
- 대시보드 새로고침 후 실험 목록 반영
- selector가 없는 경우 editor/preview에서 경고 표시

## 22. 완료 기준

### 22.1 기능 완료 기준

Agent Mode MVP는 다음 조건을 만족하면 완료로 본다.

- Agent Mode ON/OFF 가능
- 자연어로 실험 목록 조회 가능
- 자연어로 실험 결과 요약 가능
- 자연어로 A/B 실험 초안 생성 가능
- 생성된 초안을 editor에서 열 수 있음
- 배포 요청 시 `approval_required`가 표시됨
- 승인 후 실험이 running 상태로 변경됨
- 작업 실패 시 사용자에게 이유를 명확히 표시함

### 22.2 구조 완료 기준

- Agent 로직이 `services/agent` 하위로 분리됨
- `server.js`에 Agent 세부 로직이 과도하게 추가되지 않음
- 기존 experiment store와 metrics read model을 재사용함
- `site_id` 권한 체크가 모든 Agent API에 적용됨
- 위험 작업에 approval gate가 적용됨

### 22.3 안전 완료 기준

- 승인 없이 배포되지 않음
- 승인 없이 롤백되지 않음
- 승인 없이 실험 삭제되지 않음
- 권한 없는 `site_id`에 접근하지 않음
- LLM이 생성한 action은 검증 후 저장됨
- approval 실행 전 expected 상태를 재검증함
- 동일 approval 또는 idempotency key가 중복 실행되지 않음

## 23. 향후 확장 아이디어

MVP 이후에는 다음 기능을 고려할 수 있다.

### 23.1 실험 성과 기반 자동 제안

Agent가 매일 실험 결과를 확인하고, 성과가 낮은 실험은 중지 제안, 성과가 높은 실험은 확대 제안을 할 수 있다.

### 23.2 통계적 유의성 판단

A/B 테스트의 전환율 차이에 대해 표본 수, 신뢰구간, p-value 또는 Bayesian 방식의 승자 판단을 추가한다.

### 23.3 실시간 Agent 알림

특정 이탈 유형이 급증하면 Agent가 관리자에게 알림을 보낼 수 있다.

### 23.4 Persona 기반 실험 제안

Persona Lab의 synthetic agent 결과를 바탕으로 특정 고객군에 맞춘 UI 변경 실험을 제안할 수 있다.

### 23.5 다단계 작업 플로우

다음과 같은 요청을 지원할 수 있다.

```text
최근 인사이트를 바탕으로 가장 필요한 실험 3개 만들어줘.
```

Agent 동작은 다음과 같다.

```text
Agent가 여러 실험 후보 생성
-> 관리자가 선택
-> 선택된 실험만 초안 저장
```

## 24. AI coding agent 작업 지침

AI coding agent가 이 기능을 구현할 때는 다음 지침을 반드시 따른다.

### 24.1 반드시 이 문서를 먼저 읽을 것

구현 전 다음 문서를 기준으로 기능 범위를 이해한다.

```text
Dashboard/docs/agent-mode-design.md
```

### 24.2 기존 구조를 유지할 것

다음 기존 구조를 우선 재사용한다.

- `requireAuth`
- `requireSiteAccess`
- `experimentStore`
- `metricsReadModel`
- analytics pipeline
- chat routes
- editor draft 구조
- site registry
- preview targets

### 24.3 `server.js`에 모든 코드를 넣지 말 것

Agent 관련 핵심 로직은 다음 위치에 둔다.

- `dashboard-be/services/agent`
- `dashboard-be/routes/agent-routes.js`

### 24.4 작은 단계로 구현할 것

한 번에 모든 Phase를 구현하지 말고 다음 순서로 진행한다.

1. Agent API 기본 구조
2. Read-only Agent
3. Draft Agent
4. Approval Gate
5. Action Agent
6. UI 개선

### 24.5 안전장치를 우선할 것

배포, 롤백, 삭제, 보관 등 실제 상태 변경 작업은 승인 없이 실행하지 않는다.

### 24.6 테스트를 함께 작성할 것

Agent intent, approval gate, experiment tool에 대한 최소 테스트를 추가한다.

## 25. 최종 요약

Agent Mode는 UX-Stream Dashboard의 핵심 기능들을 자연어 인터페이스로 연결하는 상위 기능이다.

기존 챗봇이 인사이트를 설명하는 역할이었다면, Agent Mode는 다음을 수행한다.

```text
인사이트 이해
-> 개선 작업 계획
-> UI 변경안 생성
-> A/B 실험 초안 작성
-> 관리자 승인
-> 실험 배포
-> 결과 추적
```

이 기능을 통해 UX-Stream은 단순 분석 도구가 아니라, UX 문제 발견부터 개선 실험 실행까지 이어지는 운영 자동화 플랫폼으로 확장된다.

MVP에서는 완전 자동 배포가 아니라 승인 기반 반자동 UX 실험 에이전트를 목표로 한다.
