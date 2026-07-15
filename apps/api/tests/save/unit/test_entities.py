"""Unit — entidades de Save (§6.3), PURAS (ADR 31). Diseñadas MULTI-PAÍS desde el inicio.

`market_id` (ISO 3166-1 alpha-2: "DO"→"US"→"CO"…) va por ID en cada entidad (ADR 33). El
`canonical_product` es POR-MERCADO (no global): comparar arroz RD vs US mezclaría monedas y
realidades distintas. Un país nuevo = un nuevo valor de market_id, sin tocar código. La moneda
la lleva `Money` (DOP/USD/COP). Money-math en enteros (§12·B).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest

from src.contexts.save.domain.comparison import StoreQuote
from src.contexts.save.domain.entities import (
    CanonicalProduct,
    Price,
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
    StoreProduct,
)
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")
USD = Currency("USD")
TWO_KG = Quantity(Decimal("2"), UnitMeasure.MASS)
WHEN = datetime(2026, 7, 3, 10, 0)


def test_provider_carries_market_and_validates() -> None:
    p = Provider("p1", "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, market_id="DO")
    assert p.market_id == "DO"
    with pytest.raises(ValueError):
        Provider("p1", "", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO")  # nombre vacío
    with pytest.raises(ValueError):
        Provider("p1", "Sirena", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "")  # market vacío


def test_provider_types_and_platforms_cover_verticals_and_sources() -> None:
    # verticales futuros del marketplace (supermercado hoy; banco/seguro después)
    assert ProviderType.SUPERMARKET != ProviderType.BANK != ProviderType.INSURER
    # fuentes por plataforma (la escalabilidad: un adapter por plataforma, N países)
    assert {SourcePlatform.VTEX, SourcePlatform.MAGENTO, SourcePlatform.SHOPIFY,
            SourcePlatform.AGGREGATOR, SourcePlatform.SPA}


def test_canonical_product_is_per_market_and_compares_with_its_quantity() -> None:
    arroz = CanonicalProduct(
        "c1", "Arroz La Garza", "La Garza", TWO_KG, taxonomy_node_id="t-arroz", market_id="DO"
    )
    assert arroz.market_id == "DO"
    result = arroz.compare(
        [StoreQuote("p-merca", "Merca", Money(42400, DOP)),
         StoreQuote("p-bravo", "Bravo", Money(43800, DOP))]
    )
    assert result.cheapest.provider_id == "p-merca"
    assert result.quantity == arroz.quantity  # usa SU propio tamaño


def test_canonical_product_validates() -> None:
    with pytest.raises(ValueError):
        CanonicalProduct("c1", "", "La Garza", TWO_KG, "t", "DO")   # nombre vacío
    with pytest.raises(ValueError):
        CanonicalProduct("c1", "Arroz", "La Garza", TWO_KG, "t", "")  # market vacío


def test_store_product_requires_positive_price() -> None:
    sp = StoreProduct("s1", "p1", "c1", Money(42400, DOP), url="https://x", ean="123")
    assert sp.current_price == Money(42400, DOP)
    with pytest.raises(ValueError):
        StoreProduct("s1", "p1", "c1", Money(0, DOP))


def test_price_is_typed_positive_and_append_only_record() -> None:
    pr = Price("s1", Money(42400, DOP), captured_at=WHEN, price_type=PriceType.ONLINE, source="vtex")
    assert pr.price_type == PriceType.ONLINE and pr.captured_at == WHEN
    with pytest.raises(ValueError):
        Price("s1", Money(0, DOP), WHEN, PriceType.ONLINE, "vtex")


def test_price_types_cover_online_delivery_shelf_receipt() -> None:
    assert {PriceType.ONLINE, PriceType.DELIVERY, PriceType.SHELF, PriceType.RECEIPT}


def test_multicountry_products_use_their_own_currency_and_never_mix() -> None:
    us = CanonicalProduct("c2", "White Rice", "Generic",
                          Quantity(Decimal("1"), UnitMeasure.MASS), "t-rice", market_id="US")
    do = CanonicalProduct("c1", "Arroz", "La Garza",
                          Quantity(Decimal("1"), UnitMeasure.MASS), "t-arroz", market_id="DO")
    assert us.market_id == "US" and do.market_id == "DO"
    # mezclar monedas de distintos mercados en una comparación falla (no se mezclan mercados)
    with pytest.raises(ValueError):
        do.compare([StoreQuote("a", "A", Money(1000, DOP)),
                    StoreQuote("b", "B", Money(1000, USD))])
