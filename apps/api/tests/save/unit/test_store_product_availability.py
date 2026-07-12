"""Unit — disponibilidad de `store_product` (F3.0, gap que revela el teardown de SRD §1.1/§3.1).

Loop B (cobertura) necesita expresar "buscado en la tienda X → dejó de venderse" SIN borrar el
registro (semántica `hidden` de SRD `apply-scrape-result.ts:39-94`). Se modela como `available`
(framing positivo) en la entidad — default True (un producto recién observado está disponible).
"""
from __future__ import annotations

from src.contexts.save.domain.entities.product import StoreProduct
from src.shared.money import Currency, Money


def _sp(**over: object) -> StoreProduct:
    base: dict[str, object] = dict(
        id="sp1",
        provider_id="p1",
        canonical_product_id="c1",
        current_price=Money(42400, Currency("DOP")),
    )
    base.update(over)
    return StoreProduct(**base)  # type: ignore[arg-type]


def test_store_product_is_available_by_default() -> None:
    assert _sp().available is True


def test_store_product_can_be_marked_unavailable() -> None:
    assert _sp(available=False).available is False
