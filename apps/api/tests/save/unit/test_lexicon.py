"""Unit — matcher léxico determinista (save-category-classification, Batch 3). PURO, sin DB.

Diccionario keyword→hoja derivado de los nombres de subcategoría. Alta precisión: un token
ambiguo (mapea a >1 hoja) se descarta; un nombre sin keyword conocido → None.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.lexicon import (
    build_lexicon_index,
    lexicon_match,
)

_LEAVES = [
    ("n-arroz", "Arroz, Granos & Legumbres"),
    ("n-cerveza", "Cerveza"),
    ("n-pollo", "Pollo"),
]


def test_matches_distinctive_keyword() -> None:
    idx = build_lexicon_index(_LEAVES)
    hit = lexicon_match("Arroz Blanco Sirena 5 Lb", idx)
    assert hit is not None
    node_id, confidence = hit
    assert node_id == "n-arroz"
    assert confidence >= 0.9


def test_matches_single_word_subcategory() -> None:
    idx = build_lexicon_index(_LEAVES)
    assert lexicon_match("Cerveza Presidente 12 oz", idx)[0] == "n-cerveza"


def test_no_keyword_returns_none() -> None:
    idx = build_lexicon_index(_LEAVES)
    assert lexicon_match("Producto XYZ genérico", idx) is None


def test_accent_and_case_insensitive() -> None:
    idx = build_lexicon_index([("n-cafe", "Café")])
    # "Cafe" (sin acento, distinta caja) debe pegar con "Café" (slugify normaliza acento+caja)
    assert lexicon_match("Cafe Molido La Aurora", idx)[0] == "n-cafe"


def test_ambiguous_token_is_dropped() -> None:
    # "Especiales" aparece en dos subcategorías distintas → token ambiguo, no debe asignar
    idx = build_lexicon_index([
        ("n-a", "Aves & Carnes Especiales"),
        ("n-b", "Ofertas Especiales"),
    ])
    assert lexicon_match("Combo Especiales del día", idx) is None


def test_stopwords_and_short_tokens_ignored() -> None:
    # "de"/"&" no deben indexar; un producto con solo esos tokens comunes → None
    idx = build_lexicon_index([("n-x", "Aceite & Vinagre")])
    assert lexicon_match("de la casa", idx) is None
