"""Unit — composition root de la ingesta (ingestion.save.composition): selección del
`EmbeddingProvider`. Sin red, sin DB, sin LLM real (el juez se neutraliza).

Invariante crítico (cuadra-save-matching, gotcha #5 — one embedding model per index): el matcher
y el backfill de canónicos DEBEN embeber con el MISMO provider. Si el índice se escribe con un
provider y la query se hace con otro, viven en espacios vectoriales distintos y la etapa semántica
queda inerte/corrupta. Sin `SAVE_BGE_M3_ENDPOINT_URL` ambos caen a BGE-M3 in-process; con la URL
seteada, ambos usan el endpoint HTTP. Los dos providers usan el MISMO modelo (`BAAI/bge-m3`).
"""
from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

from ingestion.save import composition
from src.config import settings
from src.contexts.save.infrastructure.matching.embeddings import (
    BgeM3EmbeddingProvider,
    SentenceTransformersEmbeddingProvider,
)


@pytest.fixture
def _cascade_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "save_matching_cascade_enabled", True)
    # Construir un LlmJudge real armaría un cliente LLM (get_chat_model): fuera del scope de
    # este test de wiring — lo reemplazamos por un stub.
    monkeypatch.setattr(composition, "LlmJudge", lambda: MagicMock())


def test_embedding_provider_falls_back_to_in_process_without_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "")
    assert isinstance(
        composition.build_embedding_provider(), SentenceTransformersEmbeddingProvider
    )


def test_embedding_provider_uses_http_endpoint_when_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "http://bge:8080")
    assert isinstance(composition.build_embedding_provider(), BgeM3EmbeddingProvider)


def test_matcher_and_canonical_embedder_share_provider_in_process(
    _cascade_enabled: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    # in-process (sin endpoint): matcher e índice DEBEN usar el mismo provider → vectores comparables
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "")
    session = MagicMock()

    matcher = composition.build_matcher(session)
    embedder = composition.build_canonical_embedder(session)

    assert matcher is not None and embedder is not None
    assert type(matcher._embedder) is type(embedder._embedder)
    assert isinstance(matcher._embedder, SentenceTransformersEmbeddingProvider)


def test_matcher_uses_http_provider_when_endpoint_set(
    _cascade_enabled: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "http://bge:8080")

    matcher = composition.build_matcher(MagicMock())

    assert matcher is not None
    assert isinstance(matcher._embedder, BgeM3EmbeddingProvider)


def _bravo_registry(sections: list[str]):  # type: ignore[no-untyped-def]
    from src.contexts.save.domain.entities import SourcePlatform, StoreRegistry

    return StoreRegistry(
        "s1", "p-bravo", SourcePlatform.REST_CATALOG, "https://bravova-api.superbravo.com.do",
        endpoints={"profile": "bravova", "sections": sections, "store_id": "1000"},
    )


def test_partition_key_roundtrip() -> None:
    key = composition.rest_catalog_partition_key("p-bravo", "14")
    assert key == "p-bravo:14"
    assert composition.parse_rest_catalog_partition_key(key) == ("p-bravo", "14")


