"""Unit — la tarjeta de producto que viaja al chat (§4.3, revisado 2026-08-02).

El enlace externo se descartó por decisión del usuario: mandar a Safari **abandona la
conversación**. La comparación se muestra DENTRO de la burbuja.

Dos reglas de contrato que estos tests fijan:

1. **El backend manda DATOS; el chrome lo pone el cliente.** `is_cheapest` viaja como booleano, no
   como la cadena «Más barato»: el mobile ya tiene i18n y sabe pintarlo en es/en/pt. La acción
   `link` sí lleva texto localizado, pero eso es un caso distinto — ahí el texto ES el contenido.
2. **Ningún entero crudo de dinero.** Los precios viajan ya formateados por `Money.format()`, igual
   que hacia el modelo (§5.5): un entero es una invitación a que alguien lo redondee por su cuenta.
"""
from __future__ import annotations

from src.contexts.aispace.agents.groceries.agent import product_action


def _staged() -> dict:
    return {
        "name": "Café Molido Santo Domingo 1 Lb",
        "brand": "Santo Domingo",
        "image_url": "https://cdn.example/cafe.jpg",
        "captured_at": "2026-08-02",
        "stores": [
            {"provider": "Sirena", "price": "RD$472.67", "is_cheapest": True, "url": "https://s/1"},
            {"provider": "Nacional", "price": "RD$478.00", "is_cheapest": False, "url": None},
        ],
    }


class TestLaAccionDeProducto:
    def test_nothing_staged_means_no_action(self) -> None:
        assert product_action(None) == []
        assert product_action({}) == []

    def test_it_carries_the_product_identity_and_the_photo(self) -> None:
        [action] = product_action(_staged())

        assert action["type"] == "product"
        assert action["name"] == "Café Molido Santo Domingo 1 Lb"
        assert action["image_url"] == "https://cdn.example/cafe.jpg"
        assert action["captured_at"] == "2026-08-02"

    def test_every_store_travels_with_its_price_already_formatted(self) -> None:
        [action] = product_action(_staged())

        assert [s["provider"] for s in action["stores"]] == ["Sirena", "Nacional"]
        assert [s["price"] for s in action["stores"]] == ["RD$472.67", "RD$478.00"]

    def test_cheapest_is_a_BOOLEAN_not_a_translated_string(self) -> None:
        # Si el backend mandara «Más barato», el chat en inglés diría «Más barato». El dato es el
        # hecho; la palabra es del cliente, que ya tiene i18n.
        [action] = product_action(_staged())

        assert action["stores"][0]["is_cheapest"] is True
        assert action["stores"][1]["is_cheapest"] is False

    def test_a_single_store_is_NOT_marked_as_cheapest(self) -> None:
        """§8.1 fila 2 — sin con qué comparar, «el más barato» es una afirmación falsa."""
        staged = _staged()
        staged["stores"] = [staged["stores"][0]]

        [action] = product_action(staged)

        assert action["stores"][0]["is_cheapest"] is False
