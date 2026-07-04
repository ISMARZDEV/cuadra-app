"""Unit — matching de alertas G4 (dominio puro). Cruza bajadas × suscripciones."""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.domain.alerts import AlertSubscription, match_alerts
from src.contexts.save.domain.drops import PriceChange, PriceDrop
from src.contexts.save.domain.entities import PriceType
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _drop(cid: str, previous: int, current: int) -> PriceDrop:
    change = PriceChange(
        canonical_product_id=cid,
        product_name=f"Producto {cid}",
        provider_id="p1",
        provider_name="Merca",
        previous=Money(previous, DOP),
        current=Money(current, DOP),
        captured_at=datetime(2026, 7, 4, tzinfo=timezone.utc),
        price_type=PriceType.ONLINE,
    )
    drop_minor = previous - current
    return PriceDrop(change=change, drop=Money(drop_minor, DOP), drop_bps=drop_minor * 10000 // previous)


def test_matches_subscription_without_threshold() -> None:
    drops = [_drop("arroz", 45000, 42000)]
    subs = [AlertSubscription("a1", "u1", "arroz", None)]
    matches = match_alerts(drops, subs)
    assert len(matches) == 1
    assert matches[0].subscription.user_id == "u1"
    assert matches[0].drop.change.canonical_product_id == "arroz"


def test_threshold_met_matches() -> None:
    drops = [_drop("arroz", 45000, 42000)]  # nuevo = 42000
    subs = [AlertSubscription("a1", "u1", "arroz", 42000)]  # umbral 42000 → 42000 ≤ 42000 ✓
    assert len(match_alerts(drops, subs)) == 1


def test_threshold_not_met_does_not_match() -> None:
    drops = [_drop("arroz", 45000, 42000)]  # nuevo = 42000
    subs = [AlertSubscription("a1", "u1", "arroz", 40000)]  # umbral 40000 → 42000 > 40000 ✗
    assert match_alerts(drops, subs) == []


def test_only_matches_same_product() -> None:
    drops = [_drop("arroz", 45000, 42000)]
    subs = [AlertSubscription("a1", "u1", "aceite", None)]
    assert match_alerts(drops, subs) == []


def test_multiple_subscribers_same_drop() -> None:
    drops = [_drop("arroz", 45000, 42000)]
    subs = [
        AlertSubscription("a1", "u1", "arroz", None),
        AlertSubscription("a2", "u2", "arroz", 42000),
        AlertSubscription("a3", "u3", "arroz", 41000),  # no llega
    ]
    users = {m.subscription.user_id for m in match_alerts(drops, subs)}
    assert users == {"u1", "u2"}
