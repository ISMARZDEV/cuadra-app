"""Use cases de taxonomía (Save): ListCategories (árbol) + GetCategory (breadcrumb + subcats + productos).

Alimenta la página de todas las categorías (Imagen #6) y el listado por categoría (Imagen #8).
El slug se resuelve recorriendo el árbol en memoria (taxonomía chica). Solo lectura.
"""
from __future__ import annotations

from ..domain.ports import TaxonomyRepository
from ..domain.taxonomy import CategoryNode
from .dtos import (
    CategoryNodeDto,
    CategoryPageDto,
    CategoryRefDto,
    CategoryTreeDto,
    ProductSearchDto,
)
from .errors import CategoryNotFoundError


def _find_path(nodes: list[CategoryNode], slug: str, trail: tuple[CategoryNode, ...] = ()) -> (
    tuple[CategoryNode, ...] | None
):
    """Camino raíz→nodo (inclusive) del primer nodo cuyo slug coincide, o None."""
    for node in nodes:
        path = (*trail, node)
        if node.slug == slug:
            return path
        found = _find_path(list(node.children), slug, path)
        if found:
            return found
    return None


class ListCategories:
    def __init__(self, taxonomy_repo: TaxonomyRepository) -> None:
        self._repo = taxonomy_repo

    def execute(self, market_id: str) -> CategoryTreeDto:
        tree = self._repo.list_tree(market_id)
        return CategoryTreeDto(categories=[CategoryNodeDto.from_node(n) for n in tree])


class GetCategory:
    def __init__(self, taxonomy_repo: TaxonomyRepository) -> None:
        self._repo = taxonomy_repo

    def execute(self, market_id: str, slug: str) -> CategoryPageDto:
        path = _find_path(self._repo.list_tree(market_id), slug)
        if path is None:
            raise CategoryNotFoundError(slug)
        node = path[-1]
        products = self._repo.list_products_under(node.id)
        return CategoryPageDto(
            name=node.name,
            slug=node.slug,
            breadcrumb=[CategoryRefDto(name=n.name, slug=n.slug) for n in path],
            subcategories=[CategoryRefDto(name=c.name, slug=c.slug) for c in node.children],
            products=[ProductSearchDto.from_entity(p) for p in products],
        )
