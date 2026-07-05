"""Unit — taxonomía (categorías/subcategorías): slugify + ListCategories + GetCategory con fakes.

GetCategory resuelve un slug dentro del árbol, arma el breadcrumb (raíz→nodo), lista las
subcategorías y los productos bajo el nodo. Sin DB — el árbol y los productos vienen de un repo fake.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.application.categories import GetCategory, ListCategories
from src.contexts.save.application.errors import CategoryNotFoundError
from src.contexts.save.domain.entities import CanonicalProduct
from src.contexts.save.domain.taxonomy import CategoryNode, slugify
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure


def _leaf(name: str) -> CategoryNode:
    return CategoryNode(id=name, name=name, slug=slugify(name), level=2, parent_id=None)


def _node(name: str, level: int, children: tuple[CategoryNode, ...]) -> CategoryNode:
    return CategoryNode(id=name, name=name, slug=slugify(name), level=level, parent_id=None,
                        children=children)


# Despensa & Abarrotes → Arroz, Granos & Legumbres → Arroz (hoja)
ARROZ = _leaf("Arroz")
GRANOS = _node("Arroz, Granos & Legumbres", 1, (ARROZ,))
DESPENSA = _node("Despensa & Abarrotes", 0, (GRANOS,))
TREE = [DESPENSA, _node("Bebidas", 0, ())]


class FakeTaxonomyRepo:
    def __init__(self, tree: list[CategoryNode], products: list[CanonicalProduct]) -> None:
        self._tree = tree
        self._products = products

    def list_tree(self, market_id: str) -> list[CategoryNode]:
        return self._tree

    def list_products_under(self, node_id: str) -> list[CanonicalProduct]:
        return self._products


def _product() -> CanonicalProduct:
    return CanonicalProduct(
        "c1", "Arroz La Garza", "La Garza",
        Quantity(Decimal("4.5"), UnitMeasure.MASS), taxonomy_node_id="Arroz", market_id="DO",
    )


def test_slugify_strips_accents_and_symbols() -> None:
    assert slugify("Despensa & Abarrotes") == "despensa-abarrotes"
    assert slugify("Panadería & Tortillería") == "panaderia-tortilleria"


def test_list_categories_returns_nested_tree() -> None:
    dto = ListCategories(FakeTaxonomyRepo(TREE, [])).execute("DO")
    assert [c.name for c in dto.categories] == ["Despensa & Abarrotes", "Bebidas"]
    despensa = dto.categories[0]
    assert despensa.slug == "despensa-abarrotes"
    assert despensa.children[0].name == "Arroz, Granos & Legumbres"


def test_get_category_builds_breadcrumb_subcats_and_products() -> None:
    repo = FakeTaxonomyRepo(TREE, [_product()])
    dto = GetCategory(repo).execute("DO", "arroz-granos-legumbres")
    assert dto.name == "Arroz, Granos & Legumbres"
    # breadcrumb raíz→nodo
    assert [b.name for b in dto.breadcrumb] == ["Despensa & Abarrotes", "Arroz, Granos & Legumbres"]
    assert [b.slug for b in dto.breadcrumb] == ["despensa-abarrotes", "arroz-granos-legumbres"]
    # subcategorías
    assert [s.name for s in dto.subcategories] == ["Arroz"]
    # productos bajo el nodo
    assert [p.id for p in dto.products] == ["c1"]


def test_get_category_unknown_slug_raises() -> None:
    with pytest.raises(CategoryNotFoundError):
        GetCategory(FakeTaxonomyRepo(TREE, [])).execute("DO", "no-existe")
