# Backlog

> 발견된 개선 필요 항목들을 기록합니다.  
> 상태: `todo` / `in-progress` / `done`

---

## B-001 퍼널 단계 커스터마이징 지원

**상태**: todo  
**우선순위**: Medium

**문제**  
퍼널 단계(`home → browse → product → cart → checkout → payment`)가 두 파일에 각각 하드코딩되어 있어, 고객사가 7단계 퍼널을 사용하는 경우 대응 불가.

**추가로 발견된 문제**  
`funnel.js`는 마지막 단계를 `"payment"`, `events-service.js`는 `"purchase"`로 다르게 정의하고 있어 `step === "payment" ? "purchase" : step` 변환 코드가 임시로 삽입된 상태.

**수정 필요 파일**
- `dashboard-be/analytics/funnel.js` — `STEPS` 배열 및 `DEFAULT_PATH_MAPPINGS`
- `dashboard-be/services/analytics/events-service.js` — `JOURNEY_STEPS` 배열
- 프론트엔드 — 퍼널 차트 UI (단계 수 동적 렌더링)

**목표**  
단계 목록을 사이트별로 설정 가능하게 하거나, 최소한 두 파일의 단계 정의를 단일 소스로 통합.

---

## B-002 퍼널 × 세션 라벨 교차 시각화 UI

**상태**: todo  
**우선순위**: High

**배경**  
현재 대시보드에는 퍼널 차트(단계별 이탈률)와 세션 라벨(어떤 유형의 고객인지)이 각각 별도로 존재한다.  
"어떤 유형의 고객이 어느 단계에서 이탈하는가"를 한눈에 보여주는 UI가 없다.

**예시**  
checkout 단계 이탈자의 70%가 `price_sensitive_dropper`라면  
→ "결제 직전에 가격 정보나 할인 CTA를 강화해라"는 명확한 액션으로 이어짐.  
이 인사이트는 지금도 데이터로는 존재하지만, UI로 연결되지 않아 발견할 수 없는 상태.

**구현 아이디어**  
- 퍼널 각 단계 바(bar)를 라벨별로 색상 분할 (stacked bar)
- 단계 클릭 시 해당 단계 이탈자의 라벨 구성 비율 드릴다운
- 라벨별 `max_step` 분포로 "이 유형은 주로 어느 단계까지 가는가" 시각화

**필요한 백엔드 작업**  
현재 `GET /api/events/summary` 응답에 라벨 × 단계 교차 집계 데이터가 없음.  
`journey` 응답에 각 단계별 라벨 분포(`label_breakdown`) 필드 추가 필요.

**관련 파일**  
- `dashboard-be/services/analytics/events-service.js` — `buildJourneySummary()` 확장
- `dashboard-be/analytics/labeler.js` — 라벨 분류 결과
- `dashboard-be/analytics/pipeline.js` — `computeLabeledSessionSummaries()`
- 프론트엔드 — 퍼널 차트 컴포넌트

---

## B-003 비지도 학습 클러스터링 + LLM 자연어 라벨링

**상태**: todo  
**우선순위**: High

**배경**  
현재 `labeler.js`의 라벨링은 `error_count >= 1`, `rage_clicks_count >= 1` 같은 규칙을 개발자가 수동으로 작성한 rule-based 방식이다.  
새로운 고객 행동 패턴이 생기면 규칙을 직접 추가해야 하며, 발견하지 못한 패턴은 영구히 미분류 상태로 남는다.

**목표**  
세션 행동 데이터를 비지도 학습으로 클러스터링한 뒤, 각 클러스터의 통계 요약을 LLM에 넘겨 자연어 라벨과 설명을 자동 생성한다.  
규칙 없이도 데이터 분포에서 유의미한 고객 유형을 발견하고, 라벨 이름을 사람이 읽을 수 있는 형태로 출력한다.

**구현 흐름**

1. **피처 벡터 생성** — 세션당 `[page_views, clicks, dwell_ms, max_step_index, error_count, rage_clicks, unique_paths, ...]` 형태로 수치화  
2. **클러스터링** — K-Means 또는 DBSCAN으로 세션을 N개 그룹으로 분리 (K는 실루엣 스코어로 자동 탐색)  
3. **클러스터 요약** — 각 클러스터의 피처 평균/중앙값, 대표 `max_step` 분포, 세션 수 비율을 계산  
4. **LLM 라벨링** — 요약 통계를 프롬프트로 구성해 Claude API에 전송, `label` (snake_case 식별자)과 `description` (한국어 설명 1~2문장)을 JSON으로 응답받음  
5. **적용** — 생성된 라벨을 세션에 태깅, 기존 `LABELS` 상수와 병행 또는 대체

**LLM 프롬프트 예시**

```
다음은 이커머스 세션 클러스터의 통계 요약입니다.
- 평균 페이지뷰: 12.3, 평균 클릭: 31.4
- 주요 이탈 단계: product (68%)
- 에러 발생 비율: 2%, rage click 비율: 41%

이 클러스터를 가장 잘 설명하는 라벨 하나를 JSON으로 반환하세요.
{"label": "...", "description": "..."}
```

**고려사항**
- 클러스터 수 K가 바뀌면 라벨이 달라지므로 버전 관리 필요
- 동일 클러스터에 LLM이 매번 다른 라벨을 붙이지 않도록 클러스터 중심값 기반 캐싱
- 기존 rule-based 라벨과의 혼용 전략 결정 필요 (대체 vs. 병행)

**관련 파일**
- `dashboard-be/analytics/labeler.js` — 현재 rule-based 라벨링 (대체 대상)
- `dashboard-be/analytics/pipeline.js` — `computeLabeledSessionSummaries()` (피처 추출 시작점)
- `dashboard-be/services/analytics/events-service.js` — 세션 집계 데이터 소스

---
