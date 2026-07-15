"""Seed de la taxonomía canónica REAL de Save (save-category-classification, Batch 2).

Puebla `taxonomy_node` con las 15 categorías tope + subcategorías de
`docs/research/save-fable/Categorias_y_Subcategorias.md` (2 niveles), para `market_id="DO"`.

IDEMPOTENTE y COMPATIBLE con el seed demo: reusa `_taxonomy_leaf` (mismo namespace `_NS` +
esquema `uuid5(taxonomy:{market}/{cat}/{sub})`), así que un nodo ya sembrado por `save_seed`
(p.ej. "Despensa & Abarrotes" / "Arroz, Granos & Legumbres") obtiene el MISMO id — sin
duplicar, sin conflicto. Las hojas más profundas de la demo quedan como hijos extra.

Correr: `uv run python -m seeds.save_taxonomy_seed` (o vía el orquestador de seeds).
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from seeds.save_seed import _taxonomy_leaf

# apps/api/seeds/save_taxonomy_seed.py → parents[3] = raíz del repo
_MD_PATH = (
    Path(__file__).resolve().parents[3]
    / "docs/research/save-fable/Categorias_y_Subcategorias.md"
)


def parse_taxonomy(md_text: str) -> list[tuple[str, list[str]]]:
    """`## Categoría` → categoría; `- Subcategoría` → subcategoría. Ignora el `#` (h1) y blancos."""
    entries: list[tuple[str, list[str]]] = []
    current: tuple[str, list[str]] | None = None
    for raw in md_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("## "):
            current = (line[3:].strip(), [])
            entries.append(current)
        elif line.startswith("-") and current is not None:
            sub = line.lstrip("-").strip()
            if sub:
                current[1].append(sub)
    return entries


def load_taxonomy_entries() -> list[tuple[str, list[str]]]:
    return parse_taxonomy(_MD_PATH.read_text(encoding="utf-8"))


def seed_taxonomy(
    session: Session,
    market_id: str = "DO",
    entries: list[tuple[str, list[str]]] | None = None,
) -> int:
    """Crea (idempotente) categorías tope + subcategorías. Devuelve el nº de categorías tope."""
    entries = entries if entries is not None else load_taxonomy_entries()
    for category, subcategories in entries:
        _taxonomy_leaf(session, market_id, [category])
        for subcategory in subcategories:
            _taxonomy_leaf(session, market_id, [category, subcategory])
    return len(entries)


def main() -> None:
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        count = seed_taxonomy(session, market_id="DO")
        session.commit()
    print(f"seed: taxonomía Save OK ({count} categorías tope, idempotente).")


if __name__ == "__main__":
    main()
