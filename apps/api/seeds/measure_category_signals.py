"""Medición (read-only, sin embeddings): ¿cuán informativa es la categoría de ORIGEN de Sirena?

Responde la pregunta que decide si el "narrowing jerárquico" vale la pena:
  1. De la categoría de origen (category_path), ¿cuántas dan la HOJA directa vs solo el PADRE vs nada?
  2. Cuando fuente y nombre resuelven ambos, ¿cuántas caen en PADRES distintos (confusión cross-padre)?

Usa SOLO el lexicon determinista (no BGE-M3), así corre sin embeddings. El lado NOMBRE es por-lexicon
(proxy conservador: subestima lo que trgm/vector atraparían, pero la señal de ORIGEN se mide exacta).

Uso:  cd apps/api && uv run python -m seeds.measure_category_signals  [--queries 10]
"""
from __future__ import annotations

import sys

from src.contexts.save.infrastructure.classification.lexicon import (
    LexiconIndex,
    build_lexicon_index,
    lexicon_match,
)


def _match_path(source: str, index: LexiconIndex) -> tuple[str, float] | None:
    """Espeja ClassifyStoreProduct._match_source_path: el path es jerárquico, se matchea segmento a
    segmento del más específico (hondo) al general, tomando el primer hit inequívoco."""
    if not source:
        return None
    for segment in reversed(source.split(" > ")):
        hit = lexicon_match(segment, index)
        if hit is not None:
            return hit
    return None


def main() -> None:
    n_queries = 10
    if "--queries" in sys.argv:
        n_queries = int(sys.argv[sys.argv.index("--queries") + 1])

    from ingestion.save.composition import build_basket_queries, build_query_catalog_sources_for
    from ingestion.save.sources import SAVE_MARKET
    from seeds.save_seed import provider_id
    from src.shared.db.base import SessionLocal
    from sqlalchemy import text

    with SessionLocal() as s:
        # Hojas (level=1) y padres (level=0) + mapa hoja→padre, desde la taxonomía sembrada.
        leaves = s.execute(
            text("SELECT id::text, name, parent_id::text FROM save.taxonomy_node "
                 "WHERE level=1 AND market_id='DO'")
        ).all()
        parents = s.execute(
            text("SELECT id::text, name FROM save.taxonomy_node WHERE level=0 AND market_id='DO'")
        ).all()
        # La canasta sale de la TABLA (antes: `BASKET_QUERIES[:n]`) y la fuente del REGISTRY (R1,
        # antes: un dict hardcodeado). Las dos lecturas van DENTRO de la sesión.
        queries = build_basket_queries(s, SAVE_MARKET)[:n_queries]
        adapters = (
            build_query_catalog_sources_for(s, str(provider_id("Sirena")), queries)
            if queries
            else None
        )

    if not queries:
        print(f"✖ Canasta VACÍA para {SAVE_MARKET} (basket_query sin filas active).")
        return
    if not adapters:
        print("✖ Sirena inexistente, apagada, o sin capacidad by_text en store_registry.")
        return

    leaf_lex = build_lexicon_index([(r[0], r[1]) for r in leaves])
    parent_lex = build_lexicon_index([(r[0], r[1]) for r in parents])
    leaf_to_parent = {r[0]: r[2] for r in leaves}
    parent_name = {r[0]: r[1] for r in parents}
    leaf_name = {r[0]: r[1] for r in leaves}

    # Fetch en vivo de Sirena (acotado a N queries de la canasta). category_path lo pobla el VtexAdapter.
    seen: set[str] = set()
    entries = []
    for a in adapters:
        for e in a.fetch():
            if e.external_id in seen:
                continue
            seen.add(e.external_id)
            entries.append(e)

    total = len(entries)
    with_path = src_leaf = src_parent_only = src_none = 0
    both_resolved = cross_parent = 0
    examples_conflict: list[str] = []
    examples_parent_only: list[str] = []

    for e in entries:
        src_text = " > ".join(e.category_path)
        if src_text:
            with_path += 1
        s_leaf = _match_path(src_text, leaf_lex)
        s_parent = _match_path(src_text, parent_lex)
        n_leaf = lexicon_match(e.name or "", leaf_lex)

        # 1) Informatividad de la señal de origen
        if s_leaf is not None:
            src_leaf += 1
        elif s_parent is not None:
            src_parent_only += 1
            if len(examples_parent_only) < 5:
                examples_parent_only.append(
                    f"«{e.name[:40]}» origen=«{src_text[:40]}» → padre {parent_name.get(s_parent[0], '?')}"
                )
        else:
            src_none += 1

        # 2) Confusión cross-padre (proxy lexicon): fuente y nombre resuelven hoja → ¿mismo padre?
        if s_leaf is not None and n_leaf is not None:
            both_resolved += 1
            p_src = leaf_to_parent.get(s_leaf[0])
            p_name = leaf_to_parent.get(n_leaf[0])
            if p_src != p_name:
                cross_parent += 1
                if len(examples_conflict) < 5:
                    examples_conflict.append(
                        f"«{e.name[:36]}»: origen→{leaf_name.get(s_leaf[0],'?')} "
                        f"({parent_name.get(p_src,'?')}) vs nombre→{leaf_name.get(n_leaf[0],'?')} "
                        f"({parent_name.get(p_name,'?')})"
                    )

    def pct(n: int) -> str:
        return f"{(100*n/total):.0f}%" if total else "—"

    print(f"\n{'='*64}\n  MEDICIÓN — señal de categoría de ORIGEN (Sirena, {total} productos)\n{'='*64}")
    print(f"\n  con category_path de la fuente:  {with_path}/{total} ({pct(with_path)})")
    print("\n  1) ¿Qué tan lejos llega la señal de origen? (lexicon)")
    print(f"     → da la HOJA directa (subcategoría):  {src_leaf}  ({pct(src_leaf)})")
    print(f"     → solo PADRE (sin hoja):              {src_parent_only}  ({pct(src_parent_only)})")
    print(f"     → nada matcheable:                    {src_none}  ({pct(src_none)})")
    for ex in examples_parent_only:
        print(f"          · {ex}")
    print("\n  2) Confusión CROSS-PADRE (fuente vs nombre, ambos resuelven hoja)")
    print(f"     productos donde ambas señales resolvieron: {both_resolved}")
    if both_resolved:
        print(f"     de esos, en PADRES distintos:              {cross_parent}  "
              f"({(100*cross_parent/both_resolved):.0f}% de los resueltos)")
    for ex in examples_conflict:
        print(f"          · {ex}")
    print()
    print("  LECTURA:")
    print("   · Si 'solo PADRE' es ALTO → el narrowing jerárquico ayuda (fuente sabe el padre, no la hoja).")
    print("   · Si 'da la HOJA' es ALTO → Etapa B ya resuelve; narrowing = poco retorno.")
    print("   · Si 'cross-padre' es ALTO → hay confusión real que el narrowing evitaría.")
    print()


if __name__ == "__main__":
    main()
