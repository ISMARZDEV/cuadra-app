"""Backfill idempotente: normaliza los tamaños EXISTENTES a unidad canónica de 2 letras.

Recorre `store_product.size_text` y `canonical_product.display_size` y les aplica
`normalize_size_text` ("20 Lbs" → "20 Lb", "Grande" → "G"). Idempotente: re-correrlo es un no-op
(normalizar lo ya normalizado no cambia nada). Los nuevos ya entran normalizados desde la ingesta /
la creación de canónicos — esto es solo para la data vieja.

Uso:  cd apps/api && uv run python -m seeds.normalize_sizes  [--dry-run]
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from src.contexts.save.domain.value_objects import normalize_size_text
from src.contexts.save.infrastructure.models import CanonicalProductModel, StoreProductModel


def run(session, *, execute: bool) -> tuple[int, int]:
    """Devuelve (store_products actualizados, canónicos actualizados)."""
    sp_changed = cp_changed = 0

    for sp in session.execute(select(StoreProductModel)).scalars():
        new = normalize_size_text(sp.size_text)
        if new != sp.size_text:
            sp_changed += 1
            if execute:
                sp.size_text = new

    for cp in session.execute(select(CanonicalProductModel)).scalars():
        new = normalize_size_text(cp.display_size)
        if new != cp.display_size:
            cp_changed += 1
            if execute:
                cp.display_size = new

    return sp_changed, cp_changed


def main() -> None:
    execute = "--dry-run" not in sys.argv
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        sp, cp = run(session, execute=execute)
        if execute:
            session.commit()
        verb = "normalizados" if execute else "a normalizar (dry-run)"
        print(f"backfill tamaños: {sp} store_products + {cp} canónicos {verb}.")


if __name__ == "__main__":
    main()
