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


def test_descriptive_terms_switch_to_examples_recipe() -> None:
    """Con términos descriptivos, la receta pasa a `"{padre} > {hoja}. Ejemplos: {terms}"` — la
    variante medida (top-1 43%→77% sobre 120 hojas): una etiqueta corta como "Bebidas Agua" no
    discrimina; los ejemplos del dominio sí."""
    text = build_category_embedding_text(
        "Arroz, Granos & Legumbres",
        "Despensa & Abarrotes",
        terms="arroz, habichuelas, guandules, lentejas",
    )
    assert text == (
        "Despensa & Abarrotes > Arroz, Granos & Legumbres. "
        "Ejemplos: arroz, habichuelas, guandules, lentejas"
    )


def test_terms_without_parent() -> None:
    text = build_category_embedding_text("Víveres", None, terms="yuca, plátano, batata")
    assert text == "Víveres. Ejemplos: yuca, plátano, batata"


def test_blank_terms_fall_back_to_plain_recipe() -> None:
    """Términos vacíos/espacios = sin términos: la receta actual (medida) intacta."""
    assert (
        build_category_embedding_text("Frutas", "Frutas & Verduras", terms="   ")
        == "Frutas & Verduras Frutas"
    )
