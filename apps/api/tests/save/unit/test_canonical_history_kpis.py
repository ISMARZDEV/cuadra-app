"""Unit — rangos y KPIs del histórico admin (F5, US-CP-D6/D7).

Los KPIs se calculan sobre puntos de CAMBIO (la tabla `price` es change-only, doc 10), no sobre
una serie diaria. Esa es la razón de casi todas las sutilezas de acá: el "baseline carry-in" (el
precio que ya venía vigente al empezar el rango) es un punto de la serie pero NO es un cambio que
haya ocurrido dentro del rango.

Todo en minor units, enteros. Jamás floats para dinero.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from src.contexts.save.domain.canonical_history import (
    RANGE_DAYS,
    CanonicalHistoryRange,
    derive_price_kpis,
    range_since,
    window_with_carry_in,
)
from src.contexts.save.domain.entities import PriceType
from src.contexts.save.domain.history import PricePoint
from src.shared.money import Currency, Money

NOW = datetime(2026, 7, 25, 12, 0, tzinfo=UTC)
DOP = Currency("DOP")


def point(days_ago: float, minor: int, provider: str = "p1") -> PricePoint:
    return PricePoint(
        provider_id=provider,
        provider_name=provider.upper(),
        price=Money(minor, DOP),
        captured_at=NOW - timedelta(days=days_ago),
        price_type=PriceType.ONLINE,
    )


class TestRanges:
    def test_the_sdd_ranges_all_exist(self) -> None:
        """El SDD pide 15d, 1m, 3m, 6m y 1y — el histórico público sólo tenía 1m/3m/all."""
        assert {r.value for r in CanonicalHistoryRange} >= {"15d", "1m", "3m", "6m", "1y", "all"}

    @pytest.mark.parametrize(
        ("range_", "days"),
        [("15d", 15), ("1m", 30), ("3m", 90), ("6m", 180), ("1y", 365)],
    )
    def test_each_range_maps_to_its_days(self, range_: str, days: int) -> None:
        assert RANGE_DAYS[CanonicalHistoryRange(range_)] == days

    def test_all_has_no_lower_bound(self) -> None:
        assert range_since(CanonicalHistoryRange.ALL, now=NOW) is None

    def test_a_bounded_range_starts_exactly_n_days_back(self) -> None:
        assert range_since(CanonicalHistoryRange.FIFTEEN_DAYS, now=NOW) == NOW - timedelta(days=15)


class TestWindowWithCarryIn:
    """Sin carry-in el chart arrancaría vacío para una tienda que no cambió el precio dentro del
    rango — y "sin datos" no es lo mismo que "el precio no se movió"."""

    def test_the_last_change_before_the_window_is_carried_in(self) -> None:
        points = [point(40, 10000), point(5, 12000)]
        result = window_with_carry_in(points, since=NOW - timedelta(days=15))

        assert len(result) == 2
        assert result[0].price.amount_minor == 10000

    def test_only_the_most_recent_prior_point_is_carried_in(self) -> None:
        points = [point(90, 8000), point(40, 10000), point(5, 12000)]
        result = window_with_carry_in(points, since=NOW - timedelta(days=15))

        assert [p.price.amount_minor for p in result] == [10000, 12000]

    def test_without_a_lower_bound_everything_is_returned(self) -> None:
        points = [point(400, 8000), point(5, 12000)]
        assert window_with_carry_in(points, since=None) == points

    def test_a_provider_with_no_prior_point_has_no_carry_in(self) -> None:
        points = [point(5, 12000)]
        assert len(window_with_carry_in(points, since=NOW - timedelta(days=15))) == 1


class TestKpis:
    def test_min_max_and_spread_use_the_current_price_of_each_store(self) -> None:
        series = {
            "p1": [point(20, 15000, "p1"), point(2, 12000, "p1")],
            "p2": [point(3, 19000, "p2")],
        }
        kpis = derive_price_kpis(series, now=NOW)

        assert kpis.min_price_minor == 12000
        assert kpis.max_price_minor == 19000
        assert kpis.spread_minor == 7000

    def test_active_provider_count_is_the_number_of_series_with_data(self) -> None:
        series = {"p1": [point(2, 12000, "p1")], "p2": [point(3, 19000, "p2")], "p3": []}
        assert derive_price_kpis(series, now=NOW).active_provider_count == 2

    def test_last_updated_is_the_most_recent_point_across_stores(self) -> None:
        series = {"p1": [point(20, 15000, "p1")], "p2": [point(3, 19000, "p2")]}
        assert derive_price_kpis(series, now=NOW).last_updated_at == NOW - timedelta(days=3)

    def test_the_change_count_EXCLUDES_the_carry_in_point(self) -> None:
        """El carry-in es el precio que YA venía vigente: contarlo como cambio del rango
        inflaría el número y le haría creer al operador que hubo movimiento que no hubo."""
        series = {"p1": window_with_carry_in(
            [point(40, 10000, "p1"), point(5, 12000, "p1")], since=NOW - timedelta(days=15)
        )}
        kpis = derive_price_kpis(series, now=NOW, since=NOW - timedelta(days=15))

        assert kpis.price_change_count == 1

    def test_the_change_count_adds_up_across_stores(self) -> None:
        since = NOW - timedelta(days=15)
        series = {
            "p1": [point(10, 10000, "p1"), point(5, 11000, "p1")],
            "p2": [point(3, 19000, "p2")],
        }
        assert derive_price_kpis(series, now=NOW, since=since).price_change_count == 3

    def test_the_variation_compares_the_cheapest_at_the_start_against_now(self) -> None:
        """Lo que le importa al operador es cómo se movió el MEJOR precio disponible."""
        series = {
            "p1": [point(20, 15000, "p1"), point(2, 12000, "p1")],
            "p2": [point(20, 18000, "p2")],
        }
        kpis = derive_price_kpis(series, now=NOW)

        # arranca en 15000 (el más barato de entonces), termina en 12000
        assert kpis.change_in_range_minor == -3000

    def test_an_empty_history_yields_null_kpis_not_zeros(self) -> None:
        """Cero pesos es un PRECIO. "No hay datos" no es cero — pintarlo como 0 sería una
        mentira en verde en la cara del operador."""
        kpis = derive_price_kpis({}, now=NOW)

        assert kpis.min_price_minor is None
        assert kpis.max_price_minor is None
        assert kpis.spread_minor is None
        assert kpis.change_in_range_minor is None
        assert kpis.active_provider_count == 0
        assert kpis.price_change_count == 0

    def test_a_single_store_has_zero_spread_not_null(self) -> None:
        """Con una sola tienda el spread es 0 de verdad: no hay diferencia entre tiendas."""
        kpis = derive_price_kpis({"p1": [point(2, 12000, "p1")]}, now=NOW)
        assert kpis.spread_minor == 0

    def test_money_never_becomes_a_float(self) -> None:
        series = {"p1": [point(2, 12345, "p1")], "p2": [point(2, 19999, "p2")]}
        kpis = derive_price_kpis(series, now=NOW)

        for value in (kpis.min_price_minor, kpis.max_price_minor, kpis.spread_minor):
            assert isinstance(value, int)
