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
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlCategoryCandidateRepository,
    SqlCategoryClassificationRepository,
    SqlCategoryIndexRepository,
    SqlStoreProductRepository,
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
