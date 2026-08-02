"""Siembra en `save.brand` las marcas que el catálogo no conocía y el corpus SÍ usa.

Por qué (2026-08-02): tras la primera corrida de `price_refresh` de Bravo la marca no se movió
(14/52). Medido: `ResolveBrand` corrió sobre los 38 sin marca y resolvió CERO, porque `save.brand`
tenía 33 filas para DO y la marca blanca de la cadena no estaba entre ellas. El resolver RECONOCE,
no inventa: sin la fila, 13 productos cuyo nombre empieza con «BRAVO» eran irreconocibles.

Cada candidata se midió contra el corpus COMPLETO antes de entrar: ninguna toca productos de otra
tienda, así que no hay contaminación cruzada. Las descartadas y su motivo quedan en
`EXCLUDED_ON_PURPOSE` — borrar el motivo es perder por qué no están.

Idempotente: compara por `brand_key` (igual que `_get_or_create_brand_id`), así que `Bravo` y
`BRAVO` no entran dos veces. Después de esto, `python -m seeds.backfill_brands` rellena la data vieja.

Uso:  cd apps/api && uv run python -m seeds.seed_brands  [--dry-run]
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from src.contexts.save.domain.canonical_import import brand_key, normalize_brand
from src.contexts.save.infrastructure.models import BrandModel
from src.contexts.save.infrastructure.repositories import brand_key_sql

MARKET = "DO"

# Marca → por qué es seguro sembrarla. El número es lo medido sobre el corpus real.
MISSING_BRANDS: dict[str, str] = {
    "BRAVO": "Marca blanca de la cadena. 13 coincidencias, TODAS en Bravo.",
    "FRESCAN": "4 coincidencias, todas en Bravo (`FRESCAN RES Y ARROZ`).",
    "NATRUE": "1 coincidencia, en Bravo (`NATRUE BEBIDA ARROZ 32 OZ`).",
    "CRISTALINO": "1 coincidencia, en Bravo (`CRISTALINO ARROZ GOURMET 10 LB`).",
}

# Candidatas que aparecieron en la medición y NO se siembran.
EXCLUDED_ON_PURPOSE: dict[str, str] = {
    "KAYAMA": (
        "Truncamiento de OKAYAMA, que YA está en el catálogo: `KAYAMA FIDEO DE ARROZ 454GR` (Bravo) "
        "es el mismo producto que `Fideo De Arroz Okayama 454 G` (Sirena). Sembrarla crearía una "
        "marca fantasma y el brand gate leería KAYAMA vs OKAYAMA como conflicto, bloqueando un "
        "enlace legítimo: un falso NEGATIVO fabricado por nosotros."
    ),
    "DELLA": (
        "Su única coincidencia es `BRAVO HABICHUELA ROJA/RED KIDNEY 400 GR DELLA`, donde BRAVO gana "
        "igual por posición. Suma cero y arriesga etiquetar mal un producto de marca blanca."
    ),
}


def run(session, *, execute: bool) -> tuple[list[str], list[str]]:
    """Devuelve (sembradas, ya existentes)."""
    sembradas: list[str] = []
    existentes: list[str] = []

    for name in MISSING_BRANDS:
        ya = session.scalars(
            select(BrandModel)
            .where(BrandModel.market_id == MARKET)
            .where(brand_key_sql(BrandModel.name) == brand_key(name))
        ).first()
        if ya is not None:
            existentes.append(name)
            continue
        sembradas.append(name)
        if execute:
            session.add(BrandModel(name=normalize_brand(name), market_id=MARKET))

    return sembradas, existentes


def main() -> None:
    execute = "--dry-run" not in sys.argv
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        sembradas, existentes = run(session, execute=execute)
        if execute:
            session.commit()

    modo = "APLICADO" if execute else "DRY-RUN (nada escrito)"
    print(f"[{modo}] marcas nuevas: {len(sembradas)} · ya existían: {len(existentes)}")
    for name in sembradas:
        print(f"  + {name:<12} {MISSING_BRANDS[name]}")
    for name in existentes:
        print(f"  = {name:<12} (ya estaba)")
    print(f"\nNO sembradas a propósito: {', '.join(EXCLUDED_ON_PURPOSE)}")
    print("Siguiente paso: python -m seeds.backfill_brands")


if __name__ == "__main__":
    main()
