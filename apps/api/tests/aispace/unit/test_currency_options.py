"""Unit — resolve_currency_options: combina el mercado del usuario (identity, ya existente
como `home_market`) con sus hasta-3 monedas extra (aispace prefs) en las opciones finales que
ofrecerá el paso de selección de moneda del flow de gastos (máx 4 + la principal siempre primero).

Pura (sin DB/HTTP) — la resolución real de `home_market` + extras vive en la capa de aplicación
que llama a esto con los valores ya leídos de sus repos.
"""
from __future__ import annotations

from src.contexts.aispace.preferences.currency_options import resolve_currency_options


def test_primary_only_when_no_extras() -> None:
    opts = resolve_currency_options(home_market="DO", extra_currencies=[])
    assert opts.primary == "DOP"
    assert opts.extra == []
    assert opts.all == ["DOP"]


def test_primary_plus_extras_in_order() -> None:
    opts = resolve_currency_options(home_market="US", extra_currencies=["COP", "BRL"])
    assert opts.primary == "USD"
    assert opts.extra == ["COP", "BRL"]
    assert opts.all == ["USD", "COP", "BRL"]


def test_extra_matching_primary_is_deduped() -> None:
    # Si el usuario configuró su propia moneda principal como "extra" (redundante), no se repite.
    opts = resolve_currency_options(home_market="DO", extra_currencies=["USD", "DOP"])
    assert opts.all == ["DOP", "USD"]


def test_all_is_capped_at_four() -> None:
    # Defensivo: `set_extra_currencies` ya limita a 3, así que primary+3 = 4 siempre — este test
    # documenta el invariante en vez de asumirlo silenciosamente.
    opts = resolve_currency_options(home_market="DO", extra_currencies=["USD", "COP", "BRL"])
    assert len(opts.all) == 4
