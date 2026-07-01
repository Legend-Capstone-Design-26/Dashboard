# Nemotron 1M to 10K Cohort Coverage

## Summary

NVIDIA Nemotron Personas Korea의 observed population `1,000,000`명을 segment 단위로 집계한 뒤, 고정 cohort `10,000`명이 이 population 분포를 얼마나 대표하는지 계산했다.

핵심 결과는 다음과 같다.

| Metric | Value | Meaning |
| --- | ---: | --- |
| Observed population | `1,000,000` | Hugging Face rows API에서 실제 스캔한 train rows |
| Fixed cohort size | `10,000` | simulation에 사용하는 고정 persona cohort |
| Population segments | `259` | `age_group + occupation_group + style_key` 조합 수 |
| Population weight coverage | `99.7687%` | 10K cohort가 포함한 segment들이 1M population에서 차지하는 weight 합 |
| Coverage loss | `0.2313%` | 10K로 줄이면서 빠진 population segment weight |
| Distribution loss | `4.3104%` | cohort segment 분포와 1M population segment 분포의 total variation distance |
| Effective sample size | `9,788.28` | segment weight 보정 관점의 유효 샘플 수 |
| Weighting efficiency | `97.8828%` | `effective_sample_size / 10,000` |

짧게 말하면, 현재 10K cohort는 observed 1M population의 segment weight 기준으로 약 `99.77%`를 커버하며, coverage loss는 약 `0.23%`다.

## What Is A Segment?

여기서 segment는 1M persona를 다음 세 기준으로 묶은 그룹이다.

```text
segment = age_group + occupation_group + style_key
```

예시:

```text
60plus__retired__brand_loyal
```

의미:

```text
60대 이상 + 은퇴자 + brand_loyal 성향
```

현재 사용하는 segment 축은 다음과 같다.

| Field | Meaning | Example Values |
| --- | --- | --- |
| `age_group` | 나이대 | `20s`, `30s`, `40s`, `50s`, `60plus` |
| `occupation_group` | 직업군 | `retired`, `student`, `office_worker`, `professional`, `service_worker`, `laborer`, `self_employed`, `caregiver`, `other` |
| `style_key` | 행동/구매 성향 | `brand_loyal`, `comparison`, `fast_decision`, `impulsive`, `price_sensitive`, `review_oriented`, `shipping_sensitive` |

Full scan 결과, observed 1M population에서는 총 `259`개 segment가 발견됐다.

## What Is Population Weight?

`population_weight`은 특정 segment가 observed 1M population 안에서 차지하는 비율이다.

```text
population_weight = segment_population_count / 1,000,000
```

예시:

```text
segment: 60plus__retired__brand_loyal
population_count: 115,542

population_weight = 115,542 / 1,000,000
                  = 0.115542
                  = 11.5542%
```

즉 `population_weight`은 임의로 부여한 점수가 아니라, 실제 observed 1M population에서 해당 segment가 차지하는 비중이다.

## Coverage 기준

Coverage는 개별 persona 10,000명이 1,000,000명을 직접 포함한다는 뜻이 아니다.

Coverage는 다음 의미다.

```text
10K cohort 안에 존재하는 segment들의 population_weight 합
```

공식:

```text
population_weight_coverage = sum(population_weight of population segments represented by the 10K cohort)
coverage_loss = 1 - population_weight_coverage
```

현재 결과:

```text
population_weight_coverage = 0.997687 = 99.7687%
coverage_loss = 0.002313 = 0.2313%
```

해석:

```text
10,000명 cohort는 observed 1,000,000명 population의 segment weight 기준 약 99.77%를 포함한다.
10,000명으로 줄이면서 segment coverage 기준 약 0.23%가 빠졌다.
```

## Distribution Loss 기준

Coverage는 segment가 존재하는지 여부에 초점을 둔다. 반면 distribution loss는 cohort 안의 segment 비율이 1M population의 segment 비율과 얼마나 다른지를 본다.

공식:

```text
distribution_loss_total_variation = 0.5 * sum(abs(sample_weight - population_weight))
```

현재 결과:

```text
distribution_loss_total_variation = 0.043104 = 4.3104%
```

해석:

```text
10K cohort는 거의 모든 population weight를 커버하지만,
segment별 비율까지 완전히 동일하지는 않으며 전체 분포 차이는 약 4.31%다.
```

## Full Scan Artifact

Full scan은 raw 1M rows를 저장하지 않는다. 각 rows page를 읽고 즉시 segment count에 누적한 뒤 raw row는 버린다.

생성 artifact:

```text
dashboard-be/personas/cohorts/nemotron-korea-population-segments.generated.json
```

검증 결과:

```text
artifact_type: population-segments
scanned_row_count: 1,000,000
observed_num_rows_total: 1,000,000
scan_complete: true
next_offset: 1,000,000
segment_count: 259
population_count_sum: 1,000,000
population_weight_sum: 1.0
```

Artifact top-level 구조:

```text
artifact_type
metadata
segments
```

저장하지 않는 것:

```text
rows
raw_rows
```

즉, runtime에는 1M raw persona rows가 아니라 segment aggregate만 남는다.

## Top Population Segments

Observed 1M population에서 가장 큰 segment들은 다음과 같다.

| Segment | Count | Population Weight |
| --- | ---: | ---: |
| `60plus__retired__brand_loyal` | `115,542` | `11.5542%` |
| `60plus__retired__comparison` | `66,673` | `6.6673%` |
| `50s__other__brand_loyal` | `45,606` | `4.5606%` |
| `50s__other__comparison` | `37,332` | `3.7332%` |
| `40s__other__brand_loyal` | `36,354` | `3.6354%` |

## Cohort Diagnostics

Fixed 10K cohort와 full population profile을 비교한 결과는 다음과 같다.

```text
cohort_id: nemotron-korea-fixed-10000-65d9b21a0aa5
cohort_members: 10,000
observed_population_size: 1,000,000
population_segments: 259

population_weight_coverage: 0.997687
coverage_loss: 0.002313
distribution_loss_total_variation: 0.043104

missing_segment_count: 44
undercovered_segment_count: 103
overcovered_segment_count: 112

effective_sample_size: 9788.278111
weighting_efficiency: 0.978828
max_abs_weight_error: 0.002727
```

## Missing Segments

Missing segment는 1M population에는 존재하지만 10K cohort에는 한 명도 포함되지 않은 segment다.

현재 missing segment는 `44`개다. 다만 이들이 차지하는 total population weight는 작기 때문에 전체 coverage loss는 `0.2313%` 수준이다.

상위 missing segments:

| Segment | Population Count | Population Weight |
| --- | ---: | ---: |
| `60plus__office_worker__impulsive` | `274` | `0.0274%` |
| `20s__service_worker__shipping_sensitive` | `264` | `0.0264%` |
| `60plus__service_worker__fast_decision` | `251` | `0.0251%` |
| `30s__office_worker__shipping_sensitive` | `188` | `0.0188%` |
| `20s__office_worker__shipping_sensitive` | `135` | `0.0135%` |

## Undercovered Segments

Undercovered segment는 10K cohort에 포함되긴 했지만, cohort 내 비중이 1M population 비중보다 낮은 segment다.

예시:

| Segment | Population Weight | Cohort Sample Weight | Representation Rate |
| --- | ---: | ---: | ---: |
| `60plus__retired__brand_loyal` | `11.5542%` | `11.4000%` | `98.6654%` |
| `50s__other__comparison` | `3.7332%` | `3.5700%` | `95.6284%` |
| `40s__other__comparison` | `3.3550%` | `3.1900%` | `95.0820%` |
| `50s__laborer__brand_loyal` | `1.6189%` | `1.5600%` | `96.3617%` |
| `60plus__service_worker__brand_loyal` | `1.3088%` | `1.2400%` | `94.7433%` |

## Overcovered Segments

Overcovered segment는 10K cohort 내 비중이 1M population 비중보다 높은 segment다.

예시:

| Segment | Population Weight | Cohort Sample Weight | Representation Rate |
| --- | ---: | ---: | ---: |
| `60plus__retired__comparison` | `6.6673%` | `6.9400%` | `104.0901%` |
| `50s__other__brand_loyal` | `4.5606%` | `4.6000%` | `100.8639%` |
| `40s__other__brand_loyal` | `3.6354%` | `3.8300%` | `105.3529%` |
| `30s__other__comparison` | `2.9478%` | `3.0300%` | `102.7885%` |
| `30s__other__brand_loyal` | `2.7094%` | `2.8500%` | `105.1893%` |

## Interpretation

현재 10K cohort는 1M population을 segment 기준으로 매우 넓게 커버한다.

핵심 해석:

```text
1,000,000명 observed persona population을 10,000명 fixed cohort로 압축했을 때,
segment weight 기준 99.77%를 커버하고 coverage loss는 0.23%다.
분포 차이는 total variation 기준 4.31%이며,
유효 샘플 수는 약 9,788명으로 10K cohort의 weight 효율은 97.88%다.
```

따라서 현재 fixed 10K cohort는 simulation용 대표 cohort로 사용할 수 있으며, Dashboard에서는 `population_weight_coverage`, `coverage_loss`, `distribution_loss_total_variation`, missing/under/overcovered segments를 통해 축소 손실과 대표성을 설명할 수 있다.
