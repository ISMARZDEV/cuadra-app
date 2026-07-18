"""Unit — RefreshCatalogPrices con el matcher opcional de la cascada F2.0 (Batch 8, wiring).

matcher=None => comportamiento legacy F1 (la fila desconocida se DESCARTA: unmatched += 1, no se
crea store_product, no se matchea). matcher presente => la fila antes descartada se ENRUTA a la
cascada: se materializa el store_product (record_observation, canonical=None) y se pasa a
`matcher.execute(IncomingStoreProduct)`. Fakes puros, sin red ni DB.
"""
from __future__ import annotations

from datetime import datetime, timezone

from src.contexts.save.application.match_store_product import IncomingStoreProduct
from src.contexts.save.application.refresh_prices import RefreshCatalogPrices, RefreshResult
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _entry(
    external_id: str, minor: int = 47500, category: tuple[str, ...] = ()
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
        ean="123",
        category_path=category,
    )


class FakeRelevanceGate:
    """`is_off_scope(source_category) -> bool` — R2. Descarta lo obviamente fuera del catálogo."""

    def __init__(self, off_scope: set[str] | None = None) -> None:
        self._off = off_scope or set()
        self.calls: list[str] = []

    def is_off_scope(self, source_category: str) -> bool:
        self.calls.append(source_category)
        return source_category in self._off


class FakeStoreRepo:
    def __init__(self, known: set[tuple[str, str]]) -> None:
        self._known = known
        self.observations: list[dict] = []
        self._next_id = 0

    def exists(self, provider_id: str, external_id: str) -> bool:
        return (provider_id, external_id) in self._known

    def record_observation(self, **kwargs) -> str:  # type: ignore[no-untyped-def]
        self.observations.append(kwargs)
        self._next_id += 1
        return f"sp-{self._next_id}"


class FakeSource:
    def __init__(self, entries: list[RawCatalogEntry]) -> None:
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        yield from self._entries


class FakeMatcher:
    def __init__(self) -> None:
        self.calls: list[IncomingStoreProduct] = []

    def execute(self, product: IncomingStoreProduct):  # type: ignore[no-untyped-def]
        self.calls.append(product)
        return None


def test_matcher_none_keeps_legacy_drop_behavior() -> None:
    repo = FakeStoreRepo(known={("p-sirena", "14210")})
    source = FakeSource([_entry("14210"), _entry("99999")])

    result = RefreshCatalogPrices(repo).execute(source)

    assert result == RefreshResult(seen=2, refreshed=1, unmatched=1, matched=0)
    assert len(repo.observations) == 1  # SOLO el conocido: el desconocido se descarta, no se crea


def test_matcher_routes_previously_dropped_row_to_cascade() -> None:
    repo = FakeStoreRepo(known=set())  # todo desconocido
    matcher = FakeMatcher()
    source = FakeSource([_entry("99999")])

    result = RefreshCatalogPrices(repo, matcher=matcher).execute(source)

    assert result == RefreshResult(seen=1, refreshed=0, unmatched=0, matched=1)
    # se materializó el store_product (canonical=None) ANTES de matchear
    assert len(repo.observations) == 1
    assert repo.observations[0]["canonical_product_id"] is None
    assert repo.observations[0]["external_id"] == "99999"
    # y se enrutó a la cascada con el IncomingStoreProduct armado desde la entrada
    assert len(matcher.calls) == 1
    incoming = matcher.calls[0]
    assert incoming.store_product_id == "sp-1"  # el id devuelto por record_observation
    assert incoming.market_id == "DO"
    assert incoming.name == "Arroz La Garza 10 Lbs"
    assert incoming.brand == "LA GARZA"
    assert incoming.size == "10 Lbs"
    assert incoming.ean == "123"


def test_matcher_does_not_touch_known_products() -> None:
    repo = FakeStoreRepo(known={("p-sirena", "14210")})
    matcher = FakeMatcher()
    source = FakeSource([_entry("14210")])

    result = RefreshCatalogPrices(repo, matcher=matcher).execute(source)

    assert result == RefreshResult(seen=1, refreshed=1, unmatched=0, matched=0)
    assert matcher.calls == []  # los conocidos NO pasan por la cascada


