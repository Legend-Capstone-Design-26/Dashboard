# UX-Stream Agent Simulation Lab 설계서

## 1. 문서 목적

본 문서는 UX-Stream Dashboard에 추가할 **Agent Simulation Lab** 기능의 설계 방향과 기술적 타당성을 정의한다.

Agent Simulation Lab의 목표는 관리자가 A/B 실험을 만든 뒤, 실제 사용자에게 배포하기 전에 **NVIDIA Korea 페르소나 모집단 기반 가상 agent**로 실험 결과를 사전 예측하는 것이다.

즉, 실험실은 다음 질문에 답해야 한다.

```text
이 UX 변경은 어떤 사용자군에게 긍정적일까?
Variant B가 Variant A보다 전환 가능성이 높은가?
그 차이는 통계적으로 의미 있는 수준인가?
어떤 페르소나 세그먼트에서 효과가 크거나 작게 나타나는가?
```

이 문서는 구현 방식뿐 아니라 왜 이러한 구조가 타당한지도 함께 설명한다.

---

## 2. 최종 사용자 흐름

관리자는 Dashboard에서 A/B 실험을 만든 뒤 실험 상세 화면 또는 실험실 화면에서 다음 버튼을 누른다.

```text
[가상 agent로 돌려보기]
```

버튼 클릭 이후의 흐름은 다음과 같다.

```text
A/B 실험 생성
  -> 가상 agent simulation run 생성
  -> NVIDIA Korea 페르소나 모집단에서 대표 cohort 샘플링
  -> Variant A / Variant B 각각에 대해 agent simulation 실행
  -> 세션 단위 outcome 저장
  -> 전환율, 클릭률, 체류시간, 단계 도달률 집계
  -> t-test, proportion test, ANOVA 등 통계 검정
  -> Dashboard 실험실에 결과 표시
```

Dashboard는 즉시 최종 결과를 반환하지 않고 `run_id`를 먼저 반환한다.

```json
{
  "run_id": "sim_20260614_001",
  "status": "queued",
  "population_source": "nvidia/Nemotron-Personas-Korea",
  "population_size": 7000000,
  "sample_size": 10000,
  "estimated_seconds": 60
}
```

이후 프론트엔드는 polling, SSE, 또는 WebSocket으로 진행률과 결과를 갱신한다.

---

## 3. 기존 Dashboard 구조와의 연결

Agent Simulation Lab은 완전히 새로운 시스템이 아니라 현재 Dashboard가 가진 기능을 확장한다.

현재 이미 존재하는 기반은 다음과 같다.

| 영역 | 현재 구현 | 활용 방식 |
| --- | --- | --- |
| 실험 관리 | `experiments.json`, `/api/experiments`, Visual Editor | A/B 실험 정의와 Variant B 변경사항을 simulation 입력으로 사용 |
| SDK 이벤트 수집 | `/collect`, Kafka, Redis read model | agent simulation 이벤트도 동일한 event pipeline에 태울 수 있음 |
| 페르소나 카탈로그 | `dashboard-be/personas/catalog.generated.json` | NVIDIA Korea 페르소나 기반 세그먼트와 weight 활용 |
| Synthetic runner | `dashboard-be/personas/index.js`, `scripts/simulate.js` | MVP simulation engine으로 활용 |
| Overlay generator | `dashboard-be/personas/overlay-generator.js` | UX 변경이 페르소나 행동 전이에 주는 영향을 계산 |
| Persona Lab UI | `dashboard-fe/public/persona-lab.*` | 실험실 화면의 초기 UI 기반 |
| Metrics | `/api/metrics`, Redis metrics store | A/B별 전환율, 클릭률, 세션 수 집계 기반 |

따라서 구현의 핵심은 기존 기능을 버리는 것이 아니라, **simulation run lifecycle**, **대표 샘플링**, **세션 단위 결과 저장**, **통계 검정 계층**을 추가하는 것이다.

---

## 4. 700만 페르소나를 다루는 방식

### 4.1 전수 실행을 하지 않는 이유

NVIDIA Korea 페르소나가 700만 개 있다고 해서 버튼 클릭마다 700만 agent를 모두 실행하면 안 된다.

그 이유는 다음과 같다.

1. **지연시간 문제**
   - 버튼 클릭 후 수분 또는 수십 분 이상 걸리면 Dashboard UX로 사용할 수 없다.

2. **비용 문제**
   - 700만 agent를 매번 실행하면 CPU, memory, queue, storage write 비용이 과도하게 증가한다.

3. **통계적 비효율**
   - 대표성 있는 표본이면 모집단의 경향을 충분히 추정할 수 있다.
   - 표본 수를 무작정 늘리는 것보다 어떤 세그먼트를 어떻게 대표하게 뽑는지가 더 중요하다.

4. **재현성 문제**
   - 매번 전체 모집단을 처리하면 run 관리, 실패 복구, 재집계가 어려워진다.

따라서 700만 페르소나는 **실행 대상 전체**가 아니라 **모집단**으로 본다.

