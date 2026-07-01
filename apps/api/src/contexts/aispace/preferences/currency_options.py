"""Combina el mercado del usuario (identity `home_market`, ya existente) con sus hasta-3
monedas extra (aispace prefs) en las opciones de moneda que ofrecerá el HITL del flow de gastos.

Pura — no lee identity ni aispace prefs por sí misma; la capa de aplicación (controller / un
futuro use case) resuelve ambos valores por puerto y se los pasa. Así se mantiene unit-testable
sin DB y sin acoplar `aispace` a CÓMO identity/prefs persisten.
"""
from __future__ import annotations

from dataclasses import dataclass

from src.shared.money import primary_currency_for_market


@dataclass(frozen=True, slots=True)
class CurrencyOptions:
    primary: str            # derivada de home_market — no configurable directamente aquí
    extra: list[str]        # hasta 3, ya normalizadas/deduplicadas (SqlPreferenceRepository)
    all: list[str]          # primary + extra, sin duplicados, principal siempre primero (≤4)


def resolve_currency_options(*, home_market: str, extra_currencies: list[str]) -> CurrencyOptions:
    primary = primary_currency_for_market(home_market)
    extra = list(extra_currencies)
    all_currencies = [primary, *[c for c in extra if c != primary]]
    return CurrencyOptions(primary=primary, extra=extra, all=all_currencies)
