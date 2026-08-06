"""Feature names and source-of-truth subsets from the experiment plan."""
from typing import Final

FEATURES: Final[tuple[str, ...]] = (
    "session_duration_ms", "event_count", "page_view_count", "click_count",
    "depth", "unique_page_ratio", "revisit_rate", "backtrack_count", "loop_rate",
    "search_count", "filter_count", "product_detail_count", "review_view_count",
    "cart_add_count", "cart_remove_count", "checkout_entered", "payment_attempt_count",
    "purchase_completed", "error_count",
)
PATH: Final[tuple[str, ...]] = FEATURES[4:9]
COMPARE: Final[tuple[str, ...]] = FEATURES[9:13]
FUNNEL: Final[tuple[str, ...]] = FEATURES[13:18]
FEATURE_SETS: Final[dict[str, tuple[str, ...]]] = {
    "F0": FEATURES,
    "F2": PATH,
    "F3": COMPARE,
    "F4": FUNNEL,
    "F6": PATH + COMPARE,
    "F7": COMPARE + FUNNEL,
    "F11": PATH + COMPARE + FUNNEL,
    "F13": FEATURES[:13] + FEATURES[18:],
    "F15": FEATURES[:4] + COMPARE + FUNNEL + FEATURES[18:],
}
COUNT_DURATION: Final[frozenset[str]] = frozenset((
    "session_duration_ms", "event_count", "page_view_count", "click_count",
    "depth", "backtrack_count", "search_count", "filter_count", "product_detail_count",
    "review_view_count", "cart_add_count", "cart_remove_count", "payment_attempt_count", "error_count",
))
RATIOS: Final[frozenset[str]] = frozenset(("unique_page_ratio", "revisit_rate", "loop_rate"))
BINARY: Final[frozenset[str]] = frozenset(("checkout_entered", "purchase_completed"))
