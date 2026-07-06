"""Mappers model ↔ entity de Save (infra · ADR 31). Reconstruye value-objects (Money, Quantity)."""
from __future__ import annotations

from src.shared.money import Currency, Money

from ..domain.entities import (
    CanonicalProduct,
    Provider,
    ProviderType,
    SourcePlatform,
    StoreProduct,
    StoreRegistry,
)
from ..domain.value_objects import Quantity, UnitMeasure
from .models import (
    CanonicalProductModel,
    ProviderModel,
    StoreProductModel,
    StoreRegistryModel,
)


def provider_to_entity(m: ProviderModel) -> Provider:
    return Provider(
        str(m.id), m.name, ProviderType(m.type), SourcePlatform(m.platform), m.market_id,
        logo_url=m.logo_url,
    )


def store_registry_to_entity(m: StoreRegistryModel) -> StoreRegistry:
    return StoreRegistry(
        str(m.id),
        str(m.provider_id),
        SourcePlatform(m.platform),
        m.base_url,
        endpoints=m.endpoints,
        headers=m.headers,
        auth=m.auth,
        enabled=m.enabled,
        health_status=m.health_status,
        paused_at=m.paused_at,
    )


def canonical_to_entity(m: CanonicalProductModel, brand_name: str) -> CanonicalProduct:
    return CanonicalProduct(
        str(m.id),
        m.name,
        brand_name,
        Quantity(m.size_amount, UnitMeasure(m.size_measure)),
        taxonomy_node_id=str(m.taxonomy_node_id) if m.taxonomy_node_id else "",
        market_id=m.market_id,
        quality=m.quality,
        display_size=m.display_size,
        image_url=m.image_url,
        slug=m.slug,
    )


def store_product_to_entity(m: StoreProductModel) -> StoreProduct:
    return StoreProduct(
        str(m.id),
        str(m.provider_id),
        str(m.canonical_product_id) if m.canonical_product_id else "",
        Money(m.current_price_minor, Currency(m.currency)),
        url=m.url,
        ean=m.ean,
    )
