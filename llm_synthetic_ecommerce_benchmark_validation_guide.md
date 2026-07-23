# LLM 기반 합성 이커머스 세션 벤치마크 설계 및 검증 가이드

## 1. 연구 개요

### 1.1 핵심 연구 질문

> **LLM으로 생성한 Ground Truth 포함 합성 이커머스 세션을 이용하여, 어떤 Feature Engineering·전처리·거리 함수·Clustering 조합이 실제 사용자 행동 유형(Persona)을 가장 잘 복원하는지 공정하게 평가할 수 있는가?**

이 연구의 중심은 새로운 군집 알고리즘 자체를 제안하는 것이 아니다. 핵심은 **동일한 Ground Truth와 동일한 행동 로그 위에서 여러 사용자 세그먼테이션 파이프라인을 반복 가능하고 공정하게 비교하는 Benchmark를 구축하는 것**이다.

---

## 2. 연구 배경과 문제 정의

### 2.1 기존 이커머스 세그먼테이션의 일반적 흐름

```text
실제 사용자 로그
    ↓
Hand-crafted Feature 추출
    ↓
Scaling 또는 Transformation
    ↓
K-Means 등 군집화
    ↓
Cluster 해석 및 이름 부여
```

대표적인 Feature는 세션 길이, 페이지 조회 수, 클릭 수, 검색·필터 사용 횟수, 장바구니 추가·제거, 결제 진입·완료 여부, 반복 탐색 비율, 오류·Rage Click 수, 체류시간, 구매 퍼널 진행 깊이 등이다.

### 2.2 Ground Truth 부재

공개 이커머스 데이터셋은 구매 여부 예측, 추천, 검색 순위, 클릭 예측을 위해 만들어지는 경우가 많다. 그러나 다음과 같은 행동 Persona 레이블은 거의 제공하지 않는다.

- 목표구매형
- 탐색형
- 가격비교형
- 충동구매형
- 장바구니 이탈형
- 모바일 Window Shopping형

Ground Truth가 없으면 Silhouette Score와 같은 내부 군집 지표는 계산할 수 있지만, **“이 군집 결과가 실제 사용자 유형을 얼마나 정확히 복원했는가?”**를 직접 평가하기 어렵다.

### 2.3 실제 기업 로그의 접근성과 재현성 문제

기업 로그는 개인정보, 영업비밀, 보안, 법적 제약 때문에 공개하기 어렵다. 따라서 연구 결과가 좋아도 외부 연구자가 동일한 조건에서 반복 검증하기 어렵다.

### 2.4 Feature와 알고리즘 선택의 근거 부족

관행적으로 다음 조합이 사용되곤 한다.

```text
모든 Feature + log1p + Min-Max Scaling + Euclidean Distance + K-Means
```

그러나 실제로는 다음을 검증해야 한다.

- 모든 Feature가 필요한가?
- 중복 Feature가 군집 거리를 왜곡하지 않는가?
- 이진형·횟수형·비율형·순서형 변수를 Euclidean Distance로 함께 처리해도 되는가?
- K-Means가 비구형 군집과 노이즈를 잘 다루는가?
- 적은 수의 핵심 Feature가 Persona를 더 잘 분리하지 않는가?

---

## 3. 제안하는 전체 연구 구조

```text
문헌 조사
    ↓
행동 Persona 정의
    ↓
Persona Card 작성
    ↓
Prompt + 제약 조건 + Few-shot + RAG 구성
    ↓
LLM 기반 이벤트 시퀀스 생성
    ↓
Schema 및 규칙 기반 Validation
    ↓
Feature Extractor로 파생 Feature 계산
    ↓
합성 데이터 현실성 검증
    ↓
여러 분석 Pipeline 비교
    ↓
Ground Truth 기반 Persona 복원 성능 평가
    ↓
Ablation·안정성·전문가 평가
```

가장 중요한 원칙은 다음과 같다.

> **LLM은 최종 Feature 값을 직접 생성하지 않고, 원시 행동 이벤트 시퀀스를 생성해야 한다.**

권장 출력 예시는 다음과 같다.

```json
{
  "persona": "price_comparison",
  "events": [
    {"type": "page_view", "page": "home", "timestamp": 0},
    {"type": "search", "query": "wireless earphone", "timestamp": 8},
    {"type": "page_view", "page": "search_result", "timestamp": 10},
    {"type": "filter", "filter": "price_low_to_high", "timestamp": 18},
    {"type": "page_view", "page": "product_detail", "product_id": "P103", "timestamp": 25},
    {"type": "page_view", "page": "review", "product_id": "P103", "timestamp": 55},
    {"type": "back", "timestamp": 90}
  ]
}
```

이벤트 로그를 보존하면 Feature 정의가 바뀌어도 동일한 세션에서 다시 계산할 수 있다.

---

# 4. Persona 설계

