"""Unit — `PreviewBasketQuery` (F2, canasta consultable): dry-run de un TÉRMINO contra la(s)
tienda(s) del mercado, ANTES de agregarlo a la canasta. Generaliza `TestSource` (que es por
`source_id`) a "por query contra cada fuente activa del mercado", agrupando por proveedor.

CERO persistencia (mismo criterio que TestSource): no recibe ni llama repos de escritura. Mockea el
HTTP guardado (`ssrf_guard.guarded_get`) — nunca red real. Graceful por tienda: si UNA fuente falla,
su grupo trae `error` y las demás siguen devolviendo resultados.
"""
from __future__ import annotations

import httpx
import pytest

from src.contexts.save.application.preview_basket_query import PreviewBasketQuery
from src.contexts.save.domain.entities import (
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.infrastructure.catalog_sources import ssrf_guard


def _source(provider_id: str, base_url: str = "https://x.example.com") -> StoreRegistry:
    return StoreRegistry(f"src-{provider_id}", provider_id, SourcePlatform.VTEX, base_url)


def _provider(pid: str, name: str) -> Provider:
    return Provider(pid, name, ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO")


def _vtex_item(idx: int) -> dict:
    return {
        "productId": str(idx),
        "productName": f"Producto {idx}",
        "brand": "Marca",
        "items": [{"images": [], "ean": None, "sellers": [{"commertialOffer": {"Price": 100}}]}],
        "categories": [],
        "link": None,
    }


class _StubSourceRepo:
    def __init__(self, sources: list[StoreRegistry]) -> None:
        self._sources = sources

    def list_by_market(self, market_id: str) -> list[StoreRegistry]:
        return list(self._sources)

    def get_by_provider_id(self, provider_id: str) -> StoreRegistry | None:
        return next((s for s in self._sources if s.provider_id == provider_id), None)


class _StubProviderRepo:
    def __init__(self, providers: list[Provider]) -> None:
        self._providers = {p.id: p for p in providers}

    def get_by_id(self, provider_id: str) -> Provider | None:
        return self._providers.get(provider_id)


def test_previews_query_across_all_market_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ssrf_guard, "guarded_get", lambda url: [_vtex_item(1), _vtex_item(2)])
    uc = PreviewBasketQuery(
        _StubSourceRepo([_source("p1"), _source("p2")]),
        _StubProviderRepo([_provider("p1", "Sirena"), _provider("p2", "Nacional")]),
    )

    groups = uc.execute(query_text="arroz", market_id="DO")

    assert {g.provider_name for g in groups} == {"Sirena", "Nacional"}
    assert all(len(g.entries) == 2 and g.error is None for g in groups)


def test_provider_id_filters_to_one_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ssrf_guard, "guarded_get", lambda url: [_vtex_item(1)])
    uc = PreviewBasketQuery(
        _StubSourceRepo([_source("p1"), _source("p2")]),
        _StubProviderRepo([_provider("p1", "Sirena"), _provider("p2", "Nacional")]),
    )

    groups = uc.execute(query_text="arroz", market_id="DO", provider_id="p2")

    assert [g.provider_name for g in groups] == ["Nacional"]


def test_one_store_failing_does_not_break_the_rest(monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(url):  # type: ignore[no-untyped-def]
        raise httpx.ConnectError("upstream caído")

    monkeypatch.setattr(ssrf_guard, "guarded_get", _boom)
    uc = PreviewBasketQuery(
        _StubSourceRepo([_source("p1")]),
        _StubProviderRepo([_provider("p1", "Sirena")]),
    )

    groups = uc.execute(query_text="arroz", market_id="DO")

    assert len(groups) == 1
    assert groups[0].error is not None
    assert groups[0].entries == ()
