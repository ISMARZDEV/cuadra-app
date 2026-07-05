"""Unit — ListProviders (A9: "Ofertas por supermercado"). Fake repo, sin DB."""
from __future__ import annotations

from src.contexts.save.application.providers import ListProviders
from src.contexts.save.domain.entities import Provider, ProviderType, SourcePlatform


class FakeProviderRepo:
    def __init__(self, providers: list[Provider]) -> None:
        self._providers = providers

    def list_by_market(self, market_id: str) -> list[Provider]:
        return [p for p in self._providers if p.market_id == market_id]


def test_lists_providers_of_the_market_as_refs() -> None:
    providers = [
        Provider("p1", "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"),
        Provider("p2", "OtroMercado", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "US"),
    ]
    refs = ListProviders(FakeProviderRepo(providers)).execute("DO")
    assert [(r.id, r.name) for r in refs] == [("p1", "Sirena")]
