"""Unit — catálogo i18n de los strings DETERMINISTAS (no generados por el LLM).

Las fuentes coinciden: el texto fijo de UI va en un catálogo por locale, NO en el prompt
(un prompt no puede localizar un string hardcodeado). Esto cubre confirmaciones, cancelado, etc.
"""
from __future__ import annotations

from src.shared.i18n import t


def test_translates_by_language() -> None:
    assert t("cancelled", "es") == "Cancelado, no registré nada."
    assert t("cancelled", "en") == "Cancelled, I didn't register anything."
    assert t("cancelled", "pt") == "Cancelado, não registrei nada."


def test_interpolates_params() -> None:
    out = t("registered", "en", display="USD 50.00", category="Gas", wallet="USD Acct")
    assert out == "Done — I registered USD 50.00 in Gas from USD Acct."


def test_unknown_language_falls_back_to_default() -> None:
    assert t("cancelled", "xx") == t("cancelled", "es")   # default es
    assert t("cancelled", None) == t("cancelled", "es")


def test_tool_error_keys_localized() -> None:
    assert t("no_currency_wallet", "en", currency="BRL") == \
        "You don't have a BRL wallet. Create one first or use another currency."
    assert t("no_wallet", "pt").startswith("Você ainda não tem")
