"""Piezas comunes de las tools del GroceriesAgent.

Dos reglas que se aplican en TODAS y por eso viven acá:

1. **Ningún entero crudo llega al modelo.** El dinero sale ya formateado por `Money.format()`
   (§5.5). Un entero es una invitación a que el LLM «ayude a redondear»; un string no.
2. **La salida es inglés NEUTRO y compacto.** Etiquetas genéricas (`price=`, `store=`) que no
   anclan el idioma: el agente redacta la respuesta en el idioma del usuario (es/en/pt). Si la
   tool devolviera español, le contestaría en español a un usuario brasileño.
"""
from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime

from sqlalchemy.orm import Session

from src.contexts.save.application.dtos import BudgetBasketDto, PriceComparisonDto
from src.contexts.save.domain.entities import CanonicalProduct
from src.shared.money import Currency, Money

SessionFactory = Callable[[], AbstractContextManager[Session]]

# Number of search results to show in the provider-products carousel.

NO_MATCH = "no_match: that product is not in the catalog"
NO_DATA = "no_data: there is no priced catalog for this market yet"


def money(minor: int, currency: str = "DOP") -> str:
    """Minor units → string ya formateado. El modelo NUNCA ve el entero."""
    return Money(minor, Currency(currency)).format()


def captured(when: datetime | None) -> str:
    return when.date().isoformat() if when else "unknown"


def price_metadata(session: Session, canonical_product_id: str) -> dict[str, tuple[str, str]]:
    """`provider_id → (captured_at, price_type)` del precio VIGENTE de cada tienda.

    ⚠️ Existe porque `ComparedPriceDto` —y `StoreQuote` debajo— **no llevan `captured_at` ni
    `price_type`**, y §8.2 los exige en CADA precio que el agente cite: sin ellos el usuario no
    puede detectar que el dato está viejo o que es de otra modalidad.

    Se resuelve con una query aparte en vez de engordar el DTO público porque eso cambiaría el
    OpenAPI y el `@cuadra/api-client`, que esta fase declaró fuera de alcance. Es deuda anotada:
    el lugar correcto para estos dos campos es la comparación misma.
    """
    from sqlalchemy import text as _text

    rows = session.execute(
        _text(
            """
            SELECT DISTINCT ON (sp.provider_id)
                   sp.provider_id, p.captured_at, p.price_type
              FROM save.store_product sp
              JOIN save.price p ON p.store_product_id = sp.id
             WHERE sp.canonical_product_id = CAST(:cid AS uuid)
             ORDER BY sp.provider_id, p.captured_at DESC
            """
        ),
        {"cid": canonical_product_id},
    ).all()
    return {str(r.provider_id): (captured(r.captured_at), r.price_type) for r in rows}

def product_action(staged: dict | None) -> list[dict]:
    """Comparación stageada por la tool → la tarjeta que se pinta DENTRO de la burbuja del chat.

    Reemplaza al enlace externo: mandar al navegador abandona la conversación, y la comparación es
    justo lo que el usuario vino a ver. Acá viajan sólo DATOS — `is_cheapest` es un booleano, no la
    cadena «Más barato», porque el cliente ya tiene i18n y traducir del lado del servidor haría que
    un chat en inglés mostrara una etiqueta en español.

    Los precios llegan ya formateados por `Money.format()` (§5.5): ningún entero crudo de dinero
    sale de acá, ni hacia el modelo ni hacia la UI.
    """
    if not staged:
        return []
    stores = staged.get("stores", [])
    # §8.1 fila 2 — con UNA sola tienda no hay con qué comparar, así que nada es «lo más barato».
    comparable = len(stores) > 1
    return [
        {
            "type": "product",
            "name": staged.get("name"),
            "brand": staged.get("brand"),
            "image_url": staged.get("image_url"),
            "captured_at": staged.get("captured_at"),
            "stores": [
                {
                    "provider": s["provider"],
                    "price": s["price"],
                    "is_cheapest": bool(s.get("is_cheapest")) and comparable,
                    "url": s.get("url"),
                }
                for s in stores
            ],
        }
    ]


