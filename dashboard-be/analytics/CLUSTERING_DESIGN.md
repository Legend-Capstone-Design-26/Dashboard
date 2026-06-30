# 비지도학습 기반 고객 세그먼트 클러스터링 설계

---

## 1. 왜 구현하는가 (Why)

### 현재 rule-base 방식의 한계

현재 `labeler.js`는 5개의 유형군을 하드코딩된 임계값으로 분류한다.

```
- over_explorer       : page_views >= 4, depth >= 2, duration_ms >= 90,000
- price_sensitive     : price_interaction_count >= 2
- window_shopper      : page_views <= 2, clicks <= 1, duration_ms <= 20,000
- ux_friction         : error_count >= 1 or rage_clicks_count >= 1
- checkout_abandoner  : checkout_entered && !checkout_complete
```

**문제점:**
1. 임계값이 고정되어 있어 실제 사용자 행동 변화에 적응하지 못함
2. 규칙 간 우선순위(LABEL_PRIORITY)가 경직되어 복합적 행동 패턴을 놓침
3. 새로운 유형이 등장해도 개발자가 직접 규칙을 추가해야 함
4. "규칙에 걸리지 않는" 세션은 window_shopper로 fallback 처리

### 목표

- 실제 세션 데이터에서 자연스럽게 드러나는 패턴을 K-Means 클러스터링으로 발견
- LLM이 각 클러스터의 피처 프로파일을 읽고 사람이 이해할 수 있는 명칭을 부여
- 데이터가 쌓일수록 유형군이 정교해지는 자기개선(self-improving) 구조 구현
- 클러스터 K가 바뀌어도 기존 유형명의 연속성을 보장해 UX 품질 유지

---

## 2. 사전 지식 (Prerequisite Knowledge)

### 2-1. 피처 벡터 (Feature Vector)

각 세션을 숫자 배열로 표현한 것.  
`sessionSummary.js`가 이미 아래 피처들을 추출해주고 있다.

```
[
  duration_ms,           // 세션 총 시간
  page_views,            // 페이지뷰 수
  clicks,                // 클릭 수
  depth,                 // 방문한 고유 페이지 수
  dwell_total_ms,        // 총 체류 시간
  back_count,            // 뒤로가기 횟수
  error_count,           // 에러 발생 수
  rage_clicks_count,     // 레이지클릭 수
  price_interaction_count, // 가격 관련 클릭 수
  filter_count,          // 필터 사용 수
  search_count,          // 검색 수
  cart_add_count,        // 장바구니 추가 수
  cart_remove_count,     // 장바구니 제거 수
  payment_attempt_count, // 결제 시도 수
  checkout_entered,      // 체크아웃 진입 여부 (0 or 1)
  checkout_complete      // 구매 완료 여부 (0 or 1)
]
```

### 2-2. 피처 정규화 (Min-Max Normalization)

피처들의 단위와 스케일이 다르기 때문에 정규화가 필요하다.  
정규화 없이 클러스터링하면 `duration_ms`(0~300,000) 같은 큰 값이 결과를 지배한다.

```
normalized = (value - min) / (max - min)
→ 모든 피처를 0~1 범위로 통일
```

모든 피처는 정규화 후 동등한 가중치(× 1.0)로 처리한다.  
결제 관련 피처에 높은 가중치를 주면 결제 여부로만 클러스터가 분리되어  
탐색형·가격탐색형 등 결제 미진입 유형군이 하나로 뭉치는 문제가 생긴다.

### 2-3. K-Means 클러스터링

N개의 세션을 K개의 그룹으로 나누는 알고리즘.

```
1. K개의 초기 중심점(centroid)을 랜덤 배치
2. 각 세션을 가장 가까운 centroid에 배정
3. 각 그룹의 평균으로 centroid 재계산
4. centroid 변화가 없을 때까지 2-3 반복
```

### 2-4. Centroid (무게중심)

클러스터에 속한 세션들의 피처 평균값.  
클러스터를 하나의 대표 벡터로 압축한 것.

