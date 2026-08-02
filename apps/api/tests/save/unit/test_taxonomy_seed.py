"""Unit — parser de la taxonomía del MD (save-category-classification, Batch 2). Puro, sin DB.

`parse_taxonomy` convierte `docs/research/save-fable/Categorias_y_Subcategorias.md` en
[(categoría, [subcategorías])]. `load_taxonomy_entries` lee el MD real → 15 categorías tope.
"""
from __future__ import annotations

from collections import Counter, defaultdict

import pytest

from seeds.save_taxonomy_seed import load_taxonomy_entries, parse_taxonomy
from src.contexts.save.infrastructure.classification.lexicon import _tokens

_SAMPLE = """# Categorías y Subcategorías

## Alcohol `alcohol`

-   Brandy / Cognac `alcohol.brandy-cognac`
-   Cerveza `alcohol.cerveza`

## Despensa & Abarrotes `despensa-abarrotes`

-   Aceite & Vinagre `despensa-abarrotes.aceite-vinagre`
-   Arroz, Granos & Legumbres `despensa-abarrotes.arroz-granos-legumbres`
"""


def test_parse_extracts_names_and_keys() -> None:
    entries = parse_taxonomy(_SAMPLE)
    assert entries == [
        (
            ("Alcohol", "alcohol"),
            [("Brandy / Cognac", "alcohol.brandy-cognac"), ("Cerveza", "alcohol.cerveza")],
        ),
        (
            ("Despensa & Abarrotes", "despensa-abarrotes"),
            [
                ("Aceite & Vinagre", "despensa-abarrotes.aceite-vinagre"),
                ("Arroz, Granos & Legumbres", "despensa-abarrotes.arroz-granos-legumbres"),
            ],
        ),
    ]


def test_parse_ignores_h1_title_and_blanks() -> None:
    entries = parse_taxonomy(_SAMPLE)
    names = [c for (c, _k), _subs in entries]
    assert "Categorías y Subcategorías" not in names  # el `#` (h1) no es categoría


def test_a_line_without_key_is_rejected_loudly() -> None:
    """La key es la IDENTIDAD del nodo. Si falta, derivarla del nombre reintroduciría justo el bug
    que la key existe para eliminar (renombrar = nodo nuevo), así que se falla en vez de adivinar."""
    with pytest.raises(ValueError, match="sin key"):
        parse_taxonomy("## Alcohol `alcohol`\n\n-   Cerveza\n")


def test_load_real_md_has_17_top_categories() -> None:
    entries = load_taxonomy_entries()
    names = [c for (c, _k), _subs in entries]
    assert len(entries) == 17, names
    assert "Frutas & Verduras" in names
    assert "Despensa & Abarrotes" in names
    assert "Congelados" in names  # el pasillo de congelados no tenía casa hasta 2026-08-01
    # cada categoría trae al menos una subcategoría
    assert all(len(subs) >= 1 for _c, subs in entries)


def test_despensa_has_arroz_subcategory() -> None:
    entries = {c: [s for s, _k in subs] for (c, _ck), subs in load_taxonomy_entries()}
    assert "Arroz, Granos & Legumbres" in entries["Despensa & Abarrotes"]


# --- Regla de nombres: cada hoja debe ser VISIBLE para el léxico -------------------------------
# `build_lexicon_index` descarta todo token que aparezca en más de una hoja (nunca asigna a
# ciegas). Una hoja cuyos tokens sean TODOS ambiguos queda invisible para la etapa léxica barata
# y cae siempre al camino caro (embedding/juez) — en silencio, sin error.
#
# Medido 2026-08-01 sobre el árbol de entonces: 9 de 120 hojas estaban así, incluida `Frutas`
# (su único token colisionaba con `Frutas Deshidratadas` y `Pulpa De Frutas`). Estos tests son el
# guard para que no vuelva a pasar al agregar o renombrar una subcategoría.


def _leaf_names() -> list[str]:
    return [name for _cat, subs in load_taxonomy_entries() for name, _key in subs]


def test_no_two_leaves_share_a_name() -> None:
    """Dos hojas homónimas hacen ambiguos TODOS sus tokens → las dos quedan invisibles. Pasó con
    `Maternidad & Lactancia`, que existía bajo Bebés y bajo Salud & Farmacia."""
    duplicates = [n for n, count in Counter(_leaf_names()).items() if count > 1]
    assert duplicates == [], f"nombres de hoja duplicados: {duplicates}"


def test_every_leaf_owns_at_least_one_unambiguous_token() -> None:
    names = _leaf_names()
    owners: dict[str, set[str]] = defaultdict(set)
    for name in names:
        for token in _tokens(name):
            owners[token].add(name)

    invisible = [n for n in names if not any(len(owners[t]) == 1 for t in _tokens(n))]
    assert invisible == [], (
        "estas subcategorías no tienen ningún token propio y son invisibles para el léxico: "
        f"{invisible}. Renombralas para que aporten una palabra (≥3 letras) que ninguna otra use. "
        "El tokenizador NO lematiza: `leche` ≠ `leches`, `frescas` ≠ `frescos`."
    )
