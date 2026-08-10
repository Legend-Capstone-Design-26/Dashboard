# Feature definitions

All 19 features are recomputed only from `events.jsonl`; session metadata is joined only for split stratification and evaluation.

- `session_duration_ms`: last ordered `ts` minus first ordered `ts`.
- event/count features: exact matching event names (`page_view`, `click`, `search`, `filter_change`, `add_to_cart`, `remove_from_cart`, `payment_attempt`, `error`).
- `depth`: operationally defined as the number of unique non-empty paths in a session. It is not URL hierarchy depth or funnel stage. It is treated as a count and receives `log1p` then train-fitted scaling.
- `unique_page_ratio`: unique path count / non-empty path event count.
- `revisit_rate`: repeated path occurrences / non-empty path event count.
- `backtrack_count`: conservative absolute count of `A→B→A` path transitions; no referrer inference is used.
- `loop_rate`: the same `A→B→A` signal as a rate, divided by `(path count - 2)`, or zero for fewer than three paths.
- `product_detail_count` and `review_view_count`: `page_view` events whose paths start with `/product` and `/review`. This avoids counting interactions or dwell events as separate visits.
- `checkout_entered`: any `checkout_start` event or `/checkout` path.
- `purchase_completed`: any `checkout_complete` event or `/order-complete` path.

`persona_id`, `ground_truth_label`, difficulty, source, and other generation metadata never enter the feature matrix.