## 4.1 Persona는 LLM이 임의로 만들지 않는다

Persona는 문헌, 실제 이커머스 UX 구조, 공개 데이터, 전문가 의견을 근거로 사전에 정의한다. LLM의 역할은 정의된 Persona를 행동 시퀀스로 표현하는 것이다.

Persona Card 예시:

```yaml
persona_id: price_comparison
name: 가격비교형
goal: 가능한 한 낮은 가격과 높은 신뢰도를 가진 상품 선택
typical_behaviors:
  - 검색 반복
  - 가격 필터 사용
  - 여러 상품 상세 페이지 비교
  - 리뷰 탐색
  - 이전 상품 재방문
probabilistic_constraints:
  search_count: [2, 8]
  filter_count: [1, 5]
  product_detail_count: [3, 12]
  review_visit_probability: [0.5, 0.9]
  checkout_probability: [0.15, 0.5]
negative_constraints:
  - 첫 이벤트에서 바로 결제하지 않음
  - 검색과 비교 없이 충동 구매하지 않음
```

## 4.2 예시 Persona

### 목표구매형

- 구체적인 구매 목적이 있음
- 검색어가 명확함
- 탐색 범위가 좁음
- 장바구니와 Checkout 도달 확률이 높음
- 세션이 비교적 짧음

### 탐색형

- 명확한 구매 목적이 없음
- 여러 카테고리를 넓게 이동
- 상품 상세 조회는 많지만 전환은 낮음
- 고유 페이지 비율과 세션 길이가 높음

### 가격비교형

- 검색, 필터, 정렬을 자주 사용
- 여러 상품 상세와 리뷰를 비교
- 목록 또는 이전 상품으로 돌아오는 행동이 많음
- 즉시 구매보다 비교 후 이탈하거나 늦게 구매

### 충동구매형

- 검색 과정이 짧거나 생략됨
- 상품 노출 후 빠르게 장바구니와 결제로 이동
- 할인, 한정 판매, 추천 배너에 민감

### 장바구니 이탈형

- 상품을 장바구니에 추가
- Cart 제거 또는 재추가 가능
- Checkout 진입 후 결제 미완료
- 배송비, 오류, 가격, 로그인 요구 등 마찰 동반 가능

### 모바일 Window Shopping형

- 모바일 중심
- 짧은 세션이 반복될 수 있음
- 상품을 가볍게 훑어봄
- 구매 및 Checkout 도달률이 낮음

---

# 5. LLM 데이터 생성 설계

## 5.1 Prompt 구성

```text
System Prompt
    +
Persona Card
    +
사이트 및 이벤트 Schema
    +
행동 제약 조건
    +
확률적 범위
    +
Few-shot 예시
    +
RAG 근거
    +
출력 형식
    +
Self-validation 지시
```

### Constraint 설계 원칙

고정 규칙보다 확률적 범위를 사용해야 한다.

나쁜 예:

```text
가격비교형은 검색을 반드시 5번 한다.
```

좋은 예:

```text
가격비교형의 검색 횟수는 일반적으로 2~8회이다.
약 20%는 검색 대신 카테고리 탐색으로 시작할 수 있다.
필터 사용 확률은 0.6~0.9이며 모든 세션에서 발생할 필요는 없다.
```

### Few-shot의 역할

- 올바른 JSON 구조 제시
- 허용 이벤트 설명
- 자연스러운 이벤트 순서 예시
- Timestamp 증가 방식 제시
- 대표 행동과 예외 범위 제시

단, Few-shot 복사를 막기 위해 여러 예시 묶음을 회전시키고 생성 결과와 예시 간 시퀀스 유사도를 측정해야 한다.

### RAG의 역할

RAG에는 소비자 행동 연구, 공개 데이터의 세션 길이·구매 비율, Cart Abandonment 통계, 모바일·데스크톱 행동 차이, 실제 서비스의 페이지 구조, UX 전문가가 작성한 Persona 설명 등을 넣을 수 있다.

RAG의 목적은 LLM이 자의적으로 분포를 만들어내는 것을 줄이고, 생성 범위를 문헌과 공개 데이터에 Grounding하는 것이다.

## 5.2 생성 스키마 예시

```json
{
  "session_id": "S000001",
  "persona_id": "price_comparison",
  "device": "mobile",
  "traffic_source": "search_engine",
  "scenario": {
    "category": "electronics",
    "price_range": [50000, 180000],
    "promotion_exposed": true
  },
  "events": [],
  "outcome": {
    "checkout_entered": false,
    "purchase_completed": false
  },
  "generation_metadata": {
    "model": "MODEL_NAME",
    "prompt_version": "v1.2",
    "seed": 42
  }
}
```

## 5.3 다양성 확보

다음 Context 변수를 Persona와 독립적으로 교차시킨다.