def test_rest_catalog_partition_keys_filters_rest_and_expands_sections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Una clave `{provider}:{section}` por cada sección de cada fuente REST_CATALOG; VTEX/Magento se
    saltan (tienen su propio asset). Es lo que el sensor sincroniza con las particiones dinámicas."""
    from src.contexts.save.domain.entities import SourcePlatform, StoreRegistry

    bravo = _bravo_registry(["3", "14", "1018"])
    sirena = StoreRegistry("s2", "p-sirena", SourcePlatform.VTEX, "https://www.sirena.do")

    class FakeRegRepo:
        def __init__(self, session: object) -> None: ...
        def list_by_market(self, market: str) -> list[StoreRegistry]:
            return [bravo, sirena]

    monkeypatch.setattr(composition, "SqlStoreRegistryRepository", FakeRegRepo)

    keys = composition.rest_catalog_partition_keys(object())

    assert keys == ["p-bravo:3", "p-bravo:14", "p-bravo:1018"]  # Sirena (VTEX) NO aparece


def test_build_rest_catalog_source_for_single_section(monkeypatch: pytest.MonkeyPatch) -> None:
    """El partitioned asset materializa UNA sección: construye el adapter de esa (provider, section)."""
    from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import RestCatalogAdapter

    bravo = _bravo_registry(["3", "14", "1018"])

    class FakeRegRepo:
        def __init__(self, session: object) -> None: ...
        def get_by_provider_id(self, provider_id: str):  # type: ignore[no-untyped-def]
            return bravo if provider_id == "p-bravo" else None

    monkeypatch.setattr(composition, "SqlStoreRegistryRepository", FakeRegRepo)

    source = composition.build_rest_catalog_source_for(object(), "p-bravo", "14")

    assert isinstance(source, RestCatalogAdapter)
    assert source._sections == ["14"]  # SOLO esa sección
    assert composition.build_rest_catalog_source_for(object(), "p-inexistente", "14") is None


# ── F3.2b · wiring de producción del recovery ─────────────────────────────────────────────────


def _bravo_recovery_registry():  # type: ignore[no-untyped-def]
    from src.contexts.save.domain.entities import SourcePlatform, StoreRegistry

    return StoreRegistry(
        "s1", "p-bravo", SourcePlatform.REST_CATALOG, "https://bravova-api.test",
        endpoints={"profile": "bravova", "store_id": "1000", "sections": ["14"]},
    )


def _recovery_builder(monkeypatch: pytest.MonkeyPatch, registry):  # type: ignore[no-untyped-def]
    """Extrae el `build_recovery_source` que la composición inyecta, sin tocar la DB."""
    monkeypatch.setattr(composition, "SqlStoreProductRepository", lambda s: MagicMock())
    monkeypatch.setattr(composition, "RefreshCatalogPrices", lambda *a, **k: MagicMock())
    repo = MagicMock()
    repo.list_by_market.return_value = [registry]
    monkeypatch.setattr(composition, "SqlStoreRegistryRepository", lambda s: repo)
    captured: dict = {}
    real = composition.RefreshCoveredPrices

    def spy(**kw):  # type: ignore[no-untyped-def]
        captured.update(kw)
        return MagicMock()

    monkeypatch.setattr(composition, "RefreshCoveredPrices", spy)
    composition.build_refresh_covered_prices(MagicMock())
    assert real is not None
    return captured


def test_recovery_source_is_wired_and_asks_bravo_by_barcode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.contexts.save.domain.coverage import StaleCovered
    from src.contexts.save.domain.entities import SourcePlatform
    from src.contexts.save.infrastructure.catalog_sources.rest_catalog_adapter import (
        RestCatalogAdapter,
    )

    captured = _recovery_builder(monkeypatch, _bravo_recovery_registry())
    build = captured["build_recovery_source"]

    item = StaleCovered(
        store_product_id="sp1", provider_id="p-bravo", external_id="33631", url=None,
        platform=SourcePlatform.REST_CATALOG, canonical_product_id="c1",
    )
    source = build(item, "7460083780146")

    assert isinstance(source, RestCatalogAdapter)
    assert source._ean == "7460083780146", "recovery le pregunta a Bravo por el barcode"


def test_no_recovery_source_for_stores_that_cannot_look_up_by_barcode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Magento busca por término, no por barcode → no hay llave determinista → sin recovery.
    from src.contexts.save.domain.coverage import StaleCovered
    from src.contexts.save.domain.entities import SourcePlatform, StoreRegistry

    reg = StoreRegistry("s3", "p-nac", SourcePlatform.MAGENTO, "https://nacional.test")
    captured = _recovery_builder(monkeypatch, reg)
    item = StaleCovered(
        store_product_id="sp2", provider_id="p-nac", external_id="x", url=None,
        platform=SourcePlatform.MAGENTO, canonical_product_id="c1",
    )

    assert captured["build_recovery_source"](item, "7460083780146") is None


# ── El wiring de la protección (el test que faltaba) ──────────────────────────────────────────
# `round_robin_by_store` decía en su docstring que evitaba rate-limits, pero solo copió el
# INTERCALADO de SRD y no su `randomDelay(600,1200)`. Nadie lo notó porque NADIE TESTEÓ EL WIRING de
# la protección. El bug no fue "faltó una pausa": fue que una salvaguarda sin test de wiring es una
# salvaguarda que no existe. Estos tests fallan si alguien vuelve a dejar el pacing sin conectar.


def _wired_kwargs(monkeypatch: pytest.MonkeyPatch, builder, registry=None):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(composition, "SqlStoreProductRepository", lambda s: MagicMock())
    monkeypatch.setattr(composition, "RefreshCatalogPrices", lambda *a, **k: MagicMock())
    monkeypatch.setattr(composition, "SqlCanonicalProductRepository", lambda s: MagicMock())
    monkeypatch.setattr(composition, "SqlProviderRepository", lambda s: MagicMock())
    repo = MagicMock()
    repo.list_by_market.return_value = [registry] if registry else []
    monkeypatch.setattr(composition, "SqlStoreRegistryRepository", lambda s: repo)
    monkeypatch.setattr(composition, "build_matcher", lambda s: None)
    monkeypatch.setattr(composition, "build_classifier", lambda s: None)
    captured: dict = {}
    target = "RefreshCoveredPrices" if "known" in builder.__name__ or "covered" in builder.__name__ else "CoverCanonicals"
    monkeypatch.setattr(composition, target, lambda **kw: captured.update(kw) or MagicMock())
    builder(MagicMock())
    return captured


def test_freshness_wires_a_real_pace(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = _wired_kwargs(monkeypatch, composition.build_refresh_covered_prices)

    pace = captured.get("pace")
    assert pace is not None, "price_refresh le pega al /get por CADA producto → sin pausa = 429"
    slept: list[float] = []
    monkeypatch.setattr(time, "sleep", slept.append)
    pace()
    assert slept and 0.6 <= slept[0] <= 1.2, "debe esperar de verdad, en el rango probado por SRD"


def test_loop_b_wires_a_real_pace(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = _wired_kwargs(monkeypatch, composition.build_cover_canonicals)

    pace = captured.get("pace")
    assert pace is not None, "Loop B le pega UNA vez por canónico → sin pausa = 429"
    slept: list[float] = []
    monkeypatch.setattr(time, "sleep", slept.append)
    pace()
    assert slept and 0.6 <= slept[0] <= 1.2


def test_matcher_gets_no_judge_when_the_llm_switch_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    """`SAVE_LLM_JUDGE_ENABLED=false` → el matcher se arma SIN juez: la banda gris va directo a
    revisión, sin tocar la API. Complementa al circuit-breaker (que es reactivo: corta recién tras
    3 fallos). Este test falla si alguien desconecta el switch del wiring."""
    monkeypatch.setattr(settings, "save_matching_cascade_enabled", True)
    monkeypatch.setattr(settings, "save_classification_enabled", False)
    monkeypatch.setattr(settings, "save_llm_judge_enabled", False)
    monkeypatch.setattr(composition, "build_embedding_provider", lambda: MagicMock())

    matcher = composition.build_matcher(MagicMock())

    assert matcher is not None, "la cascada sigue activa: apagar el LLM no apaga el matching"
    assert matcher._judge is None, "sin juez → la banda gris no llama a la API"


def test_matcher_gets_a_real_judge_when_the_switch_is_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "save_matching_cascade_enabled", True)
    monkeypatch.setattr(settings, "save_classification_enabled", False)
    monkeypatch.setattr(settings, "save_llm_judge_enabled", True)
    monkeypatch.setattr(composition, "build_embedding_provider", lambda: MagicMock())
    monkeypatch.setattr(composition, "LlmJudge", lambda: "JUEZ-REAL")

    matcher = composition.build_matcher(MagicMock())

    assert matcher._judge == "JUEZ-REAL", "con el switch en true el juez vuelve, sin tocar nada más"


def test_classifier_gets_no_judge_when_the_llm_switch_is_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El switch cubre los DOS jueces LLM de la ingesta (matching y clasificación) — si no, apagar
    el LLM seguiría llamando a la API por el otro lado."""
    monkeypatch.setattr(settings, "save_classification_enabled", True)
    monkeypatch.setattr(settings, "save_llm_judge_enabled", False)
    monkeypatch.setattr(composition, "build_embedding_provider", lambda: MagicMock())
    monkeypatch.setattr(composition, "_build_lexicon", lambda s, m: {})

    classifier = composition.build_classifier(MagicMock())

    assert classifier is not None, "la clasificación sigue activa: el léxico no necesita LLM"
    assert classifier._judge is None


