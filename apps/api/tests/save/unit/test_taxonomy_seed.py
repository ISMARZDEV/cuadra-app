"""Unit — parser de la taxonomía del MD (save-category-classification, Batch 2). Puro, sin DB.

`parse_taxonomy` convierte `docs/research/save-fable/Categorias_y_Subcategorias.md` en
[(categoría, [subcategorías])]. `load_taxonomy_entries` lee el MD real → 15 categorías tope.
"""
from __future__ import annotations

from seeds.save_taxonomy_seed import load_taxonomy_entries, parse_taxonomy

_SAMPLE = """# Categorías y Subcategorías

## Alcohol

-   Brandy / Cognac
-   Cerveza

## Despensa & Abarrotes

-   Aceite & Vinagre
-   Arroz, Granos & Legumbres
"""


def test_parse_extracts_categories_and_subcategories() -> None:
    entries = parse_taxonomy(_SAMPLE)
    assert entries == [
        ("Alcohol", ["Brandy / Cognac", "Cerveza"]),
        ("Despensa & Abarrotes", ["Aceite & Vinagre", "Arroz, Granos & Legumbres"]),
    ]


def test_parse_ignores_h1_title_and_blanks() -> None:
    entries = parse_taxonomy(_SAMPLE)
    names = [c for c, _ in entries]
    assert "Categorías y Subcategorías" not in names  # el `#` (h1) no es categoría


def test_load_real_md_has_15_top_categories() -> None:
    entries = load_taxonomy_entries()
    names = [c for c, _ in entries]
    assert len(entries) == 15, names
    assert "Frutas & Verduras" in names
    assert "Despensa & Abarrotes" in names
    # cada categoría trae al menos una subcategoría
    assert all(len(subs) >= 1 for _c, subs in entries)


def test_despensa_has_arroz_subcategory() -> None:
    entries = dict(load_taxonomy_entries())
    assert "Arroz, Granos & Legumbres" in entries["Despensa & Abarrotes"]
