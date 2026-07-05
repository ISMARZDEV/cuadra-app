"""Save controller — HTTP boundary del contexto save (prefijo `/save`).

Catálogo público de precios (sin auth): buscar productos y comparar precios entre tiendas.
Thin (SRP): parsea el request, delega en el use case, devuelve el DTO. `market` identifica el
mercado (multi-país: DO→US→CO). Los errores de aplicación se mapean a HTTP.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from src.api.composition_root import (
    get_category,
    get_collection,
    get_compare_product,
    get_list_alert_notifications,
    get_list_alerts,
    get_list_brand_products,
    get_list_categories,
    get_list_category_products,
    get_list_collections,
    get_list_featured_products,
    get_list_price_drops,
    get_list_provider_products,
    get_list_products,
    get_list_providers,
    get_list_todays_deals,
    get_provider,
    get_price_history,
    get_register_push_token,
    get_run_alert_matching,
    get_search_products,
    get_subscribe_alert,
    get_unsubscribe_alert,
)
from src.api.extensions.security import get_current_user_id
from src.config import settings
from src.contexts.save.application.alerts import (
    ListAlertNotifications,
    ListAlerts,
    RegisterPushToken,
    RunAlertMatching,
    SubscribeAlert,
    UnsubscribeAlert,
)
from src.contexts.save.application.categories import GetCategory, ListCategories
from src.contexts.save.application.collections import GetCollection, ListCollections
from src.contexts.save.application.compare import CompareProduct
from src.contexts.save.application.drops import ListPriceDrops
from src.contexts.save.application.dtos import (
    AlertDto,
    AlertNotificationDto,
    CategoryListingDto,
    CategoryPageDto,
    CategoryTreeDto,
    CollectionDto,
    PriceComparisonDto,
    PriceDropDto,
    PriceHistoryDto,
    ProductCardDto,
    ProductSearchDto,
    ProviderPageDto,
    ProviderRefDto,
)
from src.contexts.save.application.errors import (
    CanonicalProductNotFoundError,
    CategoryNotFoundError,
)
from src.contexts.save.application.history import GetPriceHistory, HistoryRange
from src.contexts.save.application.listing import (
    ListBrandProducts,
    ListCategoryProducts,
    ListFeaturedProducts,
    ListProviderProducts,
    ListTodaysDeals,
)
from src.contexts.save.application.products import ListProducts
from src.contexts.save.application.providers import GetProvider, ListProviders
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
    slug: str = Query(..., description="Slug público del producto canónico"),
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: CompareProduct = Depends(get_compare_product),
) -> PriceComparisonDto:
    try:
        return use_case.execute(slug, market)
    except CanonicalProductNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/featured")
def featured_products(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    sort: str = Query("unit_price", description="unit_price|popular|price"),
    limit: int = Query(12, ge=1, le=50),
    use_case: ListFeaturedProducts = Depends(get_list_featured_products),
) -> list[ProductCardDto]:
    return use_case.execute(market, sort=sort, limit=limit)


@router.get("/collections")
def list_collections(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: ListCollections = Depends(get_list_collections),
) -> list[CollectionDto]:
    """Colecciones curadas del mercado como rails de la home (A6). Vacías se omiten."""
    return use_case.execute(market)


@router.get("/collection/{slug}")
def collection_page(
    slug: str,
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: GetCollection = Depends(get_collection),
) -> CollectionDto:
    """Página propia de una colección curada: todos sus productos hand-pick (A6)."""
    result = use_case.execute(slug, market)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Colección no encontrada."
        )
    return result


@router.get("/categories")
def list_categories(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: ListCategories = Depends(get_list_categories),
) -> CategoryTreeDto:
    return use_case.execute(market)


@router.get("/providers")
def list_providers(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    use_case: ListProviders = Depends(get_list_providers),
) -> list[ProviderRefDto]:
    return use_case.execute(market)


@router.get("/store/{provider_id}")
def store_page(
    provider_id: str,
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    get_provider_use_case: GetProvider = Depends(get_provider),
    list_products_use_case: ListProviderProducts = Depends(get_list_provider_products),
) -> ProviderPageDto:
    provider = get_provider_use_case.execute(provider_id)
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tienda no encontrada.")
    products = list_products_use_case.execute(market, provider_id)
    return ProviderPageDto(name=provider.name, products=products)


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


@router.get("/category/{slug}/products")
def category_products(
    slug: str,
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    stores: list[str] = Query(default=[], description="IDs de supermercado a incluir"),
    brands: list[str] = Query(default=[], description="Marcas a incluir"),
    price_min: int | None = Query(None, ge=0, description="Precio mínimo (minor units)"),
    price_max: int | None = Query(None, ge=0, description="Precio máximo (minor units)"),
    sort: str = Query("price", description="price|unit_price|name"),
    limit: int = Query(48, ge=1, le=200),
    offset: int = Query(0, ge=0),
    use_case: ListCategoryProducts = Depends(get_list_category_products),
) -> CategoryListingDto:
    try:
        return use_case.execute(
            market,
            slug,
            stores=tuple(stores),
            brands=tuple(brands),
            price_min=price_min,
            price_max=price_max,
            sort=sort,
            limit=limit,
            offset=offset,
        )
    except CategoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/product/{product_id}/brand")
def brand_products(
    product_id: str,
    limit: int = Query(12, ge=1, le=50),
    use_case: ListBrandProducts = Depends(get_list_brand_products),
) -> list[ProductCardDto]:
    return use_case.execute(product_id, limit=limit)


@router.get("/products")
def list_products(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    use_case: ListProducts = Depends(get_list_products),
) -> list[ProductSearchDto]:
    return use_case.execute(market, limit=limit, offset=offset)


@router.get("/deals")
def todays_deals(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    days: int = Query(7, ge=1, le=3650, description="Ventana de detección en días"),
    limit: int = Query(12, ge=1, le=50),
    use_case: ListTodaysDeals = Depends(get_list_todays_deals),
) -> list[ProductCardDto]:
    return use_case.execute(market, days=days, limit=limit)


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


# ── Alertas de precio (G4) — requieren usuario autenticado (JWT) ──


class SubscribeAlertRequest(BaseModel):
    product_id: str
    threshold_minor: int | None = None  # null = avísame ante cualquier bajada


class PushTokenRequest(BaseModel):
    token: str
    platform: str = "ios"  # ios|android


@router.post("/alerts/push-token", status_code=status.HTTP_204_NO_CONTENT)
def register_push_token(
    body: PushTokenRequest,
    user_id: str = Depends(get_current_user_id),
    use_case: RegisterPushToken = Depends(get_register_push_token),
) -> None:
    use_case.execute(user_id, body.token, body.platform)


@router.get("/alerts/notifications")
def alert_notifications(
    user_id: str = Depends(get_current_user_id),
    use_case: ListAlertNotifications = Depends(get_list_alert_notifications),
) -> list[AlertNotificationDto]:
    return use_case.execute(user_id)


@router.post("/alerts/run-matching")
def run_alert_matching(
    market: str = Query("DO", description="Mercado (ISO 3166-1 alpha-2)"),
    days: int = Query(7, ge=1, le=3650),
    use_case: RunAlertMatching = Depends(get_run_alert_matching),
) -> dict[str, int]:
    # En prod = schedule de Dagster; acá se expone solo en dev para demo/manual.
    if settings.app_env != "dev":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"created": use_case.execute(market, days=days)}


@router.get("/alerts")
def list_alerts(
    user_id: str = Depends(get_current_user_id),
    use_case: ListAlerts = Depends(get_list_alerts),
) -> list[AlertDto]:
    return use_case.execute(user_id)


@router.post("/alerts", status_code=status.HTTP_201_CREATED)
def subscribe_alert(
    body: SubscribeAlertRequest,
    user_id: str = Depends(get_current_user_id),
    use_case: SubscribeAlert = Depends(get_subscribe_alert),
) -> AlertDto:
    try:
        return use_case.execute(user_id, body.product_id, body.threshold_minor)
    except CanonicalProductNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/alerts/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe_alert(
    alert_id: str,
    user_id: str = Depends(get_current_user_id),
    use_case: UnsubscribeAlert = Depends(get_unsubscribe_alert),
) -> None:
    if not use_case.execute(user_id, alert_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")
