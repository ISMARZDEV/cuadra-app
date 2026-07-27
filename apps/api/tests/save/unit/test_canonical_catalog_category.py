"""Unit — categoría TOPE del catálogo canónico (hoja + tope, badge coloreado por el ancestro).

`taxonomy_node` NO tiene columna `slug`: el slug se deriva en read-time con el mismo `slugify`
del dominio, igual que en la cola de revisión (`product_match_repository`). Por eso la regla vive
en el read-model y se prueba sin levantar DB.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.domain.canonical_catalog import CanonicalCatalogRow


def _row(**overrides):  # type: ignore[no-untyped-def]
    kwargs = {
        "canonical_product_id": "c1",
        "slug": "arroz-goya-10-lb",
        "name": "Arroz Goya 10 Lb",
        "brand": "GOYA",
        "size_amount": Decimal("10.0"),
        "size_measure": "mass",
        "category": "Arroz",
        "category_top": "Despensa & Abarrotes",
    }
    kwargs.update(overrides)
    return CanonicalCatalogRow(**kwargs)  # type: ignore[arg-type]


class TestCategoryTopSlug:
    def test_the_slug_is_derived_from_the_top_name(self) -> None:
        # El mapa de colores del admin está cargado por slug de TOPE.
        assert _row().category_top_slug == "despensa-abarrotes"

    def test_accents_and_case_are_normalized(self) -> None:
        assert _row(category_top="Panadería & Tortillería").category_top_slug == (
            "panaderia-tortilleria"
        )

    def test_without_a_top_there_is_no_slug(self) -> None:
        # Un canónico sin clasificar NO inventa color: cae al badge neutro "Sin categoría".
        assert _row(category="Arroz", category_top=None).category_top_slug is None

    def test_the_leaf_is_untouched_by_the_derivation(self) -> None:
        # La hoja es el dato ESPECÍFICO que el operador lee; derivar el tope no la reemplaza.
        row = _row()
        assert row.category == "Arroz"
        assert row.category_top == "Despensa & Abarrotes"
