"""Composition root de la cascada de matching F2.0 para la ingesta (SIN dagster).

Única fuente de verdad del wiring del matcher, compartida por los assets de Dagster
(`ingestion.save.assets`) y por el CLI ligero (`seeds.save_refresh`) — así ambos aplican
idéntico ship-dark gate y no divergen. Vive aquí (no en `assets.py`) para no arrastrar dagster
al CLI.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from src.config import settings
from src.contexts.save.application.classify_backfill import ClassifyBackfill
from src.contexts.save.application.classify_store_product import ClassifyStoreProduct
from src.contexts.save.application.embed_canonical_products import EmbedCanonicalProducts
from src.contexts.save.application.embed_categories import EmbedCategories
from src.contexts.save.application.match_store_product import MatchStoreProduct
from src.contexts.save.domain.ports.repositories import EmbeddingProvider
from src.contexts.save.infrastructure.classification.category_judge import CategoryJudge
from src.contexts.save.infrastructure.classification.lexicon import build_lexicon_index
from src.contexts.save.infrastructure.matching.llm_judge import LlmJudge
from src.contexts.save.infrastructure.matching.embeddings import (
    BgeM3EmbeddingProvider,
    SentenceTransformersEmbeddingProvider,
)
from src.contexts.save.infrastructure.matching.repository import SqlProductMatchRepository
from src.contexts.save.application.cover_canonicals import CoverCanonicals
from src.contexts.save.application.refresh_covered_prices import RefreshCoveredPrices
from src.contexts.save.application.refresh_prices import RefreshCatalogPrices
from src.contexts.save.infrastructure.catalog_sources.factory import CatalogSourceFactory
from src.contexts.save.infrastructure.catalog_sources.fetch_classifier import classify_httpx_error
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlCategoryCandidateRepository,
    SqlCategoryClassificationRepository,
    SqlCategoryIndexRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
    SqlStoreRegistryRepository,
    SqlTaxonomyRepository,
)


def build_embedding_provider() -> EmbeddingProvider:
    """Elige el adapter de embeddings: si `SAVE_BGE_M3_ENDPOINT_URL` está seteado → endpoint HTTP
    (patrón de prod, servicio dedicado); si no → BGE-M3 in-process (sentence-transformers), para
    dev/batch chico. Mismo modelo en ambos → vectores comparables."""
    url = settings.save_bge_m3_endpoint_url
    return BgeM3EmbeddingProvider(url) if url else SentenceTransformersEmbeddingProvider()


def _build_category_index(
    session: Session, market_id: str
) -> tuple[dict[str, str], dict[str, str]]:
    """(lexicon token→hoja, mapa hoja→padre) para la señal de categoría del matcher (Etapa C).
    Derivado de la taxonomía sembrada (padres=nivel 0, hojas=nivel 1)."""
    tree = SqlTaxonomyRepository(session).list_tree(market_id)
    leaves = [(child.id, child.name) for root in tree for child in root.children]
    lexicon = build_lexicon_index(leaves)
    leaf_to_parent = {child.id: root.id for root in tree for child in root.children}
    return lexicon, leaf_to_parent


def build_directed_adapter(source, provider, query):  # type: ignore[no-untyped-def]
    """Puerto `BuildAdapter` de PRODUCCIÓN para Loop B: construye el adapter real de la plataforma y
    lo apunta a la consulta dirigida (`for_query`). HTTP crudo (httpx) como el refresh normal — las
    fuentes son tiendas YA registradas (`store_registry`), no config admin ad-hoc (ese caso usa el
    SSRF-guard de `TestSource`)."""
    return CatalogSourceFactory.build(
        source.platform,
        source.base_url,
        endpoints=source.endpoints,
        headers=source.headers,
        auth=source.auth,
    ).for_query(provider.id, provider.market_id, query.text)


def build_cover_canonicals(session: Session) -> CoverCanonicals:
    """Compone Loop B (cobertura dirigida, F3.1): itera los (canónico×tienda) sin cubrir y delega en
    el MISMO pipeline de refresh (record + cascada) con adapters dirigidos. Comparte la `session`
    (misma UoW que el matcher, por el invariante FK+product_match)."""
    store_repo = SqlStoreProductRepository(session)
    refresh = RefreshCatalogPrices(
        store_repo, matcher=build_matcher(session), classifier=build_classifier(session)
    )
    return CoverCanonicals(
        store_repo=store_repo,
        canonical_repo=SqlCanonicalProductRepository(session),
        source_repo=SqlStoreRegistryRepository(session),
        provider_repo=SqlProviderRepository(session),
        refresh=refresh,
        build_adapter=build_directed_adapter,
        classify_error=classify_httpx_error,  # F3.3: 503/timeout → abortar la tienda (no martillarla)
    )


def build_refresh_covered_prices(session: Session) -> RefreshCoveredPrices:
    """Compone F3.2a (frescura, camino A): re-fetch DIRECTO por id/url de lo cubierto+viejo →
    record_observation (change-only). SIN matcher (el store_product ya existe → no se re-descubre).
    Reusa F3.3 (abort-on-down vía classify_httpx_error). Cachea los registries del mercado (1 query)."""
    from ingestion.save.sources import SAVE_MARKET  # local: evita import circular (patrón del módulo)

    store_repo = SqlStoreProductRepository(session)
    refresh = RefreshCatalogPrices(store_repo, matcher=None, classifier=None)
    registries = {
        r.provider_id: r
        for r in SqlStoreRegistryRepository(session).list_by_market(SAVE_MARKET)
    }

    def build_detail_source(item):  # type: ignore[no-untyped-def]
        reg = registries[item.provider_id]
        return CatalogSourceFactory.build(
            reg.platform, reg.base_url, endpoints=reg.endpoints, headers=reg.headers, auth=reg.auth
        ).for_detail(item.provider_id, SAVE_MARKET)

    return RefreshCoveredPrices(
        store_repo=store_repo,
        refresh=refresh,
        build_detail_source=build_detail_source,
        classify_error=classify_httpx_error,
    )


def build_matcher(session: Session) -> MatchStoreProduct | None:
    """Devuelve un matcher REAL solo cuando `SAVE_MATCHING_CASCADE_ENABLED` está activo — la
    cascada se despliega DARK hasta bootstrapear la canasta curada. Comparte la `session` (misma
    UoW/transacción que el refresh, para el invariante FK+product_match). None = legacy F1
    (desconocidos descartados).

    Etapa C: cuando `SAVE_CLASSIFICATION_ENABLED` también está activo, inyecta la señal de categoría
    (lexicon + mapa hoja→padre) — boost por misma hoja + gate por padre distinto. Sin ella el
    matcher se comporta idéntico a antes."""
    if not settings.save_matching_cascade_enabled:
        return None
    from ingestion.save.sources import SAVE_MARKET

    category_lexicon = leaf_to_parent = None
    if settings.save_classification_enabled:
        category_lexicon, leaf_to_parent = _build_category_index(session, SAVE_MARKET)
    return MatchStoreProduct(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
        canonical_repo=SqlCanonicalProductRepository(session),
        embedding_provider=build_embedding_provider(),
        judge=LlmJudge(),
        category_lexicon=category_lexicon,
        leaf_to_parent=leaf_to_parent,
    )


def build_canonical_embedder(session: Session) -> EmbedCanonicalProducts | None:
    """Backfill del índice semántico: embebe los canónicos sin embedding ANTES del matching, para
    que la etapa vectorial tenga contra qué matchear. Mismo gate (`SAVE_MATCHING_CASCADE_ENABLED`)
    y MISMO modelo que `build_matcher` (vectores comparables). `None` cuando la cascada está dark."""
    if not settings.save_matching_cascade_enabled:
        return None
    return EmbedCanonicalProducts(
        SqlCanonicalProductRepository(session),
        build_embedding_provider(),
    )


def _build_lexicon(session: Session, market_id: str):  # type: ignore[no-untyped-def]
    """Índice léxico keyword→hoja para el market de ingesta, derivado de la taxonomía sembrada
    (subcategorías = nivel 1). Ingesta single-market (`SAVE_MARKET`); multi-market = F3."""
    tree = SqlTaxonomyRepository(session).list_tree(market_id)
    leaves = [(child.id, child.name) for root in tree for child in root.children]
    return build_lexicon_index(leaves)


def build_classifier(session: Session) -> ClassifyStoreProduct | None:
    """Clasificador de categoría REAL solo cuando `SAVE_CLASSIFICATION_ENABLED` está activo (ship-dark).
    Comparte la `session` del refresh. Reusa `build_embedding_provider` (mismo BGE-M3) y el juez LLM.
    `None` = dark (la ingesta no clasifica)."""
    if not settings.save_classification_enabled:
        return None
    from ingestion.save.sources import SAVE_MARKET

    return ClassifyStoreProduct(
        SqlCategoryClassificationRepository(session),
        SqlCategoryCandidateRepository(session),
        build_embedding_provider(),
        CategoryJudge(),
        _build_lexicon(session, SAVE_MARKET),
    )


def build_category_embedder(session: Session) -> EmbedCategories | None:
    """Backfill del índice semántico de CATEGORÍAS: embebe las hojas sin embedding ANTES de clasificar,
    para que `find_leaves_vector` tenga contra qué comparar. Mismo gate y modelo que `build_classifier`."""
    if not settings.save_classification_enabled:
        return None
    return EmbedCategories(SqlCategoryIndexRepository(session), build_embedding_provider())


def build_classify_backfill(session: Session) -> ClassifyBackfill | None:
    """Backfill de clasificación (job): clasifica lo existente sin `active`. Mismo gate ship-dark."""
    classifier = build_classifier(session)
    if classifier is None:
        return None
    return ClassifyBackfill(SqlCategoryClassificationRepository(session), classifier)
