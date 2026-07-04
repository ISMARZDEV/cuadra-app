"""Save controller — HTTP boundary del contexto save (prefijo `/save`).

Catálogo público de precios (sin auth): buscar productos y comparar precios entre tiendas.
Thin (SRP): parsea el request, delega en el use case, devuelve el DTO. `market` identifica el
mercado (multi-país: DO→US→CO). Los errores de aplicación se mapean a HTTP.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.composition_root import get_compare_product, get_search_products
from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.dtos import PriceComparisonDto, ProductSearchDto
from src.contexts.save.application.errors import CanonicalProductNotFoundError
from src.contexts.save.application.search import SearchProducts

router = APIRouter(prefix="/save", tags=["save"])


@router.get("/search")
def search_products(
    q: str = Query(..., min_length=1, description="Texto de búsqueda"),
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: SearchProducts = Depends(get_search_products),
) -> list[ProductSearchDto]:
    return use_case.execute(q, market)


@router.get("/compare")
def compare_product(
    product_id: str = Query(..., description="ID del producto canónico"),
    use_case: CompareProduct = Depends(get_compare_product),
) -> PriceComparisonDto:
    try:
        return use_case.execute(product_id)
    except CanonicalProductNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
