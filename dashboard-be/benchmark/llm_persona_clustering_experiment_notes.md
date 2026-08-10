# LLM 기반 사용자 Persona 벤치마크 군집화 실험 정리

## 1. 연구 배경

본 연구에서는 **LLM을 활용하여 사전에 정의한 5개의 사용자 Persona를 기반으로 synthetic benchmark 데이터를 생성**하고, 생성된 사용자 행동 데이터에서 추출한 feature를 이용하여 비지도 군집화를 수행한다.

전체 흐름은 다음과 같다.

```text
5개 Persona 정의
        ↓
LLM에 Persona 조건 제공
        ↓
Synthetic 사용자 행동 / 세션 데이터 생성
        ↓
Feature Engineering
        ↓
19개 행동 Feature
        ↓
Clustering
        ↓
Ground Truth Persona와 비교
```

여기에서 Ground Truth는 **LLM 데이터 생성 시 사용한 Persona 유형**이다.

중요한 점은 Ground Truth Persona가 clustering 학습에 직접 사용되는 것이 아니라, **최종적으로 생성된 cluster가 원래 Persona 구조를 얼마나 복원하는지 평가하기 위한 외부 평가 기준**으로 사용된다는 것이다.

---

## 2. 현재까지 수행한 실험

현재 실험에서는 여러 feature subset과 clustering pipeline을 비교하였다.

대표 pipeline은 다음과 같다.

```text
A1: Raw Features → K-Means

A2: Raw Features → UMAP → HDBSCAN

A3: Raw Features → VAE → K-Means
```

이때 UMAP과 VAE는 군집화 알고리즘 자체가 아니라 **차원 축소 또는 representation learning 방법**이며, 실제 clustering은 각각 HDBSCAN과 K-Means가 수행한다.

현재 실험에서는 7,500개 세션을 train / validation / test로 분리하고, 9개 feature subset × 3개 pipeline × 3개 seed를 이용하여 총 81개의 run을 수행하였다.

---

## 3. 현재 주요 결과

현재 가장 높은 단일 성능은 다음과 같다.

```text
F0 (전체 19 feature) × A1 (K-Means)

ARI = 0.523
NMI = 0.666
AMI = 0.665
Macro-F1 = 0.436
```

전체 pipeline 평균 ARI는 다음과 같은 경향을 보였다.

```text
A1 K-Means          ≈ 0.434
A3 VAE + K-Means    ≈ 0.392
A2 UMAP + HDBSCAN   ≈ 0.125
```

즉 현재 benchmark에서는 복잡한 representation 또는 density-based clustering보다 **전처리된 feature를 직접 사용하는 K-Means가 가장 안정적인 결과**를 보였다.

---

## 4. Feature 조합에서 나타난 결과

### 4.1 전체 Feature

```text
F0 × A1
ARI = 0.523
```

사전에 정의한 feature subset 후보 중 가장 높은 결과이다.

### 4.2 Funnel Feature 제거

```text
F0  = 0.523
F13 = 0.515
```

Funnel 관련 feature를 제거했음에도 ARI 감소는 약 0.008에 불과하였다.

따라서 Funnel 정보는 단독으로는 사용자 구분에 유용할 수 있지만, 다른 행동 feature가 충분히 존재할 경우 추가적으로 제공하는 정보가 제한적일 가능성이 있다.

### 4.3 Path Feature 제거

```text
F0  = 0.523
F15 = 0.361
```

Path 관련 feature를 제거했을 경우 성능이 크게 감소하였다.

이는 **사용자의 탐색 경로와 이동 패턴이 Persona 구분에 중요한 정보**라는 것을 시사한다.

### 4.4 Feature Interaction

```text
Path only               F2  ≈ 0.346
Compare only            F3  ≈ 0.326
Path + Compare          F6  ≈ 0.484
Path + Compare + Funnel F11 ≈ 0.485
```

개별 행동군보다 서로 다른 행동 feature를 결합했을 때 성능이 크게 향상되었다.

따라서 사용자 유형을 설명하기 위해서는 단일 행동 지표보다 **상호보완적인 행동 feature 조합**이 중요할 가능성이 높다.

---

# 5. 현재 가장 중요한 문제: Persona는 5개인데 자연 선택된 K는 3

현재 F0 × K-Means의 validation-selected K는 다음과 같다.

```text
Ground Truth Persona = 5
Selected K            = 3
ARI                   = 0.523
```

