# LLM Persona Clustering 실험 결과 및 해석 정리

## 1. 실험을 진행한 이유

이번 실험의 목적은 LLM으로 생성한 synthetic e-commerce benchmark 데이터가 실제로 사전에 정의한 사용자 persona 구조를 행동 feature 안에 잘 보존하고 있는지 확인하는 것이다.

데이터 생성 단계에서는 5개의 persona를 미리 정의했다.

```text
1. cart_abandoner
2. explorer
3. goal_oriented_buyer
4. impulse_buyer
5. price_comparison
```

그리고 각 persona 조건을 LLM에 제공해 synthetic session/event 데이터를 만들었다. 따라서 이 benchmark에는 정답 persona label이 존재한다.

중요한 점은 이 정답 label을 clustering 학습에는 사용하지 않았다는 것이다. 정답 label은 오직 마지막 평가에서만 사용했다.

전체 연구 질문은 다음과 같다.

```text
LLM이 만든 5개 persona 행동 데이터
        ↓
19개 행동 feature 추출
        ↓
비지도 clustering
        ↓
생성 당시 persona label과 비교
```

즉, 질문은 다음과 같다.

> 정답 persona를 모르는 상태에서 행동 feature만 보고 clustering했을 때, 원래 5개 persona 구조가 얼마나 복원되는가?

---

## 2. 사용한 데이터

최종 benchmark는 `merged-7500` 데이터셋이다.

| 구분 | 세션 수 |
|---|---:|
| balanced shard 2개 | 5,000 |
| hard shard | 2,500 |
| 전체 | 7,500 |

주요 파일은 다음과 같다.

```text
Dashboard/dashboard-be/benchmark/output/merged-7500/events.jsonl
Dashboard/dashboard-be/benchmark/output/merged-7500/sessions.json
```

feature-pipeline 실험에서는 GitHub repo의 실험 코드를 가져와 다음 위치에서 실행했다.

```text
Dashboard/dashboard-be/feature-pipeline-experiment/
```

---

## 3. 사용한 feature

각 session에서 19개의 행동 feature를 추출했다.

| 그룹 | Feature |
|---|---|
| 행동 강도 | `session_duration_ms`, `event_count`, `page_view_count`, `click_count` |
| 탐색 경로 | `depth`, `unique_page_ratio`, `revisit_rate`, `backtrack_count`, `loop_rate` |
| 탐색/비교 | `search_count`, `filter_count`, `product_detail_count`, `review_view_count` |
| 구매 퍼널 | `cart_add_count`, `cart_remove_count`, `checkout_entered`, `payment_attempt_count`, `purchase_completed` |
| 마찰 | `error_count` |

대표 feature subset은 다음과 같다.

| Subset | 의미 |
|---|---|
| F0 | 전체 19개 feature |
| F2 | 탐색 경로 feature |
| F3 | 탐색/비교 feature |
| F4 | 구매 퍼널 feature |
| F6 | 탐색 경로 + 탐색/비교 |
| F7 | 탐색/비교 + 구매 퍼널 |
| F11 | 탐색 경로 + 탐색/비교 + 구매 퍼널 |
| F13 | 전체 - 구매 퍼널 |
| F15 | 전체 - 탐색 경로 |

---

## 4. 비교한 실험 종류

이번에 실행한 실험은 크게 세 가지다.

### 4.1 Natural K clustering

정답 persona 개수인 5를 clustering에 알려주지 않고, `K=2..10` 중 validation split의 Silhouette 점수가 가장 좋은 K를 선택했다.

```text
train split: clustering 학습
validation split: K 선택
test split: 정답 persona와 비교 평가
```

이 실험의 질문은 다음과 같다.

> 정답 label을 전혀 모를 때, 현재 행동 feature 공간에서 자연스럽게 몇 개의 군집이 나타나는가?

### 4.2 Forced K=5 clustering

이번에는 persona가 5개라는 사실만 알고 있다고 가정하고 `K=5`로 강제했다.

이 실험의 질문은 다음과 같다.

> 5개 persona가 있다는 사실을 알고 K=5로 나누면, 현재 feature가 원래 persona를 얼마나 잘 복원하는가?

### 4.3 Supervised separability sanity check

마지막으로 정답 label을 직접 사용해 supervised classifier를 학습했다.

이것은 clustering을 대체하기 위한 실험이 아니다. 목적은 다음 질문에 답하는 것이다.

> 현재 19개 feature 안에 persona를 구분할 정보가 실제로 들어 있는가?

사용한 모델은 다음 두 가지다.

```text
Logistic Regression
Random Forest
```

---

## 5. Natural K 전체 결과

Natural K 실험은 다음 조건으로 실행했다.

