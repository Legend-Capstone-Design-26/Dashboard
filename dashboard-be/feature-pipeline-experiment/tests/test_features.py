from __future__ import annotations

import math
import sys
from pathlib import Path


MODULE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE_DIR))

from extract_features import FEATURE_COLUMNS, compute_features  # noqa: E402


def event(ts: int, event_name: str, path: str) -> dict[str, int | str]:
    return {"session_id": "s1", "ts": ts, "event_name": event_name, "path": path}


def test_compute_features_uses_final_navigation_semantics() -> None:
    # Given: page views with repeated routes, one empty path, non-page-view paths, hub returns, and A-B-A loops.
    events = [
        event(1, "page_view", "/"),
        event(2, "click", "/product/ignored"),
        event(3, "page_view", "/product/sku-1"),
        event(4, "page_view", "/"),
        event(5, "page_view", "/category/shoes"),
        event(6, "page_view", "/product/sku-2"),
        event(7, "page_view", "/category/shoes"),
        event(8, "page_view", "/search?q=boots"),
        event(9, "page_view", "/review/sku-2"),
        event(10, "page_view", "/search?q=boots"),
        event(11, "page_view", "/cart"),
        event(12, "page_view", "/checkout"),
        event(13, "page_view", "/order-complete"),
        event(14, "page_view", "/category/done"),
        event(15, "page_view", ""),
        event(16, "search", "/search?q=ignored"),
        event(17, "filter_change", "/category/ignored"),
        event(18, "add_to_cart", "/cart"),
        event(19, "remove_from_cart", "/cart"),
        event(20, "checkout_start", "/checkout"),
        event(21, "payment_attempt", "/checkout"),
        event(22, "checkout_complete", "/order-complete"),
        event(23, "error", "/checkout"),
    ]

    # When: features are extracted from the raw events.
    row = compute_features(events)

    # Then: every declared feature is present, finite, and follows the final path contract.
    assert list(row) == FEATURE_COLUMNS
    assert len(row) == 19
    assert all(math.isfinite(value) for value in row.values())
    assert row["session_duration_ms"] == 22
    assert row["event_count"] == 23
    assert row["page_view_count"] == 14
    assert row["click_count"] == 1
    assert row["depth"] == 10
    assert row["depth"] != row["page_view_count"]
    assert row["unique_page_ratio"] == 10 / 14
    assert row["revisit_rate"] == 4 / 14
    assert row["backtrack_count"] == 4
    assert row["loop_rate"] == 3 / 11
    assert row["search_count"] == 1
    assert row["filter_count"] == 1
    assert row["product_detail_count"] == 2
    assert row["review_view_count"] == 1
    assert row["cart_add_count"] == 1
    assert row["cart_remove_count"] == 1
    assert row["checkout_entered"] == 1
    assert row["payment_attempt_count"] == 1
    assert row["purchase_completed"] == 1
    assert row["error_count"] == 1
