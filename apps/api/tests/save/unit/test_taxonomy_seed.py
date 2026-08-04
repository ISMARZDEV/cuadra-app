"""Unit — parser de la taxonomía del MD (save-category-classification, Batch 2). Puro, sin DB.

`parse_taxonomy` convierte `docs/research/save-fable/Categorias_y_Subcategorias.md` en
[(categoría, [subcategorías])]. `load_taxonomy_entries` lee el MD real → 15 categorías tope.
"""
from __future__ import annotations

from collections import Counter, defaultdict

import pytest

from seeds.category_terms_data import CATEGORY_TERMS, ROOT_TERMS
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


# --- Regla de cobertura: toda hoja debe traer descriptores curados ----------------------------
# `seed_category_terms` siembra `classification_terms` desde `CATEGORY_TERMS`. Una hoja ausente del
# dict queda SIN términos y cae a la receta pobre (padre+nombre), que mide 43% top-1 contra el 77%
# de la receta descriptiva — en silencio, sin error.
#
# El dict se llavea por la KEY del nodo, no por la etiqueta: el MD declara la key como IDENTIDAD y
# el nombre como etiqueta MUTABLE ("renombrar una etiqueta actualiza el nodo"). Llavear por nombre
# —como se hacía— hacía que un rename descolgara los términos curados en silencio: pasó con 9 hojas
# (`Frutas`→`Frutas Frescas`, `Arena Para Gato`→`Arena Sanitaria`, `Lavado De Ropa`→`Detergentes &
# Suavizantes`, …) y el hueco lo tapó el CLI del LLM con términos de peor calidad.


def _leaf_keys() -> list[str]:
    return [key for _cat, subs in load_taxonomy_entries() for _name, key in subs]


def test_every_leaf_has_curated_terms() -> None:
    missing = sorted(set(_leaf_keys()) - set(CATEGORY_TERMS))
    assert missing == [], (
        f"estas hojas no tienen descriptores curados en CATEGORY_TERMS: {missing}. "
        "Agregalas a `seeds/category_terms_data.py` llaveadas por su key del MD. Sin términos la "
        "hoja cae a la receta pobre padre+nombre (43% top-1 vs 77%)."
    )


def test_no_orphan_terms_keys() -> None:
    """Una key del dict que ya no existe en el MD no falla: simplemente no se aplica nunca."""
    orphans = sorted(set(CATEGORY_TERMS) - set(_leaf_keys()))
    assert orphans == [], (
        f"estas keys de CATEGORY_TERMS no corresponden a ninguna hoja del MD: {orphans}. "
        "Borralas o corregilas — hoy son peso muerto que nunca se siembra."
    )


def _root_keys() -> list[str]:
    return [key for (_name, key), _subs in load_taxonomy_entries()]


def test_every_root_has_terms() -> None:
    """Las raíces NO las lee el clasificador (sus consultas filtran `level == 1`), pero se pueblan
    igual para que la tabla esté completa y haya una descripción del pasillo disponible."""
    missing = sorted(set(_root_keys()) - set(ROOT_TERMS))
    assert missing == [], f"raíces sin descriptores en ROOT_TERMS: {missing}"


def test_no_orphan_root_keys() -> None:
    orphans = sorted(set(ROOT_TERMS) - set(_root_keys()))
    assert orphans == [], f"keys de ROOT_TERMS que no son raíces del MD: {orphans}"


def test_root_and_leaf_terms_never_share_a_key() -> None:
    """Dos dicts, dos niveles: una key en ambos significaría que el mismo nodo es raíz y hoja."""
    assert set(ROOT_TERMS) & set(CATEGORY_TERMS) == set()
