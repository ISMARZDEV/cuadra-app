"""Unit — receta de texto para embeddear categorías (save-category-classification, Batch 5). PURO."""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.category_embedding_text import (
    build_category_embedding_text,
)


def test_includes_parent_for_context() -> None:
    text = build_category_embedding_text("Arroz, Granos & Legumbres", "Despensa & Abarrotes")
    assert text == "Despensa & Abarrotes Arroz, Granos & Legumbres"


def test_no_parent_falls_back_to_name() -> None:
    assert build_category_embedding_text("Frutas", None) == "Frutas"