```text
9 feature subsets x 3 pipelines x 3 seeds = 81 runs
Seeds: 7, 42, 2026
K 후보: 2..10
K 선택 기준: validation Silhouette
```

비교한 pipeline은 다음과 같다.

| Pipeline | 구조 |
|---|---|
| A1 | Raw/preprocessed feature -> K-Means |
| A2 | UMAP -> HDBSCAN |
| A3 | VAE latent -> K-Means |

주요 결과는 다음과 같다.

| 조건 | 선택 K | ARI | NMI | AMI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|---:|---:|
| F0 x A1 | 3 | 0.523 | 0.666 | 0.665 | 0.436 | 0.563 |
| F13 x A1 | 3 | 0.515 | 0.658 | 0.657 | 0.433 | 0.559 |
| F6 x A1 | 4 | 0.484 | 0.636 | 0.634 | 0.410 | 0.516 |
| F11 x A1 | 4 | 0.484 | 0.634 | 0.632 | 0.411 | 0.517 |
| F7 x A3 | 평균 9 | 0.479 | 0.639 | 0.636 | 0.607 | 0.710 |

가장 중요한 결과는 다음이다.

```text
F0 x A1
Selected K = 3
ARI = 0.523
```

즉 전체 19개 feature를 사용했을 때, 정답 persona는 5개이지만 label을 모르는 Natural K selection은 3개의 cluster를 가장 자연스럽다고 판단했다.

---

## 6. 왜 K=3이 자연스럽다고 말할 수 있는가

여기서 “자연스럽다”는 말은 사람이 해석한 것이 아니라 validation Silhouette 기준으로 나온 결과다.

Silhouette은 다음을 본다.

```text
1. 같은 cluster 안의 점들이 서로 가까운가?
2. 다른 cluster의 점들과는 충분히 떨어져 있는가?
```

따라서 K=3이 선택됐다는 것은 다음 의미다.

> 현재 feature 공간의 거리 구조에서는 5개로 나누는 것보다 3개로 나누는 것이 더 응집도 높고 분리도 좋은 군집으로 보였다.

하지만 이것을 다음처럼 해석하면 안 된다.

```text
실제 persona는 3개다.
```

이 데이터는 실제 관찰 데이터가 아니라 LLM으로 생성한 synthetic benchmark이고, 생성 당시 persona는 명확히 5개였기 때문이다.

정확한 해석은 다음과 같다.

> 5개 persona 조건으로 생성한 synthetic benchmark에서, 현재 19개 aggregate feature를 이용한 label-free clustering은 일부 persona를 합쳐 3개의 상위 행동 구조로 보는 경향을 보였다.

---

## 7. K=3에서 실제로 합쳐진 persona

`F0 x A1`, 전체 데이터, K=3 기준 test split의 contingency를 확인했다.

| Persona | Cluster 0 | Cluster 1 | Cluster 2 |
|---|---:|---:|---:|
| cart_abandoner | 3 | 33 | 189 |
| explorer | 224 | 1 | 0 |
| goal_oriented_buyer | 0 | 219 | 6 |
| impulse_buyer | 0 | 220 | 6 |
| price_comparison | 223 | 0 | 1 |

따라서 K=3 구조는 다음과 같다.

```text
Cluster 0: explorer + price_comparison
Cluster 1: goal_oriented_buyer + impulse_buyer
Cluster 2: cart_abandoner
```

즉 두 pair가 강하게 합쳐졌다.

```text
explorer + price_comparison
goal_oriented_buyer + impulse_buyer
```

해석하면 다음과 같다.

| 합쳐진 pair | 가능한 이유 |
|---|---|
| explorer + price_comparison | 둘 다 검색, 필터, 상품 상세 탐색, 리뷰 탐색 행동이 많음 |
| goal_oriented_buyer + impulse_buyer | 둘 다 구매까지 도달하는 구매형 행동을 보임 |

---

## 8. Forced K=5 결과

K=5를 강제로 지정했을 때의 주요 결과는 다음과 같다.

| 조건 | K | ARI | NMI | AMI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|---:|---:|
| F0 x A1 | 5 | 0.485 | 0.621 | 0.619 | 0.575 | 0.614 |
| F0 x A3 | 5 | 0.480 | 0.582 | 0.580 | 0.670 | 0.667 |
| F7 x A3 | 5 | 0.484 | 0.610 | 0.608 | 0.554 | 0.590 |
| F11 x A1 | 5 | 0.479 | 0.623 | 0.621 | 0.571 | 0.610 |

Natural K와 Forced K=5를 직접 비교하면 다음과 같다.

| 실험 | K | ARI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|
| Natural F0 x A1 | 3 | 0.523 | 0.436 | 0.563 |
| Forced F0 x A1 | 5 | 0.485 | 0.575 | 0.614 |

중요한 변화는 다음이다.