- Device
- Traffic Source
- 상품 Category
- 가격대
- 프로모션 노출
- 신규·재방문
- 로그인 상태
- 네트워크 지연
- 오류 발생 여부
- 재고 상태
- 시간대
- 예산과 브랜드 선호

모든 가격비교형을 모바일로만 생성하면 군집 모델이 Persona가 아니라 Device를 학습할 수 있다.

---

# 6. 생성 직후 1차 검증: 구조 및 규칙 검증

## 6.1 JSON 및 Schema 유효성

검증 항목:

- JSON Parsing 성공 여부
- 필수 필드 존재
- 데이터 타입 일치
- Enum 외 값 사용
- Timestamp 형식
- 중복 Session ID
- Null 허용 범위

### Parse Success Rate

```text
Parse Success Rate
= 파싱 성공 세션 수 / 전체 생성 세션 수
```

### Schema Valid Rate

```text
Schema Valid Rate
= Schema를 완전히 만족한 세션 수 / 전체 생성 세션 수
```

### Invalid Field Rate

```text
Invalid Field Rate
= 허용되지 않은 필드 또는 값의 수 / 전체 필드 수
```

유효성 검사를 통과하지 못한 데이터를 조용히 제거하지 말고 실패율 자체를 Prompt 품질 지표로 기록한다.

## 6.2 시간 순서 검증

- Timestamp 단조 증가 여부
- 음수 시간 여부
- 동일 시점의 불가능한 이벤트 중복
- 비현실적으로 긴 또는 짧은 세션
- 음수 Dwell Time

```text
Temporal Violation Rate
= 시간 규칙 위반 세션 수 / 전체 세션 수
```

```text
Negative Dwell Rate
= 음수 체류 구간 수 / 전체 체류 구간 수
```

## 6.3 사이트 상태 전이 규칙 검증

예시 Funnel:

```text
Home → Category/Search → Product Detail → Cart → Checkout → Payment → Complete
```

논리적으로 불가능한 예:

- 상품 선택 없이 Cart Add
- Cart 없이 Checkout
- Checkout 없이 Payment Complete
- 존재하지 않는 Product ID 구매
- 구매 완료 이전 시점으로 Timestamp 역행

```text
Transition Validity Rate
= 허용된 상태 전이 수 / 전체 상태 전이 수
```

```text
Impossible Funnel Rate
= 논리적으로 불가능한 퍼널 세션 수 / 전체 세션 수
```

## 6.4 Persona 제약 충족도

```text
Hard Constraint Satisfaction Rate
= 모든 필수 규칙을 만족한 세션 수 / 전체 세션 수
```

Persona의 주요 행동 조건에 가중치를 주어 0~1의 Persona Consistency Score를 계산할 수 있다. 단, 생성 규칙과 최종 평가 규칙을 동일하게 사용하면 순환 평가가 발생하므로 별도의 검증 기준과 Holdout Feature를 둔다.

---

# 7. 합성 데이터 현실성 검증 프레임워크

검증은 다음 축을 함께 봐야 한다.

1. 구조적 유효성
2. 단변량 분포
3. 다변량 의존성
4. 행동 전이 구조
5. 전체 시퀀스 구조
6. Persona 분리도와 중첩
7. 다양성 및 중복
8. 실제·공개 데이터에 대한 현실성
9. Downstream Utility
10. 안정성 및 재현성
11. 전문가 평가
12. 누출 및 편향 점검

---

# 8. 단변량 Feature 분포 검증

합성 로그와 Proxy-real 로그에서 동일한 Feature Extractor를 사용한다.

예:

- Session Duration
- Path Depth
- Search Count
- Filter Count
- Product Detail Count
- Cart Add Count
- Purchase Completion
- Dwell per Page
- Loop Rate
- Unique Page Ratio

## 8.1 기술통계와 시각화

각 Feature별로 평균, 중앙값, 표준편차, 사분위수, 최소·최대, 0의 비율, 왜도, 첨도, 주요 Percentile을 비교한다.

시각화:

- Histogram
- KDE
- Box Plot
- Violin Plot
- Empirical CDF
- Q-Q Plot

## 8.2 Kolmogorov–Smirnov Test

```text
D_KS = max_x |F_real(x) - F_syn(x)|
```

- 0에 가까울수록 유사
- 표본 수가 크면 작은 차이도 유의할 수 있으므로 p-value보다 통계량과 효과 크기를 함께 보고

## 8.3 Wasserstein Distance

한 분포를 다른 분포로 옮기는 최소 비용이다.

```text
Normalized WD = Wasserstein Distance / IQR_real
```

Raw 값과 Normalized 값을 함께 보고한다.

## 8.4 Jensen–Shannon Divergence

범주형 분포나 Bin으로 이산화한 연속형 Feature 비교에 유용하다.

```text
JSD(P,Q) = 0.5×KL(P||M) + 0.5×KL(Q||M)
M = 0.5×(P+Q)
```