```
클러스터 A의 세션 3개:
  세션1: [clicks=5, duration=30, page_views=3, ...]
  세션2: [clicks=8, duration=60, page_views=4, ...]
  세션3: [clicks=2, duration=20, page_views=2, ...]

centroid_A = [5.0, 36.7, 3.0, ...]
```

새 세션이 들어오면 저장된 centroid들과 거리를 재서 가장 가까운 클러스터에 배정한다.

### 2-5. 최적 K 탐색

- **Elbow Method**: K를 늘릴수록 클러스터 내 분산(WCSS)이 줄어드는데, 줄어드는 속도가 꺾이는 지점을 선택
- **Silhouette Score**: 각 세션이 자기 클러스터에 얼마나 잘 속하는지 수치화 (-1~1, 높을수록 좋음)
- 두 방법을 함께 사용해 K=3~8 범위에서 최적값 탐색

### 2-6. 코사인 유사도 (Cosine Similarity)

두 벡터의 방향이 얼마나 같은지 측정. 값이 1에 가까울수록 유사.  
재클러스터링 시 새 centroid가 기존 taxonomy의 어떤 유형과 유사한지 판단하는 데 사용.

```
similarity = (A · B) / (|A| × |B|)

1.0  → 완전히 같은 방향
0.85 → 매우 유사 (같은 유형으로 판단)
0.60 → 애매 (LLM에게 판단 위임)
0.60 미만 → 새로운 유형
```

### 2-7. Taxonomy (유형군 목록)

클러스터링 수학 결과와 UX에 노출되는 유형명을 분리하는 레이어.  
K가 바뀌어도 사용자에게 보이는 유형명이 안정적으로 유지되도록 한다.

```json
{
  "탐색형 브라우저": {
    "centroid": [0.3, 0.7, 0.5, ...],
    "feature_profile": { "page_views": "high", "checkout_entered": "false", ... },
    "created_at": "2025-01-01",
    "status": "active"
  }
}
```

---

## 3. 구현 알고리즘

### Phase 1: Cold Start (세션 수 < 100)

```
새 세션 이벤트 수신
  → sessionSummary.js로 피처 추출
  → Redis에 세션 피처 저장 (key: session:features:{session_id})
  → rule-base labeler.js로 레이블 부여 (기존 방식 유지)
  → 세션 카운터 증가 (key: clustering:session_count)

세션 수 >= 100 도달 시 → Phase 2 트리거
```

### Phase 2: 최초 클러스터링 (1회)

```
1. Redis에서 전체 세션 피처 로드

2. 피처 정규화
   → 각 피처의 min/max 계산
   → Min-Max Normalization 적용
   → checkout 관련 피처 가중치 적용
   → 정규화 파라미터 Redis에 저장 (이후 새 세션 정규화에 재사용)

3. K=5 고정으로 K-Means 실행 (기존 5개 rule-base 유형과 동일한 수)

4. 클러스터별 centroid 계산

5. LLM에 각 클러스터 프로파일 전달 → 명칭 부여
   프롬프트 예시:
   "다음은 클러스터 0의 평균 행동 프로파일입니다.
    page_views: 6.2, clicks: 2.1, checkout_entered: 0, duration_ms: 95000, ...
    이 사용자 유형에 적합한 명칭을 한국어로 부여해주세요."

6. Taxonomy 초기화 및 Redis에 저장
   {
     name: "탐색형 브라우저",
     centroid: [...],
     feature_profile: {...},
     status: "active"
   }

7. 이후 새 세션은 Phase 3으로 처리
```

### Phase 3: 실시간 클러스터 배정

```
새 세션 이벤트 수신
  → sessionSummary.js로 피처 추출
  → Redis에서 정규화 파라미터 로드 (min/max, 가중치)
  → 피처 정규화 적용
  → Redis에서 taxonomy의 모든 centroid 로드
  → 각 centroid와 유클리디안 거리 계산
  → 가장 가까운 centroid의 유형명 배정
  → 결과 저장

※ 이 단계는 단순 수식이므로 Node.js에서 직접 처리 (Python 불필요)
```