```text
ARI:          0.523 -> 0.485  감소
Macro-F1:     0.436 -> 0.575  증가
Hungarian Acc 0.563 -> 0.614  증가
```

해석은 다음과 같다.

> K=3은 전체 군집 구조 관점에서는 더 깔끔하지만, K=5로 강제하면 persona별 대응 성능은 더 좋아진다.

즉 5개 persona 정보가 완전히 없는 것은 아니다. 다만 label 없이 거리 구조만 보면 5개보다 3개 상위 구조가 더 강하게 보인다.

---

## 9. Supervised separability 결과

Supervised 실험에서는 정답 label을 학습에 사용했다.

F0 전체 feature 기준 결과는 다음과 같다.

| Feature | Model | Accuracy | Macro-F1 |
|---|---|---:|---:|
| F0 | Logistic Regression | 0.893 | 0.893 |
| F0 | Random Forest | 0.914 | 0.914 |

전체 subset별 supervised 결과는 다음과 같다.

| Feature | Logistic Regression Macro-F1 | Random Forest Macro-F1 |
|---|---:|---:|
| F0 | 0.893 | 0.914 |
| F2 | 0.709 | 0.688 |
| F3 | 0.646 | 0.645 |
| F4 | 0.501 | 0.497 |
| F6 | 0.809 | 0.817 |
| F7 | 0.831 | 0.838 |
| F11 | 0.837 | 0.852 |
| F13 | 0.889 | 0.905 |
| F15 | 0.893 | 0.913 |

이 결과는 매우 중요하다.

> 정답 label을 주면 현재 feature만으로도 5개 persona를 상당히 잘 구분할 수 있다.

따라서 다음 결론은 부정확하다.

```text
feature가 부족해서 K=3이 나왔다.
```

더 정확한 결론은 다음이다.

> feature에는 persona 정보가 존재하지만, 그 정보가 비지도 clustering의 거리 구조에서는 5개 cluster로 자연스럽게 드러나지 않는다.

---

## 10. hard 데이터 영향 확인 실험

중간에 제기한 가설은 다음과 같았다.

> 전체 데이터 중 hard 데이터가 1/3이나 되기 때문에, persona 간 경계가 흐려져 K가 5가 아니라 3으로 내려간 것 아닐까?

이를 확인하기 위해 `split_source=hard`와 `split_source!=hard`를 나누어 F0 x A1 Natural K를 다시 실행했다.

| Dataset | Sessions | Selected K | ARI | NMI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|---:|---:|
| Full | 7,500 | 3 | 0.523 | 0.666 | 0.436 | 0.563 |
| Hard source only | 2,500 | 3 | 0.491 | 0.615 | 0.423 | 0.549 |
| Non-hard only | 5,000 | 4 | 0.502 | 0.666 | 0.419 | 0.528 |

추가로 difficulty 기준으로도 확인했다.

| Dataset | Selected K | ARI | NMI | Macro-F1 |
|---|---:|---:|---:|---:|
| Difficulty hard only | 3 | 0.501 | 0.626 | 0.428 |
| Difficulty non-hard | 4 | 0.498 | 0.662 | 0.417 |

결론은 다음과 같다.

> hard 데이터를 제거하면 selected K가 3에서 4로 올라간다. 따라서 hard 데이터는 cluster 구조를 더 뭉개고 K를 낮추는 방향으로 영향을 준다.

하지만 hard를 제거해도 K=5까지는 올라가지 않는다. 즉 hard 데이터만이 유일한 원인은 아니다.

---

## 11. hard vs non-hard에서 합쳐진 persona

### 11.1 hard only, K=3

hard source만 사용했을 때 K=3 구조는 전체 데이터와 거의 동일했다.

| Persona | Cluster 0 | Cluster 1 | Cluster 2 |
|---|---:|---:|---:|
| cart_abandoner | 2 | 12 | 61 |
| explorer | 74 | 1 | 0 |
| goal_oriented_buyer | 0 | 71 | 4 |
| impulse_buyer | 0 | 70 | 5 |
| price_comparison | 74 | 0 | 1 |

구조는 다음과 같다.

```text
Cluster 0: explorer + price_comparison
Cluster 1: goal_oriented_buyer + impulse_buyer
Cluster 2: cart_abandoner
```

### 11.2 non-hard only, K=4

hard를 제거하면 K=4가 선택되지만, 5개 persona 중 4개가 각각 분리되는 것은 아니었다.

| Persona | Cluster 0 | Cluster 1 | Cluster 2 | Cluster 3 |
|---|---:|---:|---:|---:|
| cart_abandoner | 21 | 1 | 94 | 34 |
| explorer | 0 | 150 | 0 | 0 |
| goal_oriented_buyer | 148 | 0 | 1 | 1 |
| impulse_buyer | 150 | 0 | 1 | 0 |
| price_comparison | 0 | 147 | 0 | 2 |

