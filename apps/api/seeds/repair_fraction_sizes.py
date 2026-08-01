"""Backfill idempotente: repara los tamaños que se guardaron con el DENOMINADOR de una fracción.

`extract_size` enganchaba con el denominador: `"ALBAHACA VERDE 1/2 LB"` quedó como `2 Lb` y
`"QUESO 1/4 LB"` como `4 Lb` — 4× y 16× de error, y en la dirección peor (media libra pasó a dos).
El parser ya está arreglado; esto repara lo que se guardó antes.

⚠️ NO sirve re-normalizar `size_text`: ya está corrupto (`"2 Lb"` no recuerda que venía de `1/2`).
Hay que volver al **NOMBRE**, que es la fuente, y re-derivar desde ahí. Por eso este script existe
además de `normalize_sizes.py`, que sólo canoniza la ortografía de lo ya guardado.

Toca sólo lo que cambia, así que es idempotente: la segunda corrida no encuentra nada.

Uso:  cd apps/api && uv run python -m seeds.repair_fraction_sizes  [--dry-run]
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from src.contexts.save.domain.value_objects import normalize_size_text, parse_size
from src.contexts.save.infrastructure.catalog_sources.size_from_name import extract_size
from src.contexts.save.infrastructure.models import CanonicalProductModel, StoreProductModel


def _repaired(name: str | None) -> tuple[str, object] | None:
    """`(display, Quantity)` re-derivados del nombre, o `None` si no hay nada que reparar.

    Sólo actúa sobre nombres con fracción: es el único caso que el bug corrompía, y limitar el
    alcance evita "reparar" filas cuyo tamaño alguien ajustó a mano.
    """
    if not name or "/" not in name:
        return None
    raw = extract_size(name)
    if not raw or "/" not in raw:
        return None
    try:
        quantity = parse_size(raw)
    except ValueError:
        return None  # el dominio no lo entiende → no inventar nada
    display = normalize_size_text(raw)
    return (display, quantity) if display else None


def run(session, *, execute: bool) -> tuple[list[str], list[str]]:
    """Devuelve (líneas de store_product reparadas, líneas de canónico reparadas)."""
    store_fixed: list[str] = []
    canonical_fixed: list[str] = []

    for sp in session.execute(select(StoreProductModel)).scalars():
        found = _repaired(sp.name)
        if found is None:
            continue
        display, _quantity = found
        if sp.size_text == display:
            continue
        store_fixed.append(f"{sp.name[:44]:44} {sp.size_text!r} -> {display!r}")
        if execute:
            sp.size_text = display

    for cp in session.execute(select(CanonicalProductModel)).scalars():
        found = _repaired(cp.name)
        if found is None:
            continue
        display, quantity = found
        if cp.display_size == display and cp.size_measure == quantity.measure.value:
            continue
        canonical_fixed.append(
            f"{cp.name[:44]:44} {cp.display_size!r} ({cp.size_amount}) -> "
            f"{display!r} ({quantity.amount})"
        )
        if execute:
            # Los TRES campos, no sólo el display: `size_amount` es lo que compara el matching.
            cp.display_size = display
            cp.size_amount = quantity.amount
            cp.size_measure = quantity.measure.value

    return store_fixed, canonical_fixed


def main() -> None:
    execute = "--dry-run" not in sys.argv
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        store_fixed, canonical_fixed = run(session, execute=execute)
        if execute:
            session.commit()

    modo = "APLICADO" if execute else "DRY-RUN (nada escrito)"
    print(f"[{modo}] store_product reparados: {len(store_fixed)}")
    for line in store_fixed:
        print(f"   {line}")
    print(f"[{modo}] canonical_product reparados: {len(canonical_fixed)}")
    for line in canonical_fixed:
        print(f"   {line}")


if __name__ == "__main__":
    main()