- 0이면 동일한 분포
- Device, Traffic Source, Event Type 분포 비교에 적합

## 8.5 Population Stability Index

```text
PSI = Σ (p_syn,i - p_real,i) × ln(p_syn,i / p_real,i)
```

경험적 기준:

- PSI < 0.1: 차이가 작음
- 0.1~0.25: 변화 관찰 필요
- PSI ≥ 0.25: 큰 차이 가능성

Bin 정의에 민감하므로 고정된 Bin 정책이 필요하다.

---

# 9. 다변량 의존 구조 검증

각 Feature의 분포가 비슷해도 Feature 간 관계가 틀릴 수 있다.

## 9.1 Pearson·Spearman Correlation Matrix

```text
Correlation Matrix Error = ||C_real - C_syn||_F
```

```text
Mean Absolute Correlation Error = mean(|C_real - C_syn|)
```

- Pearson: 선형 관계
- Spearman: 단조 비선형 관계, 비정규·횟수형 데이터에 유용

## 9.2 Mutual Information

비선형 의존성을 측정한다. 예를 들어 `cart_add_count`와 `checkout_entered`, `payment_attempt_count`와 `purchase_completed`의 관계를 비교한다.

## 9.3 Covariance Profile

Raw와 Standardized Feature 기준으로 공분산 구조를 비교한다. Scale 의존성을 명시해야 한다.

## 9.4 Copula 또는 Rank Dependence

고급 실험에서는 Marginal Distribution과 Dependence Structure를 분리하여 비교할 수 있다.

---

# 10. 행동 전이 구조 검증

## 10.1 Transition Matrix

```text
T(i,j) = count(i→j) / Σ_j count(i→j)
```

상태 예:

- Home
- Category
- Search Result
- Product Detail
- Review
- Cart
- Checkout
- Payment
- Complete
- Exit

비교 지표:

```text
MATE = mean(|T_real - T_syn|)
```

```text
Transition Matrix Distance = ||T_real - T_syn||_F
```

각 출발 상태의 다음 상태 분포에 대해 Row-wise JSD를 계산하면 해석하기 쉽다.

## 10.2 Page-type Bigram과 Trigram

예:

```text
Search Result → Product Detail
Product Detail → Review
Search Result → Product Detail → Search Result
```

지표:

- 상위 N-gram 빈도
- Rank Correlation
- Jaccard Similarity
- N-gram Coverage
- Novel N-gram Rate
- 빈도 분포 JSD

```text
N-gram Coverage
= 합성 데이터에도 존재하는 실제 상위 N-gram 수 / 실제 상위 N-gram 수
```

```text
Novel N-gram Rate
= 실제 Reference에 없던 합성 N-gram 수 / 합성 N-gram 수
```

Novelty가 지나치게 높으면 비현실적 시퀀스일 가능성이 있다.

## 10.3 Dwell Distribution by Transition

전이별 체류시간을 비교한다.

- Search Result → Product Detail
- Product Detail → Review
- Cart → Checkout
- Checkout → Exit

각 전이에 대해 Median, IQR, KS, Wasserstein, Tail Probability를 계산한다.

---

# 11. 세션 시퀀스 수준 검증

## 11.1 Path Length

이벤트 수 또는 페이지 이동 수의 분포를 비교한다.

## 11.2 Revisit Rate

```text
Revisit Rate = 재방문 이벤트 수 / 전체 방문 이벤트 수
```

## 11.3 Loop Rate

다음과 같은 반복 패턴을 측정한다.

```text
A → B → A
A → B → C → A
```

## 11.4 Unique Page Ratio

```text
Unique Page Ratio = 고유 페이지 수 / 전체 페이지 방문 수
```

## 11.5 Purchase Funnel Depth

```text
Normalized Funnel Depth = Max Step Index / Final Step Index
```

## 11.6 Sequence Edit Distance

Levenshtein Distance를 사용해 다음을 검사할 수 있다.

- Few-shot 예시 복사 여부
- Persona 내부 다양성
- 실제와 합성 세션의 유사도

길이 차이가 크면 정규화된 Edit Distance를 사용한다.

## 11.7 Sequence Embedding Distance

시퀀스를 Embedding으로 변환해 다음을 비교할 수 있다.

- Maximum Mean Discrepancy
- Fréchet 형태의 분포 거리
- Classifier Two-Sample Test
- Nearest-neighbor Distance

Embedding 모델에 따라 결과가 달라지므로 단독 평가로 사용하지 않는다.

---

# 12. 실제 데이터가 없을 때의 Proxy-real Validation

자체 기업 로그가 없어도 공개 데이터의 공통 구조를 현실성 참조점으로 사용할 수 있다.

비교 가능한 항목:

- 세션 길이
- 구매·비구매 비율
- 페이지 범주별 방문 수
- Detail, Add, Purchase 이벤트
- 검색 행동
- Cart Abandonment
- 체류시간

