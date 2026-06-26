"""Unit — Money y Currency (kernel de dinero · §12·B, ADR 14).

Invariantes de los que el LEDGER depende:
- El dinero vive SIEMPRE en minor units (enteros). NUNCA float → el error de
  redondeo es el gap #1 de §12·B (un LLM reportó $28K cuando eran $3K, Cleo §12).
- No se mezclan monedas en una operación → `CurrencyMismatchError`.
- La aritmética es cerrada en minor units y preserva la moneda.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.shared.money import Currency, CurrencyMismatchError, Money


def test_currency_normalizes_uppercase() -> None:
    assert Currency("dop").code == "DOP"


@pytest.mark.parametrize("bad", ["DO", "DOPX", "D0P", "12", ""])
def test_currency_invalid_raises(bad: str) -> None:
    with pytest.raises(ValueError):
        Currency(bad)


def test_money_stores_integer_minor_units() -> None:
    m = Money(500, Currency("DOP"))  # RD$5.00
    assert m.amount_minor == 500
    assert isinstance(m.amount_minor, int)


def test_money_rejects_float_amount() -> None:
    with pytest.raises(TypeError):
        Money(5.0, Currency("DOP"))  # type: ignore[arg-type]


def test_money_rejects_bool_amount() -> None:
    # bool es subtipo de int en Python — no debe colarse como monto.
    with pytest.raises(TypeError):
        Money(True, Currency("DOP"))  # type: ignore[arg-type]


def test_money_add_same_currency() -> None:
    assert Money(500, Currency("DOP")) + Money(250, Currency("DOP")) == Money(
        750, Currency("DOP")
    )


def test_money_subtract_same_currency() -> None:
    assert Money(500, Currency("DOP")) - Money(200, Currency("DOP")) == Money(
        300, Currency("DOP")
    )


def test_money_mixing_currencies_on_add_raises() -> None:
    with pytest.raises(CurrencyMismatchError):
        Money(500, Currency("DOP")) + Money(500, Currency("USD"))


def test_money_mixing_currencies_on_subtract_raises() -> None:
    with pytest.raises(CurrencyMismatchError):
        Money(500, Currency("DOP")) - Money(500, Currency("USD"))


def test_money_negate() -> None:
    assert -Money(500, Currency("DOP")) == Money(-500, Currency("DOP"))


def test_money_zero_factory() -> None:
    z = Money.zero(Currency("USD"))
    assert z.amount_minor == 0
    assert z.currency.code == "USD"


def test_money_is_immutable() -> None:
    m = Money(500, Currency("DOP"))
    with pytest.raises((AttributeError, Exception)):
        m.amount_minor = 999  # type: ignore[misc]


# ── Exponente por moneda (mata el ×100 hardcodeado · §12·B estilo Stripe) ──────
def test_currency_exponent_by_iso() -> None:
    assert Currency("USD").exponent == 2
    assert Currency("DOP").exponent == 2
    assert Currency("COP").exponent == 2     # peso colombiano: ISO = 2
    assert Currency("JPY").exponent == 0     # yen: sin minor unit
    assert Currency("CLP").exponent == 0     # peso chileno: 0 decimales
    assert Currency("KWD").exponent == 3     # dinar kuwaití: 3 decimales
    assert Currency("XYZ").exponent == 2     # desconocida → default 2


def test_money_from_major_respects_exponent() -> None:
    assert Money.from_major(45.50, Currency("USD")).amount_minor == 4550
    assert Money.from_major(45.55, Currency("DOP")).amount_minor == 4555
    assert Money.from_major(500, Currency("JPY")).amount_minor == 500     # 0 dec → ×1, NO ×100
    assert Money.from_major(1.234, Currency("KWD")).amount_minor == 1234  # 3 dec → ×1000


def test_money_from_major_no_float_drift() -> None:
    # 19.99 * 100 en float = 1998.9999…; debe redondear a 1999, no truncar a 1998.
    assert Money.from_major(19.99, Currency("USD")).amount_minor == 1999


def test_money_to_major_roundtrips() -> None:
    assert Money(4550, Currency("USD")).to_major() == Decimal("45.50")
    assert Money(500, Currency("JPY")).to_major() == Decimal("500")
    assert Money(1234, Currency("KWD")).to_major() == Decimal("1.234")


def test_money_format_uses_currency_decimals() -> None:
    assert Money(4550, Currency("USD")).format() == "USD 45.50"
    assert Money(500, Currency("JPY")).format() == "JPY 500"       # 0 decimales
    assert Money(1234, Currency("KWD")).format() == "KWD 1.234"    # 3 decimales
