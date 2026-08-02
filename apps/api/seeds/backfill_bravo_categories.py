"""DEV: reescribe la categoría de ORIGEN de los productos de Bravo ya ingeridos (2026-08-02).

SIN RED. La subfamilia ya está guardada DENTRO de `source_category` (`'FV > FV-005'`), así que
alcanza con parsearla, buscarla en `SUBFAMILY_SECTIONS` y anteponer el nombre de sección:

    'FV > FV-005'  →  'Frutas y vegetales > FV > FV-005'

Por qué hace falta: el mapa se aplica al INGERIR, así que los productos que ya están en la BD
conservan el código opaco hasta que se los vuelva a ingerir. Esto los arregla sin pagar una sola
request, y después re-clasifica lo que quedó sin categoría (`ClassifyBackfill`, que sólo toca lo
que NO tiene clasificación activa — no revuelve lo ya resuelto).

Uso:
    cd apps/api && uv run python -m seeds.backfill_bravo_categories          # dry-run
    cd apps/api && uv run python -m seeds.backfill_bravo_categories --yes    # ejecuta
    cd apps/api && uv run python -m seeds.backfill_bravo_categories --yes --no-classify
"""
from __future__ import annotations

import sys
from collections import Counter

from sqlalchemy import text

from src.contexts.save.infrastructure.catalog_sources.bravova_sections import (
    section_for_subfamily,
)

_PROVIDER = "Bravo"

# Sólo tocamos filas que siguen siendo CÓDIGO puro (`FV` o `FV > FV-005`). Una fila que ya tiene
# nombre —porque se re-ingirió con el mapa activo— no se re-procesa: el backfill es idempotente.
_ONLY_CODES = r"^[A-Z]{2,3}( > [A-Z]{2,3}-[0-9]+)?$"


def _rows(session):  # type: ignore[no-untyped-def]
    return session.execute(
        text(
            f"""
            SELECT sp.id, sp.name, sp.source_category
            FROM save.store_product sp
            JOIN save.provider p ON p.id = sp.provider_id
            WHERE p.name = :prov AND sp.source_category ~ '{_ONLY_CODES}'
            ORDER BY sp.name
            """
        ),
        {"prov": _PROVIDER},
    ).all()


def main() -> None:
    execute = "--yes" in sys.argv
    classify = "--no-classify" not in sys.argv

    from ingestion.save.composition import build_classifier
    from ingestion.save.sources import SAVE_MARKET
    from src.contexts.save.application.classify_backfill import ClassifyBackfill
    from src.contexts.save.infrastructure.repositories import (
        SqlCategoryClassificationRepository,
    )
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        rows = _rows(session)
        print(f"{_PROVIDER}: {len(rows)} productos con categoría en CÓDIGO puro\n")

        cambios: list[tuple[str, str, str]] = []
        sin_mapa: Counter[str] = Counter()
        for row in rows:
            sub = row.source_category.split(" > ")[-1]
            section = section_for_subfamily(sub)
            if section is None:
                sin_mapa[sub] += 1
                continue
            cambios.append((str(row.id), row.name, f"{section} > {row.source_category}"))

        pct = len(cambios) / len(rows) * 100 if rows else 0
        print(f"  CON nombre de sección : {len(cambios)}  ({pct:.0f}%)")
        print(f"  sin mapa (ambiguas)   : {sum(sin_mapa.values())} en {len(sin_mapa)} subfamilias")
        if sin_mapa:
            print("     " + ", ".join(f"{k}×{v}" for k, v in sin_mapa.most_common(8)))

        print("\n  ejemplos:")
        for _, name, nuevo in cambios[:8]:
            print(f"    {name[:40]:<42} → {nuevo}")

        if not execute:
            print("\n(dry-run — nada escrito. Agregá --yes para ejecutar.)")
            return

        for pid, _, nuevo in cambios:
            session.execute(
                text("UPDATE save.store_product SET source_category = :sc WHERE id = :id"),
                {"sc": nuevo, "id": pid},
            )
        session.commit()
        print(f"\n✓ {len(cambios)} categorías de origen reescritas.")

        if not classify:
            print("(--no-classify: no se re-clasificó)")
            return

        classifier = build_classifier(session)
        if classifier is None:
            print("✖ Clasificador DARK (SAVE_CLASSIFICATION_ENABLED=false) — no se re-clasificó.")
            return
        procesados = ClassifyBackfill(
            SqlCategoryClassificationRepository(session), classifier
        ).execute(SAVE_MARKET, is_canonical=False)
        session.commit()
        print(f"✓ re-clasificación: {procesados} productos procesados (todos los sin categoría).")


if __name__ == "__main__":
    main()
