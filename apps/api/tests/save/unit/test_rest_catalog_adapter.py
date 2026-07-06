"""Unit — `RestCatalogAdapter`: adapter GENÉRICO para APIs REST/JSON de catálogo a medida.

No está atado a ningún súper: toda la parte específica (path, nombres de params de paginación, llaves
del envelope, mapeo de item) vive en un `CatalogProfile`. Estos tests usan un profile SINTÉTICO con
llaves DISTINTAS a las de Bravo Va — para probar que el adapter es realmente parametrizable y que un
súper nuevo entra agregando un profile, sin tocar el adapter. Browse por sección + paginación por offset.
"""
from __future__ import annotations

from dataclasses import replace

from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.ports import RawCatalogEntry
from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import (
    CatalogProfile,
    RestCatalogAdapter,
)
from src.shared.money import Currency, Money


def _fake_map(item: dict, provider_id: str, market_id: str) -> RawCatalogEntry:
    if "price" not in item:
        raise ValueError("sin precio")
    return RawCatalogEntry(
        provider_id=provider_id,
        market_id=market_id,
        external_id=str(item["id"]),
        name=item["title"],
        brand="",
        size_text="",
        price=Money(item["price"], Currency("DOP")),
        price_type=PriceType.ONLINE,
        source="fakesuper",
    )


# profile sintético: llaves y params DELIBERADAMENTE distintos a los de Bravo Va
FAKE_PROFILE = CatalogProfile(
    resource_path="/catalog/items",
    section_param="catId",
    store_param="shopId",
    page_size_param="limit",
    offset_param="skip",
    list_path=("result", "items"),
    total_path=("result", "count"),
    map_item=_fake_map,
    page_size=30,
)


def _entry(pid: int, price: int = 100) -> dict:
    return {"id": pid, "title": f"Prod {pid}", "price": price}


def test_url_uses_profile_param_names_and_path() -> None:
    calls: list[str] = []

    def fake_get(url: str) -> dict:
        calls.append(url)
        return {"result": {"count": 0, "items": []}}

    adapter = RestCatalogAdapter(
        base_url="https://api.fakesuper.test",
        provider_id="p-fake",
        market_id="DO",
        profile=FAKE_PROFILE,
        sections=["7"],
        store_id="55",
    )
    adapter._http_get = fake_get  # type: ignore[method-assign]
    list(adapter.fetch())

    assert calls, "el adapter debe pegarle al endpoint"
    url = calls[0]
    assert "/catalog/items" in url
    assert "catId=7" in url
    assert "shopId=55" in url
    assert "limit=30" in url
    assert "skip=0" in url


def test_url_includes_profile_extra_params_encoded() -> None:
    # algunos súper exigen params fijos extra (p.ej. Bravo Va requiere `showOrder`); el valor
    # con espacios se URL-encodea.
    calls: list[str] = []

    def fake_get(url: str) -> dict:
        calls.append(url)
        return {"result": {"count": 0, "items": []}}

    profile = replace(FAKE_PROFILE, extra_params=(("sort", "rank asc"),))
    adapter = RestCatalogAdapter(
        base_url="https://api.fakesuper.test",
        provider_id="p-fake",
        market_id="DO",
        profile=profile,
        sections=["7"],
        store_id="55",
        http_get=fake_get,
    )
    list(adapter.fetch())

    assert "sort=rank%20asc" in calls[0]


def test_fetch_iterates_all_configured_sections() -> None:
    calls: list[str] = []

    def fake_get(url: str) -> dict:
        calls.append(url)
        if "catId=7" in url and "skip=0" in url:
            return {"result": {"count": 1, "items": [_entry(1)]}}
        return {"result": {"count": 0, "items": []}}

    adapter = RestCatalogAdapter(
        base_url="https://api.fakesuper.test",
        provider_id="p-fake",
        market_id="DO",
        profile=FAKE_PROFILE,
        sections=["7", "9"],
        store_id="55",
        http_get=fake_get,
    )
    entries = list(adapter.fetch())

    assert [e.external_id for e in entries] == ["1"]
    assert any("catId=9" in c for c in calls)  # browse-full: itera la 2da sección


def test_fetch_paginates_until_total_count() -> None:
    seen: list[str] = []

    def fake_get(url: str) -> dict:
        skip = url.split("skip=")[1].split("&")[0]
        seen.append(skip)
        if skip == "0":
            return {"result": {"count": 3, "items": [_entry(1), _entry(2)]}}
        return {"result": {"count": 3, "items": [_entry(3)]}}

    adapter = RestCatalogAdapter(
        base_url="https://api.fakesuper.test",
        provider_id="p-fake",
        market_id="DO",
        profile=FAKE_PROFILE,
        sections=["7"],
        store_id="55",
        page_size=2,
        http_get=fake_get,
    )
    entries = list(adapter.fetch())

    assert len(entries) == 3
    assert seen == ["0", "2"]  # para en cuanto offset >= totalCount


def test_fetch_skips_items_that_fail_to_map() -> None:
    def fake_get(url: str) -> dict:
        if "skip=0" in url:
            return {"result": {"count": 2, "items": [_entry(1), {"id": 2, "title": "sin precio"}]}}
        return {"result": {"count": 2, "items": []}}

    adapter = RestCatalogAdapter(
        base_url="https://api.fakesuper.test",
        provider_id="p-fake",
        market_id="DO",
        profile=FAKE_PROFILE,
        sections=["7"],
        store_id="55",
        http_get=fake_get,
    )
    entries = list(adapter.fetch())

    assert [e.external_id for e in entries] == ["1"]  # el item sin precio se salta, no rompe