```text
전체 7,000,000 personas
  -> segment index 구성
  -> stratified sampling
  -> 대표 cohort 1,000 ~ 50,000명 실행
  -> weight 기반 모집단 추정
```

### 4.2 층화 샘플링

현재 `catalog.generated.json`에는 다음과 같은 세그먼트 필드가 있다.

```text
age_group
occupation_group
style_key
group_id
weight
count
```

이를 기준으로 층화 샘플링을 수행한다.

예시:

```text
20대 학생·트렌드충동형
30대 직장인·리뷰의존형
40대 일반 소비자·가격민감형
60대+ 은퇴층·배송민감형
```

기본은 모집단 비율에 맞춘 proportional allocation이다.

다만 희귀하지만 제품적으로 중요한 세그먼트는 oversampling한 뒤 집계 시 weight로 보정한다.

이 방식이 타당한 이유는 다음과 같다.

- 전체 모집단 경향을 유지하면서도 중요한 소수 세그먼트를 관찰할 수 있다.
- Dashboard에 `coverage`, `sample_size`, `segment_breakdown`을 설명할 수 있다.
- 동일한 `sample_seed`를 저장하면 같은 실험을 재현할 수 있다.

---

## 5. UX 변경을 agent가 이해하는 구조

가상 agent가 UX 변경을 이해한다는 것은 LLM이 매 agent의 클릭을 실시간으로 결정한다는 뜻이 아니다.

올바른 구조는 다음과 같다.

```text
Variant B UI 변경사항
  -> UX Change Interpreter
  -> Persona Reaction Overlay
  -> Agent State Transition Weight 보정
  -> Simulation 실행
```

### 5.1 Variant B 변경사항

Visual Editor 또는 Agent Mode에서 만든 UX 변경은 구조화된 JSON으로 저장된다.

예시:

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
        "font-weight": "700"
      }
    }
  ]
}
```

이 변경 자체는 단순 DOM mutation이다. agent simulation에 사용하려면 이를 행동 의미로 변환해야 한다.

```text
결제 CTA 문구가 더 직접적으로 바뀜
버튼 시각적 강조가 증가함
결제 행동 유도 강도가 증가함
```

다만 이 변환은 단순히 LLM에게 "좋아질까?"를 묻는 방식이면 안 된다. UX 변경은 다음 단계로 분해해서 해석한다.

```text
DOM Mutation
  -> UX Signal
  -> Behavioral Mechanism
  -> Transition Impact
```

각 단계의 역할은 다음과 같다.

| 단계 | 입력 | 출력 | 이유 |
| --- | --- | --- | --- |
| DOM Mutation | selector, action, style, text | 실제 변경된 UI 요소 | 시스템이 확정적으로 알 수 있는 사실 |
| UX Signal | DOM Mutation | visibility, clarity, urgency, trust, price_reassurance 등 | UI 변경을 행동 심리 신호로 변환 |
| Behavioral Mechanism | UX Signal + persona trait | 어떤 사용자군이 왜 반응하는지 | 페르소나별 차이를 설명하기 위해 필요 |
| Transition Impact | Behavioral Mechanism + state graph | 어떤 edge가 증가/감소하는지 | simulation runner가 사용할 수 있는 숫자 모델로 변환 |

예시:

```text
DOM Mutation:
- pay_btn 문구를 "지금 바로 주문하기"로 변경
- background color를 강한 색으로 변경
- font-weight를 700으로 변경

UX Signal:
- CTA visibility 증가
- urgency 증가
- primary action clarity 증가

Behavioral Mechanism:
- 빠른 결정형 사용자는 결제 시도 가능성이 증가
- 충동형 사용자는 CTA 클릭 가능성이 증가
- 가격민감형 사용자는 배송비/할인 정보가 없으면 영향이 제한적
- 과도한 압박을 싫어하는 사용자군은 오히려 이탈 가능성이 증가할 수 있음

Transition Impact:
- checkout_entry -> payment_attempt 증가
- payment_attempt -> checkout_complete 소폭 증가
- checkout_entry -> exit 감소 또는 특정 페르소나에서는 증가
```

이 구조가 필요한 이유는 다음과 같다.

- LLM이 막연한 예측을 하지 않고, UI 변경의 근거를 단계별로 설명하게 만들 수 있다.
- 긍정 효과와 부정 효과를 모두 모델링할 수 있다.
- 같은 DOM 변경이라도 페르소나별로 다른 행동 결과가 나오는 이유를 Dashboard에서 설명할 수 있다.
- 최종 출력이 transition multiplier로 제한되므로 simulation runner가 재현 가능하게 실행할 수 있다.

### 5.2 Reaction Overlay

UX 변경의 의미는 페르소나별 행동 전이 확률에 반영된다.

예를 들어 baseline 상태 전이가 다음과 같다고 하자.

```text
checkout_entry -> payment_attempt: weight 0.45
checkout_entry -> exit: weight 0.55
```

Variant B에서 결제 CTA가 강화되면 특정 페르소나의 전이 weight를 보정한다.

```json
{
  "reason_summary": "결제 CTA 문구와 색상 강조가 빠른 결정형 사용자에게 결제 시도를 유도할 가능성이 높습니다.",
  "edge_weight_multipliers": {
    "checkout_entry->payment_attempt": 1.2,
    "payment_attempt->checkout_complete": 1.15
  }
}
```

여기서 LLM이 Markov 모델 자체를 새로 만드는 것은 아니다. 기존 state와 edge는 시스템이 제공하고, LLM은 기존 edge에 적용할 multiplier만 제안한다.

```text
기존 Markov/state transition model
  + UX 변경 해석 결과
  + 페르소나 반응 규칙
  -> 기존 edge weight 보정