구조는 다음과 같다.

```text
Cluster 0: goal_oriented_buyer + impulse_buyer
Cluster 1: explorer + price_comparison
Cluster 2: cart_abandoner subgroup A
Cluster 3: cart_abandoner subgroup B
```

즉 hard를 제거해도 다음 두 pair는 계속 합쳐져 있다.

```text
explorer + price_comparison
goal_oriented_buyer + impulse_buyer
```

K=4가 된 이유는 두 pair 중 하나가 분리된 것이 아니라, `cart_abandoner`가 두 subgroup으로 쪼개졌기 때문이다.

---

## 12. 왜 K=5까지 올라가지 않는가

핵심 이유는 다음과 같다.

> 5개 persona 중 최소 두 쌍이 현재 feature 공간에서 매우 비슷하게 붙어 있기 때문이다.

현재 aggregate feature 기준으로는 다음 pair가 잘 분리되지 않는다.

```text
explorer vs price_comparison
goal_oriented_buyer vs impulse_buyer
```

### 12.1 explorer와 price_comparison이 합쳐지는 이유

두 persona 모두 다음 행동을 많이 할 가능성이 높다.

```text
검색
필터 사용
상품 상세 조회
리뷰 조회
여러 상품 탐색
```

현재 feature는 이런 행동의 count와 ratio를 주로 본다. 따라서 “그냥 둘러보는 탐색형”과 “가격을 비교하는 탐색형”의 차이가 충분히 분리되지 않을 수 있다.

### 12.2 goal_oriented_buyer와 impulse_buyer가 합쳐지는 이유

두 persona 모두 구매까지 도달하는 구매형 행동을 보일 수 있다.

현재 feature는 다음 정보를 잘 잡는다.

```text
cart_add_count
checkout_entered
payment_attempt_count
purchase_completed
```

하지만 다음 정보는 약하게 잡는다.

```text
얼마나 빠르게 구매했는가
검색 없이 바로 구매했는가
리뷰를 보고 구매했는가
상품 상세 체류 시간이 짧았는가
구매 전 비교 행동이 있었는가
```

따라서 목표형 구매자와 충동 구매자가 둘 다 “구매 완료형”으로 묶일 수 있다.

---

## 13. 현재 결과의 핵심 결론

이번 실험에서 가장 중요한 결론은 다음이다.

```text
1. LLM benchmark의 5개 persona 정보는 feature 안에 상당히 보존되어 있다.
2. supervised classifier는 5개 persona를 높은 성능으로 구분한다.
3. 하지만 label-free clustering은 5개 persona를 그대로 복원하지 않고 3개 또는 4개 상위 행동군을 선택한다.
4. hard 데이터는 K를 낮추는 방향으로 영향을 주지만, hard를 제거해도 K=5까지 올라가지는 않는다.
5. explorer-price_comparison, goal_oriented_buyer-impulse_buyer pair가 현재 feature 공간에서 계속 합쳐진다.
```

논문식으로 쓰면 다음과 같다.

> Supervised separability results indicate that the engineered behavioral features preserve substantial persona-discriminative information. However, natural unsupervised clustering tends to recover broader behavioral structures rather than the full five-persona taxonomy. The hard subset further increases persona overlap and reduces the selected number of clusters, but even after removing hard sessions, two persona pairs remain merged in the feature space.

한국어로 풀어 쓰면 다음과 같다.

> 현재 feature는 persona 정보를 담고 있지만, 비지도 clustering이 보는 자연스러운 거리 구조에서는 5개 persona가 아니라 탐색/비교형, 구매형, 장바구니 이탈형 같은 상위 행동군이 더 강하게 나타난다.

---

## 14. 현재 군집 구조 요약

현재 F0 feature 기준 clustering은 5개 persona를 대략 다음처럼 본다.

```text
상위 행동군 1: 탐색/비교형
  - explorer
  - price_comparison

상위 행동군 2: 구매형
  - goal_oriented_buyer
  - impulse_buyer

상위 행동군 3: 장바구니 이탈형
  - cart_abandoner
```

non-hard 데이터에서는 `cart_abandoner`가 두 subgroup으로 나뉘면서 K=4가 된다.

```text
상위 행동군 1: 탐색/비교형
상위 행동군 2: 구매형
상위 행동군 3: cart_abandoner subgroup A
상위 행동군 4: cart_abandoner subgroup B
```

하지만 여전히 다음 pair는 합쳐져 있다.

```text
explorer + price_comparison
goal_oriented_buyer + impulse_buyer
```

---

## 15. 앞으로 해야 할 실험 방향

지도학습 성능이 높기 때문에, clustering도 더 잘 될 가능성은 있다. 다만 단순 K-Means와 Silhouette 선택만으로는 부족하다.

