# Feature-Pipeline 실험 계획

## 1. 연구 목적

본 실험의 목적은 **이커머스 사용자 유형(persona)을 가장 잘 복원하는 feature 조합과 분석 파이프라인을 찾는 것**이다.

핵심은 다음 두 가지를 함께 비교하는 데 있다.

1. 어떤 feature subset이 사용자 유형 구분에 더 유효한가
2. 어떤 분석 파이프라인이 해당 feature subset과 결합될 때 더 안정적으로 persona를 복원하는가

여기서 LLM 기반 합성 데이터는 실제 로그를 대체하기 위한 것이 아니라, **정답 라벨이 알려진 통제형 benchmark**로 사용된다.

## 2. 전체 실험 흐름

각 실험 조건은 아래 순서를 따른다.

1. feature subset `F*` 선택
2. 변수 유형에 맞는 전처리 적용
3. 분석 파이프라인 `A*` 적용
4. 군집 결과 생성
5. 정답 라벨과 비교하여 성능 평가
6. seed를 바꿔 3회 반복

즉, 실제 비교 단위는 아래와 같다.

> feature subset x analysis pipeline x seed

## 3. 데이터 구성 원칙

### 3.1 데이터 단위

- 원시 입력 데이터: `events.jsonl`
- 정답 및 세션 메타데이터: `sessions.json`
- 분석 단위: 세션(session)

### 3.2 정답 라벨 사용 원칙

정답 라벨(`persona_id`, `ground_truth_label`)은 **학습 입력에 절대 포함하지 않는다.**

- feature 추출 단계: 정답 라벨 사용 금지
- 전처리 단계: 정답 라벨 사용 금지
- 임베딩/표현 학습 단계: 정답 라벨 사용 금지
- 군집화 단계: 정답 라벨 사용 금지
- 평가 단계에서만 정답 라벨 사용 허용

즉, 정답 라벨은 오직 다음 목적에만 사용한다.

1. 외부 평가 지표 계산
2. cluster-persona 대응 분석
3. feature subset과 파이프라인 비교

이 원칙을 통해 본 실험은 **비지도학습 평가 구조**를 유지한다.

### 3.3 데이터 분할 원칙

실험 데이터는 아래와 같이 분할한다.

- `train`
- `val`
- `test`

권장 비율:

- `train`: 70%
- `val`: 15%
- `test`: 15%

역할은 다음과 같다.

#### train
- feature extraction 이후 실제 clustering 입력으로 사용
- UMAP, VAE 같은 representation 학습에도 사용
- K-Means, HDBSCAN 등 군집 구조 형성에 사용

#### val
- 하이퍼파라미터 비교 및 모델 선택에 사용
- 예: UMAP 차원 수, HDBSCAN min cluster size, VAE latent 차원 등
- 최종 성능 보고용으로 사용하지 않음

#### test
- 최종 평가 전용
- 최종적으로 선택한 feature subset과 pipeline 조합의 일반화 성능 확인
- ARI, NMI, AMI, Macro-F1 등은 최종적으로 이 split에서 보고하는 것을 원칙으로 함

### 3.4 split 설계 시 주의점

1. 세션 단위로 분할한다.
2. 하나의 세션은 train/val/test 중 하나에만 속해야 한다.
3. persona 분포가 한 split에 치우치지 않도록 **stratified split**을 권장한다.
4. hard subset과 일반 subset이 특정 split에만 몰리지 않도록 분산 배치한다.

### 3.5 현재 benchmark에 대한 적용 원칙

현재 merged benchmark는 다음 구조를 가진다.

- balanced subset 5000
- hard subset 2500

이 데이터를 그대로 하나의 benchmark로 쓰되,

- 전체 7500 세션을 train/val/test로 다시 나누거나
- source와 difficulty를 고려한 stratified split을 구성하는 것이 바람직하다.

권장 stratification 기준:

- `persona_id`
- `difficulty`
- 필요하면 `source`

## 4. 19개 feature 정의

### G1. 행동 강도

- `f1` `session_duration_ms`
- `f2` `event_count`
- `f3` `page_view_count`
- `f4` `click_count`

### G2. 탐색 경로

- `f5` `depth`
- `f6` `unique_page_ratio`
- `f7` `revisit_rate`
- `f8` `backtrack_count`
- `f9` `loop_rate`

### G3. 탐색/비교 행동

- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`

### G4. 커머스 퍼널

- `f14` `cart_add_count`
- `f15` `cart_remove_count`
- `f16` `checkout_entered`
- `f17` `payment_attempt_count`
- `f18` `purchase_completed`

### G5. 마찰/오류

- `f19` `error_count`

## 5. Feature 조합 후보

본 실험에서는 아래 9개 feature subset을 비교한다.

### Baseline

- `F0` 전체 19개

포함 feature:

- `f1` `session_duration_ms`
- `f2` `event_count`
- `f3` `page_view_count`
- `f4` `click_count`
- `f5` `depth`
- `f6` `unique_page_ratio`
- `f7` `revisit_rate`
- `f8` `backtrack_count`
- `f9` `loop_rate`
- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`
- `f14` `cart_add_count`
- `f15` `cart_remove_count`
- `f16` `checkout_entered`
- `f17` `payment_attempt_count`
- `f18` `purchase_completed`
- `f19` `error_count`