```

예를 들어 baseline 모델이 다음과 같다고 하자.

```text
checkout_entry -> payment_attempt: 0.45
checkout_entry -> exit: 0.55
```

LLM 또는 rule 기반 해석기가 다음 multiplier를 제안한다.

```json
{
  "checkout_entry->payment_attempt": 1.2,
  "checkout_entry->exit": 0.9
}
```

시스템은 기존 weight에 multiplier를 곱한 뒤 정규화한다.

```text
payment_attempt raw: 0.45 * 1.2 = 0.54
exit raw: 0.55 * 0.9 = 0.495
sum: 1.035

payment_attempt normalized: 0.54 / 1.035 = 0.522
exit normalized: 0.495 / 1.035 = 0.478
```

따라서 Variant B에서는 결제 시도 확률이 `45.0% -> 52.2%`로 보정된다.

### 5.3 증가 효과와 감소 효과

UX 변경은 항상 긍정적인 효과를 만든다고 가정하면 안 된다. Variant B는 특정 페르소나의 전환 가능성을 높일 수도 있고, 반대로 불안, 혼란, 과도한 압박, 정보 은폐, 탐색 비용 증가를 만들어 전환율을 낮출 수도 있다.

따라서 multiplier는 다음 세 가지 의미를 가진다.

```text
multiplier > 1.0  해당 행동 전이 증가
multiplier = 1.0  변화 없음
multiplier < 1.0  해당 행동 전이 감소
```

예를 들어 CTA를 너무 공격적으로 바꿔 가격민감형 사용자가 부담을 느끼는 경우는 다음처럼 표현할 수 있다.

```json
{
  "reason_summary": "강한 결제 유도 문구가 가격민감형 사용자에게 압박으로 작용해 결제 시도보다 이탈 가능성을 높일 수 있습니다.",
  "edge_weight_multipliers": {
    "checkout_entry->payment_attempt": 0.85,
    "checkout_entry->exit": 1.15
  }
}
```

또 다른 예시는 다음과 같다.

```text
UX 변경:
- 결제 버튼을 크게 만들었지만 배송비 안내 영역이 아래로 밀림

가격민감형 페르소나 반응:
- CTA는 더 잘 보임
- 하지만 배송비 확인이 어려워져 불안 증가

Transition Impact:
- checkout_entry -> shipping_check 증가
- shipping_check -> exit 증가
- checkout_entry -> payment_attempt 감소
```

이 관점이 중요한 이유는 simulation lab의 목적이 단순히 "B안이 좋아 보인다"를 확인하는 것이 아니기 때문이다. 실험실은 어떤 사용자군에서는 좋아지고, 어떤 사용자군에서는 나빠지는지를 사전에 보여줘야 한다.

이 구조가 타당한 이유는 다음과 같다.

- UX 변경을 확률 모델에 연결할 수 있다.
- 같은 UX 변경이라도 페르소나별 반응 차이를 표현할 수 있다.
- LLM 결과를 숫자 multiplier로 고정하기 때문에 simulation이 재현 가능하다.
- 모든 agent에게 LLM을 호출하지 않아도 된다.
- 전환율 증가와 감소를 모두 표현할 수 있다.
- LLM이 모델 전체를 생성하지 않기 때문에 기존 state graph의 안정성을 유지할 수 있다.

---

## 6. LLM의 역할

LLM은 대규모 simulation loop 안에서 직접 클릭을 수행하지 않는다.

LLM은 다음 위치에서 사용한다.

### 6.1 자연어 요청을 UI 변경안으로 변환

관리자 요청:

```text
결제 버튼을 더 눈에 띄게 바꿔줘.
```

LLM 또는 rule 기반 도구는 이를 구조화된 action으로 변환한다.

```text
selector: [data-track-id='pay_btn']
set_text: 지금 바로 주문하기
set_style: 배경색, 글자색, 굵기, 그림자 변경
```

현재 `services/agent/tools/editor-tools.js`가 이 역할의 초기 rule 기반 구현이다.

### 6.2 UX 변경 해석

LLM은 Variant B 변경사항을 읽고 다음과 같은 의미를 도출한다.

```text
CTA urgency 증가
시각적 주목도 증가
결제 불안 감소
리뷰 신뢰도 증가
가격 민감 요소 완화
```

### 6.3 페르소나별 reaction overlay 생성

현재 `personas/overlay-prompt-builder.js`와 `personas/overlay-generator.js`가 이 구조를 이미 갖고 있다.

LLM prompt에는 다음 정보가 들어간다.

- 실험 key
- 실험 가설
- 목표 지표
- Variant A/B 변경사항
- 페르소나 라벨
- 페르소나 성향
- 페르소나 의사결정 규칙
- 사용 가능한 state transition 목록

LLM은 새로운 state를 만들지 않고 기존 edge weight multiplier만 반환한다.

이 제한이 중요한 이유는 다음과 같다.

- LLM이 임의의 행동 경로를 만들어 simulation을 오염시키는 것을 막는다.
- agent runner는 검증된 state transition graph 안에서만 움직인다.
- multiplier 범위를 제한하면 과도한 효과 예측을 방지할 수 있다.

### 6.4 프롬프트 고도화 원칙

LLM은 만능 예측기가 아니다. 따라서 prompt는 단순히 "이 UX 변경의 효과를 예측하라"가 아니라, 제한된 분석 절차를 강제해야 한다.

권장 prompt 구조는 다음과 같다.

```text
1. 변경된 UI 요소의 역할을 분류하라.
   - CTA
   - trust signal
   - price information
   - navigation
   - friction removal
   - visual hierarchy
   - form assistance

