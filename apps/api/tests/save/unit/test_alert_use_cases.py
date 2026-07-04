"""Unit — use cases de alertas G4 con repos FAKE. Subscribe valida producto; RunAlertMatching
orquesta detección→matching→persistencia idempotente."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from src.contexts.save.application.alerts import RunAlertMatching, SubscribeAlert
from src.contexts.save.application.errors import CanonicalProductNotFoundError
from src.contexts.save.domain.alerts import AlertSubscription
from src.contexts.save.domain.drops import PriceChange
from src.contexts.save.domain.entities import CanonicalProduct, PriceType
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")


class FakeCanonicalRepo:
    def __init__(self, products):
        self._p = {p.id: p for p in products}

    def get_by_id(self, pid):
        return self._p.get(pid)


class FakeAlertRepo:
    def __init__(self, subscriptions=None):
        self.subs = subscriptions or []
        self.recorded: list[tuple] = []
        self._seen: set[tuple] = set()

    def subscribe(self, user_id, canonical_product_id, market_id, threshold_minor):
        return "alert-1"

    def list_active_subscriptions(self, market_id):
        return self.subs

    def record_notification(self, *, alert_id, provider_name, captured_at, **kw):
        key = (alert_id, provider_name, captured_at)  # dedup natural (idempotencia)
        if key in self._seen:
            return False
        self._seen.add(key)
        self.recorded.append((alert_id, kw["current_minor"]))
        return True


def _canonical(cid, name):
    return CanonicalProduct(cid, name, "La Garza", Quantity(Decimal("10"), UnitMeasure.MASS), "t", "DO")


class FakeStoreRepo:
    def __init__(self, changes):
        self._changes = changes

    def list_price_changes(self, market_id, since):
        return self._changes


def _change(cid, previous, current):
    return PriceChange(
        canonical_product_id=cid, product_name=f"P {cid}", provider_id="p1",
        provider_name="Merca", previous=Money(previous, DOP), current=Money(current, DOP),
        captured_at=datetime(2026, 7, 4, tzinfo=timezone.utc), price_type=PriceType.ONLINE,
    )


def test_subscribe_validates_product_exists() -> None:
    uc = SubscribeAlert(FakeAlertRepo(), FakeCanonicalRepo([]))
    with pytest.raises(CanonicalProductNotFoundError):
        uc.execute("u1", "nope")


def test_subscribe_returns_alert_dto() -> None:
    uc = SubscribeAlert(FakeAlertRepo(), FakeCanonicalRepo([_canonical("arroz", "Arroz La Garza")]))
    dto = uc.execute("u1", "arroz", threshold_minor=40000)
    assert dto.canonical_product_id == "arroz"
    assert dto.product_name == "Arroz La Garza"
    assert dto.threshold_minor == 40000


def test_run_matching_creates_notifications_for_matched_drops() -> None:
    alert_repo = FakeAlertRepo([AlertSubscription("alert-1", "u1", "arroz", None)])
    store_repo = FakeStoreRepo([_change("arroz", 45000, 42000), _change("aceite", 30000, 29000)])
    created = RunAlertMatching(store_repo, alert_repo).execute("DO")
    assert created == 1  # solo arroz tiene suscripción
    assert alert_repo.recorded == [("alert-1", 42000)]


def test_run_matching_is_idempotent() -> None:
    alert_repo = FakeAlertRepo([AlertSubscription("alert-1", "u1", "arroz", None)])
    store_repo = FakeStoreRepo([_change("arroz", 45000, 42000)])
    uc = RunAlertMatching(store_repo, alert_repo)
    assert uc.execute("DO") == 1
    assert uc.execute("DO") == 0  # segunda corrida no re-notifica la misma bajada