def test_classifier_gets_a_real_judge_when_the_switch_is_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "save_classification_enabled", True)
    monkeypatch.setattr(settings, "save_llm_judge_enabled", True)
    monkeypatch.setattr(composition, "build_embedding_provider", lambda: MagicMock())
    monkeypatch.setattr(composition, "_build_lexicon", lambda s, m: {})
    monkeypatch.setattr(composition, "CategoryJudge", lambda: "JUEZ-CATEGORIA")

    classifier = composition.build_classifier(MagicMock())

    assert classifier._judge == "JUEZ-CATEGORIA"


# ── R1: qué fuentes entran al DESCUBRIMIENTO por-query (Fase 1, 2026-07-16) ────────────────────
# Hasta ahora el set era `SOURCE_KEYS = ("sirena","nacional","jumbo")`: un tuple hardcodeado en
# `assets.py`, mientras el browse REST YA era registry-driven. Esa inconsistencia era la raíz —
# Bravo aprendió a buscar por texto el 2026-07-16 y no había forma de que entrara sin editar código,
# y una tienda pausada desde el admin seguía ingiriéndose igual.
#
# El set se DERIVA: `store_registry` activo × `directed_capability(...).by_text`. Bravo entra solo
# (su profile declara `text_param`), y `enabled`/`paused_at` —el gate manual del admin— por fin
# significan algo para la ingesta.