Schema가 다르면 공통으로 정렬 가능한 Feature만 비교한다.

| 공통 개념 | 공개 데이터 | 합성 로그 파생값 |
|---|---|---|
| 세션 길이 | Event count | path_depth |
| 상품 탐색 | Product-related count | product_detail_count |
| 구매 여부 | Revenue/Purchase | purchase_completed |
| 체류시간 | Page duration | dwell_total_ms |
| 이탈 | Bounce/Exit | exit_without_conversion |

공개 데이터는 완벽한 Ground Truth가 아니라 **Sanity Check Reference**로 사용한다.

---

# 13. Persona Ground Truth 품질 검증

## 13.1 Persona Separability

Persona별 Feature가 완전히 동일하면 Benchmark 가치가 없고, 완전히 분리되면 지나치게 쉬운 Benchmark가 된다. 적절한 중첩과 분리가 필요하다.

검증:

- Persona별 Feature 분포
- PCA·UMAP 시각화
- ANOVA 또는 Kruskal–Wallis
- Effect Size
- Persona–Feature Mutual Information
- 단순 분류기의 Cross-validation 성능

## 13.2 쉬운 분류기 검증

- Logistic Regression
- Decision Tree
- Random Forest
- k-NN

성능이 무작위 수준이면 행동 차이가 부족하고, 거의 100%면 지나치게 규칙적일 수 있다. 적정 범위는 Persona 수와 연구 목적에 맞게 정한다.

## 13.3 Persona Leakage 검사

Feature에 다음 정보가 직접 포함되면 안 된다.

- Persona ID 또는 이름
- Prompt의 명시적 문구
- Persona별 고정 Device
- Persona별 고정 Category
- Persona별 고정 세션 길이

모델이 행동이 아니라 생성 설정의 Shortcut을 학습하지 않게 해야 한다.

---

# 14. 다양성·중복·Mode Collapse 검증

## 14.1 Exact Duplicate Rate

```text
Exact Duplicate Rate = 완전히 동일한 세션 수 / 전체 세션 수
```

Session ID와 Timestamp의 사소한 차이를 제거한 Canonical Sequence 기준으로 계산한다.

## 14.2 Near Duplicate Rate

정규화된 Edit Distance, Jaccard, Embedding Similarity를 사용한다.

## 14.3 Unique Sequence Ratio

```text
Unique Sequence Ratio = 고유 Canonical Sequence 수 / 전체 세션 수
```

## 14.4 Entropy

Persona별 이벤트 유형, 시작 페이지, 종료 상태, 시퀀스 패턴의 Shannon Entropy를 계산한다. 지나치게 낮으면 Template 수렴 가능성이 있다.

## 14.5 Scenario Coverage

```text
Scenario Coverage = 생성된 시나리오 유형 수 / 정의된 시나리오 유형 수
```

예시 시나리오:

- 검색 없이 구매
- 검색 후 이탈
- Cart 추가 후 제거
- Checkout 오류 후 재시도
- 리뷰 확인 후 구매
- 여러 상품 비교 후 이탈

---

# 15. Classifier Two-Sample Test

실제 데이터에는 `1`, 합성 데이터에는 `0`을 붙이고 동일 Feature로 분류기를 학습한다.

- Logistic Regression
- Random Forest
- Gradient Boosting

지표:

- ROC-AUC
- PR-AUC
- Accuracy
- Calibration

해석:

- AUC가 0.5에 가까우면 쉽게 구분하지 못함
- AUC가 높으면 체계적 차이가 존재
- AUC 0.5가 완전한 타당성을 보장하지 않음

Feature Importance 또는 SHAP으로 어떤 Feature가 실제와 합성을 구분하는지 분석한다.

---

# 16. Nearest-neighbor 기반 검증

각 실제 샘플에서 가장 가까운 합성 샘플까지, 그리고 각 합성 샘플에서 가장 가까운 실제 샘플까지의 거리를 계산한다.

- 너무 멂: 현실성 부족
- 지나치게 가까움: 복제 또는 Memorization 위험
- 적절한 거리: 실제 영역을 덮으면서 다양성 유지

Precision·Recall 관점:

- Precision: 합성 샘플이 현실적인 실제 영역 안에 있는 정도
- Recall: 합성 데이터가 실제 데이터의 다양한 영역을 덮는 정도

---

# 17. Downstream Utility 검증

## 17.1 TSTR: Train on Synthetic, Test on Real

합성 데이터로 모델을 학습하고 실제 데이터에서 평가한다.

예측 Task:

- 구매 완료 예측
- Cart Abandonment 예측
- Funnel Depth 예측
- 다음 이벤트 예측

## 17.2 TRTS: Train on Real, Test on Synthetic

TSTR과 TRTS가 크게 비대칭이면 합성 데이터가 실제 분포의 일부만 반영할 수 있다.

