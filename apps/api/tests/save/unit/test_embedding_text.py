"""Unit — `build_embedding_text`: la receta ÚNICA del texto que se embebe para el matching semántico.

Debe ser idéntica en el lado query (store_product entrante) y en el lado índice (canonical_product):
vectores de textos construidos distinto NO son comparables y romperían el matching en silencio. Por
eso hay UN solo helper y ambos lados lo usan.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.embedding_text import build_embedding_text


def test_joins_name_brand_size() -> None:
    assert build_embedding_text("Arroz Selecto Wala", "Wala", "5 LB") == "Arroz Selecto Wala Wala 5 LB"


def test_strips_when_brand_or_size_empty() -> None:
    assert build_embedding_text("Azucar Crema", "", "") == "Azucar Crema"