### 단일 그룹 조합

- `F2` 탐색 경로
- `F3` 탐색/비교
- `F4` 커머스 퍼널

#### F2 탐색 경로

의미:

- 사용자가 얼마나 깊고 넓게 페이지를 이동했는지
- 같은 페이지를 반복 방문하는지
- 뒤로 가기나 루프 형태의 이동이 많은지

포함 feature:

- `f5` `depth`
  - 세션 내 방문 깊이
  - 사용자가 몇 단계까지 탐색했는지 나타냄
- `f6` `unique_page_ratio`
  - 전체 방문 페이지 중 고유 페이지 비율
  - 값이 높으면 넓게 탐색, 낮으면 같은 페이지 반복 방문 경향
- `f7` `revisit_rate`
  - 이미 방문한 페이지를 다시 방문한 비율
  - 비교 행동, 망설임, 반복 탐색 신호로 해석 가능
- `f8` `backtrack_count`
  - 이전 페이지나 목록으로 되돌아간 횟수
  - 탐색형/가격비교형에서 중요한 신호가 될 수 있음
- `f9` `loop_rate`
  - `A -> B -> A` 같은 반복 이동 비율
  - 동일 경로를 왕복하는 망설임, 비교, 탐색 루프를 포착

#### F3 탐색/비교

포함 feature:

- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`

#### F4 커머스 퍼널

포함 feature:

- `f14` `cart_add_count`
- `f15` `cart_remove_count`
- `f16` `checkout_entered`
- `f17` `payment_attempt_count`
- `f18` `purchase_completed`

### 다중 그룹 조합

- `F6` 탐색 경로 + 탐색/비교
- `F7` 탐색/비교 + 퍼널
- `F11` 탐색 경로 + 탐색/비교 + 퍼널

#### F6 탐색 경로 + 탐색/비교

포함 feature:

- `f5` `depth`
- `f6` `unique_page_ratio`
- `f7` `revisit_rate`
- `f8` `backtrack_count`
- `f9` `loop_rate`
- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`

#### F7 탐색/비교 + 퍼널

포함 feature:

- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`
- `f14` `cart_add_count`
- `f15` `cart_remove_count`
- `f16` `checkout_entered`
- `f17` `payment_attempt_count`
- `f18` `purchase_completed`

#### F11 탐색 경로 + 탐색/비교 + 퍼널

포함 feature:

- `f5` `depth`
- `f6` `unique_page_ratio`
- `f7` `revisit_rate`
- `f8` `backtrack_count`
- `f9` `loop_rate`
- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`
- `f14` `cart_add_count`
- `f15` `cart_remove_count`
- `f16` `checkout_entered`
- `f17` `payment_attempt_count`
- `f18` `purchase_completed`

### Ablation 조합

- `F13` 전체 - 퍼널
- `F15` 전체 - 탐색 경로

#### F13 전체 - 퍼널

포함 feature:

- `f1` `session_duration_ms`
- `f2` `event_count`
- `f3` `page_view_count`
- `f4` `click_count`
- `f5` `depth`
- `f6` `unique_page_ratio`
- `f7` `revisit_rate`
- `f8` `backtrack_count`
- `f9` `loop_rate`
- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`
- `f19` `error_count`

#### F15 전체 - 탐색 경로

포함 feature:

- `f1` `session_duration_ms`
- `f2` `event_count`
- `f3` `page_view_count`
- `f4` `click_count`
- `f10` `search_count`
- `f11` `filter_count`
- `f12` `product_detail_count`
- `f13` `review_view_count`
- `f14` `cart_add_count`
- `f15` `cart_remove_count`
- `f16` `checkout_entered`
- `f17` `payment_attempt_count`
- `f18` `purchase_completed`
- `f19` `error_count`

## 5.1 3대 컴퓨터 분산 실행용 조합 분할

총 9개 feature subset을 3개씩 나누어 3대 컴퓨터에서 병렬 실행한다.

### Computer 1

- `F0` 전체 19개
- `F2` 탐색 경로
- `F3` 탐색/비교

의미:

- baseline과 단일 핵심 탐색 계열 subset 비교

### Computer 2

- `F4` 커머스 퍼널
- `F6` 탐색 경로 + 탐색/비교
- `F7` 탐색/비교 + 퍼널

의미:

- 퍼널 단독 효과와 탐색-퍼널 결합 효과 비교

### Computer 3

- `F11` 탐색 경로 + 탐색/비교 + 퍼널
- `F13` 전체 - 퍼널
- `F15` 전체 - 탐색 경로

의미:

- 강한 결합형 subset과 ablation subset 비교

이 분할은 각 컴퓨터가 `3 feature subsets x 3 pipelines x 3 seeds = 27 runs`를 담당하도록 맞춘 것이다.

## 6. 전처리 정책

전처리는 `A1`, `A2`, `A3` 이전에 공통으로 적용한다.

즉, 파이프라인 비교는 representation/clustering 차이에서 발생해야 하므로, 전처리 규칙은 가능한 한 동일하게 유지한다.

### 6.1 count / duration 변수

`log1p` 적용 후 scaling

대상:

- `session_duration_ms`
- `event_count`
- `page_view_count`
- `click_count`
- `backtrack_count`
- `search_count`
- `filter_count`
- `product_detail_count`
- `review_view_count`
- `cart_add_count`
- `cart_remove_count`
- `payment_attempt_count`
- `error_count`

### 6.2 ratio 변수

`log1p`는 적용하지 않고 scaling만 적용

대상:

- `unique_page_ratio`
- `revisit_rate`
- `loop_rate`

### 6.3 binary 변수

0/1 값을 그대로 유지

대상:

- `checkout_entered`
- `purchase_completed`

## 7. 분석 파이프라인 정의

모든 feature subset에 동일하게 아래 3개 파이프라인을 적용한다.

### A1. 전처리된 feature 공간 + K-Means

- 입력: 전처리된 feature vector
- representation 단계: 없음
- clustering: K-Means

의미:

- 가장 전통적인 baseline
- hand-crafted feature가 직접 cluster를 형성하는 경우를 평가

### A2. UMAP embedding + HDBSCAN

- 입력: 전처리된 feature vector
- representation 단계: UMAP
- clustering: HDBSCAN

의미:

- 비선형 저차원 표현 후 밀도 기반 cluster가 persona 구조를 더 잘 포착하는지 평가

### A3. VAE latent representation + clustering

- 입력: 전처리된 feature vector
- representation 단계: VAE latent space
- clustering: latent space에서 clustering

권장 기본형:

- `VAE latent + K-Means`

확장형 후보:

- `VAE latent + HDBSCAN`

의미:

- 학습된 잠재표현이 hand-crafted geometry보다 persona 복원에 더 유리한지 평가

## 8. Seed 반복 정책

- 각 `F* x A*` 조건을 `3`개 seed로 반복
- 평균과 표준편차를 함께 보고
- 최고값이 아니라 **안정성**도 함께 비교

총 기본 실험 수:

- `9 feature subsets x 3 pipelines x 3 seeds = 81 runs`

컴퓨터별 실험 수:

- Computer 1: `3 feature subsets x 3 pipelines x 3 seeds = 27 runs`
- Computer 2: `3 feature subsets x 3 pipelines x 3 seeds = 27 runs`
- Computer 3: `3 feature subsets x 3 pipelines x 3 seeds = 27 runs`

## 9. 평가 지표

### 9.1 외부 평가 지표

정답 라벨이 있으므로 외부 평가를 핵심으로 사용한다.

- `ARI`
- `NMI`
- `AMI`
- `Macro-F1`

### 9.2 내부 평가 지표

- `Silhouette Score`
- `Davies-Bouldin Index`
- `Calinski-Harabasz Index`

### 9.3 안정성 지표

- seed별 평균
- seed별 표준편차
- 필요 시 seed 간 pairwise agreement

## 10. 비교 논리

본 실험은 아래 질문에 답하는 것을 목표로 한다.

1. 전체 19개 feature를 다 쓰는 것이 항상 최선인가?
2. 탐색/비교 신호만으로도 persona 복원이 충분한가?
3. 퍼널 정보를 제거하면 성능이 얼마나 떨어지는가?
4. UMAP 또는 VAE 같은 representation learning이 직접 clustering보다 유리한가?
5. 어떤 조합이 seed 변화에도 가장 안정적인가?

## 11. 해석 원칙

- 내부 지표보다 외부 지표를 우선한다.
- Silhouette가 높아도 ARI/NMI가 낮으면, 구조는 깔끔하지만 persona 복원에는 약한 방법으로 해석한다.
- 작은 subset이 `F0`와 유사한 성능을 보이면, 더 효율적이고 해석 가능한 feature set으로 볼 수 있다.
- `A2` 또는 `A3`가 `A1`보다 일관되게 좋다면, persona 구조가 비선형적일 가능성을 시사한다.

## 12. 결과 보고 형식

각 행은 하나의 `F* x A*` 조건을 의미하고, 각 조건은 seed 3회의 평균으로 요약한다.

권장 컬럼:

- feature subset id
- pipeline id
- seed count
- ARI mean
- ARI std
- NMI mean
- NMI std
- Macro-F1 mean
- Macro-F1 std
- Silhouette mean
- Davies-Bouldin mean
- 비고

## 13. 요약

본 실험은 9개의 feature subset과 3개의 분석 파이프라인을 비교하여,

1. 어떤 행동 신호가 persona 복원에 가장 유효한지
2. 어떤 representation/clustering 방식이 더 좋은지
3. 어떤 조합이 가장 안정적인지

를 검증하는 것을 목표로 한다.

정답 라벨은 학습 입력에 포함하지 않고, 최종 평가 단계에서만 사용한다는 점에서 본 실험은 비지도학습 비교 구조를 유지한다.