### Phase 4: 주기적 재클러스터링

```
트리거 조건: 세션 수가 이전 클러스터링 시점의 2배 도달 or 월 1회

1. Redis에서 전체 세션 피처 로드

2. 최적 K 탐색 (K=3~8 범위)
   for K in [3, 4, 5, 6, 7, 8]:
     K-Means 실행
     WCSS 계산 (Elbow)
     Silhouette Score 계산
   → 두 지표를 종합해 최적 K 선택

3. 최적 K로 K-Means 재실행

4. Taxonomy 매핑 알고리즘 실행:

   for each NEW_CLUSTER in new_clusters:

     # 기존 taxonomy centroid들과 코사인 유사도 계산
     similarities = []
     for each EXISTING in taxonomy:
       sim = cosine_similarity(NEW_CLUSTER.centroid, EXISTING.centroid)
       similarities.append({ name: EXISTING.name, sim })

     best_match = max(similarities, by=sim)

     if best_match.sim >= 0.85:
       # 기존 유형과 충분히 유사 → 이름 유지
       NEW_CLUSTER.name = best_match.name

     elif best_match.sim >= 0.60:
       # 애매한 구간 → LLM에게 판단 위임
       LLM("이 클러스터는 기존 유형 '{name}'과 유사도 {sim}입니다.
            같은 유형입니까? 같다면 기존 이름을, 다르다면 새 이름을 부여하세요.")

     else:
       # 완전히 새로운 패턴 → LLM이 신규 명칭 부여
       LLM("이 클러스터는 기존 유형과 다른 새로운 패턴입니다. 명칭을 부여해주세요.")
       taxonomy.add(NEW_CLUSTER)

   # 기존 taxonomy 중 매핑된 클러스터가 없는 유형 처리
   for each EXISTING in taxonomy:
     if EXISTING has no mapped new_cluster:
       EXISTING.status = "deprecated"
       # 대시보드에서 점진적으로 fade-out 처리

5. 업데이트된 taxonomy, centroid, 정규화 파라미터 Redis에 저장
```

---

## 4. 파일 구조

```
dashboard-be/
  analytics/
    labeler.js                    ← 기존 rule-base (Phase 1 fallback으로 유지)
    sessionSummary.js             ← 피처 추출 (기존, 수정 없음)
    clusteringLabeler.js          ← rule-base labeler를 대체하는 새 인터페이스
                                    Phase 3 실시간 배정(assignToCluster) 포함
                                    taxonomy 없으면 labeler.js로 fallback
    clustering/
      featureExtractor.js         ← 피처 벡터 추출 + Min-Max 정규화 + 가중치 적용
      kmeans.js                   ← K-Means++ 초기화, K-Means 실행, Silhouette/Elbow 기반 최적 K 탐색
      taxonomyMapper.js           ← 코사인 유사도로 신/구 클러스터 매핑, deprecated 탐지
      llmNamer.js                 ← 클러스터 프로파일 → LLM 명칭 부여 / 애매한 매핑 판단
      clusterStore.js             ← taxonomy, normParams, 세션 카운트 Redis 저장/로드
      clusteringOrchestrator.js   ← Phase 2/4 배치 작업 진입점 (runClustering)
                                    Cold Start 판단, 최적 K 결정, taxonomy 업데이트 총괄

  workers/
    event-consumer.js           ← Kafka 이벤트 소비 + Phase 4 트리거
                                  dwell_time 이벤트(세션 종료 신호) 수신 시
                                  incrementSessionCount → shouldRecluster 체크 →
                                  조건 충족 시 runClustering을 await 없이 백그라운드 실행
```

---

## 5. 의존성

```json
"ml-kmeans": "^6.0.0"   // K-Means 구현체
```

코사인 유사도, Min-Max 정규화는 외부 라이브러리 없이 직접 구현.