다음 실험을 권장한다.

### 15.1 clustering head 비교

K=5를 고정하고 여러 clustering 방법을 비교한다.

```text
Raw features -> K-Means(k=5)
Raw features -> Gaussian Mixture(k=5)
Raw features -> Agglomerative(k=5)
Raw features -> Spectral Clustering(k=5)
PCA -> K-Means(k=5)
UMAP -> K-Means(k=5)
VAE -> K-Means(k=5)
```

목적은 다음 질문에 답하는 것이다.

> feature는 충분한데 K-Means가 문제인가? 아니면 어떤 clustering 방법을 써도 같은 persona pair가 계속 붙는가?

### 15.2 합쳐지는 pair 중심 feature 분석

다음 pair를 집중 분석한다.

```text
explorer vs price_comparison
goal_oriented_buyer vs impulse_buyer
```

비교할 항목은 다음과 같다.

```text
feature mean
feature median
feature variance
distribution overlap
effect size
Random Forest feature importance
```

### 15.3 sequence / temporal feature 추가

현재 feature는 count/ratio 중심이다. 따라서 행동 순서와 시간 정보를 추가해야 할 가능성이 높다.

추가 후보는 다음과 같다.

| 구분하려는 pair | 추가 후보 feature |
|---|---|
| explorer vs price_comparison | 상품 간 이동 횟수, filter 반복 횟수, search-detail 반복 횟수, review/detail 비율 |
| goal_oriented_buyer vs impulse_buyer | time_to_cart, time_to_purchase, search_before_purchase, review_before_purchase, product_views_before_purchase |
| cart_abandoner subgroup | cart 이후 재탐색 여부, checkout 진입 후 이탈 여부, remove_from_cart 여부 |

---

## 16. 추가 실험: label-free 전처리로 미세한 차이 증폭

지도학습 결과가 높게 나왔기 때문에 다음 가설을 세웠다.

> feature 안에 persona 정보는 있지만, 현재 거리 계산에서는 그 정보의 영향력이 약해서 K-Means가 5개 persona를 잘 나누지 못하는 것 아닐까?

이를 확인하기 위해 정답 label을 사용하지 않는 전처리만 비교했다.

중요한 원칙은 다음과 같다.

```text
정답 label은 전처리, weighting, K 선택에 사용하지 않는다.
정답 label은 test 평가에만 사용한다.
```

따라서 사용하지 않은 방법은 다음과 같다.

```text
Random Forest importance 기반 weighting
Logistic Regression coefficient 기반 weighting
persona label 기반 feature selection
label 기반 metric learning
```

비교한 전처리는 다음과 같다.

| Variant | 설명 |
|---|---|
| standard | 기존 log1p + StandardScaler |
| standard_l2 | 기존 전처리 후 L2 Normalizer |
| group_balanced | feature group별 기여도 균형화 |
| group_balanced_l2 | group balancing 후 L2 Normalizer |
| robust | RobustScaler |
| quantile_normal | QuantileTransformer normal distribution |
| power_yeo_johnson | PowerTransformer Yeo-Johnson |

실험은 우선 `F0 x K-Means`에서 수행했다.

### 16.1 Forced K=5 결과

K=5를 강제했을 때 결과는 다음과 같다.

| Preprocessing | K | ARI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|
| standard_l2 | 5 | 0.568 | 0.725 | 0.725 |
| standard | 5 | 0.546 | 0.627 | 0.666 |
| power_yeo_johnson | 5 | 0.455 | 0.549 | 0.588 |
| robust | 5 | 0.455 | 0.466 | 0.536 |
| quantile_normal | 5 | 0.413 | 0.472 | 0.515 |
| group_balanced_l2 | 5 | 0.410 | 0.579 | 0.578 |
| group_balanced | 5 | 0.401 | 0.576 | 0.573 |

가장 중요한 결과는 다음이다.

```text
기존 standard K=5:
ARI = 0.546
Macro-F1 = 0.627
Hungarian Acc = 0.666

standard + L2 K=5:
ARI = 0.568
Macro-F1 = 0.725
Hungarian Acc = 0.725
```

즉 label을 사용하지 않은 단순 L2 normalization만으로도 K=5 persona 복원 성능이 크게 좋아졌다.

해석은 다음과 같다.

> 전체 행동량의 크기보다 행동 구성 비율 또는 방향성을 더 보도록 만들면, 5개 persona를 더 잘 복원할 수 있다.

이는 현재 feature에 persona 정보가 존재한다는 기존 supervised 결과와도 일치한다.

### 16.2 Natural K 결과

Natural K 선택에서는 다른 패턴이 나타났다.

