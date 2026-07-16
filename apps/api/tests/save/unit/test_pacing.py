"""Unit — `build_pace`: la espera entre requests. Sin dormir de verdad (el sleep se inyecta)."""
from __future__ import annotations

import pytest

from src.contexts.save.infrastructure.catalog_sources.pacing import build_pace


def test_sleeps_inside_the_requested_range_in_seconds() -> None:
    slept: list[float] = []
    pace = build_pace(600, 1200, sleep=slept.append)

    for _ in range(50):
        pace()

    assert len(slept) == 50
    assert all(0.6 <= s <= 1.2 for s in slept), f"fuera de rango: {[s for s in slept if not 0.6 <= s <= 1.2]}"


def test_uses_jitter_so_parallel_runs_do_not_align() -> None:
    # Con una pausa FIJA, N procesos sincronizados pegan en la misma milésima y el pico es el mismo
    # que sin pausa. El rango tiene que producir valores distintos.
    slept: list[float] = []
    pace = build_pace(600, 1200, sleep=slept.append)

    for _ in range(30):
        pace()

    assert len(set(slept)) > 1, "sin jitter no hay protección contra corridas alineadas"


def test_defaults_match_srds_proven_rate() -> None:
    # 600-1200ms = los defaults de SRD (`scrape-many.ts:31-32`), el ritmo que sus scrapers sostienen
    # en producción contra estas mismas APIs. No es un número inventado.
    slept: list[float] = []
    build_pace(sleep=slept.append)()

    assert 0.6 <= slept[0] <= 1.2


def test_rejects_an_impossible_range() -> None:
    with pytest.raises(ValueError):
        build_pace(1200, 600)
    with pytest.raises(ValueError):
        build_pace(-1, 100)