2. UX signal을 분류하라.
   - visibility
   - clarity
   - urgency
   - trust
   - price reassurance
   - effort reduction
   - cognitive load increase
   - perceived pressure increase

3. 페르소나 성향과 연결하라.
   - impulsive
   - review_oriented
   - price_sensitive
   - comparison
   - shipping_sensitive
   - fast_decision

4. 사용 가능한 transition edge 중 영향을 받는 edge만 선택하라.

5. 각 edge에 multiplier와 이유를 붙여라.

6. 근거가 약하면 multiplier를 1.0에 가깝게 유지하라.

7. 긍정 효과뿐 아니라 부정 효과도 고려하라.
```

LLM 출력 스키마는 다음처럼 근거와 신뢰도를 포함하는 형태가 좋다.

```json
{
  "reason_summary": "한국어 요약",
  "ux_signals": ["visibility", "urgency"],
  "persona_mechanisms": [
    {
      "persona_trait": "fast_decision",
      "mechanism": "명확하고 강한 CTA가 빠른 결정을 유도함"
    }
  ],
  "edge_weight_multipliers": {
    "checkout_entry->payment_attempt": {
      "multiplier": 1.2,
      "direction": "increase",
      "confidence": 0.72,
      "reason": "CTA visibility와 urgency가 증가했기 때문"
    }
  }
}
```

단, simulation runner가 실제로 사용하는 값은 최종적으로 검증된 `edge -> multiplier` 맵이다. 나머지 필드는 Dashboard 설명과 audit에 사용한다.

이 방식이 타당한 이유는 다음과 같다.

- LLM의 판단 과정을 구조화해 설명 가능성을 높인다.
- 단순 긍정 편향을 줄이고 감소 효과를 명시적으로 고려하게 한다.
- confidence가 낮은 edge는 시스템에서 multiplier를 약하게 적용할 수 있다.
- 같은 실험을 다시 실행할 때 prompt, output, 적용 multiplier를 audit할 수 있다.

### 6.5 시스템 검증 및 정규화

LLM 결과는 그대로 simulation에 적용하지 않는다. 반드시 시스템 검증 단계를 거친다.

검증 규칙은 다음과 같다.

```text
1. edge가 현재 persona state graph에 존재하는가?
2. multiplier가 허용 범위 안에 있는가? 예: 0.6 ~ 1.6
3. 변경된 UI 요소와 영향을 받는 edge가 논리적으로 연결되는가?
4. goal event와 무관한 edge를 과도하게 변경하지 않았는가?
5. confidence가 너무 낮은 경우 multiplier를 1.0에 가깝게 shrink할 것인가?
6. 같은 segment와 같은 experiment에 대해 이미 생성된 overlay가 있는가?
```

예를 들어 LLM이 다음처럼 존재하지 않는 edge를 반환하면 폐기한다.

```json
{
  "edge_weight_multipliers": {
    "unknown_state->checkout_complete": 1.4
  }
}
```

또한 multiplier가 과도하면 clamp한다.

```text
입력: 2.5
허용 범위: 0.6 ~ 1.6
적용: 1.6
```

confidence 기반 shrink도 적용할 수 있다.

```text
raw multiplier: 1.4
confidence: 0.5
neutral: 1.0
applied multiplier: 1.0 + ((1.4 - 1.0) * 0.5) = 1.2
```

이 검증 계층이 필요한 이유는 LLM이 가끔 과도한 인과관계를 만들거나, 실제 state graph에 없는 행동을 제안할 수 있기 때문이다. simulation 결과의 타당성은 LLM 자체보다 **LLM 출력에 대한 제약과 검증**에서 나온다.

### 6.6 결과 설명

통계 계산은 코드가 수행한다. LLM은 계산된 결과를 사용자가 이해하기 쉬운 설명으로 바꾸는 데 사용한다.

예시:

```text
B안은 전체 simulated cohort에서 전환율을 12.4% 높였고,
특히 20대 충동형과 빠른 결정형 사용자군에서 효과가 컸습니다.
반면 60대 가격민감형에서는 배송비 정보가 직접 개선되지 않아 효과가 제한적이었습니다.
```

### 6.7 LLM을 사용하지 않아야 하는 영역

다음 영역은 LLM이 아니라 deterministic code 또는 statistical module로 처리한다.

- agent 대량 실행 loop
- p-value 계산
- 전환율 계산
- t-test, ANOVA, proportion test
- sample allocation
- run progress 계산
- retry/idempotency 처리

이 구분이 타당한 이유는 비용과 재현성 때문이다. LLM을 모든 agent 행동 결정에 사용하면 비용이 폭증하고 같은 run을 재현하기 어렵다.

---

## 7. Simulation Run 데이터 모델

### 7.1 `simulation_runs`

```text
run_id
site_id
experiment_key
experiment_version
population_source
population_size
sample_size
sample_seed
status
mode: synthetic | browser
created_by
created_at
started_at
finished_at
```

상태 흐름:

```text
created
  -> sampling
  -> queued
  -> running
  -> aggregating
  -> validating
  -> completed
