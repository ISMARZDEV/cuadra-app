"""Save controller — HTTP boundary del contexto save (prefijo `/save`).

Catálogo público de precios (sin auth): buscar productos y comparar precios entre tiendas.
Thin (SRP): parsea el request, delega en el use case, devuelve el DTO. `market` identifica el
mercado (multi-país: DO→US→CO). Los errores de aplicación se mapean a HTTP.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.api.composition_root import (
    get_category,
    get_compare_product,
    get_list_categories,
    get_list_price_drops,
    get_list_products,
    get_price_history,
    get_search_products,
)
from src.contexts.save.application.categories import GetCategory, ListCategories
from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.drops import ListPriceDrops
from src.contexts.save.application.dtos import (
    CategoryPageDto,
    CategoryTreeDto,
    PriceComparisonDto,
    PriceDropDto,
    PriceHistoryDto,
    ProductSearchDto,
)
from src.contexts.save.application.errors import (
    CanonicalProductNotFoundError,
    CategoryNotFoundError,
)
from src.contexts.save.application.history import GetPriceHistory, HistoryRange
from src.contexts.save.application.products import ListProducts
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


@router.get("/categories")
def list_categories(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: ListCategories = Depends(get_list_categories),
) -> CategoryTreeDto:
    return use_case.execute(market)


@router.get("/category/{slug}")
def category(
    slug: str,
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: GetCategory = Depends(get_category),
) -> CategoryPageDto:
    try:
        return use_case.execute(market, slug)
    except CategoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/products")
def list_products(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    use_case: ListProducts = Depends(get_list_products),
) -> list[ProductSearchDto]:
    return use_case.execute(market, limit=limit, offset=offset)


@router.get("/drops")
def price_drops(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    days: int = Query(7, ge=1, le=3650, description="Ventana de detección en días"),
    use_case: ListPriceDrops = Depends(get_list_price_drops),
) -> list[PriceDropDto]:
    return use_case.execute(market, days=days)


@router.get("/history")
def price_history(
    product_id: str = Query(..., description="ID del producto canónico"),
    range_: HistoryRange = Query("all", alias="range", description="Ventana del chart"),
    use_case: GetPriceHistory = Depends(get_price_history),
) -> PriceHistoryDto:
    try:
        return use_case.execute(product_id, range_=range_)
    except CanonicalProductNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
