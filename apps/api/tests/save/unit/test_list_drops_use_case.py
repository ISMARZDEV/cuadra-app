"""Unit — ListPriceDrops (G4): orquesta puerto → detect_drops → DTO. Fakes puros."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from src.contexts.save.application.drops import ListPriceDrops
from src.contexts.save.domain.drops import PriceChange
from src.contexts.save.domain.entities import PriceType
from src.shared.money import Currency, Money

DOP = Currency("DOP")
NOW = datetime(2026, 7, 3, 12, 0, tzinfo=timezone.utc)


class FakeStoreRepo:
    def __init__(self, changes: list[PriceChange]) -> None:
        self._changes = changes
        self.calls: list[tuple[str, datetime]] = []

    def list_price_changes(self, market_id: str, since: datetime) -> list[PriceChange]:
        self.calls.append((market_id, since))
        return self._changes


def _change(prev: int, curr: int) -> PriceChange:
    return PriceChange(
        canonical_product_id="c1",
        product_name="Arroz La Garza 10 Lbs",
        provider_id="p-jumbo",
        provider_name="Jumbo",
        previous=Money(prev, DOP),
        current=Money(curr, DOP),
        captured_at=NOW,
        price_type=PriceType.ONLINE,
    )


def test_maps_drops_to_dto_and_passes_window() -> None:
    repo = FakeStoreRepo([_change(47500, 45000), _change(44000, 45495)])  # bajada + subida

    dtos = ListPriceDrops(repo).execute(market_id="DO", days=7, now=NOW)

    assert repo.calls == [("DO", NOW - timedelta(days=7))]
    assert len(dtos) == 1  # la subida no es bajada
    dto = dtos[0]
    assert dto.canonical_product_id == "c1"
    assert dto.product_name == "Arroz La Garza 10 Lbs"
    assert dto.provider_name == "Jumbo"
    assert dto.previous_minor == 47500
    assert dto.current_minor == 45000
    assert dto.currency == "DOP"
    assert dto.drop_minor == 2500
    assert dto.drop_bps == 526
    assert dto.price_type == "online"


def test_empty_when_no_changes() -> None:
    assert ListPriceDrops(FakeStoreRepo([])).execute(market_id="DO", days=7, now=NOW) == []