```

실패 또는 취소 상태:

```text
failed
cancelled
```

### 7.2 `simulation_sample_groups`

```text
run_id
group_id
age_group
occupation_group
style_key
population_count
population_weight
sample_count
sample_weight
oversampled
```

이 테이블이 필요한 이유는 결과 해석 때문이다.

Dashboard는 단순히 `10,000명 돌렸습니다`가 아니라 다음처럼 설명할 수 있어야 한다.

```text
NVIDIA Korea 7,000,000 페르소나 모집단 중 대표 cohort 10,000명을 샘플링했습니다.
세그먼트 커버리지: 94.2%
희귀 세그먼트는 oversampling 후 weight로 보정했습니다.
```

### 7.3 `simulation_sessions`

```text
run_id
session_id
persona_id
group_id
actor_type: synthetic_agent | browser_agent
variant: A | B
converted
conversion_event
page_views
clicks
dwell_total_ms
max_step
revenue
weight
started_at
ended_at
```

통계 검정을 위해서는 aggregate counter만으로 부족하다. 세션 단위 outcome이 있어야 평균, 분산, 신뢰구간, p-value를 계산할 수 있다.

---

## 8. 통계 검정 설계

### 8.1 지표별 검정 방법

| 지표 | 예시 | 권장 검정 |
| --- | --- | --- |
| 전환율 | checkout_complete / sessions | two-proportion z-test 또는 chi-square test |
| 클릭률 | clicks / page_views | proportion test |
| 평균 체류시간 | dwell_total_ms 평균 | Welch t-test |
| 평균 탐색 깊이 | page depth 평균 | Welch t-test |
| 3개 이상 variant | A/B/C 비교 | one-way ANOVA |
| 페르소나 세그먼트 간 반응 차이 | segment별 uplift | ANOVA 또는 segment별 검정 |

### 8.2 결과 표시 예시

```text
Variant A 전환율: 8.4%
Variant B 전환율: 10.3%
Uplift: +22.6%
p-value: 0.018
95% CI: +0.4% ~ +3.5%
결론: simulated cohort 기준 B안이 유의미하게 높음
```

### 8.3 통계 결과의 해석 제한

Synthetic simulation 결과는 실제 사용자 실험 결과와 동일하게 취급하면 안 된다.

Dashboard에는 반드시 다음과 같은 라벨을 붙인다.

```text
이 결과는 NVIDIA Korea persona 기반 synthetic simulation입니다.
실제 사용자 행동을 보장하지 않으며, 실험 배포 전 방향성 검토에 사용해야 합니다.
```

이 제한이 필요한 이유는 다음과 같다.

- synthetic persona는 생성된 모델이므로 실제 시장 편향을 완전히 반영하지 못한다.
- 표본 수가 커져도 모델 편향은 사라지지 않는다.
- p-value는 simulator 내부 가정하에서의 차이를 의미한다.

---

## 9. API 설계 초안

### 9.1 Simulation run 생성

```text
POST /api/simulations/runs
```

요청:

```json
{
  "site_id": "customer-site",
  "experiment_key": "exp_checkout_cta_v2",
  "sample_size": 10000,
  "mode": "synthetic",
  "sample_seed": "optional-fixed-seed"
}
```

응답:

```json
{
  "ok": true,
  "run_id": "sim_20260614_001",
  "status": "queued",
  "sample_size": 10000,
  "population_size": 7000000
}
```

### 9.2 Simulation run 상태 조회

```text
GET /api/simulations/runs/:runId
```

응답:

```json
{
  "ok": true,
  "run_id": "sim_20260614_001",
  "status": "running",
  "progress": {
    "sampled": 10000,
    "processed": 4200,
    "failed": 12
  }
}
```

### 9.3 Simulation 결과 조회

```text
GET /api/simulations/runs/:runId/results
```

응답:

```json
{
  "ok": true,
  "run_id": "sim_20260614_001",
  "summary": {
    "winner": "B",
    "uplift": 0.226,
    "significant": true
  },
  "variants": {
    "A": { "sessions": 5000, "conversions": 420, "cvr": 0.084 },
    "B": { "sessions": 5000, "conversions": 515, "cvr": 0.103 }
  },
  "statistics": {
    "test": "two_proportion_z_test",
    "p_value": 0.018,
    "confidence_level": 0.95
  },
  "segments": []
}
```

---

## 10. 구현 단계

### Phase 1. 현재 Synthetic Lab 정리

- `/api/metrics`에서 `actor_type`, `persona_id`, `run_id` 필터를 실제로 반영한다.
- `persona-lab` 결과에 synthetic 결과임을 명확히 표시한다.
- `simulation_run_id`를 이벤트와 session outcome에 추가한다.

### Phase 2. Simulation Run Store 추가

- `simulation_runs` 저장소 추가
- `simulation_sample_groups` 저장소 추가
- `simulation_sessions` 저장소 추가
- run 상태 전이와 progress 계산 추가

### Phase 3. 대표 cohort 샘플러 구현

- `catalog.generated.json`의 `groups`를 기반으로 stratified sampling 구현
- `sample_seed` 기반 재현성 보장
- oversampling과 weight 보정 지원

### Phase 4. UX Reaction Overlay 고도화

- 실험별, 세그먼트별 overlay 생성
- LLM 호출 결과 캐싱
- 동일 실험과 동일 persona group에 대해 중복 호출 방지
- multiplier 범위 제한과 validation 유지

### Phase 5. 통계 검정 모듈 추가

- conversion rate용 proportion test
- continuous metric용 Welch t-test
- 3개 이상 group 비교용 ANOVA
- confidence interval, effect size, sample size warning 표시

### Phase 6. Browser Agent 확장

MVP 이후에는 synthetic event generator뿐 아니라 실제 브라우저 기반 agent도 추가할 수 있다.

```text
Browser Agent
  -> /preview/:siteId 접속
  -> __ab_force=A 또는 B 적용
  -> DOM 탐색
  -> 버튼/링크/폼 행동
  -> SDK가 실제 이벤트 전송
