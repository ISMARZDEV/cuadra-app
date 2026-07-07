"""Composition root de la cascada de matching F2.0 para la ingesta (SIN dagster).

Única fuente de verdad del wiring del matcher, compartida por los assets de Dagster
(`ingestion.save.assets`) y por el CLI ligero (`seeds.save_refresh`) — así ambos aplican
idéntico ship-dark gate y no divergen. Vive aquí (no en `assets.py`) para no arrastrar dagster
al CLI.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from src.config import settings
from src.contexts.save.application.embed_canonical_products import EmbedCanonicalProducts
from src.contexts.save.application.match_store_product import MatchStoreProduct
from src.contexts.save.infrastructure.matching.claude_judge import ClaudeJudge
from src.contexts.save.infrastructure.matching.embeddings import BgeM3EmbeddingProvider
from src.contexts.save.infrastructure.matching.repository import SqlProductMatchRepository
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlStoreProductRepository,
)


def build_matcher(session: Session) -> MatchStoreProduct | None:
    """Devuelve un matcher REAL solo cuando `SAVE_MATCHING_CASCADE_ENABLED` está activo — la
    cascada se despliega DARK hasta bootstrapear la canasta curada. Comparte la `session` (misma
    UoW/transacción que el refresh, para el invariante FK+product_match). None = legacy F1
    (desconocidos descartados)."""
    if not settings.save_matching_cascade_enabled:
        return None
    return MatchStoreProduct(
        match_repo=SqlProductMatchRepository(session),
        store_repo=SqlStoreProductRepository(session),
        canonical_repo=SqlCanonicalProductRepository(session),
        embedding_provider=BgeM3EmbeddingProvider(settings.save_bge_m3_endpoint_url),
        judge=ClaudeJudge(),
    )


def build_canonical_embedder(session: Session) -> EmbedCanonicalProducts | None:
    """Backfill del índice semántico: embebe los canónicos sin embedding ANTES del matching, para
    que la etapa vectorial tenga contra qué matchear. Mismo gate (`SAVE_MATCHING_CASCADE_ENABLED`)
    y MISMO modelo que `build_matcher` (vectores comparables). `None` cuando la cascada está dark."""
    if not settings.save_matching_cascade_enabled:
        return None
    return EmbedCanonicalProducts(
        SqlCanonicalProductRepository(session),
        BgeM3EmbeddingProvider(settings.save_bge_m3_endpoint_url),
    )
