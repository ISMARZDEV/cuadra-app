"""Unit — `provider_products_action` agrupa productos por tienda para el carrusel del chat.

Reglas:
- Ningún entero crudo sale hacia el cliente.
- Cada producto se repite bajo cada proveedor que lo tiene.
- Sin resultados → lista vacía.
"""
from __future__ import annotations

from src.contexts.aispace.agents.groceries.tools._shared import provider_products_action
from src.contexts.save.application.dtos import ComparedPriceDto, PriceComparisonDto


def test_provider_products_action_groups_items_by_store() -> None:
    comparisons = [
        PriceComparisonDto(
            canonical_product_id="c1",
            slug="arroz-campos",
            name="Arroz Campos 20 Lb",
            brand="Campos",
            quality=None,
            display_size="20 Lb",
            image_url="https://img.example/arroz.jpg",
            currency="DOP",
            cheapest_provider="Sirena",
            spread_minor=2_000,
            entries=[
                ComparedPriceDto(
                    provider_id="p1",
                    provider_name="Sirena",
                    price_minor=45_000,
                    currency="DOP",
                    unit_price_minor=2_250,
                    unit_measure="mass",
                    is_cheapest=True,
                    extra_minor=0,
                    url="https://sirena.example/arroz",
                ),
                ComparedPriceDto(
                    provider_id="p2",
                    provider_name="Nacional",
                    price_minor=47_000,
                    currency="DOP",
                    unit_price_minor=2_350,
                    unit_measure="mass",
                    is_cheapest=False,
                    extra_minor=2_000,
                    url="https://nacional.example/arroz",
                ),
            ],
        ),
        PriceComparisonDto(
            canonical_product_id="c2",
            slug="arroz-rice",
            name="Arroz Rico 10 Lb",
            brand="Rico",
            quality=None,
            display_size="10 Lb",
            image_url=None,
            currency="DOP",
            cheapest_provider="Sirena",
            spread_minor=0,
            entries=[
                ComparedPriceDto(
                    provider_id="p1",
                    provider_name="Sirena",
                    price_minor=25_000,
                    currency="DOP",
                    unit_price_minor=2_500,
                    unit_measure="mass",
                    is_cheapest=True,
                    extra_minor=0,
                    url=None,
                ),
            ],
        ),
    ]

    actions = provider_products_action(comparisons)

    assert len(actions) == 1
    action = actions[0]
    assert action["type"] == "provider_products"
    assert action["currency"] == "DOP"
    providers = {p["provider_id"]: p for p in action["providers"]}
    assert set(providers) == {"p1", "p2"}

    sirena = providers["p1"]
    assert sirena["provider_name"] == "Sirena"
    assert len(sirena["items"]) == 2
    assert sirena["items"][0]["index"] == 1
    assert sirena["items"][0]["name"] == "Arroz Campos 20 Lb"
    assert sirena["items"][0]["url"] == "https://sirena.example/arroz"
    # unit_price_minor=2_250 → "DOP 22.50"
    assert "22.50" in sirena["items"][0]["unit_price"]
    assert not isinstance(sirena["items"][0]["unit_price"], int)
    assert sirena["items"][1]["index"] == 2
    assert sirena["items"][1]["name"] == "Arroz Rico 10 Lb"

    nacional = providers["p2"]
    assert nacional["provider_name"] == "Nacional"
    assert len(nacional["items"]) == 1
    assert nacional["items"][0]["name"] == "Arroz Campos 20 Lb"


def test_provider_products_action_uses_price_when_unit_price_is_missing() -> None:
    comparisons = [
        PriceComparisonDto(
            canonical_product_id="c3",
            slug="pan",
            name="Pan de Agua",
            brand="",
            quality=None,
            display_size=None,
            image_url=None,
            currency="DOP",
            cheapest_provider="Sirena",
            spread_minor=0,
            entries=[
                ComparedPriceDto(
                    provider_id="p1",
                    provider_name="Sirena",
                    price_minor=18_500,
                    currency="DOP",
                    unit_price_minor=None,
                    unit_measure=None,
                    is_cheapest=True,
                    extra_minor=0,
                    url=None,
                ),
            ],
        ),
    ]

    [action] = provider_products_action(comparisons)
    item = action["providers"][0]["items"][0]
    assert "185.00" in item["unit_price"]


def test_provider_products_action_returns_empty_for_none_or_empty() -> None:
    assert provider_products_action(None) == []
    assert provider_products_action([]) == []
