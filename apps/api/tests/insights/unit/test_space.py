"""Unit — Space (§5.2 + refinamiento UI): agrupa cuentas (wallets Y categorías).

Card ② del carrusel (insights-ui-navbar.md §3/§5): un Space puede contener wallets y
categorías (ambas son `Account`). Inmutable: agregar/quitar devuelve un nuevo Space.
"""
from __future__ import annotations

from src.contexts.insights.domain.entities import Space


def test_space_starts_empty() -> None:
    s = Space("s1", "u1", "Hogar")
    assert s.account_ids == frozenset()
    assert s.contains("acc-1") is False


def test_with_and_without_account_is_immutable() -> None:
    s = Space("s1", "u1", "Hogar").with_account("acc-1").with_account("acc-2")
    assert s.contains("acc-1") and s.contains("acc-2")

    s2 = s.without_account("acc-1")
    assert not s2.contains("acc-1")
    assert s2.contains("acc-2")
    # el original no cambió (inmutabilidad)
    assert s.contains("acc-1")


def test_with_account_is_idempotent() -> None:
    s = Space("s1", "u1", "Hogar").with_account("acc-1").with_account("acc-1")
    assert len(s.account_ids) == 1
