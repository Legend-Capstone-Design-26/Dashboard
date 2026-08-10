# Feature 정의 확정본

계획서 4장의 19개 feature 를 `events.jsonl` 에서 계산하는 규칙이다.
**3대 컴퓨터가 반드시 같은 규칙을 써야 결과를 비교할 수 있다.** 구현은 `extract_features.py`.

## 이벤트 어휘

`merged-7500` 데이터셋의 `event_name` 은 아래 11종이다.

`page_view`, `click`, `dwell_time`, `search`, `filter_change`,
`add_to_cart`, `remove_from_cart`, `checkout_start`, `payment_attempt`,
`checkout_complete`, `error`

## 19개 feature

| id | 이름 | 계산 규칙 |
|---|---|---|
| f1 | `session_duration_ms` | `max(ts) - min(ts)` |
| f2 | `event_count` | 세션의 전체 이벤트 수 |
| f3 | `page_view_count` | `page_view` 이벤트 수 |
| f4 | `click_count` | `click` 이벤트 수 |
| f5 | `depth` | 비어 있지 않은 고유 `page_view` 경로 수 |
| f6 | `unique_page_ratio` | `depth / page_view_count` |
| f7 | `revisit_rate` | `(page_view_count - depth) / page_view_count` |
| f8 | `backtrack_count` | detail/funnel 경로에서 navigation hub 로 돌아간 `page_view` 전이 수 |
| f9 | `loop_rate` | `page_view` 경로에서 `path[i] == path[i-2]` 인 i 의 수 / `(비어 있지 않은 page_view 경로 수 - 2)` |
| f10 | `search_count` | `search` 이벤트 수 |
| f11 | `filter_count` | `filter_change` 이벤트 수 |
| f12 | `product_detail_count` | `path` 가 `/product/` 로 시작하는 `page_view` 수 |
| f13 | `review_view_count` | `path` 가 `/review/` 로 시작하는 `page_view` 수 |
| f14 | `cart_add_count` | `add_to_cart` 이벤트 수 |
| f15 | `cart_remove_count` | `remove_from_cart` 이벤트 수 |
| f16 | `checkout_entered` | `checkout_start` 가 1건이라도 있으면 1 |
| f17 | `payment_attempt_count` | `payment_attempt` 이벤트 수 |
| f18 | `purchase_completed` | `checkout_complete` 가 1건이라도 있으면 1 |
| f19 | `error_count` | `error` 이벤트 수 |

## 계획서에 명시되지 않아 여기서 확정한 항목

계획서에 코드 수준 정의가 없어 임의 해석이 가능했던 부분이다. 팀에서 다르게 정하면 이 문서와
`extract_features.py` 를 함께 고쳐야 한다.

### f8 `backtrack_count`

계획서 표현은 "이전 페이지나 목록으로 되돌아간 횟수"다. URL segment 깊이로 계산하면
`/product/x -> /category/y` 같은 실제 목록 복귀와 `/category/x -> /` 같은 단순 hub 이동을
구분하지 못하므로 쓰지 않는다. 대신 **detail/funnel 경로에서 navigation hub 로 돌아간
`page_view` 전이**로 정의한다. `click`, `search`, `filter_change` 같은 비-`page_view` 이벤트의
`path` 는 navigation 계산에 넣지 않는다.

- 출발 detail/funnel: `/product...`, `/review...`, `/cart...`, `/checkout...`, `/order-complete...`
- 도착 navigation hub: `/`, `/category...`, `/search...`
- `/product/grocery_4102` -> `/category/grocery` : backtrack
- `/review/grocery_4102` -> `/search?q=grocery` : backtrack
- `/category/grocery` -> `/` : backtrack 아님
- `/product/a` -> `/product/b` : backtrack 아님

### f5 `depth`, f6 `unique_page_ratio`, f7 `revisit_rate`

`depth` 는 세션이 방문한 고유 `page_view` 경로의 수다. `page_view_count`(f3)는 전체
`page_view` 이벤트 수이므로 반복 방문이 있으면 두 값은 달라진다. 빈 `path` 는 depth 에 넣지
않지만 f3에는 남긴다.

f6/f7 은 같은 두 원천값인 `depth` 와 `page_view_count` 에서 파생된다. 따라서
`page_view_count > 0` 인 세션에서는 `f7 = 1 - f6` 로 완전 종속이다. 계획서가 둘 다 요구하므로
둘 다 유지하되, F2 / F6 / F11 에서 중복 차원이라는 점을 결과 해석 시 감안한다.

### f9 `loop_rate`

`loop_rate` 는 f8과 독립적으로 `page_view` 경로 시퀀스에서 `A -> B -> A` 패턴을 센다.
detail/funnel 에서 hub 로 돌아간 전이가 f8에 잡히더라도 같은 3개 경로가 A-B-A라면 f9에도
반영된다. 비어 있는 `path` 는 루프 분모와 분자에서 제외한다.

### f12 `product_detail_count`, f13 `review_view_count`

전용 이벤트가 없어 `page_view` 의 `path` prefix 로 파생한다.
`merged-7500` 기준 `/product/` 15,018건(7,498세션), `/review/` 6,933건(3,246세션)으로 신호는 충분하다.

**이 규칙은 F0, F3, F6, F7, F11, F13, F15 에 모두 영향을 준다. 즉 3대 컴퓨터 전부 해당된다.**

### f5 `depth` 의 전처리 분류

계획서 6.1 count 목록에 `depth` 가 빠져 있으나 count 계열이므로 `log1p` + scaling 을 적용했다.