즉 Ground Truth에는 5개의 Persona가 존재하지만, 현재 feature 공간을 기준으로 내부 군집 품질을 최적화했을 때 K-Means는 3개의 cluster를 더 자연스러운 구조로 판단하였다.

이 결과는 단순히

> 실제 사용자 유형이 3개이다.

라고 해석해서는 안 된다.

본 데이터는 실제 관찰 데이터가 아니라 **5개의 Persona 조건을 기반으로 LLM이 생성한 synthetic benchmark**이기 때문이다.

따라서 다음과 같은 여러 원인이 존재할 수 있다.

---

# 6. 왜 5개의 Persona가 3개의 Cluster로 나타날 수 있는가?

## 6.1 LLM 생성 단계에서 Persona 차이가 충분히 구현되지 않은 경우

Persona 정의 자체는 다르더라도 LLM이 실제 사용자 행동을 생성하는 과정에서 서로 비슷한 행동 패턴을 생성했을 수 있다.

예를 들어 다음 두 Persona가 있다고 가정한다.

```text
Persona A: 신중한 비교형 사용자
Persona B: 탐색 중심 사용자
```

LLM이 두 Persona 모두에 대해 다음과 같은 행동을 생성한다면,

```text
검색 빈도 높음
필터 사용 많음
상품 상세 탐색 많음
여러 페이지 방문
구매율 낮음
```

Persona 라벨은 서로 다르지만 실제 행동 분포는 크게 겹칠 수 있다.

이 경우 clustering이 두 Persona를 하나의 cluster로 묶는 것은 자연스러운 결과가 된다.

---

## 6.2 Feature Engineering 과정에서 Persona 차이가 사라진 경우

LLM이 서로 다른 행동 sequence를 생성했더라도 현재 feature가 대부분 count / ratio 형태라면 행동 순서 정보가 손실될 수 있다.

예를 들어 다음과 같은 두 세션이 있다고 하자.

```text
Persona A
검색 → 상품1 → 검색 → 상품2 → 리뷰 → 검색

Persona B
검색 → 상품1 → 장바구니 → 상품2 → 장바구니 → 결제
```

원래 행동 sequence는 다르지만 단순 집계 feature로 변환하면 일부 값이 비슷해질 수 있다.

```text
search_count
page_views
click_count
depth
duration
```

따라서 다음과 같은 정보 손실 구조가 발생할 수 있다.

```text
Persona
   ↓
LLM-generated behavior
   ↓
[정보 손실 가능]
Feature Engineering
   ↓
Feature Vector
   ↓
Clustering
```

이 경우 문제는 LLM 생성 자체보다는 **현재 feature representation이 Persona 차이를 충분히 보존하지 못했다는 것**이다.

---

## 6.3 Clustering 알고리즘의 구조적 한계

Feature 공간에는 5개의 구조가 존재하지만 K-Means가 이를 충분히 표현하지 못했을 가능성도 있다.

K-Means는 Euclidean distance와 centroid를 기반으로 하기 때문에 복잡한 비선형 군집 또는 크기·밀도가 크게 다른 군집에서는 한계가 있을 수 있다.

다만 현재 benchmark에서는 K-Means가 UMAP + HDBSCAN보다 훨씬 높은 ARI를 기록했기 때문에, 현재 결과만으로는 **K-Means 자체가 주된 문제라고 단정하기 어렵다.**

---

# 7. 반드시 필요한 추가 실험 1: K=5 강제 군집화

현재 자연 군집 실험에서는 K가 validation criterion에 의해 선택되었다.

다음 단계에서는 Ground Truth Persona의 개수가 5개라는 사실만 알고 있다고 가정하고 다음 실험을 수행할 필요가 있다.

```text
Features
   ↓
K-Means(k=5)
   ↓
5 Clusters
   ↓
Ground Truth Persona 5개와 비교
```

이 실험의 질문은 다음과 같다.

> 5개의 사용자 유형이 존재한다는 사실을 알고 있을 때, 현재 feature가 해당 5개 Persona를 얼마나 잘 복원할 수 있는가?

---

## 7.1 평가 지표

K=5 실험에서는 다음 지표를 함께 사용하는 것이 좋다.

### ARI

전체 clustering 구조가 Ground Truth와 얼마나 유사한지 평가한다.

### NMI / AMI

Ground Truth Persona와 cluster 간 공유되는 정보량을 평가한다.

### Hungarian Matching Accuracy

