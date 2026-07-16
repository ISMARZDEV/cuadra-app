"""Unit — `RefreshCoveredPrices` (F3.2a + §15.4 fallback A→C): orquestación PURA con stubs.

Camino A: re-fetch DIRECTO por id/url (o source_ref) → change-only. Si A no es usable (sin
localizador → DetailUnavailable; token vencido/ausente → AUTH_FAILED; plataforma sin detail →
build_detail_source None) → NO marca unavailable: DIFIERE el provider y lo refresca por BROWSE (C, una
vez por provider). Reusa F3.3 (round-robin + abort-on-down). No red, no DB.
"""
from __future__ import annotations

from dataclasses import dataclass

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


def _build(items, *, detail_for=None, browse_for=None, pace=None):  # type: ignore[no-untyped-def]
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
        **({} if pace is None else {"pace": pace}),
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


# ── F3.2b · Recovery determinista (Fase 1: solo EAN exacto) ───────────────────────────────────
# Cuando el camino A dice "ya no está" (el localizador murió: Bravo rotó el idArticulo), antes de
# ocultar el producto se intenta RE-ENCONTRARLO preguntándole a la tienda por el EAN del CANÓNICO
# (Sirena lo aporta al 100%). Habilitado por el hallazgo 2026-07-15: `filterByEan` es un lookup
# global y exacto. SupermercadosRD NO puede hacer esto en Bravo (su RecoverableShopId=1|2|3|4).
#
# REGLA DURA (SDD §14.3): auto-repara SOLO con EAN exacto. Reparar por nombre escribiría el precio
# de OTRO producto en el canónico — la versión silenciosa del false merge, que nadie revisa.


@dataclass(frozen=True)
class _Found:
    """Lo mínimo que el use-case mira de un candidato devuelto por la búsqueda dirigida."""

    external_id: str
    url: str | None
    ean: str | None


class _RecoveryRepo(_StaleRepo):
    def __init__(self, items, *, canonical_ean: str | None) -> None:  # type: ignore[no-untyped-def]
        super().__init__(items)
        self._canonical_ean = canonical_ean
        self.repaired: list[tuple[str, str, str | None]] = []

    def find_ean_for_canonical(self, canonical_product_id: str) -> str | None:
        return self._canonical_ean

    def repair_locator(self, store_product_id: str, external_id: str, url: str | None) -> None:
        self.repaired.append((store_product_id, external_id, url))


def _stale_covered(sp_id: str = "s1", canonical: str | None = "c1") -> StaleCovered:
    return StaleCovered(
        store_product_id=sp_id, provider_id="p1", external_id=f"ext-{sp_id}",
        url=None, platform=SourcePlatform.REST_CATALOG, source_ref={"id_articulo": "33631"},
        canonical_product_id=canonical,
    )


def _build_recovery(*, canonical_ean, candidates):  # type: ignore[no-untyped-def]
    repo = _RecoveryRepo([_stale_covered()], canonical_ean=canonical_ean)
    refresh = _Refresh()
    asked: list[str] = []

    def build_detail_source(item):  # type: ignore[no-untyped-def]
        return _DetailSource(entry=None)  # camino A: "ya no está"

    def build_recovery_source(item, ean):  # type: ignore[no-untyped-def]
        asked.append(ean)
        return _SourceOf(candidates)

    uc = RefreshCoveredPrices(
        store_repo=repo,
        refresh=refresh,  # type: ignore[arg-type]
        build_detail_source=build_detail_source,
        classify_error=_classify,
        build_recovery_source=build_recovery_source,
    )
    return uc, repo, refresh, asked


class _SourceOf:
    def __init__(self, entries) -> None:  # type: ignore[no-untyped-def]
        self._entries = entries

    def fetch(self):  # type: ignore[no-untyped-def]
        return list(self._entries)


