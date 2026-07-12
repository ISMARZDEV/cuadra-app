"""Unit — `CoverCanonicals` (Loop B / cobertura dirigida): orquestación PURA con stubs.

Verifica que: (1) itera los pares sin cubrir (round-robin por tienda), (2) arma la consulta DIRIGIDA
(EAN-first en VTEX), (3) SELECCIONA el mejor candidato PARA el canónico objetivo y solo ESE pasa a la
cascada (`RefreshCatalogPrices`) — NO ingesta los 65 resultados (fix live 2026-07-12), (4) salta
tiendas browse-only y (5) aborta una tienda caída (F3.3). No red, no DB, no cascada real.
"""
from __future__ import annotations

from dataclasses import dataclass
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


@dataclass(frozen=True)
class _Cand:
    """Candidato crudo mínimo — `select_best_candidate` solo lee name/ean; `provider` es para que el
    refresh-fake sepa de qué tienda vino (la cascada real recibiría un RawCatalogEntry completo)."""

    name: str
    ean: str | None = None
    provider: str = "p1"


class _FetchAdapter:
    def __init__(self, cands: list[_Cand]) -> None:
        self._cands = cands

    def fetch(self):  # type: ignore[no-untyped-def]
        return iter(self._cands)


class _FailingAdapter:
    """Tienda caída: `fetch()` revienta (equivale a un 503 tras agotar reintentos)."""

    def fetch(self):  # type: ignore[no-untyped-def]
        raise _BackendDown()


class _BackendDown(Exception):
    pass


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
        self.calls: list[str] = []
        self.received: list[list[_Cand]] = []

    def execute(self, source: object, captured_at: object = None) -> RefreshResult:
        entries = list(source.fetch())  # type: ignore[attr-defined]
        self.received.append(entries)
        self.calls.append(entries[0].provider if entries else "?")
        return RefreshResult(seen=1, refreshed=0, unmatched=0, matched=1)


def _build(store_ean: str | None, candidates: list[_Cand] | None = None):  # type: ignore[no-untyped-def]
    captured: dict[str, object] = {}
    refresh = _Refresh()
    cands = candidates if candidates is not None else [_Cand("Arroz La Garza Premium", ean=store_ean)]

    def build_adapter(source, provider, query):  # type: ignore[no-untyped-def]
        captured["query"] = query
        return _FetchAdapter(cands)

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


def test_selects_best_candidate_for_target_not_all_results() -> None:
    # La tienda devuelve ruido + el real → solo el REAL pasa a la cascada (no los 3).
    noise_a = _Cand("Azucar Crema Blanca")
    real = _Cand("Arroz La Garza Premium 20 Lb")
    noise_b = _Cand("Cafe Santo Domingo 1 Lb")
    uc, _captured, refresh = _build(store_ean=None, candidates=[noise_a, real, noise_b])

    result = uc.execute("DO")

    assert refresh.received == [[real]]  # UN solo candidato — el mejor para el objetivo
    assert result.matched == 1


def test_skips_pair_when_no_relevant_candidate() -> None:
    # Solo ruido → no se ingesta nada, el canónico queda sin cubrir (no se fuerza un mal match).
    uc, _captured, refresh = _build(
        store_ean=None, candidates=[_Cand("Azucar Crema"), _Cand("Detergente Ace")]
    )

    result = uc.execute("DO")

    assert refresh.calls == []
    assert result.matched == 0


# --- round-robin + abort-on-down + gate browse-only (F3.3) --------------------------------------

class _MultiStoreRepo:
    def list_uncovered(self, market_id: str) -> list[CoveragePair]:
        return [
            CoveragePair("cA1", "A"),
            CoveragePair("cA2", "A"),
            CoveragePair("cB1", "B"),
            CoveragePair("cB2", "B"),
        ]

    def find_ean_for_canonical(self, canonical_product_id: str) -> str | None:
        return None


class _AnyCanonicalRepo:
    def get_by_id(self, pid: str) -> CanonicalProduct:
        return _canonical()


class _PerProviderSourceRepo:
    def get_by_provider_id(self, provider_id: str) -> StoreRegistry:
        return StoreRegistry(f"s-{provider_id}", provider_id, SourcePlatform.VTEX, "https://x.do")


class _PerProviderProviderRepo:
    def get_by_id(self, pid: str) -> Provider:
        return Provider(pid, pid, ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO")


def _build_multi(down_provider: str):  # type: ignore[no-untyped-def]
    from src.contexts.save.domain.fetch_outcome import FetchErrorKind, FetchOutcome

    refresh = _Refresh()
    order: list[str] = []

    def build_adapter(source, provider, query):  # type: ignore[no-untyped-def]
        order.append(provider.id)
        if provider.id == down_provider:
            return _FailingAdapter()
        return _FetchAdapter([_Cand("Arroz La Garza Premium", provider=provider.id)])

    def classify(exc: Exception) -> FetchOutcome:
        if isinstance(exc, _BackendDown):
            return FetchOutcome(kind=FetchErrorKind.BACKEND_DOWN, retryable=True, hide=False)
        return FetchOutcome(kind=FetchErrorKind.FATAL, retryable=False, hide=False)

    uc = CoverCanonicals(
        store_repo=_MultiStoreRepo(),
        canonical_repo=_AnyCanonicalRepo(),
        source_repo=_PerProviderSourceRepo(),
        provider_repo=_PerProviderProviderRepo(),
        refresh=refresh,  # type: ignore[arg-type]
        build_adapter=build_adapter,
        classify_error=classify,
    )
    return uc, refresh, order


def test_round_robin_interleaves_stores() -> None:
    uc, _refresh, order = _build_multi(down_provider="__none__")

    uc.execute("DO")

    assert order == ["A", "B", "A", "B"]  # entrada A,A,B,B → intercalado A,B,A,B


def test_aborts_remaining_pairs_of_a_downed_store() -> None:
    uc, refresh, _order = _build_multi(down_provider="A")

    result = uc.execute("DO")

    # A cae en su primer fetch → sus pares restantes NO se intentan; B completo.
    assert refresh.calls == ["B", "B"]
    assert result.stores_aborted == 1
    assert result.matched == 2


class _BrowseOnlySourceRepo:
    def get_by_provider_id(self, provider_id: str) -> StoreRegistry:
        return StoreRegistry("s1", "p1", SourcePlatform.REST_CATALOG, "https://bravo.do")


def test_skips_browse_only_stores() -> None:
    refresh = _Refresh()
    built: list[object] = []

    def build_adapter(source, provider, query):  # type: ignore[no-untyped-def]
        built.append(source)
        return _FetchAdapter([_Cand("x")])

    uc = CoverCanonicals(
        store_repo=_StoreRepo(None),
        canonical_repo=_CanonicalRepo(),
        source_repo=_BrowseOnlySourceRepo(),
        provider_repo=_ProviderRepo(),
        refresh=refresh,  # type: ignore[arg-type]
        build_adapter=build_adapter,
    )

    result = uc.execute("DO")

    assert built == []          # nunca se construyó adapter para la tienda browse-only
    assert refresh.calls == []
    assert result.pairs_attempted == 0
