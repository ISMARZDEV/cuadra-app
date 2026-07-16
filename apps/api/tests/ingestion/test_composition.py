"""Unit — composition root de la ingesta (ingestion.save.composition): selección del
`EmbeddingProvider`. Sin red, sin DB, sin LLM real (el juez se neutraliza).

Invariante crítico (cuadra-save-matching, gotcha #5 — one embedding model per index): el matcher
y el backfill de canónicos DEBEN embeber con el MISMO provider. Si el índice se escribe con un
provider y la query se hace con otro, viven en espacios vectoriales distintos y la etapa semántica
queda inerte/corrupta. Sin `SAVE_BGE_M3_ENDPOINT_URL` ambos caen a BGE-M3 in-process; con la URL
seteada, ambos usan el endpoint HTTP. Los dos providers usan el MISMO modelo (`BAAI/bge-m3`).
"""
from __future__ import annotations

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
