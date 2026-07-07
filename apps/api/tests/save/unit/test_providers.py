"""Unit — ListProviders/GetProvider (A9: "Ofertas por supermercado"). Fake repo, sin DB."""
from __future__ import annotations

from src.contexts.save.application.providers import GetProvider, ListProviders
from src.contexts.save.domain.entities import Provider, ProviderType, SourcePlatform


class FakeProviderRepo:
    def __init__(self, providers: list[Provider]) -> None:
        self._providers = providers

    def list_by_market(self, market_id: str) -> list[Provider]:
        return [p for p in self._providers if p.market_id == market_id]

    def get_by_id(self, provider_id: str) -> Provider | None:
        return next((p for p in self._providers if p.id == provider_id), None)


def test_lists_providers_of_the_market_as_refs() -> None:
    providers = [
        Provider("p1", "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"),
        Provider("p2", "OtroMercado", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "US"),
    ]
    refs = ListProviders(FakeProviderRepo(providers)).execute("DO")
    assert [(r.id, r.name) for r in refs] == [("p1", "Sirena")]


def test_lists_providers_carries_logo_url_when_present() -> None:
    """3.4: el catálogo público necesita el logo para dejar de renderizar solo el nombre."""
    providers = [
        Provider(
            "p1", "Jumbo", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO",
            logo_url="https://cdn.example.com/jumbo.png",
        ),
        Provider("p2", "SinLogo", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"),
    ]
    refs = ListProviders(FakeProviderRepo(providers)).execute("DO")
    assert refs[0].logo_url == "https://cdn.example.com/jumbo.png"
    assert refs[1].logo_url is None


def test_get_provider_returns_ref_with_logo_url() -> None:
    providers = [
        Provider(
            "p1", "Jumbo", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO",
            logo_url="https://cdn.example.com/jumbo.png",
        ),
    ]
    ref = GetProvider(FakeProviderRepo(providers)).execute("p1")
    assert ref is not None
    assert ref.logo_url == "https://cdn.example.com/jumbo.png"


def test_get_provider_returns_none_when_not_found() -> None:
    assert GetProvider(FakeProviderRepo([])).execute("missing") is None
