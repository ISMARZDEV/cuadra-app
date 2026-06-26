"""Unit — Money y Currency (kernel de dinero · §12·B, ADR 14).

Invariantes de los que el LEDGER depende:
- El dinero vive SIEMPRE en minor units (enteros). NUNCA float → el error de
  redondeo es el gap #1 de §12·B (un LLM reportó $28K cuando eran $3K, Cleo §12).
- No se mezclan monedas en una operación → `CurrencyMismatchError`.
- La aritmética es cerrada en minor units y preserva la moneda.
"""
from __future__ import annotations

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