```

다만 browser agent는 임의 고객사 사이트를 탐색하므로 다음 보안 제한이 필요하다.

- domain allowlist
- 외부 링크 차단
- destructive form submit 차단
- rate limit
- sandboxed browser context
- audit log

---

## 11. 타당성 요약

이 설계가 타당한 이유는 다음과 같다.

1. **현재 코드와 잘 연결된다**
   - 기존 experiment, persona, overlay, metrics 구조를 재사용한다.

2. **대규모 페르소나를 현실적으로 다룰 수 있다**
   - 700만 전수 실행 대신 stratified sample과 weight 보정으로 latency와 비용을 제어한다.

3. **UX 변경의 의미를 simulation에 연결할 수 있다**
   - LLM이 UX 변경을 reaction overlay로 변환하고, runner는 이를 state transition weight에 반영한다.

4. **LLM 사용 위치가 명확하다**
   - LLM은 해석과 설명에 사용하고, 대량 실행과 통계 검정은 deterministic code가 수행한다.

5. **결과 해석이 가능하다**
   - 단순 승패가 아니라 segment별 uplift, p-value, confidence interval, caveat를 함께 제공한다.

6. **실제 사용자 실험과 구분할 수 있다**
   - synthetic, browser agent, real user 결과를 분리해 신뢰도와 해석 범위를 명확히 할 수 있다.

---

## 12. 추가로 고려해야 할 문제점

Agent Simulation Lab을 실제 제품 수준으로 만들기 위해서는 다음 문제를 반드시 검토해야 한다.

### 12.1 Synthetic 결과의 과신 위험

가상 agent 결과는 실제 사용자 행동이 아니다. 특히 p-value나 confidence interval을 표시하면 사용자가 이를 실제 실험 결과처럼 오해할 수 있다.

대응 방안:

- 모든 결과에 `synthetic simulation` 라벨을 붙인다.
- 실제 사용자 실험 결과와 UI 영역을 분리한다.
- "실제 배포 전 방향성 검토"라는 caveat를 결과 카드에 표시한다.
- synthetic p-value는 "simulation model 안에서의 유의성"이라고 설명한다.

### 12.2 LLM 편향과 과잉 인과 추론

LLM은 UX 변경과 행동 변화 사이의 인과를 과도하게 확신할 수 있다. 예를 들어 버튼 색상 변경만으로 구매 완료가 크게 증가한다고 예측할 수 있다.

대응 방안:

- multiplier 범위를 제한한다.
- confidence 기반 shrink를 적용한다.
- 근거가 약한 UX signal은 multiplier를 1.0에 가깝게 둔다.
- LLM 출력과 rule 기반 fallback을 비교한다.
- 같은 변경에 대해 segment별 결과가 모두 같은 방향이면 bias 가능성을 경고한다.

### 12.3 페르소나 모집단의 대표성 문제

NVIDIA Korea 페르소나 700만 개가 실제 고객사의 사용자 분포와 항상 일치하지는 않는다.

대응 방안:

- 고객사 사이트의 실제 SDK 이벤트 분포를 사용해 persona weight를 보정한다.
- 실제 유입 데이터가 부족한 경우 기본 Korea persona weight를 사용한다.
- Dashboard에 사용한 population source와 weight version을 표시한다.
- 추후 real user data가 쌓이면 synthetic persona distribution을 calibration한다.

### 12.4 세그먼트별 희귀 집단 문제

전체 평균에서 B안이 좋아 보여도 특정 세그먼트에서는 나빠질 수 있다. 반대로 중요한 희귀 세그먼트가 전체 평균에서 묻힐 수 있다.

대응 방안:

- 전체 uplift뿐 아니라 segment breakdown을 필수로 표시한다.
- 희귀하지만 중요한 segment는 oversampling 후 weight 보정한다.
- Simpson's paradox 가능성을 경고한다.
- 특정 segment에서 음수 uplift가 크면 winner 결과에 warning을 붙인다.

### 12.5 통계 검정의 전제 조건

t-test, ANOVA, proportion test는 각각 전제 조건이 있다. 표본 수가 너무 작거나 분산이 극단적이면 결과를 신뢰하기 어렵다.

대응 방안:

- metric별 적절한 검정을 자동 선택한다.
- sample size warning을 표시한다.
- p-value만 표시하지 말고 effect size와 confidence interval을 함께 표시한다.
- conversion처럼 binary outcome은 t-test가 아니라 proportion test를 사용한다.
- 여러 segment를 동시에 검정할 경우 multiple comparison 문제를 고려한다.

### 12.6 실제 브라우저 기반 agent 확장 시 보안 문제

향후 browser agent가 고객사 사이트를 실제로 돌아다니게 되면 보안 리스크가 커진다.

대응 방안:

- site registry의 allowlist domain만 접근한다.
- 외부 링크 이동을 차단한다.
- 결제, 회원가입, 삭제, 주문 확정 등 destructive action을 차단한다.
- form submit은 명시적으로 허용된 경우에만 실행한다.
- sandboxed browser context와 rate limit을 적용한다.
- 모든 agent action을 audit log로 남긴다.

### 12.7 성능과 비용 문제

simulation run은 버튼 클릭 UX에 맞아야 한다. 700만 전수 실행이나 LLM per-agent 호출은 실시간 제품 경험에 맞지 않는다.

대응 방안:

- cohort sampling을 기본으로 한다.
- LLM은 segment별 overlay 생성에만 사용한다.
- overlay 결과를 experiment + segment + persona_version 기준으로 캐싱한다.
- worker queue 기반 비동기 실행을 사용한다.
- 빠른 preview run과 고신뢰도 full run을 분리한다.

```text
Quick run: 1,000 agents, 10~30초 목표
Standard run: 10,000 agents, 1~3분 목표
Deep run: 50,000+ agents, 비동기 리포트 목표
```

### 12.8 제품 설명의 신뢰성

사용자가 결과를 신뢰하려면 "왜 이런 결과가 나왔는지"를 볼 수 있어야 한다.

대응 방안:

- 사용한 UX signal을 표시한다.
- segment별 reaction overlay 이유를 표시한다.
- sample coverage와 persona distribution을 표시한다.
- Markov transition 변화 전후를 시각화한다.
- LLM이 만든 설명과 실제 통계 결과를 구분해 표시한다.

---

## 13. Agent Simulation Lab의 의미와 제품 포지셔닝

Agent Simulation Lab은 실제 A/B 테스트를 대체하는 기능이 아니다. 이 기능의 의미는 실제 사용자에게 실험을 배포하기 전에 UX 변경안의 방향성, 위험, 세그먼트별 반응 차이를 빠르게 검토하는 데 있다.

따라서 제품 포지션은 다음과 같이 정의한다.

```text
실제 A/B 테스트 대체재: 아님
실험 전 후보 검증 도구: 맞음
UX 변경 리스크 탐지 도구: 맞음
세그먼트별 반응 가설 생성 도구: 맞음
실제 배포 전 의사결정 보조 도구: 맞음
```

### 13.1 왜 의미가 있는가

첫째, 실제 사용자에게 노출하기 전에 위험한 UX 변경을 걸러낼 수 있다.

예를 들어 CTA를 강하게 만든 Variant B가 전체 평균에서는 좋아 보여도, 가격민감형이나 신중형 페르소나에서는 오히려 이탈을 증가시킬 수 있다. Agent Simulation Lab은 이런 역효과 가능성을 실제 배포 전에 경고할 수 있다.

```text
전체 simulated uplift: +4.2%
20대 충동형: +15.1%
60대 가격민감형: -6.3%