| Preprocessing | Selected K | ARI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|
| standard | 3 | 0.523 | 0.436 | 0.563 |
| power_yeo_johnson | 3 | 0.522 | 0.436 | 0.564 |
| robust | 3 | 0.518 | 0.434 | 0.560 |
| quantile_normal | 3 | 0.508 | 0.430 | 0.559 |
| group_balanced_l2 | 6 | 0.384 | 0.558 | 0.540 |
| standard_l2 | 2 | 0.367 | 0.233 | 0.400 |
| group_balanced | 7 | 0.354 | 0.527 | 0.504 |

여기서 중요한 점은 다음이다.

```text
standard_l2는 K=5를 강제하면 가장 좋지만,
Natural K 선택에서는 K=2를 선택한다.
```

즉 L2 normalization은 persona-constrained recovery에는 도움이 되지만, Silhouette 기준으로는 더 큰 상위 구조를 선호하게 만들 수 있다.

이 결과는 중요한 해석을 만든다.

> 좋은 persona 복원 전처리와 좋은 내부 군집 지표 전처리는 반드시 같지 않다.

### 16.3 standard_l2 K=5에서의 confusion

`standard_l2 + K=5`의 test split contingency는 다음과 같다.

| Persona | Cluster 0 | Cluster 1 | Cluster 2 | Cluster 3 | Cluster 4 |
|---|---:|---:|---:|---:|---:|
| cart_abandoner | 1 | 3 | 190 | 29 | 2 |
| explorer | 176 | 0 | 1 | 0 | 48 |
| goal_oriented_buyer | 0 | 133 | 6 | 86 | 0 |
| impulse_buyer | 0 | 147 | 6 | 73 | 0 |
| price_comparison | 5 | 0 | 3 | 0 | 216 |

이 결과에서 좋아진 부분은 다음과 같다.

```text
explorer와 price_comparison이 상당 부분 분리됨
cart_abandoner도 대부분 독립 cluster로 유지됨
```

하지만 여전히 어려운 부분도 있다.

```text
goal_oriented_buyer와 impulse_buyer는 여전히 강하게 섞임
```

즉 L2 normalization은 탐색/비교형 pair를 분리하는 데는 도움이 되었지만, 구매형 pair를 완전히 분리하지는 못했다.

### 16.4 전처리 실험 결론

이번 label-free 전처리 실험의 결론은 다음과 같다.

```text
1. 정답 label을 사용하지 않는 전처리만으로도 K=5 복원 성능을 개선할 수 있다.
2. standard + L2 normalization이 현재까지 가장 좋은 K=5 clustering 결과를 만들었다.
3. 이는 행동량 자체보다 행동 구성 비율/방향성이 persona 복원에 중요하다는 신호다.
4. 그러나 goal_oriented_buyer와 impulse_buyer는 여전히 잘 분리되지 않는다.
5. 따라서 다음 개선은 구매형 pair를 가르는 sequence/temporal feature 추가가 필요하다.
```

이 실험은 다음 파일에 저장되어 있다.

```text
Dashboard/dashboard-be/feature-pipeline-experiment/preprocessing_ablation.py
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/preprocessing-ablation-f0.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/preprocessing-contingency/
```

### 16.5 Step 1: standard_l2를 주요 subset으로 확장

F0에서 `standard_l2`가 효과적이었기 때문에, 주요 subset 전체로 확장했다.

실험 조건은 다음과 같다.

```text
Feature subsets: F0, F7, F11, F13, F15
Preprocessing: standard vs standard_l2
Clustering: K-Means(k=5)
Seeds: 7, 42, 2026
Label 사용: test 평가에만 사용
```

결과는 다음과 같다.

| Feature | Standard ARI | Standard L2 ARI | ARI 변화 | Standard L2 Macro-F1 | Standard L2 Hungarian Acc |
|---|---:|---:|---:|---:|---:|
| F0 | 0.546 | 0.568 | +0.022 | 0.725 | 0.725 |
| F7 | 0.446 | 0.450 | +0.004 | 0.531 | 0.575 |
| F11 | 0.446 | 0.469 | +0.023 | 0.632 | 0.649 |
| F13 | 0.443 | 0.553 | +0.110 | 0.718 | 0.718 |
| F15 | 0.445 | 0.438 | -0.007 | 0.638 | 0.633 |

가장 큰 개선은 `F13 = 전체 - funnel`에서 나타났다.

```text
F13 standard:
ARI = 0.443
Macro-F1 = 0.541
Hungarian Acc = 0.580

F13 standard_l2:
ARI = 0.553
Macro-F1 = 0.718
Hungarian Acc = 0.718
```

즉 L2 normalization은 F0에만 우연히 효과가 있었던 것이 아니라, 특히 path/explore/intensity 중심 feature에서 persona 복원력을 크게 높였다.

반대로 F15는 path feature를 제거한 subset인데, L2를 적용해도 성능이 좋아지지 않았다.

