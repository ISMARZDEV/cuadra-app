"""Unit — `basket_action` formatea la canasta como ui_action para el chat.

La regla de oro: ningún entero crudo sale hacia el cliente. Todo el dinero ya va formateado
por `Money.format()`.
"""
from __future__ import annotations

from src.contexts.aispace.agents.groceries.tools._shared import basket_action
from src.contexts.save.application.dtos import BasketLineDto, BudgetBasketDto, ProviderBasketDto


def test_basket_action_formats_money_and_indexes_items() -> None:
    result = BudgetBasketDto(
        budget_minor=500_000,
        providers=(
            ProviderBasketDto(
                provider_id="p1",
                provider_name="Sirena",
                lines=(
                    BasketLineDto(
                        group="Arroz",
                        canonical_product_id="c1",
                        name="Arroz Campos 20 Lb",
                        unit_price_minor=45_000,
                        units=1,
                        subtotal_minor=45_000,
                        brand="Campos",
                        display_size="20 Lb",
                        image_url="https://img.example/arroz.jpg",
                        url="https://sirena.example/arroz",
                    ),
                ),
                total_minor=45_000,
                remaining_minor=455_000,
                groups_covered=("Arroz",),
                groups_unavailable=(),
                groups_unaffordable=(),
                is_cheapest=True,
            ),
        ),
    )

    actions = basket_action(result)

    assert len(actions) == 1
    action = actions[0]
    assert action["type"] == "basket"
    assert action["budget"] == "DOP 5,000.00"
    assert action["currency"] == "DOP"
    assert len(action["providers"]) == 1
    provider = action["providers"][0]
    assert provider["provider_name"] == "Sirena"
    assert provider["total"] == "DOP 450.00"
    assert provider["remaining"] == "DOP 4,550.00"
    assert provider["is_cheapest"] is True
    item = provider["items"][0]
    assert item["index"] == 1
    assert item["name"] == "Arroz Campos 20 Lb"
    assert item["brand"] == "Campos"
    assert item["size"] == "20 Lb"
    assert item["unit_price"] == "DOP 450.00"
    assert item["subtotal"] == "DOP 450.00"
    assert item["image_url"] == "https://img.example/arroz.jpg"
    assert item["url"] == "https://sirena.example/arroz"


def test_basket_action_returns_empty_when_no_providers() -> None:
    result = BudgetBasketDto(budget_minor=100_000, providers=())
    assert basket_action(result) == []


def test_basket_action_returns_empty_for_none() -> None:
    assert basket_action(None) == []
