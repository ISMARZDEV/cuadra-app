"""Unit — el puente rubro↔taxonomía de la canasta. DOMINIO PURO.

Cada caso de acá es un fallo REAL medido contra la base el 2026-08-02, no uno inventado.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.basket_taxonomy import (
    ALLOWED_TAXONOMY_BY_GROUP,
    allowed_nodes_for,
    is_plausible,
    mapping_pairs,
)


class TestLosFallosRealesQueMotivaronElPuente:
    def test_canned_tuna_in_oil_is_not_cooking_oil(self) -> None:
        """`word_similarity('aceite', 'Atún En Aceite Calvo')` = 1.0 y es LEGÍTIMO: «Aceite» es
        palabra entera. Por eso el piso no alcanzaba y hace falta la taxonomía."""
        chain = ["Enlatados & Conservas", "Despensa & Abarrotes"]

        assert is_plausible("Aceites y grasas", chain) is False

    def test_real_cooking_oil_does_belong(self) -> None:
        assert is_plausible("Aceites y grasas", ["Aceite & Vinagre", "Despensa & Abarrotes"])

    def test_spaghetti_is_not_eggs(self) -> None:
        assert is_plausible("Huevos", ["Pastas", "Despensa & Abarrotes"]) is False

    def test_a_cookie_is_not_a_grain(self) -> None:
        assert is_plausible("Granos y legumbres", ["Galletas & Barras", "Snacks & Dulces"]) is False

    def test_dog_food_is_not_meat(self) -> None:
        assert is_plausible("Carnes", ["Alimento Para Perro", "Mascotas"]) is False

    def test_baby_puree_is_not_meat(self) -> None:
        assert is_plausible("Carnes", ["Compotas & Papillas De Bebé", "Bebés"]) is False


class TestLaCadenaDeAncestros:
    def test_an_ancestor_is_enough(self) -> None:
        """El rubro se mapea a la RAÍZ cuando entra entera: cualquier hoja bajo ella vale."""
        assert is_plausible("Carnes", ["Pollo", "Carnes & Pescados"])
        assert is_plausible("Bebidas", ["Refresco", "Bebidas"])

    def test_eggs_do_not_sneak_into_dairy_through_the_shared_root(self) -> None:
        """«Lácteos & Huevos» es una sola raíz. Si el rubro Lácteos la aceptara, los huevos
        entrarían: por eso ese rubro enumera hojas en vez de usar la raíz."""
        assert is_plausible("Lácteos", ["Huevos", "Lácteos & Huevos"]) is False
        assert is_plausible("Lácteos", ["Queso", "Lácteos & Huevos"])

    def test_a_none_in_the_chain_does_not_break_it(self) -> None:
        """La cadena viene de LEFT JOINs: los niveles que no existen llegan como None."""
        assert is_plausible("Huevos", ["Huevos", None, None])  # type: ignore[list-item]


class TestDegradacion:
    def test_an_unmapped_group_accepts_everything_instead_of_vanishing(self) -> None:
        """Un rubro nuevo creado desde el admin no puede quedar sin resolver por no estar curado."""
        assert allowed_nodes_for("Rubro Inventado Por El Admin") == frozenset()
        assert is_plausible("Rubro Inventado Por El Admin", ["Cualquier Hoja"])


class TestFormaDelMapeo:
    def test_every_group_maps_to_at_least_one_node(self) -> None:
        empty = [g for g, nodes in ALLOWED_TAXONOMY_BY_GROUP.items() if not nodes]

        assert empty == []

    def test_the_flattened_pairs_match_the_mapping(self) -> None:
        pairs = mapping_pairs()

        assert len(pairs) == sum(len(n) for n in ALLOWED_TAXONOMY_BY_GROUP.values())
        assert all(node in ALLOWED_TAXONOMY_BY_GROUP[group] for group, node in pairs)

    @pytest.mark.parametrize(
        "group",
        [
            "Aceites y grasas", "Azúcar y endulzantes", "Bebidas", "Bebé", "Café", "Carnes",
            "Cereales y avena", "Embutidos", "Enlatados y conservas", "Granos y legumbres",
            "Harinas y horneo", "Higiene personal", "Huevos", "Limpieza", "Lácteos",
            "Panadería y galletas", "Pastas", "Sal y especias", "Salsas y condimentos", "Víveres",
        ],
    )
    def test_the_twenty_household_groups_are_all_mapped(self, group: str) -> None:
        """Los 20 grupos de `basket_query`. Si la canasta curada crece, este test lo señala."""
        assert allowed_nodes_for(group), f"el rubro {group!r} quedó sin mapeo"
