"""Unit — ListProviders/GetProvider (A9: "Ofertas por supermercado"). Fake repo, sin DB."""
from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime

from src.contexts.save.application.providers import (
    ArchiveProvider,
    GetProvider,
    ListAdminProviders,
    ListProviders,
)
from src.contexts.save.domain.entities import Provider, ProviderType, SourcePlatform


class FakeProviderRepo:
    def __init__(self, providers: list[Provider]) -> None:
        self._providers = providers

    def list_by_market(self, market_id: str, *, include_archived: bool = False) -> list[Provider]:
        rows = [p for p in self._providers if p.market_id == market_id]
        if not include_archived:
            rows = [p for p in rows if not p.is_archived]
        return rows

    def get_by_id(self, provider_id: str) -> Provider | None:
        return next((p for p in self._providers if p.id == provider_id), None)

    def set_archived(self, provider_id: str, *, archived: bool) -> bool:
        for i, p in enumerate(self._providers):
            if p.id == provider_id:
                stamp = datetime(2026, 7, 27, tzinfo=UTC) if archived else None
                self._providers[i] = replace(p, archived_at=stamp)
                return True
        return False


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


# --- ListAdminProviders (T1/#11): listado admin con la ENTIDAD completa, no el ref público -------


def test_admin_list_returns_full_entities_of_the_market() -> None:
    providers = [
        Provider("p1", "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"),
        Provider("p2", "Fuera", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "US"),
    ]
    result = ListAdminProviders(FakeProviderRepo(providers)).execute("DO")
    assert [p.id for p in result] == ["p1"]
    # trae type/platform/market (lo que el ref público NO da) para edición segura
    assert result[0].type == ProviderType.SUPERMARKET
    assert result[0].platform == SourcePlatform.VTEX
    assert result[0].market_id == "DO"


def test_admin_list_sorted_by_name() -> None:
    providers = [
        Provider("p2", "Zumo", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO"),
        Provider("p1", "Bravo", ProviderType.SUPERMARKET, SourcePlatform.REST_CATALOG, "DO"),
    ]
    result = ListAdminProviders(FakeProviderRepo(providers)).execute("DO")
    assert [p.name for p in result] == ["Bravo", "Zumo"]


# --- ArchiveProvider: SOFT-delete ----------------------------------------------------------------
# Un provider está referenciado por FK desde `store_registry` y `store_product`, así que un DELETE
# real o revienta o se lleva por delante el histórico de precios. Espeja `ArchiveCanonicalProduct`:
# un solo use case con booleano, para que restaurar sea la inversa EXACTA de archivar.


def _do_provider(pid: str = "p1", name: str = "Bravo") -> Provider:
    return Provider(pid, name, ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO")


def test_archive_stamps_the_provider_and_returns_it() -> None:
    repo = FakeProviderRepo([_do_provider()])
    result = ArchiveProvider(repo).execute(provider_id="p1", archived=True)

    assert result is not None
    assert result.is_archived is True


def test_unarchive_is_the_exact_inverse() -> None:
    repo = FakeProviderRepo([_do_provider()])
    use_case = ArchiveProvider(repo)

    use_case.execute(provider_id="p1", archived=True)
    restored = use_case.execute(provider_id="p1", archived=False)

    assert restored is not None
    assert restored.is_archived is False
    assert restored.archived_at is None


def test_archive_returns_none_when_provider_does_not_exist() -> None:
    """El "no encontrado" es regla del use case, no del repo (ADR 31: el repo es I/O puro)."""
    assert ArchiveProvider(FakeProviderRepo([])).execute(provider_id="nope", archived=True) is None


def test_admin_list_hides_archived_providers_by_default() -> None:
    """Archivar tiene que SACARLO de la consola; si siguiera listado no serviría de nada."""
    repo = FakeProviderRepo([_do_provider("p1", "Bravo"), _do_provider("p2", "Ritmo")])
    ArchiveProvider(repo).execute(provider_id="p2", archived=True)

    result = ListAdminProviders(repo).execute("DO")

    assert [p.name for p in result] == ["Bravo"]


def test_admin_list_can_include_archived_on_demand() -> None:
    """Sin esta vista, un provider archivado por error sería irrecuperable desde la UI."""
    repo = FakeProviderRepo([_do_provider("p1", "Bravo"), _do_provider("p2", "Ritmo")])
    ArchiveProvider(repo).execute(provider_id="p2", archived=True)

    result = ListAdminProviders(repo).execute("DO", include_archived=True)

    assert [p.name for p in result] == ["Bravo", "Ritmo"]
