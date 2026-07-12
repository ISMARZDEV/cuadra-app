"""Unit — `CoverCanonicals` (Loop B / cobertura dirigida, F3.1): orquestación PURA con stubs.

Verifica que: (1) itera los pares sin cubrir, (2) arma la consulta DIRIGIDA correcta (EAN-first en
VTEX), (3) delega en `RefreshCatalogPrices` (record + cascada) por cada par. No red, no DB, no cascada
real — la cascada se prueba en su propia suite; acá se aísla la orquestación.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.application.cover_canonicals import CoverCanonicals
from src.contexts.save.application.refresh_prices import RefreshResult
from src.contexts.save.domain.coverage import CoveragePair
from src.contexts.save.domain.entities import (
    CanonicalProduct,
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure


def _canonical() -> CanonicalProduct:
    return CanonicalProduct(
        "c1", "Arroz La Garza Premium", "La Garza",
        Quantity(Decimal("9.07"), UnitMeasure.MASS),
        taxonomy_node_id="t1", market_id="DO", display_size="20 Lb",
    )


class _StoreRepo:
    def __init__(self, ean: str | None) -> None:
        self._ean = ean

    def list_uncovered(self, market_id: str) -> list[CoveragePair]:
        return [CoveragePair("c1", "p1")]

    def find_ean_for_canonical(self, canonical_product_id: str) -> str | None:
        return self._ean


class _CanonicalRepo:
    def get_by_id(self, pid: str) -> CanonicalProduct:
        return _canonical()


class _SourceRepo:
    def get_by_provider_id(self, provider_id: str) -> StoreRegistry:
        return StoreRegistry("s1", "p1", SourcePlatform.VTEX, "https://sirena.do")


class _ProviderRepo:
    def get_by_id(self, pid: str) -> Provider:
        return Provider("p1", "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO")


class _Refresh:
    def __init__(self) -> None:
        self.calls: list[object] = []

    def execute(self, source: object, captured_at: object = None) -> RefreshResult:
        self.calls.append(source)
        return RefreshResult(seen=1, refreshed=0, unmatched=0, matched=1)


def _build(store_ean: str | None):  # type: ignore[no-untyped-def]
    captured: dict[str, object] = {}
    refresh = _Refresh()

    def build_adapter(source, provider, query):  # type: ignore[no-untyped-def]
        captured["query"] = query
        return object()  # adapter falso (el refresh stub no lo usa)

    uc = CoverCanonicals(
        store_repo=_StoreRepo(store_ean),
        canonical_repo=_CanonicalRepo(),
        source_repo=_SourceRepo(),
        provider_repo=_ProviderRepo(),
        refresh=refresh,  # type: ignore[arg-type]
        build_adapter=build_adapter,
    )
    return uc, captured, refresh


def test_covers_uncovered_pair_with_ean_query_on_vtex() -> None:
    uc, captured, refresh = _build(store_ean="7460083780023")

    result = uc.execute("DO")

    q = captured["query"]
    assert q.by_ean is True and q.text == "7460083780023"  # VTEX + EAN → dirigida por barcode
    assert len(refresh.calls) == 1  # delegó al pipeline (record + cascada) una vez
    assert result.pairs_attempted == 1
    assert result.matched == 1


def test_falls_back_to_name_query_when_no_ean() -> None:
    uc, captured, _ = _build(store_ean=None)

    uc.execute("DO")

    q = captured["query"]
    assert q.by_ean is False
    assert q.text == "Arroz La Garza Premium 20 Lb"