def _registry(  # type: ignore[no-untyped-def]
    provider_id: str, platform, base_url: str = "https://x.test", **kw
):
    from src.contexts.save.domain.entities import StoreRegistry

    return StoreRegistry("id-" + provider_id, provider_id, platform, base_url, **kw)


def _fake_registry_repo(monkeypatch: pytest.MonkeyPatch, rows: list) -> None:  # type: ignore[no-untyped-def]
    class FakeRegRepo:
        def __init__(self, session: object) -> None: ...
        def list_by_market(self, market: str) -> list:
            return rows
        def get_by_provider_id(self, pid: str):  # type: ignore[no-untyped-def]
            return next((r for r in rows if r.provider_id == pid), None)

    monkeypatch.setattr(composition, "SqlStoreRegistryRepository", FakeRegRepo)


def test_query_partitions_include_every_platform_that_searches_by_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # VTEX y Magento buscan por texto por plataforma; Bravo (REST_CATALOG) por PROFILE — y por eso
    # la capacidad la calcula infra, no el dominio: una plataforma no puede responder por todos sus
    # profiles. Bravo entra SOLO, sin tocar código: es el desbloqueo que R1 existe para dar.
    from src.contexts.save.domain.entities import SourcePlatform

    _fake_registry_repo(monkeypatch, [
        _registry("p-sirena", SourcePlatform.VTEX),
        _registry("p-nacional", SourcePlatform.MAGENTO),
        _registry("p-bravo", SourcePlatform.REST_CATALOG,
                  endpoints={"profile": "bravova", "sections": ["14"], "store_id": "1000"}),
    ])

    assert set(composition.query_catalog_partition_keys(object())) == {
        "p-sirena", "p-nacional", "p-bravo"
    }