def basket_action(result: BudgetBasketDto | None) -> list[dict]:
    """Canasta por presupuesto → card con tabs por provider + carrusel de productos.

    El dinero viaja formateado por `Money.format()`; el cliente no recibe enteros.
    """
    if not result or not result.providers:
        return []
    currency = "DOP"
    return [
        {
            "type": "basket",
            "budget": money(result.budget_minor, currency),
            "currency": currency,
            "providers": [
                {
                    "provider_id": provider.provider_id,
                    "provider_name": provider.provider_name,
                    "total": money(provider.total_minor, currency),
                    "remaining": money(provider.remaining_minor, currency),
                    "items_count": provider.items_count,
                    "groups_covered": list(provider.groups_covered),
                    "groups_unavailable": list(provider.groups_unavailable),
                    "groups_unaffordable": list(provider.groups_unaffordable),
                    "is_cheapest": provider.is_cheapest,
                    "items": [
                        {
                            "index": index + 1,
                            "canonical_product_id": line.canonical_product_id,
                            "name": line.name,
                            "brand": line.brand,
                            "size": line.display_size,
                            "image_url": line.image_url,
                            "url": line.url,
                            "unit_price": money(line.unit_price_minor, currency),
                            "subtotal": money(line.subtotal_minor, currency),
                            "units": line.units,
                        }
                        for index, line in enumerate(provider.lines)
                    ],
                }
                for provider in result.providers
            ],
        }
    ]


def provider_products_action(comparisons: list[PriceComparisonDto] | None) -> list[dict]:
    """Búsqueda de productos → carrusel por proveedor, sin totales de canasta.

    Cada producto se repite bajo cada proveedor que lo tiene, con el precio de ESA tienda.
    El dinero viaja formateado por `Money.format()`; el cliente no recibe enteros.
    """
    if not comparisons:
        return []

    by_provider: dict[str, dict] = {}
    for comparison in comparisons:
        for entry in comparison.entries:
            provider = by_provider.setdefault(
                entry.provider_id,
                {
                    "provider_id": entry.provider_id,
                    "provider_name": entry.provider_name,
                    "items": [],
                },
            )
            unit_price_str = (
                money(entry.unit_price_minor, comparison.currency)
                if entry.unit_price_minor is not None
                else money(entry.price_minor, comparison.currency)
            )
            provider["items"].append(
                {
                    "index": len(provider["items"]) + 1,
                    "canonical_product_id": comparison.canonical_product_id,
                    "name": comparison.name,
                    "brand": comparison.brand,
                    "size": comparison.display_size,
                    "image_url": comparison.image_url,
                    "url": entry.url,
                    "unit_price": unit_price_str,
                }
            )

    if not by_provider:
        return []

    return [
        {
            "type": "provider_products",
            "currency": comparisons[0].currency,
            "providers": list(by_provider.values()),
        }
    ]


def product_option(
    canonical: CanonicalProduct,
    comparison: PriceComparisonDto,
    *,
    index: int,
    currency: str,
) -> dict:
    """One disambiguation option rendered as a product carousel card.

    Uses the cheapest store's price as the card's headline price and its URL as the primary link.
    Money is already formatted by `Money.format()` via `PriceComparisonDto`.
    """
    entry = comparison.entries[0] if comparison.entries else None
    unit_price_str = (
        money(entry.unit_price_minor, currency)
        if entry and entry.unit_price_minor is not None
        else money(entry.price_minor, currency)
        if entry
        else money(0, currency)
    )
    return {
        "value": canonical.id,
        "label": canonical.name,
        "kind": "product",
        "product": {
            "index": index,
            "canonical_product_id": canonical.id,
            "name": canonical.name,
            "brand": canonical.brand or None,
            "size": canonical.display_size,
            "image_url": canonical.image_url,
            "url": entry.url if entry else None,
            "unit_price": unit_price_str,
        },
    }
