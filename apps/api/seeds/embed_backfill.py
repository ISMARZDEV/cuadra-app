"""DEV: puebla el índice SEMÁNTICO — embebe los canónicos con `embedding` NULL.

Sin esto, `search_semantic` (búsqueda del usuario) y `find_candidates_vector` (cascada de matching)
filtran por `embedding IS NOT NULL` y **nunca devuelven nada**: el sistema degrada a léxico sin
avisar. Medido el 2026-08-02: el catálogo tenía 0 de 133 canónicos embebidos, y con la etapa
semántica apagada la búsqueda NO alcanzaba su objetivo de top-5 (93.3% contra un piso de 95%).

Es idempotente (`list_without_embedding` excluye lo ya hecho) y hay que correrlo **después de
cualquier alta de canónicos** — por ejemplo `seeds.demo_catalog`.

Usa el modelo BGE-M3 IN-PROCESS (grupo de deps `ingestion`, solo dev). En producción el embedder
sale de `SAVE_BGE_M3_ENDPOINT_URL`.

Uso:  cd apps/api && uv run python -m seeds.embed_backfill
"""
from __future__ import annotations

import time

from src.contexts.save.application.embed_canonical_products import EmbedCanonicalProducts
from src.contexts.save.infrastructure.matching.embeddings import (
    SentenceTransformersEmbeddingProvider,
)
from src.contexts.save.infrastructure.repositories import SqlCanonicalProductRepository
from src.shared.db.base import SessionLocal

MARKET = "DO"


def main() -> None:
    started = time.time()
    with SessionLocal() as session:
        repo = SqlCanonicalProductRepository(session)
        pending = len(repo.list_without_embedding(MARKET, limit=100_000))
        if not pending:
            print("nada que hacer: todos los canónicos ya tienen embedding.")
            return
        print(f"sin embedding: {pending} — cargando BGE-M3…")
        embedded = EmbedCanonicalProducts(
            repo, SentenceTransformersEmbeddingProvider()
        ).execute(MARKET)
        session.commit()
    print(f"embebidos: {embedded} en {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
