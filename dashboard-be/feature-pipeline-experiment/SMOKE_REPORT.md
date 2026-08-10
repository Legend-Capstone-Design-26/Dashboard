# Feature-Pipeline 실험 결과

- 대상: `F0` x `A1` x seed [np.int64(42)]
- 총 1 runs, 평가 split: test

## 한 줄 결론

**F0 x A1** 가 ARI 0.523 (±0.000), Macro-F1 0.436 로 가장 좋다. feature subset 중에서는 **F0**, 파이프라인 중에서는 **A1** 가 평균적으로 앞선다. seed 변화에 가장 안정적인 조건은 **F0 x A1** (ARI std 0.000) 이다.

## 전체 결과 (seed 평균)

| feature | pipeline | seeds | runtime(s) | 선택 params | ARI mean | ARI std | AMI mean | AMI std | NMI mean | Macro-F1 mean | Macro-F1 std | Hungarian Acc | Silhouette | DB | fallback | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F0 | A1 | 1 | 1.8 | k=3.0 | 0.523 | 0.000 | 0.665 | 0.000 | 0.666 | 0.436 | 0.000 | 0.563 | 0.440 | 1.130 | - | - |

## Feature subset 순위 (파이프라인 평균)

| feature subset | ARI 평균 | AMI 평균 | Macro-F1 평균 |
|---|---|---|---|
| F0 | 0.523 | 0.665 | 0.436 |

## 파이프라인 순위 (feature subset 평균)

| pipeline | ARI 평균 | AMI 평균 | Macro-F1 평균 |
|---|---|---|---|
| A1 | 0.523 | 0.665 | 0.436 |

## 해석 메모

- **군집 수 k 를 포함한 모든 하이퍼파라미터는 val split 의 Silhouette 으로 골랐다.** 정답 라벨과 persona 수(5)는 선택 과정에 들어가지 않는다. 라벨은 test 지표 계산에만 쓰인다.
- `선택 k` 가 5 에 가까우면 라벨 없이도 데이터가 persona 개수를 드러냈다는 뜻이다.
- 계획서 11장에 따라 내부 지표(Silhouette, DB)보다 외부 지표(ARI, NMI, Macro-F1)를 우선한다.
- Silhouette 가 높은데 ARI 가 낮으면 군집은 깔끔하지만 persona 복원에는 실패한 경우다.
- `고유벡터 N개` 비고는 해당 subset 의 전처리 후 서로 다른 벡터 수다. 이 값이 작으면 동점 세션이 대량으로 생겨 거리 기반 군집이 임의로 갈린다.
