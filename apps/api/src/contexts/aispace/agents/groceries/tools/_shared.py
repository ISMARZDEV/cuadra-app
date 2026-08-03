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

from src.shared.money import Currency, Money

SessionFactory = Callable[[], AbstractContextManager[Session]]

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
