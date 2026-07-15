"""Unit — `RefreshCoveredPrices` (F3.2a + §15.4 fallback A→C): orquestación PURA con stubs.

Camino A: re-fetch DIRECTO por id/url (o source_ref) → change-only. Si A no es usable (sin
localizador → DetailUnavailable; token vencido/ausente → AUTH_FAILED; plataforma sin detail →
build_detail_source None) → NO marca unavailable: DIFIERE el provider y lo refresca por BROWSE (C, una
vez por provider). Reusa F3.3 (round-robin + abort-on-down). No red, no DB.
"""
from __future__ import annotations

from src.contexts.save.application.refresh_covered_prices import RefreshCoveredPrices
from src.contexts.save.application.refresh_prices import RefreshResult
from src.contexts.save.domain.coverage import StaleCovered
from src.contexts.save.domain.entities import SourcePlatform
from src.contexts.save.domain.fetch_outcome import DetailUnavailable, FetchErrorKind, FetchOutcome


class _BackendDown(Exception):
    pass


class _AuthError(Exception):
    pass


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
    def __init__(self, *, entry: object = object(), raises: Exception | None = None) -> None:
        self._entry = entry
        self._raises = raises

    def fetch_by_external_id(self, external_id, url, source_ref=None):  # type: ignore[no-untyped-def]
        if self._raises is not None:
            raise self._raises
        return self._entry


class _Refresh:
    def __init__(self) -> None:
        self.calls: list[object] = []

    def execute(self, source: object, captured_at: object = None) -> RefreshResult:
        self.calls.append(source)
        return RefreshResult(seen=1, refreshed=1, unmatched=0, matched=0)


def _stale(sp_id: str, provider: str, platform=SourcePlatform.VTEX) -> StaleCovered:  # type: ignore[no-untyped-def]
    return StaleCovered(
        store_product_id=sp_id, provider_id=provider, external_id=f"ext-{sp_id}",
        url=None, platform=platform, source_ref=None,
    )


def _classify(exc: Exception) -> FetchOutcome:
    if isinstance(exc, _BackendDown):
        return FetchOutcome(kind=FetchErrorKind.BACKEND_DOWN, retryable=True, hide=False)
    if isinstance(exc, _AuthError):
        return FetchOutcome(kind=FetchErrorKind.AUTH_FAILED, retryable=False, hide=False)
    return FetchOutcome(kind=FetchErrorKind.FATAL, retryable=False, hide=False)


def _build(items, *, detail_for=None, browse_for=None):  # type: ignore[no-untyped-def]
    repo = _StaleRepo(items)
    refresh = _Refresh()
    browsed: list[str] = []

    def build_detail_source(item):  # type: ignore[no-untyped-def]
        return (detail_for or (lambda it: _DetailSource()))(item)

    def build_browse_source(pid):  # type: ignore[no-untyped-def]
        browsed.append(pid)
        return (browse_for or (lambda p: object()))(pid)

    uc = RefreshCoveredPrices(
        store_repo=repo,
        refresh=refresh,  # type: ignore[arg-type]
        build_detail_source=build_detail_source,
        build_browse_source=build_browse_source,
        classify_error=_classify,
    )
    return uc, repo, refresh, browsed


def test_refreshes_via_detail_path_a() -> None:
    uc, repo, refresh, browsed = _build([_stale("s1", "p1")])

    result = uc.execute("DO")

    assert len(refresh.calls) == 1 and repo.unavailable == [] and browsed == []
    assert result.refreshed == 1 and result.checked == 1


def test_marks_unavailable_when_detail_finds_nothing() -> None:
    uc, repo, refresh, browsed = _build(
        [_stale("s1", "p1")], detail_for=lambda it: _DetailSource(entry=None)
    )

    result = uc.execute("DO")

    assert repo.unavailable == ["s1"] and refresh.calls == [] and browsed == []
    assert result.unavailable == 1