Cluster label 자체에는 의미가 없으므로 Hungarian algorithm을 이용해 cluster와 Persona를 최적으로 대응시킨 뒤 정확도를 계산한다.

예:

```text
Cluster 0 ↔ Persona A
Cluster 1 ↔ Persona B
Cluster 2 ↔ Persona C
Cluster 3 ↔ Persona D
Cluster 4 ↔ Persona E
```

### Macro Precision / Recall / F1

각 Persona가 균형 있게 복원되는지 확인한다.

### Confusion Matrix

어떤 Persona끼리 주로 혼동되는지 직접 확인한다.

---

# 8. Natural K와 Forced K=5 비교의 의미

현재 결과:

```text
Natural K = 3
ARI = 0.523
```

에 대해 K=5 실험 결과가 어떻게 나타나는지에 따라 해석이 달라진다.

---

## Case A. K=5에서 성능이 크게 증가

예:

```text
Natural K=3
ARI = 0.523

Forced K=5
ARI = 0.72
Macro-F1 = 0.76
```

이 경우 다음과 같이 해석할 수 있다.

> 현재 feature에는 5개 Persona를 구분하는 정보가 존재하지만, 내부 군집 기준에서는 일부 Persona가 더 큰 행동군으로 묶이는 경향이 있다.

즉 feature 자체는 충분한 정보를 가지고 있을 가능성이 높다.

---

## Case B. K=5에서도 성능 향상이 제한적

예:

```text
Natural K=3
ARI = 0.523

Forced K=5
ARI = 0.55
```

이 경우 다음과 같은 가능성을 검토해야 한다.

```text
1. LLM이 일부 Persona를 행동적으로 충분히 다르게 생성하지 못함
2. Feature Engineering 과정에서 Persona 구분 정보가 손실됨
3. 일부 Persona 자체의 정의가 행동적으로 너무 유사함
```

이 경우 **Persona separability 분석**이 필요하다.

---

# 9. 반드시 필요한 추가 실험 2: Supervised Separability Sanity Check

LLM 기반 benchmark의 품질을 확인하기 위해 clustering과 별도로 supervised classifier를 이용한 검증을 수행하는 것이 좋다.

목적은 clustering을 supervised learning으로 대체하는 것이 아니다.

질문은 다음과 같다.

> 현재 19개 feature만으로 Ground Truth Persona 5개를 실제로 구별할 수 있는가?

실험 구조:

```text
19 Features
    ↓
Supervised Classifier
    ↓
Ground Truth Persona Prediction
```

가능한 baseline 모델:

```text
Logistic Regression
Random Forest
XGBoost / LightGBM
```

---

## 9.1 Supervised 성능이 매우 높은 경우

예:

```text
Supervised Macro-F1 = 0.92
Clustering ARI      = 0.52
```

의미:

> Feature에는 Persona 정보를 충분히 포함하고 있지만 비지도 clustering이 이를 완전히 복원하지 못하고 있다.

이 경우 feature 부족보다는 clustering 구조 또는 자연 군집과 label 구조의 차이가 주요 원인일 가능성이 높다.

---

## 9.2 Supervised 성능도 낮은 경우

예:

```text
Supervised Macro-F1 = 0.60
Clustering ARI      = 0.52
```

의미:

> 정답 label을 학습에 제공해도 현재 feature만으로 Persona를 충분히 구분하기 어렵다.

이 경우 우선적으로 다음을 검토해야 한다.

```text
LLM Persona 생성 과정
Persona 정의
Feature Engineering
```

---

## 9.3 Supervised 성능이 지나치게 높은 경우

예:

```text
Macro-F1 ≈ 0.99 ~ 1.00
```

이라면 또 다른 문제를 검토해야 한다.

LLM이 Persona 조건을 너무 명확하고 규칙적으로 데이터에 심어 synthetic benchmark가 지나치게 쉬워졌을 가능성이 있다.

즉 benchmark는 단순히 separable하기만 하면 좋은 것이 아니라 실제 사용자 행동처럼 일정 수준의 overlap과 variation을 포함해야 한다.

---

# 10. 추천하는 전체 검증 구조

본 연구에서는 세 가지 서로 다른 질문을 분리하는 것이 좋다.

```text
                  LLM-generated Benchmark
                           │
                           ▼
                  Ground Truth Persona 5개
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    Benchmark          Natural         Constrained
    Separability       Clustering      Clustering
          │                │                │
    Supervised             K 자유          K = 5
    Classifier              │                │
          │                │                │
          ▼                ▼                ▼
      Macro-F1           ARI/NMI         ARI/F1
```

