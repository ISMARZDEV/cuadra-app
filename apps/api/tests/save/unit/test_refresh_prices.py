"""Unit — RefreshCatalogPrices (§6.3): refresca precios de productos YA matcheados.

Slice de F1: la fuente (adapter) entrega RawCatalogEntry y el use case registra la observación
SOLO para store_products conocidos por (provider, external_id) — el alta de productos nuevos
es del matching (F2). Pasa canonical_product_id=None: record_observation NO toca el link
canónico en refresh (solo lo usa al crear). Fakes puros, sin red ni DB.
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.application.refresh_prices import RefreshCatalogPrices, RefreshResult
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.shared.money import Currency, Money
from src.contexts.save.domain.entities.product_match import ProductMatch

DOP = Currency("DOP")


def _entry(
    external_id: str,
    minor: int,
    source_ref: dict[str, str] | None = None,
) -> RawCatalogEntry:
    return RawCatalogEntry(
        provider_id="p-sirena",
        market_id="DO",
        external_id=external_id,
        name="Arroz La Garza 10 Lbs",
        brand="LA GARZA",
        size_text="10 Lbs",
        price=Money(minor, DOP),
        price_type=PriceType.ONLINE,
        source="vtex",
        url="https://www.sirena.do/arroz-la-garza-10-lbs/p",
        ean="123",
        source_ref=source_ref,
    )


class FakeStoreRepo:
    def __init__(self, known: set[tuple[str, str]]) -> None:
        self._known = known
        self.observations: list[dict] = []

    def exists(self, provider_id: str, external_id: str) -> bool:
        return (provider_id, external_id) in self._known

    def record_observation(self, **kwargs) -> str:  # type: ignore[no-untyped-def]
        self.observations.append(kwargs)
        return "sp-1"


class FakeSource:
    def __init__(self, entries: list[RawCatalogEntry]) -> None:
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        yield from self._entries


def test_refreshes_only_known_products() -> None:
    repo = FakeStoreRepo(known={("p-sirena", "14210")})
    source = FakeSource([_entry("14210", 47500), _entry("99999", 10000)])

    result = RefreshCatalogPrices(repo).execute(source)

    assert result == RefreshResult(seen=2, refreshed=1, unmatched=1)
    assert len(repo.observations) == 1
    obs = repo.observations[0]
    assert obs["provider_id"] == "p-sirena"
    assert obs["external_id"] == "14210"
    assert obs["canonical_product_id"] is None  # refresh: NO toca el link canónico
    assert obs["price"] == Money(47500, DOP)
    assert obs["price_type"] == PriceType.ONLINE
    assert obs["source"] == "vtex"
    assert obs["url"] == "https://www.sirena.do/arroz-la-garza-10-lbs/p"
    assert obs["ean"] == "123"


def test_captured_at_is_injectable_and_shared_by_run() -> None:
    ts = datetime(2026, 7, 3, 12, 0, tzinfo=timezone.utc)
    repo = FakeStoreRepo(known={("p-sirena", "a"), ("p-sirena", "b")})
    source = FakeSource([_entry("a", 100), _entry("b", 200)])

    RefreshCatalogPrices(repo).execute(source, captured_at=ts)

    assert [o["captured_at"] for o in repo.observations] == [ts, ts]


def test_empty_source_yields_zero_counts() -> None:
    repo = FakeStoreRepo(known=set())
    result = RefreshCatalogPrices(repo).execute(FakeSource([]))
    assert result == RefreshResult(seen=0, refreshed=0, unmatched=0)


class FakeMatcher:
    def __init__(self) -> None:
        self.calls: list = []

    def execute(self, incoming):  # type: ignore[no-untyped-def]
        self.calls.append(incoming)
        # Devuelve un ProductMatch REAL: el `MatchStoreProduct` de verdad SIEMPRE lo hace, y #4.3
        # lee su `status` para contar el desenlace. Un fake que devuelve None no honra el contrato
        # del port — pasa el test y rompe en producción.
        return ProductMatch(
            store_product_id=incoming.store_product_id,
            canonical_product_id="canon-1",
            confidence=1.0,
            method="ean",
            status="auto_linked",
        )


def test_create_branch_persists_source_ref_regression() -> None:
    """Regresión (§15.3): al MATERIALIZAR un producto DESCONOCIDO (rama create, cascada activa)
    el `source_ref` del entry debe llegar a `record_observation`. El bug histórico solo pasaba
    `source_ref` en la rama refresh (conocido) → el browse guardaba source_ref=None (JSONB null)
    y el re-fetch por-producto (camino A) de Bravo se quedaba sin localizador."""
    repo = FakeStoreRepo(known=set())  # producto DESCONOCIDO → rama create/matched
    source = FakeSource([_entry("29866", 12400, source_ref={"id_articulo": "29866"})])

    result = RefreshCatalogPrices(repo, matcher=FakeMatcher()).execute(source)

    assert result == RefreshResult(
        seen=1, refreshed=0, unmatched=0, matched=1, auto_linked=1
    )
    assert len(repo.observations) == 1
    assert repo.observations[0]["source_ref"] == {"id_articulo": "29866"}
