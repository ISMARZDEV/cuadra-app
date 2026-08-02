"""DEV: ¿alcanza el tier `fast` para los jueces, o hace falta `smart`? A/B sobre los MISMOS pares.

Motivación medida (2026-08-01): el juez de CATEGORÍA hizo 147 clasificaciones vía `llm` contra 12
del de matching, y los dos corren en `smart` (gpt-4o / claude-sonnet). Su tarea es un sí/no sobre
un texto corto — trabajo de tier `fast` a primera vista. Pero bajar de modelo sin medir sería
exactamente lo que este subsistema tiene prohibido, así que primero se comparan los veredictos.

Corre los MISMOS productos por los dos tiers y reporta dónde difieren. El costo del experimento es
el de una corrida chica, y a cambio la decisión deja de ser una opinión.

Sirve para los DOS jueces del subsistema, que son distintos y no hay que confundirlos: el de
CATEGORÍA decide a qué hoja pertenece un producto; el de MATCHING decide si dos productos son el
mismo. El segundo es más caro de equivocar —su desenlace es un auto-enlace— así que su barra debe
ser más alta que el mero porcentaje de acuerdo.

Uso:
    cd apps/api && uv run python -m seeds.ab_judge_tier [--judge category|matching] [--limit 40]
"""
from __future__ import annotations

import sys

from sqlalchemy import text

from src.contexts.save.domain.classification import ClassifiableProduct
from src.contexts.save.infrastructure.classification.category_judge import CategoryJudge
from src.contexts.save.infrastructure.matching.llm_judge import LlmJudge
from src.shared.llm import get_chat_model

_GREY = """
SELECT sp.name, sp.brand, sp.size_text, tn.name AS hoja
  FROM save.category_decision d
  JOIN save.store_product sp ON sp.id = d.store_product_id
  JOIN save.taxonomy_node tn ON tn.id = COALESCE(d.name_leaf_id, d.taxonomy_node_id)
 WHERE d.band = 'grey' AND d.method IN ('llm', 'none')
 ORDER BY d.created_at DESC
 LIMIT :limit
"""


_GREY_MATCHES = """
SELECT DISTINCT ON (pm.id)
       sp.name AS store_name, sp.brand AS store_brand, sp.size_text, sp.ean,
       cp.name AS canon_name, b.name AS canon_brand, cp.display_size
  FROM save.product_match pm
  JOIN save.store_product sp ON sp.id = pm.store_product_id
  JOIN save.review_candidate rc ON rc.product_match_id = pm.id
  JOIN save.canonical_product cp ON cp.id = rc.canonical_product_id
  LEFT JOIN save.brand b ON b.id = cp.brand_id
 WHERE pm.status = 'pending_review' AND pm.confidence >= 0.55 AND pm.confidence < 0.85
 ORDER BY pm.id, rc.score DESC
 LIMIT :limit
"""


def _category_judge(tier: str) -> CategoryJudge:
    from src.contexts.save.infrastructure.classification.category_judge import _Verdict

    return CategoryJudge(
        model=get_chat_model(tier, max_retries=0).with_structured_output(_Verdict, include_raw=True)
    )


def _matching_judge(tier: str) -> LlmJudge:
    from src.contexts.save.infrastructure.matching.llm_judge import _Verdict

    return LlmJudge(
        model=get_chat_model(tier, max_retries=0).with_structured_output(_Verdict, include_raw=True)
    )