## 17.3 Synthetic Augmentation

```text
Real Only vs Real + Synthetic
```

합성 데이터를 추가했을 때 실제 Test Set 성능이 개선되는지 확인한다.

---

# 18. Clustering Benchmark 외부 평가 지표

## 18.1 Adjusted Rand Index

- 1: 완전 일치
- 0 부근: 무작위 수준
- 음수: 우연보다 나쁠 수 있음

Cluster ID 순서에 영향받지 않고 우연 일치를 보정한다.

## 18.2 NMI와 AMI

- NMI: Persona와 Cluster가 공유하는 정보량을 정규화
- AMI: 우연 일치 편향을 추가로 보정

## 18.3 Purity

직관적이지만 Cluster 수가 많아질수록 높아질 수 있으므로 단독 사용하지 않는다.

## 18.4 Homogeneity, Completeness, V-measure

- Homogeneity: 하나의 Cluster 안에 같은 Persona가 모였는가?
- Completeness: 하나의 Persona가 여러 Cluster로 흩어지지 않았는가?
- V-measure: 두 지표의 조화평균

## 18.5 Mapping 후 Macro-F1

Hungarian Algorithm 등으로 Cluster와 Persona를 최적으로 대응시킨 뒤 Macro Precision, Macro Recall, Macro F1, Confusion Matrix를 계산한다.

불균형 Persona에서는 Accuracy보다 Macro-F1이 중요하다.

---

# 19. 내부 군집 품질 지표

## 19.1 Silhouette Score

- 1에 가까움: 잘 분리
- 0 부근: 경계
- 음수: 다른 Cluster에 더 가까울 수 있음

비구형·밀도 차이가 큰 군집에서는 오해를 줄 수 있다.

## 19.2 Davies–Bouldin Index

낮을수록 좋다.

## 19.3 Calinski–Harabasz Index

높을수록 좋다.

## 19.4 WCSS 또는 Inertia

K가 증가하면 항상 감소하므로 단독 비교하지 않고 Elbow 분석에 사용한다.

## 19.5 내부·외부 지표 불일치

Silhouette는 높지만 ARI가 낮을 수 있다. 이는 수학적으로 명확한 군집이 Persona Ground Truth와 다를 수 있다는 뜻이며, 이 불일치 자체가 중요한 결과다.

---

# 20. 비즈니스 및 해석 가능성 평가

## 20.1 Cluster Profile Distinctiveness

```text
Standardized Mean Difference
= (cluster mean - global mean) / global standard deviation
```

## 20.2 Business KPI 분리도

Cluster별로 다음을 비교한다.

- Conversion Rate
- Cart Abandonment Rate
- Average Funnel Depth
- Promo Sensitivity
- Error/Friction Risk
- Search Intensity

통계적 유의성과 Effect Size를 함께 본다.

## 20.3 Actionability

| Cluster | 특징 | 가능한 Action |
|---|---|---|
| 가격비교형 | 검색·필터·리뷰 반복 | 비교표, 가격 알림, 리뷰 요약 |
| 장바구니 이탈형 | Cart 진입 후 이탈 | 배송비 조기 노출, 결제 오류 개선 |
| 탐색형 | 넓은 카테고리 탐색 | 개인화 추천, 최근 본 상품 |
| 목표구매형 | 빠른 Funnel 진행 | 검색 정확도, 빠른 결제 |

---

# 21. 전문가 평가

## 21.1 평가자 구성

- UX 디자이너
- 데이터 분석가
- 이커머스 운영자
- 마케팅 담당자
- 행동 데이터 연구자

각 역할별 2명 내외를 목표로 한다.

## 21.2 Blind Evaluation

실제와 합성 여부를 숨기고 다음을 5점 또는 7점 Likert 척도로 평가한다.

1. 실제 사용자의 행동처럼 보이는가?
2. 이벤트 순서가 논리적이고 자연스러운가?
3. 사용자 목표를 추론할 수 있는가?
4. 같은 묶음이 하나의 유형으로 설명되는가?
5. UX 또는 마케팅 Action을 제안할 수 있는가?
6. 지나치게 정형적이거나 인공적인가?

## 21.3 평가자 간 신뢰도

- Cohen’s Kappa: 평가자 2명
- Fleiss’ Kappa: 평가자 3명 이상, 범주형
- Krippendorff’s Alpha: 결측과 다양한 평가자 수 대응
- ICC: 연속형 또는 Likert 점수 일치도

평균 점수와 평가자 간 합의도를 함께 보고한다.

---

# 22. Prompt·RAG·Self-validation Ablation

비교 조건:

1. Prompt-only
2. Constraint Prompt
3. Constraint + Few-shot
4. Constraint + Few-shot + RAG
5. Constraint + Few-shot + RAG + Self-validation

동일 Persona 수, 세션 수, Temperature, Seed 정책을 유지한다.

### 구조 품질

