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
            return None

    repo = FakeStoreRepo(known=set())  # todo desconocido → todo se enruta al matcher
    matcher = FakeMatcher()
    adapters = [FakeSource([_entry("a"), _entry("b")]), FakeSource([_entry("c")])]

    result = refresh_source(repo, adapters, matcher=matcher)

    assert result == RefreshResult(seen=3, refreshed=0, unmatched=0, matched=3)
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
