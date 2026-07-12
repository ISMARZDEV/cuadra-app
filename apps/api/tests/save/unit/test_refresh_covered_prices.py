"""Unit — `RefreshCoveredPrices` (F3.2a / frescura: refrescar lo ya cubierto): orquestación PURA.

Recorre los `store_product` cubiertos y VIEJOS (`list_stale_covered`, TTL 18h/3d), y por cada uno hace
un re-fetch DIRECTO por su `external_id`/`url` conocido (camino A) → lo enruta al MISMO pipeline de
refresh (`record_observation`, change-only: precio igual → solo bumpea last_seen_at; distinto → fila de
histórico). Si el re-fetch no lo encuentra (A falla) → `is_available=false` (fase 1, sin B todavía).
Salta plataformas browse-only (no soportan fetch-by-id) y aborta una tienda caída (reusa F3.3). No red,
no DB.
"""
from __future__ import annotations

from src.contexts.save.application.refresh_covered_prices import RefreshCoveredPrices
from src.contexts.save.application.refresh_prices import RefreshResult
from src.contexts.save.domain.coverage import StaleCovered
from src.contexts.save.domain.entities import SourcePlatform


class _StaleRepo:
    def __init__(self, items: list[StaleCovered]) -> None:
        self._items = items
        self.unavailable: list[str] = []

    def list_stale_covered(self, market_id: str, now=None, **kw):  # type: ignore[no-untyped-def]
        return self._items

    def set_availability(self, store_product_id: str, available: bool) -> None:
        if not available:
            self.unavailable.append(store_product_id)


class _DetailSource:
    """Fake `ProductDetailSource`: devuelve un entry (marcador) o None (no encontrado)."""

    def __init__(self, entry: object | None) -> None:
        self._entry = entry

    def fetch_by_external_id(self, external_id: str, url: str | None):  # type: ignore[no-untyped-def]
        return self._entry


class _FailingDetailSource:
    def fetch_by_external_id(self, external_id: str, url: str | None):  # type: ignore[no-untyped-def]
        raise _BackendDown()


class _BackendDown(Exception):
    pass


class _Refresh:
    def __init__(self) -> None:
        self.calls: list[object] = []

    def execute(self, source: object, captured_at: object = None) -> RefreshResult:
        self.calls.append(list(source.fetch()))  # type: ignore[attr-defined]
        return RefreshResult(seen=1, refreshed=1, unmatched=0, matched=0)


def _stale(sp_id: str, provider: str, platform=SourcePlatform.VTEX) -> StaleCovered:  # type: ignore[no-untyped-def]
    return StaleCovered(
        store_product_id=sp_id, provider_id=provider, external_id=f"ext-{sp_id}",
        url=f"https://x.do/{sp_id}", platform=platform,
    )


def _build(items, *, detail_for=None, classify=None):  # type: ignore[no-untyped-def]
    repo = _StaleRepo(items)
    refresh = _Refresh()
    order: list[str] = []

    def build_detail_source(item: StaleCovered):  # type: ignore[no-untyped-def]
        order.append(item.provider_id)
        return (detail_for or (lambda it: _DetailSource(object())))(item)

    uc = RefreshCoveredPrices(
        store_repo=repo,
        refresh=refresh,  # type: ignore[arg-type]
        build_detail_source=build_detail_source,
        **({"classify_error": classify} if classify else {}),
    )
    return uc, repo, refresh, order


def test_refreshes_a_stale_covered_product_via_direct_fetch() -> None:
    uc, repo, refresh, _ = _build([_stale("s1", "p1")])

    result = uc.execute("DO")

    assert len(refresh.calls) == 1          # camino A → record_observation (change-only)
    assert repo.unavailable == []           # se encontró → sigue disponible
    assert result.checked == 1
    assert result.refreshed == 1


def test_marks_unavailable_when_direct_fetch_finds_nothing() -> None:
    # A no lo encuentra (fase 1, sin B) → is_available=false, NO se borra.
    uc, repo, refresh, _ = _build([_stale("s1", "p1")], detail_for=lambda it: _DetailSource(None))

    result = uc.execute("DO")

    assert refresh.calls == []
    assert repo.unavailable == ["s1"]
    assert result.unavailable == 1


def test_skips_browse_only_platforms() -> None:
    # REST_CATALOG no soporta fetch-by-id → lo refresca el browse de Loop A, no F3.2a.
    uc, repo, refresh, order = _build([_stale("s1", "p1", platform=SourcePlatform.REST_CATALOG)])

    result = uc.execute("DO")

    assert order == []                      # ni se construyó el detail source
    assert refresh.calls == [] and repo.unavailable == []
    assert result.checked == 0


def test_round_robin_and_abort_on_downed_store() -> None:
    from src.contexts.save.domain.fetch_outcome import FetchErrorKind, FetchOutcome

    items = [_stale("a1", "A"), _stale("a2", "A"), _stale("b1", "B"), _stale("b2", "B")]

    def detail_for(item: StaleCovered):  # type: ignore[no-untyped-def]
        return _FailingDetailSource() if item.provider_id == "A" else _DetailSource(object())

    def classify(exc: Exception) -> FetchOutcome:
        if isinstance(exc, _BackendDown):
            return FetchOutcome(kind=FetchErrorKind.BACKEND_DOWN, retryable=True, hide=False)
        return FetchOutcome(kind=FetchErrorKind.FATAL, retryable=False, hide=False)

    uc, _repo, refresh, order = _build(items, detail_for=detail_for, classify=classify)

    result = uc.execute("DO")

    # RR = A(cae→abort),B(ok),A(saltado),B(ok) → solo B llega al refresh
    assert len(refresh.calls) == 2
    assert result.stores_aborted == 1