```text
F15 standard ARI = 0.445
F15 standard_l2 ARI = 0.438
```

따라서 현재 결과는 다음 해석을 지지한다.

> L2 normalization은 전체 행동량보다 행동 구성 비율/방향성을 강조하며, 이 효과는 path feature가 포함되어 있을 때 특히 크다.

F13 standard_l2의 confusion은 다음과 같다.

| Persona | Cluster 0 | Cluster 1 | Cluster 2 | Cluster 3 | Cluster 4 |
|---|---:|---:|---:|---:|---:|
| cart_abandoner | 4 | 1 | 32 | 3 | 185 |
| explorer | 1 | 171 | 0 | 53 | 0 |
| goal_oriented_buyer | 131 | 0 | 86 | 2 | 6 |
| impulse_buyer | 147 | 0 | 73 | 0 | 6 |
| price_comparison | 0 | 5 | 0 | 218 | 1 |

개선된 부분은 다음과 같다.

```text
cart_abandoner는 대부분 독립 cluster로 유지됨
explorer와 price_comparison 분리가 크게 좋아짐
```

하지만 여전히 남은 문제는 다음과 같다.

```text
goal_oriented_buyer와 impulse_buyer는 여전히 같은 cluster에 많이 섞임
```

따라서 다음 개선의 핵심은 구매형 pair를 분리하는 feature를 추가하는 것이다.

```text
time_to_first_cart
time_to_purchase
product_views_before_cart
searches_before_cart
reviews_before_purchase
cart_to_purchase_time
```

Step 1 결과 파일은 다음과 같다.

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/preprocessing-step1-key-subsets.csv
```

---

## 17. 추가 실험: temporal feature 생성 및 검증

기존 19개 feature는 count/ratio 중심이므로, page당 시간, 상품당 시간, 구매까지 걸린 시간 같은 temporal feature를 원본 `events.jsonl`에서 다시 계산했다.

추가한 전체 temporal feature는 다음 12개다.

```text
avg_time_per_page
avg_time_per_product
avg_time_per_review
time_to_first_product
time_to_first_cart
time_to_checkout
time_to_purchase
cart_to_purchase_time
product_views_before_cart
searches_before_cart
reviews_before_purchase
filters_before_purchase
```

이 중 우선 핵심 temporal feature 6개를 별도로 검증했다.

```text
avg_time_per_page
avg_time_per_product
time_to_first_cart
time_to_checkout
time_to_purchase
cart_to_purchase_time
```

이 feature들은 모두 정답 label 없이 event timestamp, event_name, path, dwell_time의 `props.dwell_ms`에서 계산했다.

실험 조건은 다음과 같다.

```text
Preprocessing: standard_l2
Clustering: K-Means(k=5) and Natural K
Seeds: 7, 42, 2026
Label 사용: test 평가에만 사용
```

### 17.1 Forced K=5 결과

| Feature Set | Feature 수 | ARI | NMI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|---:|
| F0 standard_l2 | 19 | 0.568 | 0.649 | 0.725 | 0.725 |
| F0 + core temporal | 25 | 0.623 | 0.726 | 0.648 | 0.686 |
| F0 + all temporal | 31 | 0.513 | 0.625 | 0.624 | 0.652 |
| F13 + core temporal | 20 | 0.634 | 0.730 | 0.688 | 0.725 |
| F13 + all temporal | 26 | 0.479 | 0.589 | 0.609 | 0.636 |

가장 좋은 ARI는 `F13 + core temporal + standard_l2`에서 나왔다.

```text
F13 + core temporal + standard_l2 + K=5
ARI = 0.634
NMI = 0.730
Macro-F1 = 0.688
Hungarian Acc = 0.725
```

기존 F13 standard_l2와 비교하면 다음과 같다.

```text
F13 standard_l2:
ARI = 0.553
Macro-F1 = 0.718
Hungarian Acc = 0.718

F13 + core temporal standard_l2:
ARI = 0.634
Macro-F1 = 0.688
Hungarian Acc = 0.725
```

즉 core temporal feature를 추가하면 ARI와 NMI, Hungarian Accuracy는 개선된다. 다만 Macro-F1은 약간 감소한다.

해석은 다음과 같다.

> core temporal feature는 전체 cluster structure를 정답 persona 구조에 더 가깝게 만들지만, persona별 균형 복원은 아직 완전히 해결하지 못한다.

반면 12개 temporal feature를 모두 넣으면 성능이 떨어졌다.

```text
F0 + all temporal ARI = 0.513
F13 + all temporal ARI = 0.479
```

따라서 temporal feature는 무조건 많이 넣는 것이 아니라, 핵심 feature를 선별해야 한다.

### 17.2 Natural K 결과

Natural K에서도 core temporal feature는 개선을 보였다.

| Feature Set | Selected K | ARI | NMI | Macro-F1 | Hungarian Acc |
|---|---:|---:|---:|---:|---:|
| F0 standard_l2 | 2 | 0.367 | 0.567 | 0.233 | 0.400 |
| F0 + core temporal | 3 | 0.594 | 0.737 | 0.459 | 0.595 |
| F13 + core temporal | 3 | 0.584 | 0.722 | 0.456 | 0.590 |

기존 `standard_l2`는 Natural K에서 K=2를 선택했지만, core temporal feature를 넣으면 K=3으로 올라가고 ARI도 크게 좋아졌다.

```text
F0 standard_l2 natural:
K = 2
ARI = 0.367