- Parse Success Rate
- Schema Valid Rate
- Transition Validity Rate
- Temporal Violation Rate

### Persona 품질

- Hard Constraint Satisfaction
- Persona Consistency
- Persona Separability
- Persona Leakage

### 현실성

- KS
- Wasserstein
- JSD
- Correlation Error
- Transition Matrix Error
- Two-Sample AUC

### 다양성

- Exact·Near Duplicate Rate
- Unique Sequence Ratio
- Entropy
- Scenario Coverage

### Benchmark Utility

- ARI
- NMI·AMI
- Macro-F1
- Seed Stability
- Pipeline Ranking Correlation

---

# 23. Benchmark 안정성과 재현성

## 23.1 Seed 반복

각 Pipeline을 최소 10개 Seed로 반복하고 평균, 표준편차, 95% Confidence Interval, 최소·최대, Seed별 순위를 보고한다.

## 23.2 Cluster Stability

```text
Stability = 반복 실행 간 평균 Pairwise ARI
```

## 23.3 Bootstrap Stability

복원 추출한 데이터에서 군집 결과가 유지되는지 평가한다.

## 23.4 Pipeline Ranking Stability

생성 Batch, Prompt Version, Generator Model이 바뀌어도 Pipeline 순위가 유지되는지 측정한다.

- Spearman Rank Correlation
- Kendall’s Tau
- Top-k Overlap

---

# 24. 권장 비교 Pipeline

## Feature Set

- 전체 Feature
- Navigation
- Engagement
- Friction
- Search and Comparison
- Commerce

## Scaling·Transformation

- Raw
- log1p
- Min-Max
- Standard
- Robust
- Quantile Transformation

## Distance

- Euclidean
- Manhattan
- Cosine
- Gower

## Dimension Reduction

- None
- PCA
- UMAP

## Clustering

- K-Means
- MiniBatch K-Means
- Gaussian Mixture Model
- Agglomerative Clustering
- HDBSCAN
- K-Prototypes 또는 혼합형 데이터용 대안

---

# 25. 종합 평가표

| 평가 축 | 대표 지표 | 방향 |
|---|---|---|
| 구조 유효성 | Schema Valid Rate | 높을수록 좋음 |
| 시간 유효성 | Temporal Violation Rate | 낮을수록 좋음 |
| Persona 일관성 | Persona Consistency | 높을수록 좋음 |
| 단변량 현실성 | KS, Wasserstein, JSD | 낮을수록 좋음 |
| 상관 구조 | Correlation Matrix Error | 낮을수록 좋음 |
| 전이 구조 | Transition Matrix Error | 낮을수록 좋음 |
| 시퀀스 현실성 | N-gram Coverage | 높을수록 좋음 |
| 중복 | Duplicate Rate | 낮을수록 좋음 |
| Coverage | Scenario Coverage | 높을수록 좋음 |
| 실제-합성 구분 | Two-Sample AUC | 0.5에 가까울수록 구분이 어려움 |
| Persona 복원 | ARI, NMI, AMI | 높을수록 좋음 |
| 불균형 대응 | Macro-F1 | 높을수록 좋음 |
| 내부 군집 품질 | Silhouette | 높을수록 좋음 |
| 안정성 | Seed·Bootstrap ARI | 높을수록 좋음 |
| 전문가 현실성 | Likert 평균 | 높을수록 좋음 |
| 평가자 신뢰도 | Alpha·Kappa·ICC | 높을수록 좋음 |

---

# 26. 단일 종합 점수 사용 시 주의점

여러 지표를 하나의 점수로 합치면 Trade-off가 숨겨질 수 있다. 사용한다면 다음을 공개해야 한다.

- 정규화 방법
- 각 지표 방향
- 가중치
- Missing 처리
- 민감도 분석
- 가중치 변화에 따른 순위 변화

가능하면 Pareto Frontier, Radar Chart, 원시 지표를 함께 제공한다.

---

# 27. 권장 실험 절차

1. Persona 4~6종과 이벤트 Schema 고정
2. LLM, Temperature, Prompt Version, RAG Source, Seed 정책 고정
3. Persona별 100~300개 Pilot 생성
4. JSON·Schema·Timestamp·전이·Persona 규칙 검사
5. Feature Extractor로 Feature 계산
6. 분포·상관·전이·시퀀스·중복·전문가 검증
7. 실패 원인에 따라 Prompt 수정
8. 최종 Benchmark 생성
9. 여러 Pipeline을 Seed 반복 실행
10. 외부·내부·비즈니스 평가
11. Feature·Scaling·Distance·Clustering·Prompt Ablation
12. Persona Card, Prompt, Schema, Generator, Validator, Seed, 환경 공개

---

# 28. 최소가치실험(MVE) 권장안

## 데이터

- Persona: 4종
- Persona당 세션: 500개
- 총 세션: 2,000개
- Prompt 조건: 4개 이상
- Proxy-real Dataset: 1개 이상