def test_recovers_locator_when_the_store_still_sells_it_under_a_new_id() -> None:
    uc, repo, refresh, asked = _build_recovery(
        canonical_ean="7460083780146",
        candidates=[_Found(external_id="99999", url="https://b.test/99999", ean="7460083780146")],
    )

    result = uc.execute("DO")

    assert asked == ["7460083780146"], "le pregunta a la tienda por el EAN del canónico"
    assert repo.repaired == [("s1", "99999", "https://b.test/99999")], "repara el localizador"
    assert len(refresh.calls) == 1, "y re-precia con lo encontrado"
    assert repo.unavailable == [], "NO lo oculta: sigue a la venta"
    assert result.unavailable == 0


def test_hides_the_product_when_recovery_finds_nothing() -> None:
    uc, repo, refresh, _ = _build_recovery(canonical_ean="7460083780146", candidates=[])

    result = uc.execute("DO")

    assert repo.repaired == []
    assert repo.unavailable == ["s1"], "desapareció de verdad → se oculta (no se borra, F3.0)"
    assert result.unavailable == 1


def test_never_auto_repairs_when_the_candidate_ean_differs() -> None:
    # La tienda devolvió ALGO, pero con otro barcode → no es el mismo producto. Reparar acá
    # escribiría el precio de otro producto en el canónico. Se oculta y que lo vea un humano.
    uc, repo, _, _ = _build_recovery(
        canonical_ean="7460083780146",
        candidates=[_Found(external_id="99999", url=None, ean="7460083789999")],
    )

    uc.execute("DO")

    assert repo.repaired == [], "EAN distinto → NUNCA auto-repara"
    assert repo.unavailable == ["s1"]


def test_never_auto_repairs_when_several_candidates_share_the_ean() -> None:
    # Ambigüedad → no hay decisión determinista. Mismo criterio que la COLISIÓN de la cascada de
    # matching (>1 canónico con el mismo EAN → cola humana, jamás auto-link).
    uc, repo, _, _ = _build_recovery(
        canonical_ean="7460083780146",
        candidates=[
            _Found(external_id="1", url=None, ean="7460083780146"),
            _Found(external_id="2", url=None, ean="7460083780146"),
        ],
    )

    uc.execute("DO")

    assert repo.repaired == [], "ambiguo → NUNCA auto-repara"
    assert repo.unavailable == ["s1"]


def test_hides_without_asking_when_the_canonical_has_no_known_ean() -> None:
    # Sin EAN no hay llave determinista → la recuperación por NOMBRE es Fase 2 (propuesta a un
    # humano), nunca automática. Por ahora se oculta.
    uc, repo, _, asked = _build_recovery(canonical_ean=None, candidates=[])

    uc.execute("DO")

    assert asked == [], "ni siquiera sale a buscar"
    assert repo.unavailable == ["s1"]


# ── Pacing: la MITAD del patrón SRD que faltaba ───────────────────────────────────────────────
# `round_robin_by_store` cita `scrape-many.ts:11-77` y su docstring dice que evita rate-limits.
# Pero SRD hace DOS cosas: intercala las tiendas Y espera `randomDelay(600,1200)` ENTRE RONDAS.
# Nos trajimos el orden y dejamos la pausa. Con UNA tienda el intercalado es un NO-OP (devuelve la
# misma lista) y los N requests salen a fondo. `price_refresh` sobre Bravo es exactamente ese caso:
# una tienda, cientos de /get. Verificado en vivo 2026-07-15: Bravo responde 429.


def test_paces_between_requests_because_interleaving_alone_does_not_rate_limit() -> None:
    paced: list[int] = []
    uc, repo, refresh, _ = _build(
        [_stale("s1", "p1"), _stale("s2", "p1"), _stale("s3", "p1")],
        pace=lambda: paced.append(1),
    )

    uc.execute("DO")

    assert len(refresh.calls) == 3, "se refrescaron los 3"
    assert len(paced) == 2, "N requests → N-1 pausas (no se espera antes del primero)"


def test_does_not_pace_before_the_very_first_request() -> None:
    paced: list[int] = []
    uc, _, _, _ = _build([_stale("s1", "p1")], pace=lambda: paced.append(1))

    uc.execute("DO")

    assert paced == [], "un solo item → ninguna espera; la pausa es ENTRE requests"