def _run_matching(limit: int) -> None:
    """A/B del juez de MATCHING. Su desenlace es un AUTO-ENLACE, así que el criterio no es sólo el
    acuerdo: importa la DIRECCIÓN de los desacuerdos. Que el barato enlace donde el caro no lo hace
    es mucho peor que lo inverso — un falso merge fusiona dos productos distintos en el catálogo."""
    from src.contexts.save.infrastructure.matching.cascade.banding import JUDGE_MATCH_MIN_CONFIDENCE
    from src.shared.db.base import SessionLocal

    with SessionLocal() as s:
        filas = s.execute(text(_GREY_MATCHES), {"limit": limit}).all()
    if not filas:
        print("no hay pares en banda gris con candidatos.")
        return

    jueces = {"fast": _matching_judge("fast"), "smart": _matching_judge("smart")}
    coinciden = 0
    tokens = {"fast": 0, "smart": 0}
    modelos: dict[str, str] = {}
    fast_enlaza_de_mas: list[str] = []
    smart_enlaza_de_mas: list[str] = []
    enlaces = {"fast": 0, "smart": 0}

    print(f"comparando {len(filas)} pares de banda gris (juez de MATCHING)\n")
    for f in filas:
        store = {"name": f.store_name, "brand": f.store_brand, "size": f.size_text, "ean": f.ean}
        canon = {"name": f.canon_name, "brand": f.canon_brand, "size": f.display_size, "ean": None}
        enlaza = {}
        for tier, juez in jueces.items():
            v = juez.judge(store_product=store, canonical_product=canon)
            tokens[tier] += (v.input_tokens or 0) + (v.output_tokens or 0)
            if v.model:
                modelos[tier] = v.model
            enlaza[tier] = v.decision == "match" and v.confidence >= JUDGE_MATCH_MIN_CONFIDENCE
            enlaces[tier] += int(enlaza[tier])

        if enlaza["fast"] == enlaza["smart"]:
            coinciden += 1
        else:
            linea = f"    {(f.store_name or '')[:40]:40} → {(f.canon_name or '')[:36]}"
            (fast_enlaza_de_mas if enlaza["fast"] else smart_enlaza_de_mas).append(linea)

    total = len(filas)
    difieren = total - coinciden

    # GUARDA CONTRA UN A/B DEGENERADO. Si ningún tier auto-enlaza NUNCA, el acuerdo es del 100% y
    # no significa nada: coinciden en decir que no, siempre. Pasó de verdad el 2026-08-01 —
    # 120/120 "de acuerdo" con los dos jueces respondiendo `no_match` a todo, porque la banda gris
    # de la cola está llena de pares que obviamente no son el mismo producto (2562 productos contra
    # 104 canónicos). Un A/B sin POSITIVOS no mide precisión, mide el sesgo de la muestra.
    if enlaces["fast"] == 0 and enlaces["smart"] == 0:
        print("⚠ A/B DEGENERADO: ningún tier auto-enlazó en toda la muestra.")
        print("  El 100% de acuerdo es vacío — coinciden en rechazar, no en decidir.")
        print("  Hace falta una muestra con pares PLAUSIBLES (canonizá más antes de medir).")
        return

    print("=== ACUERDO EN EL DESENLACE (¿auto-enlaza?) ===")
    print(f"  coinciden : {coinciden}/{total}  ({100*coinciden/total:.0f}%)")
    print(f"  difieren  : {difieren}")
    print("\n=== COSTO EN TOKENS ===")
    for tier in ("fast", "smart"):
        print(f"  {tier:6} {modelos.get(tier, '?'):28} {tokens[tier]:6} tokens")

    print("\n=== DIRECCIÓN DE LOS DESACUERDOS (lo que decide, no el %) ===")
    print(f"  fast ENLAZA y smart no  : {len(fast_enlaza_de_mas)}   ← riesgo de FALSO MERGE")
    for x in fast_enlaza_de_mas[:10]:
        print(x)
    print(f"  smart ENLAZA y fast no  : {len(smart_enlaza_de_mas)}   ← sólo pierde cobertura")
    for x in smart_enlaza_de_mas[:6]:
        print(x)

    print(
        "\nCRITERIO: acá el porcentaje NO alcanza. Un falso merge fusiona dos productos distintos\n"
        "en el catálogo y hay que desenlazarlo a mano; perder un enlace sólo manda el par a la cola.\n"
        "Si `fast` enlaza donde `smart` no, revisá ESOS casos uno por uno antes de bajar el tier."
    )


def main() -> None:
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 40
    cual = sys.argv[sys.argv.index("--judge") + 1] if "--judge" in sys.argv else "category"
    if cual == "matching":
        _run_matching(limit)
        return
    from src.shared.db.base import SessionLocal

    with SessionLocal() as s:
        filas = s.execute(text(_GREY), {"limit": limit}).all()

    if not filas:
        print("no hay decisiones en banda gris registradas. Corré una clasificación primero.")
        return

    jueces = {"fast": _category_judge("fast"), "smart": _category_judge("smart")}
    coinciden = difieren = 0
    tokens = {"fast": 0, "smart": 0}
    modelos: dict[str, str] = {}
    desacuerdos: list[str] = []

    print(f"comparando {len(filas)} pares de banda gris\n")
    for f in filas:
        producto = ClassifiableProduct(
            ref_id="ab", is_canonical=False, name=f.name or "",
            brand=f.brand or "", size_text=f.size_text or "",
        )
        veredictos = {}
        for tier, juez in jueces.items():
            v = juez.judge(producto, f.hoja)
            veredictos[tier] = v
            tokens[tier] += (v.input_tokens or 0) + (v.output_tokens or 0)
            if v.model:
                modelos[tier] = v.model

        # Sólo importa el DESENLACE (¿asigna la hoja o no?), no la confianza exacta: es lo único
        # que cambia el estado del catálogo.
        def asigna(v) -> bool:  # type: ignore[no-untyped-def]
            return v.decision == "match" and v.confidence >= 0.70

        if asigna(veredictos["fast"]) == asigna(veredictos["smart"]):
            coinciden += 1
        else:
            difieren += 1
            if len(desacuerdos) < 12:
                desacuerdos.append(
                    f"    {(f.name or '')[:44]:44} → {f.hoja[:24]:24}"
                    f" fast={veredictos['fast'].decision}/{veredictos['fast'].confidence:.2f}"
                    f" smart={veredictos['smart'].decision}/{veredictos['smart'].confidence:.2f}"
                )

    total = coinciden + difieren
    print("=== ACUERDO EN EL DESENLACE ===")
    print(f"  coinciden : {coinciden}/{total}  ({100*coinciden/total:.0f}%)")
    print(f"  difieren  : {difieren}/{total}")
    print("\n=== COSTO EN TOKENS ===")
    for tier in ("fast", "smart"):
        print(f"  {tier:6} {modelos.get(tier, '?'):28} {tokens[tier]:6} tokens")

    if desacuerdos:
        print("\n=== DONDE DIFIEREN (revisá cuál acierta) ===")
        for d in desacuerdos:
            print(d)

    print(
        "\nCRITERIO: bajar a `fast` sólo si el acuerdo es alto Y los desacuerdos no son casos\n"
        "donde `smart` acierta. Un desacuerdo en el que el barato asigna de más es peor que el\n"
        "ahorro — el subsistema prefiere abstenerse a inventar categoría."
    )


if __name__ == "__main__":
    main()