---

## Research Question 1 — Benchmark Separability

> LLM이 생성한 5개의 Persona가 현재 행동 feature에서 실제로 구분 가능한가?

검증:

```text
Supervised Classification
Persona별 Precision / Recall / F1
Confusion Matrix
```

---

## Research Question 2 — Natural Behavioral Structure

> Persona label을 전혀 모를 때 행동 데이터에서 자연스럽게 어떤 군집 구조가 나타나는가?

검증:

```text
Natural K Selection
ARI
NMI
AMI
Silhouette
Selected K
```

현재 주요 결과:

```text
F0 × K-Means
K = 3
ARI = 0.523
```

---

## Research Question 3 — Persona-Constrained Recovery

> Persona가 5개라는 사실만 알고 있을 때 unsupervised clustering이 Ground Truth Persona를 얼마나 복원할 수 있는가?

검증:

```text
K-Means(k=5)
ARI
NMI
AMI
Hungarian Accuracy
Macro-F1
Persona-level Recall
Confusion Matrix
```

---

# 11. Persona Pair 분석

K=5 실험에서는 전체 성능뿐만 아니라 **어떤 Persona pair가 서로 혼동되는지 분석하는 것이 중요하다.**

5개의 Persona가 존재하면 총 10개의 pair가 존재한다.

```text
P1 vs P2
P1 vs P3
P1 vs P4
P1 vs P5
P2 vs P3
P2 vs P4
P2 vs P5
P3 vs P4
P3 vs P5
P4 vs P5
```

Confusion Matrix를 통해 특정 Persona pair가 반복적으로 섞이는지 확인한다.

예를 들어 P1과 P2가 지속적으로 혼동된다면 다음 분석을 수행한다.

```text
P1 / P2 혼동 확인
        ↓
현재 feature 분포 비교
        ↓
두 Persona를 구분하는 feature 탐색
        ↓
LLM 원본 행동 sequence 비교
        ↓
현재 feature에서 유실된 정보 확인
        ↓
새로운 feature 설계
```

---

# 12. 추가 Feature Engineering 방향

현재 feature가 count / ratio 중심이라면 다음과 같은 sequence / transition / temporal feature를 고려할 수 있다.

## Transition Feature

```text
search_to_detail_ratio
detail_to_cart_ratio
cart_to_checkout_ratio
detail_to_review_ratio
```

## 반복 행동

```text
search_detail_cycle_count
product_comparison_switch_count
backtrack_after_product_view
search_after_product_view_rate
```

## 시간 Feature

```text
mean_dwell_per_product
dwell_variance
time_to_first_cart
time_to_checkout
time_between_product_views
```

## Sequence Feature

```text
검색 → 상세 → 검색 반복 정도
상품 간 이동 횟수
장바구니 이후 재탐색 여부
checkout 진입 후 이탈 패턴
```

이러한 feature는 단순 행동 횟수보다 **사용자가 어떤 순서와 맥락으로 행동했는지**를 표현할 수 있다.

---

# 13. Representation 비교를 더 공정하게 만드는 방법

현재 pipeline은 다음과 같다.

```text
Raw → K-Means
UMAP → HDBSCAN
VAE → K-Means
```

이 구성에서는 representation과 clustering algorithm이 동시에 변하기 때문에 성능 차이가 어느 요소에서 발생했는지 완전히 분리하기 어렵다.

추가적으로 다음 실험을 수행하면 더 공정한 비교가 가능하다.

```text
Raw  → K-Means(k=5)
UMAP → K-Means(k=5)
VAE  → K-Means(k=5)
```

이 경우 clustering head를 K-Means로 통일하기 때문에 다음 질문에 직접 답할 수 있다.

> 어떤 representation이 Ground Truth Persona 구조를 가장 잘 보존하는가?

더 확장하면 다음 factorial comparison도 가능하다.

| Representation | K-Means | HDBSCAN |
|---|---:|---:|
| Raw | O | O |
| UMAP | O | O |
| VAE | O | O |

이를 통해 representation 효과와 clustering algorithm 효과를 분리해서 분석할 수 있다.

---

# 14. 권장 실험 순서

현재 연구에서 다음 순서로 진행하는 것이 효율적이다.

## 1단계 — K=5 강제 K-Means

우선 F0을 중심으로 실행한다.

```text
F0 → K-Means(k=5)
```

평가:

