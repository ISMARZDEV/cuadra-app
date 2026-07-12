"""Unit — category gate/boost de la cascada de matching (Etapa C). PURO, sin DB.

Espeja `size_gate`: la categoría es una señal DURA de "SKU distinto" a nivel PADRE (gate) y un
refuerzo blando a nivel HOJA (boost). Conservador (Sacred #4): ante cualquier categoría desconocida
NO bloquea (deja el comportamiento actual intacto) — nunca rompe un match bueno por falta de datos.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.category_gate import (
    CATEGORY_BOOST,
    categories_conflict,
    category_boost,
)


# --- gate a nivel PADRE ------------------------------------------------------------------------
def test_conflict_when_parents_differ() -> None:
    assert categories_conflict("padre-despensa", "padre-limpieza") is True


def test_no_conflict_when_parents_match() -> None:
    assert categories_conflict("padre-despensa", "padre-despensa") is False


def test_no_conflict_when_store_parent_unknown() -> None:
    assert categories_conflict(None, "padre-despensa") is False


def test_no_conflict_when_canonical_parent_unknown() -> None:
    assert categories_conflict("padre-despensa", None) is False


# --- boost a nivel HOJA ------------------------------------------------------------------------
def test_boost_when_same_leaf() -> None:
    assert category_boost("hoja-arroz", "hoja-arroz") == CATEGORY_BOOST


def test_no_boost_when_different_leaf() -> None:
    assert category_boost("hoja-arroz", "hoja-cafe") == 0.0


def test_no_boost_when_leaf_unknown() -> None:
    assert category_boost(None, "hoja-arroz") == 0.0
    assert category_boost("hoja-arroz", None) == 0.0