해석:
B안은 전체적으로는 긍정적이지만,
가격민감형 사용자군에서는 정보 부족 또는 과도한 결제 유도로 이탈 위험이 있다.
```

둘째, 단순 평균이 아니라 세그먼트별 반응을 볼 수 있다.

실제 A/B 테스트를 바로 실행하면 초기에 보이는 값은 보통 전체 전환율, 클릭률, 평균 체류시간 같은 aggregate metric이다. 그러나 simulation lab은 다음처럼 사용자군별 가설을 먼저 제공할 수 있다.

```text
20대 충동형: CTA 강조에 강하게 반응
30대 리뷰의존형: 신뢰 정보가 없으면 효과 제한
60대 가격민감형: 배송비/가격 정보가 없으면 부정 반응
빠른 결정형: 결제 단계 단순화에 긍정 반응
```

셋째, 실제 실험 설계 비용을 줄인다.

관리자가 여러 개의 B안 후보를 만들었을 때 모든 안을 실제 사용자에게 배포하는 것은 위험하고 비용이 크다. Agent Simulation Lab은 여러 후보를 빠르게 비교해 실제 A/B 테스트에 올릴 가능성이 높은 후보를 압축한다.

```text
후보 B1: CTA 색상 강조
후보 B2: 배송비 안내 강조
후보 B3: 리뷰 요약 추가

