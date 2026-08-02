"""DEV: ¿qué tokens del léxico merecen decidir una hoja solos, y qué costaría cambiarlo?

EL GATE. Ninguna edición del vocabulario (`_ATTRIBUTE_TOKENS`, `classification_terms`, un rename de
hoja) debería aplicarse sin correr esto antes. Mide cada token del índice contra el corpus real y
—lo importante— SIMULA el cambio propuesto sobre las clasificaciones que ya existen, contando
cuántas se romperían.

Por qué existe: el 2026-08-01 se probaron tres criterios de degradación que parecían correctos.
Dos habrían destruido **298 y 455 clasificaciones correctas** respectivamente, y sólo esta
simulación lo mostró antes de aplicarlos.

  · "degradar si la raíz del corpus difiere de la del índice" → 298 perdidas. Degradaba
    `detergente`, que concentra al 100% en Limpieza: el token está BIEN, lo que falta es una hoja
    de limpieza que lo nombre (hueco de TAXONOMÍA, no de vocabulario).
  · "degradar si el token no concentra" → 455 perdidas. Degradaba `leche`, `pollo`, `queso`: el
    vocabulario real es polisémico (leche de vaca / de coco / corporal) y aun así sirven.
  · "degradar si lift < 1" → 20 perdidas. Es el único criterio sin lectura benigna, y el que quedó.

ETIQUETA DÉBIL: la raíz sale del `source_category` —la estantería donde la propia tienda puso el
producto— y el token sale del NOMBRE. Dos textos distintos, así que no es circular. Es supervisión
gratis y a escala, sin trabajo humano de etiquetado.

SÓLO LECTURA: no escribe nada. Ver `.claude/skills/cuadra-save-vocabulary/SKILL.md` para el método.

Uso:
    cd apps/api && uv run python -m seeds.measure_token_reliability [--market DO]
"""
from __future__ import annotations

import sys

from sqlalchemy import text

from src.contexts.save.infrastructure.classification.lexicon import (
    build_lexicon_index,
    lexicon_match,
    lexicon_match_path,
)
from src.contexts.save.infrastructure.classification.token_reliability import (
    LabeledProduct,
    demoted_tokens,
    measure_token_reliability,
)

_LEAVES = """
SELECT h.id, h.name FROM save.taxonomy_node h JOIN save.taxonomy_node p ON p.id = h.parent_id
"""
_ROOTS = """
WITH RECURSIVE up AS (
  SELECT id, parent_id, name, id AS leaf FROM save.taxonomy_node
  UNION ALL
  SELECT t.id, t.parent_id, t.name, up.leaf FROM save.taxonomy_node t JOIN up ON up.parent_id = t.id
) SELECT leaf, id AS root_id, name AS root_name FROM up WHERE parent_id IS NULL
"""


def main() -> None:
    market = sys.argv[sys.argv.index("--market") + 1] if "--market" in sys.argv else "DO"
    from src.shared.db.base import SessionLocal

    with SessionLocal() as s:
        hojas = [(str(r.id), r.name) for r in s.execute(text(_LEAVES))]
        nombre_hoja = dict(hojas)
        raices = list(s.execute(text(_ROOTS)))
        raiz_de = {str(r.leaf): str(r.root_id) for r in raices}
        nombre_raiz = {str(r.root_id): r.root_name for r in raices}
        productos = s.execute(
            text("SELECT name, source_category FROM save.store_product")
        ).all()

    index = build_lexicon_index(hojas)
    corpus = [
        LabeledProduct(name=p.name or "", root_id=raiz_de[hit[0]])
        for p in productos
        if (hit := lexicon_match_path(p.source_category or "", index)) and raiz_de.get(hit[0])
    ]

    print(f"mercado {market} · corpus {len(productos)} productos · etiquetados {len(corpus)}")
    if not corpus:
        print("sin etiqueta débil: ninguna categoría de origen resuelve. Nada que medir.")
        return

    prior: dict[str, int] = {}
    for lp in corpus:
        prior[lp.root_id] = prior.get(lp.root_id, 0) + 1
    mayor = max(prior.values()) / len(corpus)
    print(f"raíz mayoritaria {100*mayor:.0f}% → techo de lift {1/mayor:.2f}")
    if mayor > 0.60:
        print(
            "  ⚠ CORPUS SESGADO: con esta concentración ningún token de la raíz dominante puede\n"
            "    superar ese techo, así que uno bueno y uno malo quedan indistinguibles.\n"
            "    Activá basket queries de MÁS CATEGORÍAS (no más de la misma) y volvé a medir."
        )

    veredictos = measure_token_reliability(corpus, index, raiz_de)

    mal_mapeados = [v for v in veredictos if v.mismapped]
    print(f"\n=== MAL MAPEADOS ({len(mal_mapeados)}) — concentran, pero en otra raíz ===")
    print("    NO se degradan: el token sirve, falta curar la TAXONOMÍA.\n")
    for v in sorted(mal_mapeados, key=lambda v: -v.support):
        print(
            f"  «{v.token:14}» n={v.support:<4} conc={v.probability:.2f}"
            f"  índice→{nombre_hoja.get(v.taxonomy_node_id, '?')[:28]:28}"
            f"  corpus→{nombre_raiz.get(v.corpus_root_id or '', '?')[:20]}"
        )

    degradados = demoted_tokens(veredictos)
    print(f"\n=== A DEGRADAR ({len(degradados)}) — lift < 1, anti-informativos ===")
    for v in sorted((v for v in veredictos if not v.decides), key=lambda v: -v.support):
        print(
            f"  «{v.token:14}» n={v.support:<4} lift={v.lift:.2f}"
            f"  índice→{nombre_hoja.get(v.taxonomy_node_id, '?')[:28]}"
        )

    # --- EL GATE ---
    nuevo = build_lexicon_index(hojas, demoted=degradados)
    perdidas, cambios, ejemplos = 0, 0, []
    for p in productos:
        antes = lexicon_match(p.name or "", index)
        despues = lexicon_match(p.name or "", nuevo)
        if antes == despues:
            continue
        if antes and not despues:
            perdidas += 1
            if len(ejemplos) < 10:
                ejemplos.append(
                    f"    {(p.name or '')[:52]:52} ya no → "
                    f"{nombre_hoja.get(antes[0], '?')}"
                )
        else:
            cambios += 1

    print(f"\n=== GATE · impacto sobre los {len(productos)} productos ===")
    print(f"  dejan de resolverse por léxico : {perdidas}")
    print(f"  cambian de hoja                : {cambios}")
    print("\n  REVISALAS UNA POR UNA: ¿eran aciertos o errores?")
    for e in ejemplos:
        print(e)


if __name__ == "__main__":
    main()