def test_query_partitions_skip_a_source_disabled_from_the_admin(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # "solo los supermercados que yo tenga activos". `enabled` existía y la ingesta por-query lo
    # IGNORABA por completo (el tuple hardcodeado no consultaba nada).
    from src.contexts.save.domain.entities import SourcePlatform

    _fake_registry_repo(monkeypatch, [
        _registry("p-sirena", SourcePlatform.VTEX),
        _registry("p-jumbo", SourcePlatform.MAGENTO, enabled=False),
    ])

    assert composition.query_catalog_partition_keys(object()) == ["p-sirena"]


def test_query_partitions_skip_a_paused_source(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import UTC, datetime

    from src.contexts.save.domain.entities import SourcePlatform

    _fake_registry_repo(monkeypatch, [
        _registry("p-sirena", SourcePlatform.VTEX),
        _registry("p-nacional", SourcePlatform.MAGENTO, paused_at=datetime.now(UTC)),
    ])

    assert composition.query_catalog_partition_keys(object()) == ["p-sirena"]


def test_query_partitions_skip_a_browse_only_rest_source(monkeypatch: pytest.MonkeyPatch) -> None:
    # EL gate que R1 no puede romper: un REST_CATALOG cuyo profile NO declara `text_param` es CIEGO
    # al texto. Mandarle las 213 queries de la canasta le navegaría el catálogo entero 213 veces.
    # Default conservador ante profile desconocido (misma regla que `directed_capability`).
    from src.contexts.save.domain.entities import SourcePlatform

    _fake_registry_repo(monkeypatch, [
        _registry("p-sirena", SourcePlatform.VTEX),
        _registry("p-otro", SourcePlatform.REST_CATALOG,
                  endpoints={"profile": "no-registrado", "sections": ["1"], "store_id": "9"}),
    ])

    assert composition.query_catalog_partition_keys(object()) == ["p-sirena"]


def test_builds_one_adapter_per_basket_query_for_the_partitioned_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.contexts.save.domain.entities import SourcePlatform

    _fake_registry_repo(monkeypatch, [_registry("p-sirena", SourcePlatform.VTEX, "https://sirena.do")])

    sources = composition.build_query_catalog_sources_for(
        object(), "p-sirena", ("arroz", "aceite")
    )

    assert sources is not None
    assert len(sources) == 2
    assert sources[0]._query == "arroz"
    assert sources[0]._base_url == "https://sirena.do"


def test_the_magento_store_view_header_comes_from_the_registry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Jumbo y Nacional comparten instancia Magento (CCN): sin el header `Store: jumbo`, jumbo.com.do
    # sirve NACIONAL (hallazgo doc 09). Ese dato vivía HARDCODEADO en `build_sources`; ahora sale
    # del registry, que es lo que permite que una tienda nueva sea una FILA y no un deploy.
    from src.contexts.save.domain.entities import SourcePlatform

    _fake_registry_repo(monkeypatch, [
        _registry("p-jumbo", SourcePlatform.MAGENTO, "https://jumbo.com.do",
                  headers={"Store": "jumbo"}),
    ])

    sources = composition.build_query_catalog_sources_for(object(), "p-jumbo", ("arroz",))

    assert sources is not None
    assert sources[0]._store_code == "jumbo"


def test_building_sources_for_an_orphan_partition_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Una partición cuyo provider ya no existe (o dejó de ser by_text) → el asset la salta sin
    # fallar, igual que `build_rest_catalog_source_for`. El sensor tarda en limpiarla.
    _fake_registry_repo(monkeypatch, [])

    assert composition.build_query_catalog_sources_for(object(), "p-fantasma", ("arroz",)) is None


def test_building_sources_for_a_disabled_provider_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Defensa en profundidad: aunque el sensor no haya limpiado la partición todavía, materializarla
    # a mano NO debe ingerir una tienda que el admin apagó.
    from src.contexts.save.domain.entities import SourcePlatform

    _fake_registry_repo(monkeypatch, [_registry("p-jumbo", SourcePlatform.MAGENTO, enabled=False)])

    assert composition.build_query_catalog_sources_for(object(), "p-jumbo", ("arroz",)) is None