simulation 결과:
B1: 일부 세그먼트에서 역효과
B2: 가격민감형에서 긍정적
B3: 리뷰의존형에서 긍정적

실제 테스트 추천:
B2 또는 B3 우선
```

이 관점에서 Agent Simulation Lab은 "정답 예측기"가 아니라 "실험 후보 압축기"에 가깝다.

### 13.2 하면 안 되는 주장

다음 주장은 피해야 한다.

```text
simulation에서 p-value가 유의하므로 실제 사용자에게도 반드시 유의하다.
```

이 해석은 틀리다. simulation의 p-value는 실제 시장의 확률이 아니라, 현재 persona model과 reaction overlay 가정 안에서의 차이를 의미한다.

따라서 Dashboard 문구는 다음처럼 작성해야 한다.

```text
이 UX 변경은 현재 페르소나 모델과 고객사 보정 weight 기준에서
B안이 더 나을 가능성이 높으므로 실제 A/B 테스트 후보로 적합합니다.
```

또는 부정적인 경우 다음처럼 표현한다.

```text
이 UX 변경은 일부 세그먼트에서 전환 저하 가능성이 있어
실제 배포 전 변경안 보완이 필요합니다.
```

### 13.3 실제 A/B 테스트와의 관계

Agent Simulation Lab과 실제 A/B 테스트의 관계는 다음과 같다.

```text
Agent Simulation Lab
  -> 빠른 사전 검토
  -> 위험 후보 제거
  -> 유망 후보 압축
  -> 세그먼트별 가설 생성

Real User A/B Test
  -> 실제 사용자 행동 검증
  -> 최종 성과 판단
  -> 실제 배포 의사결정
```

즉 Agent Simulation Lab은 실제 A/B 테스트 앞단에 위치한다.

```text
아이디어 생성
  -> Agent Simulation Lab
  -> 실제 A/B 테스트
  -> 실험 결과 분석
  -> 배포 또는 롤백
```

이 구조가 타당한 이유는 실제 A/B 테스트의 비용과 리스크를 줄이면서도, 최종 판단은 실제 사용자 데이터로 남겨두기 때문이다.

### 13.4 제품 메시지

사용자에게 보여줄 제품 메시지는 다음 방향이 적절하다.

```text
NVIDIA Korea 페르소나 기반 synthetic cohort로
실제 배포 전 UX 변경안의 방향성과 세그먼트별 리스크를 사전 검토합니다.
```

피해야 할 메시지는 다음과 같다.

```text
실제 사용자 전환율을 정확히 예측합니다.
```

대신 다음처럼 말해야 한다.

```text
실제 A/B 테스트 전에 유망한 UX 변경 후보를 선별하고,
세그먼트별 긍정/부정 반응 가능성을 탐색합니다.
```

비유하면 Agent Simulation Lab은 실제 주행 테스트 전에 사용하는 시뮬레이터와 같다. 시뮬레이터에서 좋은 결과가 실제 도로에서의 성공을 보장하지는 않지만, 위험한 설계를 사전에 발견하고 테스트 후보를 줄이는 데 큰 가치가 있다.

---

## 14. 한 줄 결론

Agent Simulation Lab은 700만 페르소나 전체를 매번 실행하는 기능이 아니라, NVIDIA Korea 페르소나 모집단에서 대표 cohort를 샘플링하고, UX 변경을 LLM 기반 reaction overlay로 변환한 뒤, 코드 기반 agent runner와 통계 검정으로 A/B 실험의 방향성을 사전에 평가하는 기능이다.
