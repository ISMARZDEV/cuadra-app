"""Unit — la canasta por presupuesto (§7). DOMINIO PURO: sin DB, sin LLM, dinero en enteros.

El criterio NO es maximizar artículos (eso devolvería 30 paquetes de sal, matemáticamente óptimo e
inútil para comprar): es **cobertura del hogar por prioridad**. Primero un artículo de cada rubro
esencial; con lo que sobre, se repite. Greedy, determinista y explicable ante el usuario.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.basket import (
    BasketGroup,
    BasketOffer,
    plan_basket,
    project_recurring_cost,
    worth_second_store,
)


def _g(label: str, priority: int) -> BasketGroup:
    return BasketGroup(label=label, priority=priority)


def _o(
    group: str,
    name: str,
    price_minor: int,
    pid: str | None = None,
    *,
    image_url: str | None = None,
    url: str | None = None,
    brand: str | None = None,
    display_size: str | None = None,
    captured_at: str | None = None,
) -> BasketOffer:
    return BasketOffer(
        group=group,
        canonical_product_id=pid or name,
        name=name,
        price_minor=price_minor,
        image_url=image_url,
        url=url,
        brand=brand,
        display_size=display_size,
        captured_at=captured_at,
    )


class TestCoberturaPorPrioridad:
    def test_covers_one_item_per_group_before_repeating_any(self) -> None:
        """La ronda 1 es COBERTURA: nadie repite hasta que todos los rubros tengan algo."""
        groups = [_g("Arroz", 1), _g("Aceite", 2), _g("Café", 3)]
        offers = [
            _o("Arroz", "arroz barato", 10_000),
            _o("Aceite", "aceite", 20_000),
            _o("Café", "café", 30_000),
        ]

        basket = plan_basket(groups, offers, budget_minor=100_000)

        assert set(basket.groups_covered) == {"Arroz", "Aceite", "Café"}
        assert sorted(line.group for line in basket.lines) == ["Aceite", "Arroz", "Café"]

    def test_within_a_group_it_takes_the_cheapest(self) -> None:
        groups = [_g("Arroz", 1)]
        offers = [
            _o("Arroz", "caro", 50_000),
            _o("Arroz", "barato", 12_000),
            _o("Arroz", "medio", 30_000),
        ]

        basket = plan_basket(groups, offers, budget_minor=100_000)

        assert [line.name for line in basket.lines] == ["barato"]

    def test_priority_decides_who_gets_the_last_peso(self) -> None:
        """Con presupuesto para UNO solo, gana el rubro más esencial, no el más barato."""
        groups = [_g("Arroz", 1), _g("Galletas", 9)]
        offers = [_o("Arroz", "arroz", 20_000), _o("Galletas", "galletas", 5_000)]

        basket = plan_basket(groups, offers, budget_minor=20_000)

        assert [line.name for line in basket.lines] == ["arroz"]
        assert basket.groups_unaffordable == ("Galletas",)

    def test_the_leftover_buys_more_units_of_what_is_already_covered(self) -> None:
        groups = [_g("Arroz", 1)]
        offers = [_o("Arroz", "arroz", 10_000)]

        basket = plan_basket(groups, offers, budget_minor=35_000, max_units_per_item=3)

        assert basket.lines[0].units == 3          # el tope corta, no el presupuesto
        assert basket.total_minor == 30_000
        assert basket.remaining_minor == 5_000

    def test_the_totals_close_in_integers(self) -> None:
        groups = [_g("A", 1), _g("B", 2)]
        offers = [_o("A", "a", 1_333), _o("B", "b", 2_777)]

        basket = plan_basket(groups, offers, budget_minor=50_000)

        assert basket.total_minor == sum(line.subtotal_minor for line in basket.lines)
        assert basket.total_minor + basket.remaining_minor == 50_000
        assert isinstance(basket.total_minor, int)

    def test_basket_lines_carry_visual_fields_from_the_offer(self) -> None:
        """Las líneas de la canasta necesitan image_url, url, brand, size y captured_at para renderizar la card."""
        groups = [_g("Arroz", 1)]
        offers = [
            _o(
                "Arroz",
                "Arroz Campos 20 Lb",
                10_000,
                image_url="https://example.com/arroz.jpg",
                url="https://sirena.com/arroz",
                brand="Campos",
                display_size="20 Lb",
                captured_at="2026-08-02",
            )
        ]

        basket = plan_basket(groups, offers, budget_minor=100_000)

        line = basket.lines[0]
        assert line.image_url == "https://example.com/arroz.jpg"
        assert line.url == "https://sirena.com/arroz"
        assert line.brand == "Campos"
        assert line.display_size == "20 Lb"
        assert line.captured_at == "2026-08-02"


class TestCasosBorde:
    """§7.5 — los cuatro con test OBLIGATORIO."""

    def test_a_group_with_no_offer_here_is_reported_not_replaced(self) -> None:
        """Jamás rellenar un rubro vacío con otra cosa: se dice que falta."""
        groups = [_g("Arroz", 1), _g("Pañales", 2)]
        offers = [_o("Arroz", "arroz", 10_000)]

        basket = plan_basket(groups, offers, budget_minor=100_000)

        assert basket.groups_unavailable == ("Pañales",)
        assert all(line.group != "Pañales" for line in basket.lines)

    def test_when_nothing_fits_it_says_how_much_is_missing(self) -> None:
        groups = [_g("Arroz", 1)]
        offers = [_o("Arroz", "arroz", 25_000)]

        basket = plan_basket(groups, offers, budget_minor=10_000)

        assert basket.lines == ()
        assert basket.shortfall_minor == 15_000     # no una canasta vacía sin explicación

    def test_a_basket_that_bought_something_has_no_shortfall(self) -> None:
        basket = plan_basket([_g("A", 1)], [_o("A", "a", 5_000)], budget_minor=10_000)

        assert basket.shortfall_minor is None

    @pytest.mark.parametrize("budget", [0, -1, -50_000])
    def test_a_zero_or_negative_budget_is_a_clear_error_not_a_crash(self, budget: int) -> None:
        with pytest.raises(ValueError, match="presupuesto"):
            plan_basket([_g("A", 1)], [_o("A", "a", 100)], budget_minor=budget)

    def test_money_must_be_integer_minor_units(self) -> None:
        with pytest.raises(TypeError):
            plan_basket([_g("A", 1)], [_o("A", "a", 100)], budget_minor=100.5)  # type: ignore[arg-type]

    def test_a_provider_with_thin_coverage_still_produces_a_basket(self) -> None:
        """No se oculta al proveedor flojo: aparece con menos rubros, y eso ES la comparación."""
        groups = [_g("A", 1), _g("B", 2), _g("C", 3)]
        offers = [_o("A", "a", 1_000)]

        basket = plan_basket(groups, offers, budget_minor=100_000)

        assert basket.groups_covered == ("A",)
        assert basket.groups_unavailable == ("B", "C")


class TestVerdictoDeLaSegundaTienda:
    """§7.6 — devuelve el UMBRAL DE EQUILIBRIO, nunca una recomendación absoluta.

    No sabemos si el usuario tiene carro, moto o guagua, ni a qué distancia vive. Inventar un costo
    de traslado sería exactamente el número inventado que este dominio prohíbe. Así que damos el
    único número que sí sabemos —el ahorro bruto— y que decida él.
    """

    def test_it_reports_the_gross_saving_as_the_break_even_threshold(self) -> None:
        verdict = worth_second_store(
            single_store_total_minor=982_000,
            split_total_minor=961_000,
            products_cheaper_elsewhere=3,
        )

        assert verdict.gross_saving_minor == 21_000
        assert verdict.break_even_minor == 21_000   # conviene SI el viaje cuesta menos que esto
        assert verdict.products_cheaper_elsewhere == 3

    def test_a_negligible_saving_says_so_with_all_the_letters(self) -> None:
        """Un comparador que SIEMPRE empuja a comparar más pierde credibilidad."""
        verdict = worth_second_store(
            single_store_total_minor=982_000,
            split_total_minor=980_200,
            products_cheaper_elsewhere=1,
        )

        assert verdict.gross_saving_minor == 1_800
        assert verdict.is_negligible is True

    def test_no_saving_at_all_is_not_negative(self) -> None:
        verdict = worth_second_store(
            single_store_total_minor=500_000,
            split_total_minor=500_000,
            products_cheaper_elsewhere=0,
        )

        assert verdict.gross_saving_minor == 0
        assert verdict.is_negligible is True

    def test_a_split_more_expensive_than_one_store_is_rejected_as_impossible(self) -> None:
        """Repartir la compra NUNCA puede salir más caro: sería un error de cálculo aguas arriba."""
        with pytest.raises(ValueError, match="más caro"):
            worth_second_store(
                single_store_total_minor=500_000,
                split_total_minor=520_000,
                products_cheaper_elsewhere=2,
            )


class TestProyeccionMensual:
    """§7.7 — la frecuencia la da el USUARIO. Multiplicar por cuatro sería inventar consumo."""

    def test_it_projects_only_with_a_frequency_the_user_gave(self) -> None:
        assert project_recurring_cost(120_000, times_per_month=4) == 480_000

    @pytest.mark.parametrize("frequency", [0, -1])
    def test_it_refuses_to_project_without_a_real_frequency(self, frequency: int) -> None:
        with pytest.raises(ValueError, match="frecuencia"):
            project_recurring_cost(120_000, times_per_month=frequency)

    def test_there_is_no_default_frequency(self) -> None:
        """Un default sería un supuesto de consumo disfrazado de dato."""
        with pytest.raises(TypeError):
            project_recurring_cost(120_000)  # type: ignore[call-arg]
