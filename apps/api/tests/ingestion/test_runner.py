"""Unit — runner de refresh (ingestion.save.runner): agrega RefreshCatalogPrices por fuente.

`refresh_source` corre el use case sobre CADA adapter de una fuente (una canasta puede tener
varias queries) y suma los conteos. Fakes puros, sin red ni DB — la lógica de refresh vive
(y está testeada) en RefreshCatalogPrices; acá solo se prueba la agregación.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ingestion.save.runner import refresh_source
from src.contexts.save.application.refresh_prices import RefreshResult
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.shared.money import Currency, Money
from src.contexts.save.domain.entities.product_match import ProductMatch

DOP = Currency("DOP")


def _entry(external_id: str) -> RawCatalogEntry:
    return RawCatalogEntry(
        provider_id="p-sirena",
        market_id="DO",
        external_id=external_id,
        name="Arroz La Garza 10 Lbs",
        brand="LA GARZA",
        size_text="10 Lbs",
        price=Money(47500, DOP),
        price_type=PriceType.ONLINE,
        source="vtex",
    )


class FakeSource:
    def __init__(self, entries: list[RawCatalogEntry]) -> None:
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        yield from self._entries


class FakeStoreRepo:
    def __init__(self, known: set[tuple[str, str]]) -> None:
        self._known = known
        self.observations = 0

    def exists(self, provider_id: str, external_id: str) -> bool:
        return (provider_id, external_id) in self._known

    def record_observation(self, **kwargs) -> str:  # type: ignore[no-untyped-def]
        self.observations += 1
        return "sp"


def test_aggregates_counts_across_adapters() -> None:
    repo = FakeStoreRepo(known={("p-sirena", "a")})
    adapters = [FakeSource([_entry("a"), _entry("b")]), FakeSource([_entry("a")])]

    result = refresh_source(repo, adapters)

    assert result == RefreshResult(seen=3, refreshed=2, unmatched=1)
    assert repo.observations == 2  # "a" conocido en ambos adapters; "b" desconocido


def test_no_adapters_yields_zero() -> None:
    assert refresh_source(FakeStoreRepo(set()), []) == RefreshResult(0, 0, 0)


def test_forwards_matcher_and_aggregates_matched_across_adapters() -> None:
    class FakeMatcher:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, product):  # type: ignore[no-untyped-def]
            self.calls += 1
            # ProductMatch real (ver #4.3): el port devuelve siempre un veredicto.
            return ProductMatch(
                store_product_id=product.store_product_id,
                canonical_product_id="canon-1",
                confidence=1.0,
                method="ean",
                status="auto_linked",
            )

    repo = FakeStoreRepo(known=set())  # todo desconocido → todo se enruta al matcher
    matcher = FakeMatcher()
    adapters = [FakeSource([_entry("a"), _entry("b")]), FakeSource([_entry("c")])]

    result = refresh_source(repo, adapters, matcher=matcher)

    assert result == RefreshResult(
        seen=3, refreshed=0, unmatched=0, matched=3, auto_linked=3
    )
    assert matcher.calls == 3  # el matcher fue efectivamente enrutado por cada fuente


def test_captured_at_is_forwarded() -> None:
    ts = datetime(2026, 7, 4, tzinfo=timezone.utc)
    captured: list[datetime] = []

    class RecordingRepo(FakeStoreRepo):
        def record_observation(self, **kwargs):  # type: ignore[no-untyped-def]
            captured.append(kwargs["captured_at"])
            return super().record_observation(**kwargs)

    refresh_source(RecordingRepo(known={("p-sirena", "a")}), [FakeSource([_entry("a")])], captured_at=ts)
    assert captured == [ts]


# ── Pacing en Loop A (el hueco que quedó del fix de 2026-07-15) ────────────────────────────────
# `build_sources()` arma UN adapter por término de canasta POR tienda: hoy son 213 términos × 3
# tiendas ≈ 639 búsquedas. El runner las corría en un for pelado, sin ninguna pausa. Es el MISMO
# bug que en price_refresh/Loop B/browse: la protección de SRD (`randomDelay(600,1200)`) nunca se
# copió. Acá ni siquiera hay round-robin: los adapters de UNA tienda vienen juntos por construcción.


def test_paces_between_adapters_because_each_one_is_a_search_against_the_same_store() -> None:
    paced: list[int] = []
    repo = FakeStoreRepo(set())
    adapters = [FakeSource([_entry("1")]), FakeSource([_entry("2")]), FakeSource([_entry("3")])]

    refresh_source(repo, adapters, pace=lambda: paced.append(1))

    assert len(paced) == 2, "3 búsquedas → 2 pausas (nunca antes de la primera)"


def test_does_not_pace_a_single_adapter() -> None:
    paced: list[int] = []

    refresh_source(FakeStoreRepo(set()), [FakeSource([_entry("1")])], pace=lambda: paced.append(1))

    assert paced == []


def test_aggregates_the_cascade_outcome_across_adapters() -> None:
    """El runner sumaba seen/refreshed/unmatched/matched y DESCARTABA el desenlace de la cascada
    (#4.3). Con eso la consola vería `matched=40` sin saber si fueron 40 auto-enlaces o 40 de
    trabajo humano pendiente — que es justo la pregunta operativa."""

    class ScriptedMatcher:
        def __init__(self, statuses):  # type: ignore[no-untyped-def]
            self.statuses = statuses
            self.products = []

        def execute(self, product):  # type: ignore[no-untyped-def]
            status = self.statuses[min(len(self.products), len(self.statuses) - 1)]
            self.products.append(product)
            return ProductMatch(
                store_product_id=product.store_product_id,
                canonical_product_id="canon-1" if status == "auto_linked" else None,
                confidence=1.0 if status == "auto_linked" else 0.0,
                method="ean" if status == "auto_linked" else "human",
                status=status,
            )

    repo = FakeStoreRepo(known=set())
    matcher = ScriptedMatcher(["auto_linked", "pending_review"])
    adapters = [FakeSource([_entry("a")]), FakeSource([_entry("b")])]

    result = refresh_source(repo, adapters, matcher=matcher)

    assert result.matched == 2
    assert result.auto_linked == 1
    assert result.queued_for_review == 1


def test_forwards_the_run_id_to_every_adapter() -> None:
    """El asset conoce `context.run_id`; sin este tramo la columna quedaría siempre NULL y el
    deep-link `?run_id=` no encontraría nada."""

    class RecordingMatcher:
        def __init__(self) -> None:
            self.products = []

        def execute(self, product):  # type: ignore[no-untyped-def]
            self.products.append(product)
            return ProductMatch(
                store_product_id=product.store_product_id,
                canonical_product_id="canon-1",
                confidence=1.0,
                method="ean",
                status="auto_linked",
            )

    repo = FakeStoreRepo(known=set())
    matcher = RecordingMatcher()
    adapters = [FakeSource([_entry("a")]), FakeSource([_entry("b")])]

    refresh_source(repo, adapters, matcher=matcher, run_id="dagster-run-abc")

    assert {p.run_id for p in matcher.products} == {"dagster-run-abc"}