# ---------------------------------------------------------------- R2: relevance gate (descarte) --
# Medido 2026-07-16: aun con la canasta acotada a arroz+legumbre, Magento hace OR de tokens y trae
# comida de perro/velas/pañitos por queries de "arroz"/"verdes" → 45% de la cola era ruido. El gate
# descarta EN DESCUBRIMIENTO lo que la categoría de origen resuelve a un top-level fuera del catálogo.


def test_relevance_gate_discards_off_scope_before_materialize_and_match() -> None:
    repo = FakeStoreRepo(known=set())  # desconocido
    matcher = FakeMatcher()
    gate = FakeRelevanceGate(off_scope={"Mascotas > Alimento para Perros"})
    source = FakeSource([_entry("dogfood", category=("Mascotas", "Alimento para Perros"))])

    result = RefreshCatalogPrices(repo, matcher=matcher, relevance_gate=gate).execute(source)

    assert result == RefreshResult(seen=1, refreshed=0, unmatched=0, matched=0, discarded=1)
    assert repo.observations == []  # NO se materializa el ruido
    assert matcher.calls == []      # NO entra a la cascada
    assert gate.calls == ["Mascotas > Alimento para Perros"]  # se consultó con el path unido


def test_relevance_gate_keeps_in_scope_and_routes_to_cascade() -> None:
    repo = FakeStoreRepo(known=set())
    matcher = FakeMatcher()
    gate = FakeRelevanceGate(off_scope={"Mascotas > Alimento para Perros"})
    source = FakeSource([_entry("arroz", category=("Despensa", "Arroz"))])

    result = RefreshCatalogPrices(repo, matcher=matcher, relevance_gate=gate).execute(source)

    assert result == RefreshResult(seen=1, refreshed=0, unmatched=0, matched=1, discarded=0)
    assert len(repo.observations) == 1  # in-scope → se materializa y matchea normal
    assert len(matcher.calls) == 1


def test_relevance_gate_only_applies_to_unknown_products() -> None:
    repo = FakeStoreRepo(known={("p-sirena", "known")})
    matcher = FakeMatcher()
    gate = FakeRelevanceGate(off_scope={"Mascotas"})
    source = FakeSource([_entry("known", category=("Mascotas",))])

    result = RefreshCatalogPrices(repo, matcher=matcher, relevance_gate=gate).execute(source)

    # un producto CONOCIDO se refresca aunque su categoría sea off-scope: el gate es de
    # DESCUBRIMIENTO, no re-evalúa lo ya ingerido. Y no se consulta.
    assert result == RefreshResult(seen=1, refreshed=1, unmatched=0, matched=0, discarded=0)
    assert gate.calls == []


def test_no_relevance_gate_is_noop() -> None:
    repo = FakeStoreRepo(known=set())
    matcher = FakeMatcher()
    source = FakeSource([_entry("x", category=("Mascotas",))])

    result = RefreshCatalogPrices(repo, matcher=matcher).execute(source)

    # sin gate → comportamiento legacy: el desconocido entra a la cascada, nada se descarta.
    assert result == RefreshResult(seen=1, refreshed=0, unmatched=0, matched=1, discarded=0)


def test_matcher_routes_multiple_and_leaves_known_alone() -> None:
    repo = FakeStoreRepo(known={("p-sirena", "known")})
    matcher = FakeMatcher()
    source = FakeSource([_entry("known"), _entry("new-a"), _entry("new-b")])

    result = RefreshCatalogPrices(repo, matcher=matcher).execute(source, captured_at=datetime(
        2026, 7, 5, tzinfo=timezone.utc
    ))

    assert result == RefreshResult(seen=3, refreshed=1, unmatched=0, matched=2)
    # dos desconocidos enrutados en orden; el id lo devuelve record_observation. El conocido
    # también llama record_observation (sp-1, ignorado), así que los enrutados son sp-2, sp-3.
    assert len(matcher.calls) == 2
    assert [c.store_product_id for c in matcher.calls] == ["sp-2", "sp-3"]