```text
ARI
NMI
AMI
Hungarian Accuracy
Macro-F1
Confusion Matrix
```

---

## 2단계 — Persona Confusion 분석

어떤 Persona끼리 주로 혼동되는지 확인한다.

특히 Natural K=3 결과에서 어떤 Persona들이 동일 cluster에 포함되는지도 함께 확인한다.

---

## 3단계 — Supervised Separability Check

```text
19 Features
    ↓
Random Forest / Logistic Regression 등
    ↓
5 Persona Prediction
```

목적:

> 현재 feature가 애초에 Persona를 구분할 수 있는 정보를 가지고 있는가?

를 검증한다.

---

## 4단계 — Feature-Level Pair Analysis

혼동되는 Persona pair를 중심으로 각 feature distribution을 비교한다.

예:

```text
mean
median
variance
distribution overlap
effect size
feature importance
```

---

## 5단계 — Feature 개선

필요한 경우 sequence / transition / temporal feature를 추가한다.

---

## 6단계 — 주요 Feature Subset에 K=5 적용

우선순위 후보:

```text
F0   : 전체 feature
F13  : 전체 - Funnel
F6   : Path + Compare
F11  : Path + Compare + Funnel
F15  : 전체 - Path
```

이를 통해 기존 ablation 결과가 K=5 환경에서도 유지되는지 확인한다.

---

# 15. 연구 해석 시 주의점

현재 데이터는 실제 사용자 관찰 데이터가 아니라 **LLM으로 생성된 synthetic controlled benchmark**이다.

따라서 다음 표현은 피해야 한다.

> 실제 사용자 유형은 3개이다.

대신 다음과 같이 표현하는 것이 적절하다.

> 5개의 Persona 조건을 기반으로 생성한 synthetic benchmark에서, 현재 행동 feature를 이용한 label-free clustering은 3개의 주요 행동 구조를 형성하였다.

또는:

> 사전에 정의한 5개의 Persona 중 일부가 현재 feature representation에서 유사한 행동 패턴을 나타내어 동일한 상위 군집으로 결합되는 경향이 관찰되었다.

그러나 이 원인이 LLM 생성 과정인지, feature representation인지, clustering algorithm인지는 추가 검증 없이 단정할 수 없다.

---

# 16. 핵심 연구 논리

전체 연구는 다음 논리로 정리할 수 있다.

```text
5 Persona 정의
      ↓
LLM benchmark 생성
      ↓
행동 Feature 추출
      ↓
──────────────────────────────
1. 이 Persona들은 feature에서 구별 가능한가?
   → Supervised Separability

2. 라벨 없이 보면 자연스럽게 몇 개로 군집되는가?
   → Natural Clustering

3. 5개 군집을 만들도록 하면 Persona를 얼마나 복원하는가?
   → Forced K=5 Clustering

4. 어떤 Persona가 서로 혼동되는가?
   → Confusion / Pair Analysis

5. 왜 혼동되는가?
   → Feature Distribution / Sequence Analysis

6. 어떤 새로운 feature가 필요한가?
   → Feature Engineering
──────────────────────────────
```

---

# 17. 현재 단계에서 가장 중요한 결론

현재 `Persona=5`인데 `Natural K=3`이 선택되었다는 사실만으로 **feature가 부족하다고 단정할 수는 없다.**

다만 이는 다음 질문을 제기하는 강한 신호이다.

> 현재 19개 feature가 LLM이 생성한 5개의 Persona 차이를 충분히 보존하고 있는가?

이를 확인하기 위해서는 최소한 다음 두 실험이 필요하다.

```text
1. K-Means(k=5) + Ground Truth 비교
2. Supervised Persona Separability Sanity Check
```

이 두 결과를 함께 보면 문제의 위치를 상당 부분 구분할 수 있다.

```text
Supervised 성능 높음
+ K=5 clustering 성능 높음
→ Feature에 Persona 정보가 충분히 존재

Supervised 성능 높음
+ K=5 clustering 성능 낮음
→ Clustering / geometry 문제 가능성

Supervised 성능 낮음
+ K=5 clustering 성능 낮음
→ LLM 생성 또는 Feature Engineering 문제 가능성
```

따라서 다음 연구 단계의 핵심은 단순히 clustering 성능을 더 높이는 것이 아니라,

> **LLM이 생성한 Persona 정보가 어떤 단계에서 보존되고 어떤 단계에서 손실되는지를 검증하는 것**

으로 설정하는 것이 가장 타당하다.
