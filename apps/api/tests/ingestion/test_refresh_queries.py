"""Unit — selección de queries de la canasta que consume la ingesta (F1, Gap #1): PURO, sin DB.

`_select_queries` decide QUÉ queries se ingieren: las de la TABLA `basket_query` (active, ya
resueltas por el repo). La tabla es la ÚNICA fuente — ya NO hay fallback hardcodeado (el backfill
vive en migración y la tabla se protege de los resets). La perilla `SAVE_REFRESH_QUERY_LIMIT`
recorta a las primeras N (runs cortos en dev).

`_select_queries` vive en `assets.py`, que importa dagster a nivel de módulo → requiere el
dependency-group `ingestion`; en CI (que no lo sincroniza) el test se SALTA con importorskip,
igual que `test_definitions.py`.
"""
from __future__ import annotations

import pytest

pytest.importorskip("dagster")

from ingestion.save.assets import _select_queries  # noqa: E402


def test_uses_table_queries() -> None:
    result = _select_queries(["arroz la garza", "leche rica"], limit_env=None)
    assert result == ("arroz la garza", "leche rica")


def test_empty_table_returns_empty_no_hardcoded_fallback() -> None:
    # Ya no hay fallback: canasta vacía → nada que ingerir (el asset avisa con un warning).
    result = _select_queries([], limit_env=None)
    assert result == ()


def test_limit_slices_table_queries() -> None:
    result = _select_queries(["a", "b", "c", "d"], limit_env="2")
    assert result == ("a", "b")


def test_limit_on_empty_stays_empty() -> None:
    result = _select_queries([], limit_env="3")
    assert result == ()


def test_invalid_limit_is_ignored() -> None:
    result = _select_queries(["a", "b"], limit_env="cero")
    assert result == ("a", "b")
