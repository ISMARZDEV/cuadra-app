"""OFFLINE: genera `taxonomy_node.classification_terms` para las hojas que no los tienen (LLM).

Por qué existe: la receta de embedding del clasificador rinde ~43% top-1 con etiquetas cortas
("Bebidas Agua") y ~77% cuando cada hoja trae descriptores del dominio ("agua, botellón, planeta
azul"). Este CLI los genera UNA vez con el LLM (tier fast, barato), los persiste (invalidando el
embedding viejo) y —salvo `--no-embed`— re-embebe el índice con la receta nueva.

- **Idempotente**: solo toca hojas SIN términos → re-correr no re-paga ni pisa términos revisados.
- **Fail-safe**: una hoja cuyo LLM falla NO se persiste (queda para la próxima corrida).
- **Cuota**: ~120 llamadas `fast` una sola vez. Requiere `LLM_PROVIDER` + su API key (dev: openai).

Uso:
  cd apps/api && uv run python -m seeds.generate_category_terms [--no-embed] [--market DO]
"""
from __future__ import annotations

import sys


def _arg(flag: str, default: str) -> str:
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main() -> None:
    market = _arg("--market", "DO")
    do_embed = "--no-embed" not in sys.argv

    from ingestion.save.composition import build_embedding_provider
    from src.contexts.save.application.embed_categories import EmbedCategories
    from src.contexts.save.application.generate_category_terms import GenerateCategoryTerms
    from src.contexts.save.infrastructure.classification.llm_category_terms import (
        LlmCategoryTermsGenerator,
    )
    from src.contexts.save.infrastructure.repositories import SqlCategoryIndexRepository
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        index = SqlCategoryIndexRepository(session)
        pending = index.leaves_without_terms(market, limit=1000)
        if not pending:
            print(f"▶ Nada que hacer: todas las hojas de {market} ya tienen classification_terms.")
            return
        print(f"▶ Generando términos para {len(pending)} hoja(s) de {market} vía LLM (tier fast)…")

        n = GenerateCategoryTerms(index, LlmCategoryTermsGenerator()).execute(market)
        session.commit()
        print(f"  ✓ {n}/{len(pending)} hojas sembradas (las que fallaron quedan para reintentar).")

        if do_embed:
            embedded = EmbedCategories(index, build_embedding_provider()).execute(market)
            session.commit()
            print(f"  ✓ {embedded} hojas re-embebidas con la receta descriptiva.")
        else:
            print("  · Re-embed omitido (--no-embed). Corré EmbedCategories / la ingesta para aplicarlo.")


if __name__ == "__main__":
    main()
