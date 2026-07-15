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
from src.contexts.save.domain.ports import CatalogSource
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


def build_refresh_known_prices(session: Session) -> RefreshCoveredPrices:
    """Compone `price_refresh` (paridad Prices Batch de SRD): re-precia por id TODO lo CONOCIDO y viejo
    (matcheado O en revisión), no solo lo cubierto. Mismo camino A + fallback C + F3.3 que la frescura —
    solo cambia el conjunto (`list_stale_known`)."""
    return build_refresh_covered_prices(session, known=True)


def build_refresh_covered_prices(session: Session, *, known: bool = False) -> RefreshCoveredPrices:
    """Compone F3.2a (frescura): camino A (re-fetch por id/url/source_ref → change-only, SIN matcher)
    + fallback C (browse por provider diferido, §15.4). Reusa F3.3 (abort-on-down vía
    classify_httpx_error). Cachea los registries del mercado (1 query). `known=True` (para `price_refresh`)
    amplía el conjunto de covered-only a TODO lo conocido con locator (`list_stale_known`)."""
    from src.contexts.save.domain.entities import SourcePlatform

    from ingestion.save.sources import SAVE_MARKET  # local: evita import circular (patrón del módulo)

    store_repo = SqlStoreProductRepository(session)
    refresh = RefreshCatalogPrices(store_repo, matcher=None, classifier=None)
    registries = {
        r.provider_id: r
        for r in SqlStoreRegistryRepository(session).list_by_market(SAVE_MARKET)
    }

    def _builder(provider_id):  # type: ignore[no-untyped-def]
        reg = registries.get(provider_id)
        if reg is None:
            return None
        return CatalogSourceFactory.build(
            reg.platform, reg.base_url, endpoints=reg.endpoints, headers=reg.headers, auth=reg.auth
        )

    def build_detail_source(item):  # type: ignore[no-untyped-def]
        builder = _builder(item.provider_id)
        if builder is None:
            return None
        try:
            return builder.for_detail(item.provider_id, SAVE_MARKET)  # camino A
        except ValueError:
            return None  # plataforma sin ProductDetailSource → el use-case cae al browse (C)

    def build_browse_source(provider_id):  # type: ignore[no-untyped-def]
        # Solo REST_CATALOG tiene "browse completo" como refresh (VTEX/Magento son query-based).
        reg = registries.get(provider_id)
        if reg is None or reg.platform is not SourcePlatform.REST_CATALOG:
            return None
        return _builder(provider_id).for_query(provider_id, SAVE_MARKET, "")  # REST ignora la query → browse

    return RefreshCoveredPrices(
        store_repo=store_repo,
        refresh=refresh,
        build_detail_source=build_detail_source,
        build_browse_source=build_browse_source,
        classify_error=classify_httpx_error,
        stale_source=store_repo.list_stale_known if known else None,
    )


def rest_catalog_partition_keys(session: Session) -> list[str]:
    """Claves de partición (`{provider_id}:{section}`) de TODAS las fuentes REST_CATALOG del mercado —
    lo que el sensor sincroniza con las particiones dinámicas del asset `rest_catalog_prices`. Filtra a
    REST_CATALOG (VTEX/Magento son query-based, tienen su propio asset). Registry-driven (regla SAGRADA
    #4). Vacío si no hay ninguna configurada."""
    from src.contexts.save.domain.entities import SourcePlatform

    from ingestion.save.sources import SAVE_MARKET  # local: evita import circular (patrón del módulo)

    keys: list[str] = []
    for reg in SqlStoreRegistryRepository(session).list_by_market(SAVE_MARKET):
        if reg.platform is not SourcePlatform.REST_CATALOG:
            continue
        for section in (reg.endpoints or {}).get("sections") or []:
            keys.append(rest_catalog_partition_key(reg.provider_id, section))
    return keys


# Clave de partición del asset `rest_catalog_prices`: `{provider_id}:{section}`. La sección sola NO es
# única entre proveedores (dos súper REST podrían usar la misma), así que el provider va en la clave —
# el asset necesita saber DE QUÉ fuente es la sección (base_url/endpoints/auth).
_PARTITION_SEP = ":"


def rest_catalog_partition_key(provider_id: str, section: str) -> str:
    return f"{provider_id}{_PARTITION_SEP}{section}"


def parse_rest_catalog_partition_key(key: str) -> tuple[str, str]:
    """`{provider_id}:{section}` → (provider_id, section). `rsplit` con tope 1: los UUID no tienen `:`
    y las secciones son numéricas, así que el último `:` separa bien aunque el provider fuera raro."""
    provider_id, section = key.rsplit(_PARTITION_SEP, 1)
    return provider_id, section


def build_rest_catalog_source_for(
    session: Session, provider_id: str, section: str
) -> CatalogSource | None:
    """UN adapter de browse REST_CATALOG para (provider, section) — el partitioned asset materializa
    UNA sección por partición. `None` si la fuente no existe o dejó de ser REST_CATALOG (partición
    huérfana → el asset la salta)."""
    from src.contexts.save.domain.entities import SourcePlatform

    from ingestion.save.sources import SAVE_MARKET

    reg = SqlStoreRegistryRepository(session).get_by_provider_id(provider_id)
    if reg is None or reg.platform is not SourcePlatform.REST_CATALOG:
        return None
    builder = CatalogSourceFactory.build(
        reg.platform, reg.base_url,
        endpoints={**(reg.endpoints or {}), "sections": [section]},
        headers=reg.headers, auth=reg.auth,
    )
    return builder.for_query(reg.provider_id, SAVE_MARKET, "")  # REST ignora la query → browse


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