def test_defers_to_browse_on_detail_unavailable() -> None:
    # Sin localizador → DetailUnavailable → NO unavailable: se refresca por browse (C).
    uc, repo, refresh, browsed = _build(
        [_stale("s1", "p1", platform=SourcePlatform.REST_CATALOG)],
        detail_for=lambda it: _DetailSource(raises=DetailUnavailable("sin id")),
    )

    result = uc.execute("DO")

    assert repo.unavailable == []          # NO se oculta por falta de camino A
    assert browsed == ["p1"]               # se refrescó por browse
    assert result.browsed_providers == 1
    assert len(refresh.calls) == 1         # el browse pasó por el refresh


def test_defers_to_browse_on_auth_failed() -> None:
    # Token vencido/ausente (403 → AUTH_FAILED) → fallback browse, no unavailable.
    uc, repo, _refresh, browsed = _build(
        [_stale("s1", "p1", platform=SourcePlatform.REST_CATALOG)],
        detail_for=lambda it: _DetailSource(raises=_AuthError()),
    )

    result = uc.execute("DO")

    assert repo.unavailable == [] and browsed == ["p1"] and result.browsed_providers == 1


def test_defers_when_no_detail_source() -> None:
    # Plataforma sin detail (build_detail_source None) → browse.
    uc, _repo, _refresh, browsed = _build(
        [_stale("s1", "p1", platform=SourcePlatform.AGGREGATOR)], detail_for=lambda it: None
    )

    result = uc.execute("DO")

    assert browsed == ["p1"] and result.browsed_providers == 1


def test_deferred_provider_browsed_once_not_per_item() -> None:
    # 2 items del mismo provider diferido → UN solo browse (no uno por item).
    uc, _repo, _refresh, browsed = _build(
        [_stale("s1", "p1"), _stale("s2", "p1")], detail_for=lambda it: None
    )

    uc.execute("DO")

    assert browsed == ["p1"]


def test_round_robin_and_abort_on_downed_store() -> None:
    items = [_stale("a1", "A"), _stale("a2", "A"), _stale("b1", "B"), _stale("b2", "B")]

    def detail_for(item):  # type: ignore[no-untyped-def]
        return _DetailSource(raises=_BackendDown()) if item.provider_id == "A" else _DetailSource()

    uc, _repo, refresh, browsed = _build(items, detail_for=detail_for)

    result = uc.execute("DO")

    # A cae (retryable) → abort; B ok. Ni A se difiere (abort ≠ defer).
    assert len(refresh.calls) == 2 and result.stores_aborted == 1 and browsed == []


def test_uses_injected_stale_source_over_covered_default() -> None:
    """El asset `price_refresh` reusa ESTE use-case pero con `list_stale_known` (incluye NO cubiertos).
    Inyectando `stale_source`, re-precia ese conjunto en vez del covered-only por defecto."""
    repo = _StaleRepo([])  # list_stale_covered → VACÍO
    refresh = _Refresh()
    known = [_stale("k1", "p1")]

    uc = RefreshCoveredPrices(
        store_repo=repo,
        refresh=refresh,  # type: ignore[arg-type]
        build_detail_source=lambda item: _DetailSource(),
        stale_source=lambda market, now=None: known,  # inyectado (known, no covered)
    )

    result = uc.execute("DO")

    assert result.checked == 1 and result.refreshed == 1  # usó el inyectado, no el covered-only vacío


def test_defaults_to_covered_when_no_stale_source_injected() -> None:
    """Sin inyección → F3.2a intacto (covered-only vía `store_repo.list_stale_covered`)."""
    repo = _StaleRepo([_stale("c1", "p1")])
    refresh = _Refresh()

    uc = RefreshCoveredPrices(
        store_repo=repo,
        refresh=refresh,  # type: ignore[arg-type]
        build_detail_source=lambda item: _DetailSource(),
    )

    assert uc.execute("DO").checked == 1