F0 + core temporal natural:
K = 3
ARI = 0.594
```

즉 temporal feature는 자연 군집 구조도 개선한다.

### 17.3 F13 + core temporal의 confusion

`F13 + core temporal + standard_l2 + K=5`, seed 42의 contingency는 다음과 같다.

| Persona | Cluster 0 | Cluster 1 | Cluster 2 | Cluster 3 | Cluster 4 |
|---|---:|---:|---:|---:|---:|
| cart_abandoner | 0 | 0 | 39 | 186 | 0 |
| explorer | 0 | 35 | 0 | 0 | 190 |
| goal_oriented_buyer | 219 | 0 | 0 | 6 | 0 |
| impulse_buyer | 209 | 0 | 11 | 6 | 0 |
| price_comparison | 0 | 209 | 1 | 3 | 11 |

개선된 점은 다음과 같다.

```text
cart_abandoner는 매우 잘 분리됨
explorer와 price_comparison도 이전보다 더 분리됨
전체 ARI/NMI가 크게 개선됨
```

하지만 여전히 남은 문제는 다음이다.

```text
goal_oriented_buyer와 impulse_buyer는 cluster 0에서 계속 강하게 섞임
```

즉 temporal feature가 구조를 개선했지만, 구매형 pair 분리는 아직 부족하다.

### 17.4 temporal feature 실험 결론

이번 실험의 결론은 다음과 같다.

```text
1. 원본 events.jsonl에서 page/product/cart/purchase 시간 feature를 추가하는 것은 효과가 있다.
2. 특히 core temporal feature 6개는 ARI/NMI를 크게 개선한다.
3. 그러나 temporal feature를 12개 모두 넣으면 노이즈 또는 중복 신호 때문에 성능이 악화된다.
4. goal_oriented_buyer와 impulse_buyer는 여전히 잘 분리되지 않는다.
5. 다음 단계에서는 구매형 pair를 직접 가르는 더 세밀한 sequence feature가 필요하다.
```

생성된 파일은 다음과 같다.

```text
Dashboard/dashboard-be/feature-pipeline-experiment/temporal_feature_experiment.py
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/temporal-features.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/temporal-feature-results.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/temporal-contingency/
```

---

## 18. 생성된 주요 결과 파일

### Natural K 전체 결과

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/natural-k-results.csv
Dashboard/dashboard-be/feature-pipeline-experiment/NATURAL_K_REPORT.md
```

### Forced K=5 결과

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/forced-k5-results.csv
Dashboard/dashboard-be/feature-pipeline-experiment/FORCED_K5_REPORT.md
```

### Supervised separability 결과

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/supervised-results.csv
```

### hard 영향 확인 결과

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/source-hard-f0-a1-natural-k.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/source-non-hard-f0-a1-natural-k.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/difficulty-hard-f0-a1-natural-k.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/difficulty-non-hard-f0-a1-natural-k.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/source-hard-key-subsets-a1-natural-k.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/source-non-hard-key-subsets-a1-natural-k.csv
```

### hard/non-hard supervised 비교

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/source-hard-f0-supervised.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/source-non-hard-f0-supervised.csv
```

### label-free 전처리 ablation

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/preprocessing-ablation-f0.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/preprocessing-contingency/
```

### temporal feature 실험

```text
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/temporal-features.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/temporal-feature-results.csv
Dashboard/dashboard-be/feature-pipeline-experiment/artifacts/temporal-contingency/
```

---

## 19. 최종 한 줄 결론

이번 실험은 다음을 보여준다.

> LLM으로 생성한 5개 persona 정보는 현재 19개 행동 feature에 충분히 포함되어 있지만, 비지도 clustering의 자연스러운 거리 구조에서는 5개 persona가 그대로 분리되기보다 `탐색/비교형`, `구매형`, `장바구니 이탈형` 같은 3개 상위 행동군으로 먼저 나타난다. hard 데이터는 이 경향을 강화하지만 유일한 원인은 아니며, 5개 persona를 더 잘 복원하려면 clustering head 변경과 sequence/temporal feature 추가가 필요하다.
