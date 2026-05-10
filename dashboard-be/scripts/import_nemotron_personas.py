from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from datasets import load_dataset


ROOT = Path(__file__).resolve().parents[1]
PERSONAS_DIR = ROOT / "personas"
OUTPUT_PATH = PERSONAS_DIR / "catalog.generated.json"


@dataclass
class GroupTemplate:
    style: str
    timeline: List[Dict[str, Any]]
    goals: List[str]


@dataclass
class StateModelTemplate:
    entry_state: str
    max_steps: int
    terminal_states: List[str]
    states: Dict[str, Dict[str, Any]]
    experiment_overlays: Dict[str, Dict[str, Dict[str, Dict[str, float]]]]


STYLE_TEMPLATES: Dict[str, GroupTemplate] = {
    "price_sensitive": GroupTemplate(
        style="price_sensitive",
        goals=["할인 여부와 배송비를 비교해 가장 부담 없는 상품 찾기"],
        timeline=[
            {"after_ms": 0, "event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
            {"after_ms": 1200, "event_name": "click", "path": "/detail", "props": {"element_id": "price_toggle"}},
            {"after_ms": 800, "event_name": "click", "path": "/detail", "props": {"element_id": "coupon_open"}},
            {"after_ms": 1400, "event_name": "click", "path": "/detail", "props": {"element_id": "shipping_fee_info"}},
            {"after_ms": 9000, "event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 18000, "reason": "pagehide"}},
        ],
    ),
    "review_oriented": GroupTemplate(
        style="review_oriented",
        goals=["후기와 평점을 충분히 확인한 뒤 신뢰할 수 있는 상품 고르기"],
        timeline=[
            {"after_ms": 0, "event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
            {"after_ms": 1000, "event_name": "click", "path": "/detail", "props": {"element_id": "review_tab"}},
            {"after_ms": 1200, "event_name": "scroll_depth", "path": "/detail", "props": {"depth": 65}},
            {"after_ms": 2200, "event_name": "click", "path": "/detail", "props": {"element_id": "review_sort_helpful"}},
            {"after_ms": 12000, "event_name": "add_to_cart", "path": "/detail", "props": {"source": "review_confidence"}},
            {"after_ms": 1800, "event_name": "checkout_start", "path": "/checkout", "props": {"source": "product_detail"}},
            {"after_ms": 4000, "event_name": "dwell_time", "path": "/checkout", "props": {"dwell_ms": 10000, "reason": "pagehide"}},
        ],
    ),
    "impulsive": GroupTemplate(
        style="impulsive",
        goals=["마음에 드는 상품을 빠르게 골라 바로 구매하기"],
        timeline=[
            {"after_ms": 0, "event_name": "page_view", "path": "/", "props": {"title": "Home"}},
            {"after_ms": 900, "event_name": "click", "path": "/", "props": {"element_id": "hero_cta"}},
            {"after_ms": 1200, "event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
            {"after_ms": 1500, "event_name": "add_to_cart", "path": "/detail", "props": {"source": "buy_now"}},
            {"after_ms": 900, "event_name": "checkout_start", "path": "/checkout", "props": {"source": "buy_now"}},
            {"after_ms": 1000, "event_name": "payment_attempt", "path": "/checkout", "props": {"method": "easy_pay"}},
            {"after_ms": 900, "event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "impulse_purchase"}},
        ],
    ),
    "comparison": GroupTemplate(
        style="comparison",
        goals=["여러 상품을 비교해 가장 합리적인 선택지를 찾기"],
        timeline=[
            {"after_ms": 0, "event_name": "page_view", "path": "/search", "props": {"title": "Search"}},
            {"after_ms": 1800, "event_name": "search", "path": "/search", "props": {"query": "best seller"}},
            {"after_ms": 2400, "event_name": "page_view", "path": "/category", "props": {"title": "Collection"}},
            {"after_ms": 1600, "event_name": "filter_change", "path": "/category", "props": {"filter": "sort_by_rating"}},
            {"after_ms": 1800, "event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
            {"after_ms": 1400, "event_name": "click", "path": "/detail", "props": {"element_id": "compare_products"}},
            {"after_ms": 9000, "event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 22000, "reason": "pagehide"}},
        ],
    ),
    "brand_loyal": GroupTemplate(
        style="brand_loyal",
        goals=["익숙하고 신뢰하는 브랜드 상품을 반복 구매하기"],
        timeline=[
            {"after_ms": 0, "event_name": "page_view", "path": "/", "props": {"title": "Home"}},
            {"after_ms": 1100, "event_name": "click", "path": "/", "props": {"element_id": "brand_story"}},
            {"after_ms": 1800, "event_name": "page_view", "path": "/detail", "props": {"title": "Brand Product Detail"}},
            {"after_ms": 1400, "event_name": "add_to_cart", "path": "/detail", "props": {"source": "brand_trust"}},
            {"after_ms": 1800, "event_name": "checkout_start", "path": "/checkout", "props": {"source": "brand_trust"}},
            {"after_ms": 1200, "event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "brand_trust"}},
        ],
    ),
    "fast_decision": GroupTemplate(
        style="fast_decision",
        goals=["고민을 줄이고 빠르게 구매를 완료하기"],
        timeline=[
            {"after_ms": 0, "event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
            {"after_ms": 900, "event_name": "add_to_cart", "path": "/detail", "props": {"source": "quick_decision"}},
            {"after_ms": 800, "event_name": "checkout_start", "path": "/checkout", "props": {"source": "quick_decision"}},
            {"after_ms": 900, "event_name": "payment_attempt", "path": "/checkout", "props": {"method": "saved_card"}},
            {"after_ms": 1000, "event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "quick_decision"}},
        ],
    ),
    "shipping_sensitive": GroupTemplate(
        style="shipping_sensitive",
        goals=["배송비와 배송 조건이 유리한 상품을 찾기"],
        timeline=[
            {"after_ms": 0, "event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
            {"after_ms": 1000, "event_name": "click", "path": "/detail", "props": {"element_id": "shipping_fee_info"}},
            {"after_ms": 1200, "event_name": "click", "path": "/detail", "props": {"element_id": "delivery_policy"}},
            {"after_ms": 1800, "event_name": "click", "path": "/detail", "props": {"element_id": "free_shipping_threshold"}},
            {"after_ms": 9000, "event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 18000, "reason": "pagehide"}},
        ],
    ),
}


STATE_MODEL_TEMPLATES: Dict[str, StateModelTemplate] = {
    "price_sensitive": StateModelTemplate(
        entry_state="detail_view",
        max_steps=8,
        terminal_states=["exit", "checkout_complete"],
        states={
            "detail_view": {
                "emit": {"event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
                "after_ms": {"type": "fixed", "value": 0},
                "transitions": [
                    {"to": "price_check", "weight": 0.45},
                    {"to": "shipping_check", "weight": 0.3},
                    {"to": "review_check", "weight": 0.15},
                    {"to": "exit", "weight": 0.1},
                ],
            },
            "price_check": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "price_toggle"}},
                "after_ms": {"type": "range", "min": 700, "max": 1500},
                "transitions": [
                    {"to": "coupon_check", "weight": 0.4},
                    {"to": "shipping_check", "weight": 0.4},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "coupon_check": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "coupon_open"}},
                "after_ms": {"type": "range", "min": 600, "max": 1200},
                "transitions": [
                    {"to": "shipping_check", "weight": 0.5},
                    {"to": "cart_entry", "weight": 0.25},
                    {"to": "exit", "weight": 0.25},
                ],
            },
            "shipping_check": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "shipping_fee_info"}},
                "after_ms": {"type": "range", "min": 900, "max": 1800},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.35},
                    {"to": "exit", "weight": 0.65},
                ],
            },
            "review_check": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "review_tab"}},
                "after_ms": {"type": "range", "min": 900, "max": 2000},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.4},
                    {"to": "exit", "weight": 0.6},
                ],
            },
            "cart_entry": {
                "emit": {"event_name": "add_to_cart", "path": "/detail", "props": {"source": "price_sensitive"}},
                "after_ms": {"type": "range", "min": 700, "max": 1500},
                "transitions": [
                    {"to": "checkout_entry", "weight": 0.35},
                    {"to": "exit", "weight": 0.65},
                ],
            },
            "checkout_entry": {
                "emit": {"event_name": "checkout_start", "path": "/checkout", "props": {"source": "price_sensitive"}},
                "after_ms": {"type": "range", "min": 800, "max": 1800},
                "transitions": [
                    {"to": "exit", "weight": 0.7},
                    {"to": "checkout_complete", "weight": 0.3},
                ],
            },
            "checkout_complete": {
                "emit": {"event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "price_sensitive"}},
                "after_ms": {"type": "range", "min": 600, "max": 1400},
                "transitions": [],
            },
            "exit": {
                "emit": {"event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 18000, "reason": "pagehide"}},
                "after_ms": {"type": "range", "min": 1500, "max": 4000},
                "transitions": [],
            },
        },
        experiment_overlays={
            "__default__": {
                "B": {
                    "edge_weight_multipliers": {
                        "shipping_check->cart_entry": 1.35,
                        "shipping_check->exit": 0.8,
                        "cart_entry->checkout_entry": 1.15,
                    }
                }
            }
        },
    ),
    "review_oriented": StateModelTemplate(
        entry_state="detail_view",
        max_steps=8,
        terminal_states=["exit", "checkout_complete"],
        states={
            "detail_view": {
                "emit": {"event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
                "after_ms": {"type": "fixed", "value": 0},
                "transitions": [
                    {"to": "review_tab", "weight": 0.7},
                    {"to": "spec_check", "weight": 0.2},
                    {"to": "exit", "weight": 0.1},
                ],
            },
            "review_tab": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "review_tab"}},
                "after_ms": {"type": "range", "min": 700, "max": 1500},
                "transitions": [
                    {"to": "review_sort", "weight": 0.55},
                    {"to": "trust_check", "weight": 0.25},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "review_sort": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "review_sort_helpful"}},
                "after_ms": {"type": "range", "min": 900, "max": 2000},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.45},
                    {"to": "trust_check", "weight": 0.35},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "spec_check": {
                "emit": {"event_name": "scroll_depth", "path": "/detail", "props": {"depth": 65}},
                "after_ms": {"type": "range", "min": 800, "max": 1800},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.35},
                    {"to": "exit", "weight": 0.65},
                ],
            },
            "trust_check": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "trust_badge"}},
                "after_ms": {"type": "range", "min": 600, "max": 1200},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.45},
                    {"to": "exit", "weight": 0.55},
                ],
            },
            "cart_entry": {
                "emit": {"event_name": "add_to_cart", "path": "/detail", "props": {"source": "review_confidence"}},
                "after_ms": {"type": "range", "min": 900, "max": 1800},
                "transitions": [
                    {"to": "checkout_entry", "weight": 0.5},
                    {"to": "exit", "weight": 0.5},
                ],
            },
            "checkout_entry": {
                "emit": {"event_name": "checkout_start", "path": "/checkout", "props": {"source": "review_confidence"}},
                "after_ms": {"type": "range", "min": 1000, "max": 2200},
                "transitions": [
                    {"to": "checkout_complete", "weight": 0.35},
                    {"to": "exit", "weight": 0.65},
                ],
            },
            "checkout_complete": {
                "emit": {"event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "review_confidence"}},
                "after_ms": {"type": "range", "min": 800, "max": 1600},
                "transitions": [],
            },
            "exit": {
                "emit": {"event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 15000, "reason": "pagehide"}},
                "after_ms": {"type": "range", "min": 1200, "max": 3500},
                "transitions": [],
            },
        },
        experiment_overlays={
            "__default__": {
                "B": {
                    "edge_weight_multipliers": {
                        "review_sort->cart_entry": 1.35,
                        "trust_check->cart_entry": 1.3,
                        "checkout_entry->checkout_complete": 1.2,
                    }
                }
            }
        },
    ),
    "impulsive": StateModelTemplate(
        entry_state="landing",
        max_steps=7,
        terminal_states=["exit", "checkout_complete"],
        states={
            "landing": {
                "emit": {"event_name": "page_view", "path": "/", "props": {"title": "Home"}},
                "after_ms": {"type": "fixed", "value": 0},
                "transitions": [
                    {"to": "cta_click", "weight": 0.65},
                    {"to": "detail_view", "weight": 0.2},
                    {"to": "exit", "weight": 0.15},
                ],
            },
            "cta_click": {
                "emit": {"event_name": "click", "path": "/", "props": {"element_id": "hero_cta"}},
                "after_ms": {"type": "range", "min": 400, "max": 900},
                "transitions": [
                    {"to": "detail_view", "weight": 0.8},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "detail_view": {
                "emit": {"event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
                "after_ms": {"type": "range", "min": 700, "max": 1300},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.6},
                    {"to": "exit", "weight": 0.4},
                ],
            },
            "cart_entry": {
                "emit": {"event_name": "add_to_cart", "path": "/detail", "props": {"source": "buy_now"}},
                "after_ms": {"type": "range", "min": 400, "max": 900},
                "transitions": [
                    {"to": "checkout_entry", "weight": 0.7},
                    {"to": "exit", "weight": 0.3},
                ],
            },
            "checkout_entry": {
                "emit": {"event_name": "checkout_start", "path": "/checkout", "props": {"source": "buy_now"}},
                "after_ms": {"type": "range", "min": 500, "max": 1100},
                "transitions": [
                    {"to": "payment_attempt", "weight": 0.8},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "payment_attempt": {
                "emit": {"event_name": "payment_attempt", "path": "/checkout", "props": {"method": "easy_pay"}},
                "after_ms": {"type": "range", "min": 500, "max": 1000},
                "transitions": [
                    {"to": "checkout_complete", "weight": 0.8},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "checkout_complete": {
                "emit": {"event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "impulse_purchase"}},
                "after_ms": {"type": "range", "min": 300, "max": 900},
                "transitions": [],
            },
            "exit": {
                "emit": {"event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 9000, "reason": "pagehide"}},
                "after_ms": {"type": "range", "min": 800, "max": 1800},
                "transitions": [],
            },
        },
        experiment_overlays={
            "__default__": {
                "B": {
                    "edge_weight_multipliers": {
                        "landing->cta_click": 1.2,
                        "detail_view->cart_entry": 1.3,
                        "payment_attempt->checkout_complete": 1.2,
                    }
                }
            }
        },
    ),
    "comparison": StateModelTemplate(
        entry_state="search_entry",
        max_steps=8,
        terminal_states=["exit", "checkout_complete"],
        states={
            "search_entry": {
                "emit": {"event_name": "page_view", "path": "/search", "props": {"title": "Search"}},
                "after_ms": {"type": "fixed", "value": 0},
                "transitions": [
                    {"to": "search_query", "weight": 0.7},
                    {"to": "exit", "weight": 0.3},
                ],
            },
            "search_query": {
                "emit": {"event_name": "search", "path": "/search", "props": {"query": "best seller"}},
                "after_ms": {"type": "range", "min": 1000, "max": 1800},
                "transitions": [
                    {"to": "listing_view", "weight": 0.85},
                    {"to": "exit", "weight": 0.15},
                ],
            },
            "listing_view": {
                "emit": {"event_name": "page_view", "path": "/category", "props": {"title": "Collection"}},
                "after_ms": {"type": "range", "min": 1000, "max": 2000},
                "transitions": [
                    {"to": "filter_apply", "weight": 0.55},
                    {"to": "detail_view", "weight": 0.3},
                    {"to": "exit", "weight": 0.15},
                ],
            },
            "filter_apply": {
                "emit": {"event_name": "filter_change", "path": "/category", "props": {"filter": "sort_by_rating"}},
                "after_ms": {"type": "range", "min": 900, "max": 1700},
                "transitions": [
                    {"to": "detail_view", "weight": 0.7},
                    {"to": "exit", "weight": 0.3},
                ],
            },
            "detail_view": {
                "emit": {"event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
                "after_ms": {"type": "range", "min": 1200, "max": 2200},
                "transitions": [
                    {"to": "compare_click", "weight": 0.45},
                    {"to": "cart_entry", "weight": 0.25},
                    {"to": "exit", "weight": 0.3},
                ],
            },
            "compare_click": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "compare_products"}},
                "after_ms": {"type": "range", "min": 900, "max": 1800},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.35},
                    {"to": "exit", "weight": 0.65},
                ],
            },
            "cart_entry": {
                "emit": {"event_name": "add_to_cart", "path": "/detail", "props": {"source": "comparison"}},
                "after_ms": {"type": "range", "min": 800, "max": 1500},
                "transitions": [
                    {"to": "checkout_entry", "weight": 0.4},
                    {"to": "exit", "weight": 0.6},
                ],
            },
            "checkout_entry": {
                "emit": {"event_name": "checkout_start", "path": "/checkout", "props": {"source": "comparison"}},
                "after_ms": {"type": "range", "min": 1200, "max": 2000},
                "transitions": [
                    {"to": "checkout_complete", "weight": 0.25},
                    {"to": "exit", "weight": 0.75},
                ],
            },
            "checkout_complete": {
                "emit": {"event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "comparison"}},
                "after_ms": {"type": "range", "min": 700, "max": 1500},
                "transitions": [],
            },
            "exit": {
                "emit": {"event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 22000, "reason": "pagehide"}},
                "after_ms": {"type": "range", "min": 1300, "max": 3200},
                "transitions": [],
            },
        },
        experiment_overlays={
            "__default__": {
                "B": {
                    "edge_weight_multipliers": {
                        "detail_view->cart_entry": 1.2,
                        "compare_click->cart_entry": 1.25,
                    }
                }
            }
        },
    ),
    "brand_loyal": StateModelTemplate(
        entry_state="landing",
        max_steps=7,
        terminal_states=["exit", "checkout_complete"],
        states={
            "landing": {
                "emit": {"event_name": "page_view", "path": "/", "props": {"title": "Home"}},
                "after_ms": {"type": "fixed", "value": 0},
                "transitions": [
                    {"to": "brand_story", "weight": 0.65},
                    {"to": "detail_view", "weight": 0.2},
                    {"to": "exit", "weight": 0.15},
                ],
            },
            "brand_story": {
                "emit": {"event_name": "click", "path": "/", "props": {"element_id": "brand_story"}},
                "after_ms": {"type": "range", "min": 700, "max": 1400},
                "transitions": [
                    {"to": "detail_view", "weight": 0.8},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "detail_view": {
                "emit": {"event_name": "page_view", "path": "/detail", "props": {"title": "Brand Product Detail"}},
                "after_ms": {"type": "range", "min": 900, "max": 1600},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.65},
                    {"to": "exit", "weight": 0.35},
                ],
            },
            "cart_entry": {
                "emit": {"event_name": "add_to_cart", "path": "/detail", "props": {"source": "brand_trust"}},
                "after_ms": {"type": "range", "min": 700, "max": 1200},
                "transitions": [
                    {"to": "checkout_entry", "weight": 0.7},
                    {"to": "exit", "weight": 0.3},
                ],
            },
            "checkout_entry": {
                "emit": {"event_name": "checkout_start", "path": "/checkout", "props": {"source": "brand_trust"}},
                "after_ms": {"type": "range", "min": 700, "max": 1400},
                "transitions": [
                    {"to": "checkout_complete", "weight": 0.6},
                    {"to": "exit", "weight": 0.4},
                ],
            },
            "checkout_complete": {
                "emit": {"event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "brand_trust"}},
                "after_ms": {"type": "range", "min": 500, "max": 1000},
                "transitions": [],
            },
            "exit": {
                "emit": {"event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 12000, "reason": "pagehide"}},
                "after_ms": {"type": "range", "min": 1000, "max": 2500},
                "transitions": [],
            },
        },
        experiment_overlays={
            "__default__": {
                "B": {
                    "edge_weight_multipliers": {
                        "detail_view->cart_entry": 1.15,
                        "checkout_entry->checkout_complete": 1.15,
                    }
                }
            }
        },
    ),
    "fast_decision": StateModelTemplate(
        entry_state="detail_view",
        max_steps=6,
        terminal_states=["exit", "checkout_complete"],
        states={
            "detail_view": {
                "emit": {"event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
                "after_ms": {"type": "fixed", "value": 0},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.7},
                    {"to": "exit", "weight": 0.3},
                ],
            },
            "cart_entry": {
                "emit": {"event_name": "add_to_cart", "path": "/detail", "props": {"source": "quick_decision"}},
                "after_ms": {"type": "range", "min": 400, "max": 900},
                "transitions": [
                    {"to": "checkout_entry", "weight": 0.75},
                    {"to": "exit", "weight": 0.25},
                ],
            },
            "checkout_entry": {
                "emit": {"event_name": "checkout_start", "path": "/checkout", "props": {"source": "quick_decision"}},
                "after_ms": {"type": "range", "min": 500, "max": 1000},
                "transitions": [
                    {"to": "payment_attempt", "weight": 0.8},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "payment_attempt": {
                "emit": {"event_name": "payment_attempt", "path": "/checkout", "props": {"method": "saved_card"}},
                "after_ms": {"type": "range", "min": 500, "max": 900},
                "transitions": [
                    {"to": "checkout_complete", "weight": 0.75},
                    {"to": "exit", "weight": 0.25},
                ],
            },
            "checkout_complete": {
                "emit": {"event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "quick_decision"}},
                "after_ms": {"type": "range", "min": 400, "max": 800},
                "transitions": [],
            },
            "exit": {
                "emit": {"event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 9000, "reason": "pagehide"}},
                "after_ms": {"type": "range", "min": 800, "max": 1800},
                "transitions": [],
            },
        },
        experiment_overlays={
            "__default__": {
                "B": {
                    "edge_weight_multipliers": {
                        "detail_view->cart_entry": 1.1,
                        "checkout_entry->payment_attempt": 1.1,
                        "payment_attempt->checkout_complete": 1.15,
                    }
                }
            }
        },
    ),
    "shipping_sensitive": StateModelTemplate(
        entry_state="detail_view",
        max_steps=7,
        terminal_states=["exit", "checkout_complete"],
        states={
            "detail_view": {
                "emit": {"event_name": "page_view", "path": "/detail", "props": {"title": "Product Detail"}},
                "after_ms": {"type": "fixed", "value": 0},
                "transitions": [
                    {"to": "shipping_info", "weight": 0.6},
                    {"to": "delivery_policy", "weight": 0.25},
                    {"to": "exit", "weight": 0.15},
                ],
            },
            "shipping_info": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "shipping_fee_info"}},
                "after_ms": {"type": "range", "min": 800, "max": 1500},
                "transitions": [
                    {"to": "delivery_policy", "weight": 0.5},
                    {"to": "threshold_check", "weight": 0.3},
                    {"to": "exit", "weight": 0.2},
                ],
            },
            "delivery_policy": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "delivery_policy"}},
                "after_ms": {"type": "range", "min": 900, "max": 1800},
                "transitions": [
                    {"to": "threshold_check", "weight": 0.55},
                    {"to": "exit", "weight": 0.45},
                ],
            },
            "threshold_check": {
                "emit": {"event_name": "click", "path": "/detail", "props": {"element_id": "free_shipping_threshold"}},
                "after_ms": {"type": "range", "min": 800, "max": 1500},
                "transitions": [
                    {"to": "cart_entry", "weight": 0.35},
                    {"to": "exit", "weight": 0.65},
                ],
            },
            "cart_entry": {
                "emit": {"event_name": "add_to_cart", "path": "/detail", "props": {"source": "shipping_sensitive"}},
                "after_ms": {"type": "range", "min": 700, "max": 1300},
                "transitions": [
                    {"to": "checkout_entry", "weight": 0.4},
                    {"to": "exit", "weight": 0.6},
                ],
            },
            "checkout_entry": {
                "emit": {"event_name": "checkout_start", "path": "/checkout", "props": {"source": "shipping_sensitive"}},
                "after_ms": {"type": "range", "min": 900, "max": 1700},
                "transitions": [
                    {"to": "checkout_complete", "weight": 0.25},
                    {"to": "exit", "weight": 0.75},
                ],
            },
            "checkout_complete": {
                "emit": {"event_name": "checkout_complete", "path": "/order-complete", "props": {"source": "shipping_sensitive"}},
                "after_ms": {"type": "range", "min": 600, "max": 1200},
                "transitions": [],
            },
            "exit": {
                "emit": {"event_name": "dwell_time", "path": "/detail", "props": {"dwell_ms": 18000, "reason": "pagehide"}},
                "after_ms": {"type": "range", "min": 1200, "max": 2800},
                "transitions": [],
            },
        },
        experiment_overlays={
            "__default__": {
                "B": {
                    "edge_weight_multipliers": {
                        "threshold_check->cart_entry": 1.3,
                        "threshold_check->exit": 0.85,
                    }
                }
            }
        },
    ),
}


AGE_GROUPS = [
    (29, "20s"),
    (39, "30s"),
    (49, "40s"),
    (59, "50s"),
]


def ascii_slug(value: str) -> str:
    cleaned = []
    for char in value.lower():
        if char.isalnum():
            cleaned.append(char)
        elif char in {" ", "-", "/", "_"}:
            cleaned.append("-")
    slug = "".join(cleaned).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "persona"


def listify(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if not isinstance(value, str):
        return []
    raw = value.strip()
    if not raw:
        return []
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    parts = [item.strip().strip("\"'") for item in raw.split(",")]
    return [item for item in parts if item]


def classify_age_group(age: Any) -> str:
    try:
        age_value = int(age)
    except (TypeError, ValueError):
        return "unknown"
    if age_value < 20:
        return "teens"
    for upper_bound, label in AGE_GROUPS:
        if age_value <= upper_bound:
            return label
    return "60plus"


def classify_occupation_group(occupation: str, age_group: str, education_level: str, family_type: str) -> str:
    text = occupation.lower()
    education = education_level.lower()
    family = family_type.lower()

    if "무직" in text or "구직" in text:
        if age_group == "60plus":
            return "retired"
        if age_group in {"teens", "20s"} and any(keyword in education for keyword in ["고등", "대학교", "대학", "전문"]):
            return "student"
        if any(keyword in family for keyword in ["자녀", "배우자", "한부모"]):
            return "caregiver"
        return "other"

    if any(keyword in text for keyword in ["학생", "대학생", "고등학생", "중학생"]):
        return "student"
    if any(keyword in text for keyword in ["사무", "회사", "행정", "office", "직원", "비서", "회계", "경리"]):
        return "office_worker"
    if any(keyword in text for keyword in ["전문", "교사", "의사", "간호", "엔지니어", "연구", "개발"]):
        return "professional"
    if any(keyword in text for keyword in ["자영", "사업", "경영자", "사장"]):
        return "self_employed"
    if any(keyword in text for keyword in ["서비스", "요식", "배달", "상담", "판매", "조리", "판매원", "서빙"]):
        return "service_worker"
    if any(keyword in text for keyword in ["주부", "가정", "육아"]):
        return "caregiver"
    if any(keyword in text for keyword in ["은퇴", "퇴직", "연금"]):
        return "retired"
    if any(keyword in text for keyword in ["일용", "노무", "현장", "생산", "운전", "하역", "적재", "운송", "경비", "청소", "지게차"]):
        return "laborer"
    return "other"


def dominant_style(signals: Dict[str, int]) -> str:
    style_map = {
        "price_sensitive": signals["price_sensitive"],
        "review_oriented": signals["review_oriented"],
        "impulsive": signals["impulsive"],
        "comparison": signals["comparison"],
        "brand_loyal": signals["brand_loyal"],
        "fast_decision": signals["fast_decision"],
        "shipping_sensitive": signals["shipping_sensitive"],
    }
    return max(style_map.items(), key=lambda item: (item[1], item[0]))[0]


def normalize_risk(signals: Dict[str, int]) -> str:
    if signals["impulsive"] + signals["fast_decision"] >= 3:
        return "high"
    if signals["review_oriented"] + signals["comparison"] >= 3:
        return "low"
    return "medium"


def normalize_level(score: int) -> str:
    if score >= 3:
        return "high"
    if score <= 1:
        return "low"
    return "medium"


def preferred_device(age_group: str, style: str) -> str:
    if age_group in {"teens", "20s", "30s"}:
        return "mobile"
    if style in {"price_sensitive", "impulsive", "shipping_sensitive"}:
        return "mobile"
    return "desktop"


def derive_signals(row: Dict[str, Any]) -> Dict[str, int]:
    text_parts = [
        str(row.get("persona") or ""),
        str(row.get("professional_persona") or ""),
        str(row.get("sports_persona") or ""),
        str(row.get("arts_persona") or ""),
        str(row.get("travel_persona") or ""),
        str(row.get("culinary_persona") or ""),
        str(row.get("family_persona") or ""),
        str(row.get("cultural_background") or ""),
        str(row.get("career_goals_and_ambitions") or ""),
        str(row.get("occupation") or ""),
    ]
    hobby_list = listify(row.get("hobbies_and_interests_list"))
    skill_list = listify(row.get("skills_and_expertise_list"))
    text = " ".join(text_parts + hobby_list + skill_list).lower()
    signals = Counter()

    keyword_map = {
        "price_sensitive": ["절약", "가성비", "할인", "쿠폰", "가격", "저렴", "비용"],
        "review_oriented": ["후기", "리뷰", "평판", "검증", "추천", "신뢰"],
        "impulsive": ["트렌드", "충동", "즉흥", "새로운", "빠르게", "바로"],
        "comparison": ["비교", "꼼꼼", "검토", "따져", "여러", "정보"],
        "brand_loyal": ["브랜드", "익숙", "단골", "애용", "충성"],
        "fast_decision": ["신속", "효율", "빠른", "시간 절약", "결정"],
        "shipping_sensitive": ["배송", "택배", "도착", "무료배송", "배송비"],
    }
    for signal, keywords in keyword_map.items():
      for keyword in keywords:
        if keyword in text:
          signals[signal] += 1

    return defaultdict(int, signals)


def derive_personality_traits(style: str, signals: Dict[str, int]) -> List[str]:
    traits = {
        "price_sensitive": ["budget-conscious", "value-seeking", "careful-spender"],
        "review_oriented": ["trust-seeking", "detail-oriented", "cautious"],
        "impulsive": ["trend-focused", "spontaneous", "emotion-driven"],
        "comparison": ["analytical", "patient", "comparison-driven"],
        "brand_loyal": ["loyal", "trust-driven", "habitual"],
        "fast_decision": ["efficient", "decisive", "low-friction"],
        "shipping_sensitive": ["logistics-aware", "threshold-conscious", "practical"],
    }.get(style, ["practical", "shopping-oriented"])
    if signals["review_oriented"] >= 2 and "detail-oriented" not in traits:
        traits.append("detail-oriented")
    return traits[:4]


def decision_rules(style: str) -> List[str]:
    return {
        "price_sensitive": [
            "Prioritize discounted items before standard-priced alternatives.",
            "Inspect shipping fee and coupon availability before purchase.",
        ],
        "review_oriented": [
            "Check ratings and reviews before adding to cart.",
            "Delay checkout if trust signals are weak.",
        ],
        "impulsive": [
            "React quickly to strong visual CTA and trend language.",
            "Buy sooner when friction is low and stock feels scarce.",
        ],
        "comparison": [
            "Browse multiple products before choosing one.",
            "Use filters or comparisons before checkout.",
        ],
        "brand_loyal": [
            "Prefer familiar brands even when alternatives are cheaper.",
            "Proceed to checkout when brand trust is confirmed.",
        ],
        "fast_decision": [
            "Minimize browsing steps and move to checkout quickly.",
            "Avoid deep comparison unless blocked by friction.",
        ],
        "shipping_sensitive": [
            "Check delivery thresholds and extra fees before purchase.",
            "Leave if shipping cost outweighs product value.",
        ],
    }.get(style, ["Browse, evaluate, and purchase in a consistent manner."])


def goal_templates(style: str, occupation_group: str) -> List[str]:
    role_hint = {
        "student": "학생 생활에 맞는 가성비 상품 찾기",
        "office_worker": "출퇴근과 일상에 바로 쓸 수 있는 상품 찾기",
        "professional": "품질과 신뢰도가 높은 상품 찾기",
        "self_employed": "업무 효율과 실용성이 높은 상품 찾기",
        "service_worker": "피로를 줄이고 편의를 높이는 상품 찾기",
        "caregiver": "가정 생활에 도움이 되는 실속형 상품 찾기",
        "retired": "안심하고 오래 쓸 수 있는 상품 찾기",
        "laborer": "튼튼하고 실용적인 상품 찾기",
        "other": "일상에 맞는 적절한 상품 찾기",
    }.get(occupation_group, "일상에 맞는 적절한 상품 찾기")
    style_hint = STYLE_TEMPLATES[style].goals[0]
    return [role_hint, style_hint]


def derive_shopping_style(style: str) -> str:
    return {
        "price_sensitive": "price-sensitive",
        "review_oriented": "review-oriented",
        "impulsive": "impulsive trend shopper",
        "comparison": "cautious comparison shopper",
        "brand_loyal": "brand-loyal premium shopper",
        "fast_decision": "fast decision buyer",
        "shipping_sensitive": "shipping-cost-sensitive shopper",
    }.get(style, "general shopper")


def derive_name(age_group: str, occupation_group: str, style: str) -> str:
    parts = [age_group, occupation_group, style]
    return " · ".join(part.replace("_", " ") for part in parts)


def normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    age_group = classify_age_group(row.get("age"))
    occupation = str(row.get("occupation") or "unknown").strip()
    education_level = str(row.get("education_level") or "").strip()
    family_type = str(row.get("family_type") or "").strip()
    occupation_group = classify_occupation_group(occupation, age_group, education_level, family_type)
    signals = derive_signals(row)
    style = dominant_style(signals)

    interests = listify(row.get("hobbies_and_interests_list"))[:5]
    if not interests:
        interests = listify(row.get("skills_and_expertise_list"))[:5]

    normalized = {
        "persona_id": str(row.get("uuid") or ""),
        "source_dataset": "nvidia/Nemotron-Personas-Korea",
        "name": derive_name(age_group, occupation_group, style),
        "age_group": age_group,
        "gender": str(row.get("sex") or "unknown"),
        "occupation": occupation,
        "occupation_group": occupation_group,
        "region": {
            "district": str(row.get("district") or ""),
            "province": str(row.get("province") or ""),
            "country": str(row.get("country") or ""),
        },
        "household_type": family_type,
        "housing_type": str(row.get("housing_type") or ""),
        "education_level": education_level,
        "shopping_style": derive_shopping_style(style),
        "style_key": style,
        "personality_traits": derive_personality_traits(style, signals),
        "decision_rules": decision_rules(style),
        "interests": interests,
        "risk_tolerance": normalize_risk(signals),
        "price_sensitivity": normalize_level(signals["price_sensitive"] + (1 if age_group in {"teens", "20s"} else 0)),
        "review_dependency": normalize_level(signals["review_oriented"] + signals["comparison"]),
        "impulse_buying_tendency": normalize_level(signals["impulsive"] + signals["fast_decision"]),
        "preferred_device": preferred_device(age_group, style),
        "shipping_sensitivity": normalize_level(signals["shipping_sensitive"]),
        "brand_loyalty": normalize_level(signals["brand_loyal"]),
        "trust_signal_preference": normalize_level(signals["review_oriented"] + signals["brand_loyal"]),
        "goal_templates": goal_templates(style, occupation_group),
        "source_excerpt": str(row.get("persona") or "")[:240],
    }
    return normalized


def group_key(normalized: Dict[str, Any]) -> str:
    return "__".join([
        normalized["age_group"],
        normalized["occupation_group"],
        normalized["style_key"],
    ])


def group_label(normalized: Dict[str, Any]) -> str:
    age_map = {
        "teens": "10대",
        "20s": "20대",
        "30s": "30대",
        "40s": "40대",
        "50s": "50대",
        "60plus": "60대+",
        "unknown": "연령 미상",
    }
    occupation_map = {
        "student": "학생",
        "office_worker": "직장인",
        "professional": "전문직",
        "self_employed": "자영업",
        "service_worker": "서비스직",
        "caregiver": "가족중심",
        "retired": "은퇴층",
        "laborer": "현장근로",
        "other": "일반 소비자",
    }
    style_map = {
        "price_sensitive": "가격민감형",
        "review_oriented": "리뷰의존형",
        "impulsive": "트렌드충동형",
        "comparison": "비교검토형",
        "brand_loyal": "브랜드충성형",
        "fast_decision": "빠른결정형",
        "shipping_sensitive": "배송민감형",
    }
    return f"{age_map.get(normalized['age_group'], normalized['age_group'])} {occupation_map.get(normalized['occupation_group'], normalized['occupation_group'])}·{style_map.get(normalized['style_key'], normalized['style_key'])}"


def choose_weight(count: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(count / total, 4)


def select_representative_groups(grouped: Dict[str, List[Dict[str, Any]]], target_groups: int) -> List[Any]:
    ranked_groups = sorted(grouped.items(), key=lambda item: len(item[1]), reverse=True)
    selected: List[Any] = []
    selected_keys = set()

    def add_best_by(predicate):
        best = None
        for key, items in ranked_groups:
            if key in selected_keys:
                continue
            representative = items[0]
            if not predicate(representative):
                continue
            if best is None or len(items) > len(best[1]):
                best = (key, items)
        if best is not None:
            key, items = best
            selected.append(best)
            selected_keys.add(key)

    age_groups = ["20s", "30s", "40s", "50s", "60plus"]
    style_keys = list(STYLE_TEMPLATES.keys())
    occupation_groups = ["student", "office_worker", "professional", "self_employed", "service_worker", "caregiver", "retired", "laborer"]

    for age_group in age_groups:
        add_best_by(lambda representative, age_group=age_group: representative["age_group"] == age_group)
    for style_key in style_keys:
        add_best_by(lambda representative, style_key=style_key: representative["style_key"] == style_key)
    for occupation_group in occupation_groups:
        add_best_by(lambda representative, occupation_group=occupation_group: representative["occupation_group"] == occupation_group)

    for item in ranked_groups:
        if len(selected) >= target_groups:
            break
        key, _ = item
        if key in selected_keys:
            continue
        selected.append(item)
        selected_keys.add(key)

    return selected[:target_groups]


def build_catalog(rows: Iterable[Dict[str, Any]], target_groups: int) -> Dict[str, Any]:
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        normalized = normalize_row(row)
        grouped[group_key(normalized)].append(normalized)

    ranked_groups = select_representative_groups(grouped, target_groups)
    total = sum(len(items) for _, items in ranked_groups)
    personas: List[Dict[str, Any]] = []
    groups: List[Dict[str, Any]] = []

    for key, items in ranked_groups:
        representative = items[0]
        label = group_label(representative)
        style = representative["style_key"]
        template = STYLE_TEMPLATES[style]
        state_model = STATE_MODEL_TEMPLATES[style]
        persona_id = ascii_slug(label)
        weight = choose_weight(len(items), total)
        persona = {
            "id": persona_id,
            "weight": weight,
            "description": label,
            "group_id": key,
            "group_label": label,
            "runner_type": "state_transition",
            "normalized_persona": representative,
            "goal_templates": representative["goal_templates"],
            "timeline": template.timeline,
            "state_model": {
                "entry_state": state_model.entry_state,
                "max_steps": state_model.max_steps,
                "terminal_states": state_model.terminal_states,
                "states": state_model.states,
                "experiment_overlays": state_model.experiment_overlays,
            },
        }
        personas.append(persona)
        groups.append({
            "group_id": key,
            "group_label": label,
            "count": len(items),
            "weight": weight,
            "style_key": style,
            "age_group": representative["age_group"],
            "occupation_group": representative["occupation_group"],
            "sample_persona_id": representative["persona_id"],
        })

    return {
        "version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_dataset": "nvidia/Nemotron-Personas-Korea",
        "defaults": {
            "app_id": "ux-stream-sim",
            "site_id": "ab-sample",
            "base_url": "http://localhost:3000/",
            "lang": "ko-KR",
            "screen": {"w": 1920, "h": 1080},
            "viewport": {"w": 1200, "h": 800},
        },
        "groups": groups,
        "personas": personas,
    }


def load_rows(max_rows: int, streaming: bool) -> Iterable[Dict[str, Any]]:
    dataset = load_dataset("nvidia/Nemotron-Personas-Korea", split="train", streaming=streaming)
    if streaming:
        rows = []
        for index, row in enumerate(dataset):
            rows.append(row)
            if index + 1 >= max_rows:
                break
        return rows
    length = min(max_rows, len(dataset))
    return (dataset[index] for index in range(length))


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Nemotron Personas Korea into generated dashboard personas catalog.")
    parser.add_argument("--max-rows", type=int, default=20000, help="Maximum rows to inspect while building representative persona groups.")
    parser.add_argument("--target-groups", type=int, default=24, help="How many representative persona groups to emit.")
    parser.add_argument("--streaming", action="store_true", help="Use Hugging Face streaming mode for ingestion.")
    args = parser.parse_args()

    rows = load_rows(max_rows=args.max_rows, streaming=args.streaming)
    catalog = build_catalog(rows, target_groups=args.target_groups)
    PERSONAS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"generated {len(catalog['personas'])} personas -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
