"""DEV: activa la clasificación de categoría y la corre EN VIVO sobre una fuente, para VERLA.

Qué hace (contra el DB de dev):
  1. Embebe las 120 hojas de taxonomía sin embedding (para la etapa vector del clasificador).
  2. Refresca la fuente elegida (repuebla `store_product.source_category` desde el adapter) y
     clasifica inline cada producto — la cascada cruza la categoría de ORIGEN con el NOMBRE (Etapa B).
  3. Reporta el desglose por método (source / source_name / lexicon / trgm / vector / hybrid / llm).

Requiere `SAVE_CLASSIFICATION_ENABLED=true` (si no, el clasificador es dark → no-op y sin efecto).

Uso:
  cd apps/api && SAVE_CLASSIFICATION_ENABLED=true uv run python -m seeds.classify_live [--source sirena] [--queries 12]
"""
from __future__ import annotations

import sys

from sqlalchemy import text


def _arg(flag: str, default: str) -> str:
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main() -> None:
    source_key = _arg("--source", "sirena")
    n_queries = int(_arg("--queries", "12"))

    from ingestion.save.composition import (
        build_basket_queries,
        build_category_embedder,
        build_classifier,
        build_query_catalog_sources_for,
    )
    from ingestion.save.runner import refresh_source
    from ingestion.save.sources import SAVE_MARKET
    from seeds.save_seed import provider_id
    from src.contexts.save.infrastructure.repositories import SqlStoreProductRepository
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        classifier = build_classifier(session)
        if classifier is None:
            print("✖ Clasificador DARK: exportá SAVE_CLASSIFICATION_ENABLED=true y reintentá.")
            return

        embedder = build_category_embedder(session)
        if embedder is not None:
            n = embedder.execute(SAVE_MARKET)
            print(f"▶ Embeddings de categoría: {n} hojas embebidas (índice semántico).")

        # La canasta sale de la TABLA (antes: `BASKET_QUERIES[:n]`, un tuple hardcodeado). Medir
        # sobre una canasta distinta de la que ingiere producción daría números que no significan
        # lo que uno cree.
        queries = build_basket_queries(session, SAVE_MARKET)[:n_queries]
        if not queries:
            print(f"✖ Canasta VACÍA para {SAVE_MARKET} (basket_query sin filas active).")
            return

        # La fuente sale del registry (R1): `--source sirena` → provider "Sirena". Antes era una
        # clave de un dict hardcodeado, así que Bravo no era elegible ni existiendo.
        adapters = build_query_catalog_sources_for(
            session, str(provider_id(source_key.capitalize())), queries
        )
        if not adapters:
            print(
                f"✖ Fuente «{source_key}» inexistente, apagada, o que no busca por texto. "
                "Opciones: sirena, nacional, jumbo, bravo."
            )
            return

        repo = SqlStoreProductRepository(session)
        result = refresh_source(repo, adapters, classifier=classifier)  # sin matcher = solo clasifica
        session.commit()
        print(
            f"▶ Refresh «{source_key}»: seen={result.seen} refreshed={result.refreshed} "
            f"unmatched={result.unmatched} (clasificados inline)."
        )

        # Desglose de clasificaciones por método (solo de esta fuente).
        rows = session.execute(
            text(
                """
                SELECT cc.method, count(*) AS n, round(avg(cc.confidence), 3) AS conf
                FROM save.category_classification cc
                JOIN save.store_product sp ON sp.id = cc.store_product_id
                JOIN save.provider p ON p.id = sp.provider_id
                WHERE p.name ILIKE :pn AND cc.status = 'active'
                GROUP BY cc.method ORDER BY n DESC
                """
            ),
            {"pn": source_key},
        ).all()
        print(f"\n  Clasificaciones activas de «{source_key}» por método:")
        if not rows:
            print("    (ninguna — ¿source_category vacío o nombres sin match?)")
        for r in rows:
            print(f"    {r.method:<12} {r.n:>4}   conf.prom {r.conf}")
        print()


if __name__ == "__main__":
    main()