## Pipeline

- Feature Set: 전체 / Navigation / Commerce
- Scaling: log1p+MinMax / Robust
- Clustering: K-Means / GMM
- 총 12개 Pipeline

## 반복

- Pipeline당 Seed 10개
- 최소 120회 군집화

## 핵심 지표

생성 검증:

- Schema Valid Rate
- Persona Constraint Satisfaction
- Normalized Wasserstein
- Correlation Error
- Transition Matrix Error
- Duplicate Rate
- Expert Realism

군집 평가:

- ARI
- NMI
- Macro-F1
- Silhouette
- Seed Stability

---

# 29. 권장 합격 기준 설정 방식

## 29.1 Hard Gate

논리적 오류에는 강한 기준을 적용한다.

예:

- Schema Valid Rate ≥ 99%
- Impossible Funnel Rate ≤ 0.5%
- Negative Dwell Rate = 0%
- Unknown Event Type Rate = 0%

## 29.2 Relative Gate

현실성 지표는 Baseline 대비 개선으로 평가한다.

예:

```text
Constraint + Few-shot + RAG가 Prompt-only보다
평균 Normalized Wasserstein을 20% 이상 감소시키는가?
```

## 29.3 Persona별 기준

전체 평균뿐 아니라 다음을 함께 보고한다.

- Macro Average
- Worst Persona Score
- Persona별 Confidence Interval

## 29.4 Holdout Reference

Prompt와 RAG에 사용하지 않은 공개 데이터 또는 전문가 평가 세트를 최종 검증용으로 분리한다.

---

# 30. 주요 위험과 대응

## LLM이 Persona 규칙을 너무 직접 반영

- 확률 분포 사용
- Persona 간 공통 행동 허용
- Context 변수 교차
- 일부 예외 행동과 현실적 Noise 포함

## Persona보다 Device나 Category가 군집을 지배

- 모든 Persona에서 Context 비율을 유사하게 배분
- Context Stratification
- Device 제거 Ablation
- Conditional Mutual Information 분석

## Few-shot 복사

- 여러 Few-shot Set 회전
- Sequence Similarity 검사
- Near Duplicate 제거

## 합성 데이터가 너무 깨끗함

- 중간 이탈, 반복 클릭, 오류, 긴 Idle, 뒤로가기, Reload, 추적 누락을 포함한 Noise Model 추가
- Clean Benchmark와 Noisy Benchmark를 별도 제공

## 생성 규칙과 평가 규칙의 순환

- 생성 규칙 검사와 최종 평가 분리
- 독립 전문가 검토
- Holdout Feature 사용

## 합성 Benchmark에만 최적화

- Proxy-real 데이터에서 순위 재검증
- Prompt·Generator Model 변경 후 Ranking Stability 평가

---

# 31. 논문의 핵심 Contribution

1. Ground Truth가 포함된 이커머스 행동 세그먼테이션 Benchmark 제안
2. 문헌 기반 Persona를 LLM이 구조화된 행동 로그로 생성하는 파이프라인 제안
3. LLM이 Feature를 직접 만들지 않고 Feature Extractor가 파생값을 계산하는 재사용 구조 제안
4. Feature, Scaling, Distance, Reduction, Clustering을 동일 조건에서 비교하는 프레임워크 제공
5. 분포·상관·전이·시퀀스·다양성·효용·전문가 평가를 결합한 합성 데이터 검증 체계 제안
6. Prompt, Constraint, Few-shot, RAG, Self-validation Ablation 제공
7. Seed, Prompt Version, Generator Model 변화에 따른 Pipeline Ranking Stability 평가

---

# 32. 최종 요약

```text
문헌에서 Persona 정의
    ↓
LLM이 원시 이벤트 시퀀스 생성
    ↓
Schema·시간·전이·Persona 규칙 검증
    ↓
Feature Extractor로 파생 Feature 계산
    ↓
실제 또는 Proxy-real 데이터와
분포·상관·전이·시퀀스 구조 비교
    ↓
중복·다양성·누출·편향 검증
    ↓
전문가 Blind Evaluation
    ↓
다양한 세그먼테이션 Pipeline 반복 비교
    ↓
ARI·NMI·AMI·Macro-F1·Silhouette·안정성 평가
```

가장 중요한 원칙은 다음 세 가지다.

1. **LLM이 생성한 데이터라는 이유만으로 Ground Truth가 자동으로 신뢰되는 것은 아니다.**
2. **각 Feature의 분포가 비슷하다는 사실만으로 시퀀스 데이터가 현실적이라고 판단할 수 없다.**
3. **Benchmark의 가치는 합성 데이터의 외형적 유사성보다, 연구 질문에 맞게 정렬되고 Pipeline 간 비교 결과가 안정적으로 재현되는지에 달려 있다.**
