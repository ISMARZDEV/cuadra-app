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
from src.contexts.save.domain.directed_query import DirectedCapability
from src.contexts.save.domain.entities import (
    CanonicalProduct,
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure


def _ean_of(canonical_product_id: str) -> str:
    """Barcode determinista por canónico. No hace falta que sea válido GS1: `select_ean_match`
    COMPARA cadenas (los dos lados ya vienen normalizados a GTIN-14 desde la escritura)."""
    return f"0746008378{sum(map(ord, canonical_product_id)) % 10000:04d}"


def _canonical() -> CanonicalProduct:
    return CanonicalProduct(
        "c1", "Arroz La Garza Premium", "La Garza",
        Quantity(Decimal("9.07"), UnitMeasure.MASS),
        taxonomy_node_id="t1", market_id="DO", display_size="20 Lb",
    )


@dataclass(frozen=True)
class _Cand:
    """Candidato crudo mínimo — `select_ean_match` solo lee ean; `provider` es para que el
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


# ── R4: la Cobertura es BARCODE PURO, y sin hallazgo DESCARTA (no encola) ─────────────────────
# Antes, un canónico sin barcode caía a una consulta por NOMBRE — metiendo descubrimiento adentro de
# cobertura. Y si la tienda devolvía cualquier cosa, se tomaba "la más parecida". Los dos son la
# misma clase de error: convertir "no lo encontré" en "acá está".


def test_a_canonical_without_a_barcode_is_not_for_this_process() -> None:
    # No hay nada que preguntar: el Proceso 2 identifica POR barcode. Este canónico se descubre por
    # nombre en el Proceso 1, que tiene cola y revisión humana. Ni siquiera se hace la request.
    uc, captured, refresh = _build(store_ean=None)

    result = uc.execute("DO")

    assert "query" not in captured, "se armó una consulta para un canónico sin barcode"
    assert refresh.calls == []
    assert result.pairs_attempted == 0


def test_only_the_candidate_carrying_the_barcode_reaches_the_cascade() -> None:
    # La tienda devuelve ruido + el real → solo el REAL pasa a la cascada (no los 3). El criterio es
    # el barcode, no el parecido del nombre.
    noise_a = _Cand("Azucar Crema Blanca", ean="00000000000017")
    real = _Cand("GOYA GANDULES C/ COCO", ean="7460083780023")  # nombre irreconocible, barcode exacto
    noise_b = _Cand("Arroz La Garza Premium 20 Lb", ean=None)   # nombre IDÉNTICO al objetivo, sin barcode
    uc, _captured, refresh = _build(
        store_ean="7460083780023", candidates=[noise_a, real, noise_b]
    )

    result = uc.execute("DO")

    assert refresh.received == [[real]]
    assert result.matched == 1


def test_discards_instead_of_queueing_when_the_barcode_is_not_there() -> None:
    # "Si no se encuentra, se descarta". La cola es para lo que un humano debe DECIDIR; acá no hay
    # decisión, hay ausencia. Encolar un "no está" ahogaría la cola con intentos fallidos.
    uc, _captured, refresh = _build(
        store_ean="7460083780023",
        candidates=[_Cand("Azucar Crema", ean="00000000000017"), _Cand("Detergente Ace")],
    )

    result = uc.execute("DO")

    assert refresh.calls == []  # nada entró a la cascada → nada pudo encolarse
    assert result.matched == 0
    assert result.pairs_attempted == 1  # se preguntó, y la respuesta fue "no lo tengo"


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
        # R4: la Cobertura es barcode puro y `list_uncovered` (R5) solo lista EAN-alcanzables →
        # un par sin barcode ya no llega hasta acá. Un barcode determinista por canónico.
        return _ean_of(canonical_product_id)


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
        # El candidato trae el barcode del canónico pedido: la tienda respetó el filtro.
        return _FetchAdapter(
            [_Cand("Arroz La Garza Premium", ean=query.text, provider=provider.id)]
        )

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


# ── Loop B en fuentes REST cuyo PROFILE sabe buscar por EAN ───────────────────────────────────
# Bravo es REST_CATALOG: por PLATAFORMA es browse-only y Loop B la saltea (correcto por defecto —
# correr Loop B sobre un browse-full costaría N navegaciones del catálogo entero). Pero su profile
# declara `model.filterByEan` → lookup exacto en UNA request (verificado en vivo 2026-07-15).
# La capacidad la calcula INFRAESTRUCTURA (única capa que conoce profiles) y se inyecta; el
# use-case solo consume {supported, by_ean}, sin enterarse de que existe un profile "bravova".


class _RestSourceRepo:
    def get_by_provider_id(self, provider_id: str) -> StoreRegistry:
        return StoreRegistry(
            "s2", "p1", SourcePlatform.REST_CATALOG, "https://bravova-api.test",
            endpoints={"profile": "bravova", "store_id": "1000", "sections": ["14"]},
        )


def _build_rest(capability_of=None, pace=None, store_ean="7460083780023"):  # type: ignore[no-untyped-def]
    captured: dict[str, object] = {}
    refresh = _Refresh()

    def build_adapter(source, provider, query):  # type: ignore[no-untyped-def]
        captured["query"] = query
        return _FetchAdapter([_Cand("Arroz La Garza Premium", ean="7460083780023")])

    kwargs = {} if capability_of is None else {"capability_of": capability_of}
    if pace is not None:
        kwargs["pace"] = pace
    uc = CoverCanonicals(
        store_repo=_StoreRepo(store_ean),
        canonical_repo=_CanonicalRepo(),
        source_repo=_RestSourceRepo(),
        provider_repo=_ProviderRepo(),
        refresh=refresh,  # type: ignore[arg-type]
        build_adapter=build_adapter,
        **kwargs,
    )
    return uc, captured, refresh


def test_covers_rest_source_when_injected_capability_says_it_looks_up_by_ean() -> None:
    uc, captured, refresh = _build_rest(
        capability_of=lambda source: DirectedCapability(by_ean=True, by_text=True)
    )

    result = uc.execute("DO")

    q = captured["query"]
    assert q.by_ean is True and q.text == "7460083780023"  # le pide el barcode, no el nombre
    assert result.pairs_attempted == 1, "REST con lookup por EAN SÍ es target de Loop B"
    assert len(refresh.calls) == 1


def test_skips_rest_source_by_default_because_the_platform_alone_means_browse_only() -> None:
    # Sin capacidad inyectada manda el default de plataforma → retrocompatible: Bravo se saltea.
    uc, captured, refresh = _build_rest()

    result = uc.execute("DO")

    assert result.pairs_attempted == 0
    assert "query" not in captured, "ni siquiera construye el adapter"
    assert refresh.calls == []


def test_paces_between_stores_because_interleaving_alone_does_not_rate_limit() -> None:
    """Loop B tiene el mismo agujero que la frescura: `round_robin_by_store` reordena, pero sin la
    pausa de SRD (`randomDelay(600,1200)` entre rondas) los requests salen a fondo. Con Bravo ahora
    habilitado (lookup por EAN), Loop B le va a pegar UNA vez por canónico — sin pausa, eso es un 429.
    """
    paced: list[int] = []
    uc, _, refresh = _build_rest(
        capability_of=lambda source: DirectedCapability(by_ean=True, by_text=True),
        pace=lambda: paced.append(1),
    )

    uc.execute("DO")

    assert len(refresh.calls) == 1
    assert paced == [], "un solo par → ninguna espera (la pausa es ENTRE requests)"


def test_skips_the_pair_when_the_store_only_knows_barcode_and_the_canonical_has_none() -> None:
    """EL GATE QUE FALTABA (bug del experimento 2026-07-15).

    Bravo encuentra por barcode pero es CIEGO al texto. Si el canónico no tiene EAN,
    `build_directed_query` cae al NOMBRE — y el adapter REST ignora el texto y browsea las 41
    secciones. Con 23 canónicos sin EAN eso son MILES de requests: el desastre que el gate
    browse-only prevenía y que yo reintroduje al declarar a Bravo "dirigible" sin decir CÓMO.

    Sin llave utilizable, el par NO se intenta: ese canónico es trabajo de Loop A.
    """
    uc, captured, refresh = _build_rest(
        capability_of=lambda source: DirectedCapability(by_ean=True, by_text=False),
        store_ean=None,  # el canónico no tiene barcode conocido
    )

    result = uc.execute("DO")

    assert result.pairs_attempted == 0, "sin EAN y sin búsqueda por texto → no hay consulta posible"
    assert "query" not in captured, "ni siquiera construye el adapter (eso ya sería el browse)"
    assert refresh.calls == []


def test_a_store_that_only_searches_by_text_has_no_place_in_coverage() -> None:
    """R4 — la división del modelo: **Cobertura = barcode puro / Descubrimiento = texto**.

    Este test decía lo contrario: que una tienda con `by_text` cubriera por NOMBRE cuando el canónico
    no tenía barcode. Eso metía descubrimiento adentro de cobertura — y el Descubrimiento ya hace ese
    trabajo mejor, porque tiene cola y canonización humana. La Cobertura es el proceso BARATO y
    ESPECÍFICO: preguntar por un artículo puntual, por su código. Si no se puede preguntar por
    código, no es su trabajo.

    Magento (by_ean=False) queda entonces FUERA del Proceso 2 por completo, que es correcto: nunca
    expone barcodes. Sus productos se descubren por nombre y consiguen EAN cuando Sirena o Bravo los
    matchean (R7).
    """
    uc, captured, refresh = _build_rest(
        capability_of=lambda source: DirectedCapability(by_ean=False, by_text=True),
        store_ean="7460083780023",  # el canónico SÍ tiene barcode…
    )

    result = uc.execute("DO")

    # …pero la tienda no sabe buscar por barcode → no hay cobertura posible acá.
    assert result.pairs_attempted == 0
    assert "query" not in captured
    assert refresh.calls == []
