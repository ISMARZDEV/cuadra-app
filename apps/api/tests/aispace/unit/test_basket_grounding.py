"""Unit — §8.1 fila 5: un rubro que la tienda NO vende se dice EXPLÍCITAMENTE.

Por qué este caso es unitario y no de integración, como los otros cinco: se midió contra la base
de dev (2026-08-02) y las **tres** tiendas cubren los **20** rubros — `groups_unavailable` está
vacío en todas. O sea que **la integración no puede ejercitar este caso**: no hay datos que lo
produzcan. Testearlo ahí sería escribir un test que pasa sin probar nada.

El renderizado se extrajo a funciones puras justamente para poder construir el hueco a mano. La
distinción que se protege acá es de §7.5 y no es cosmética:

    «esta tienda NO LO VENDE»   ≠   «no te alcanzó el presupuesto»

Son dos hechos distintos para quien compra —uno se arregla con más dinero y el otro no— y
mezclarlos, o callarse uno, es deshonesto.
"""
from __future__ import annotations

from src.contexts.aispace.agents.groceries.tools.basket import (
    render_comparison,
    render_store_detail,
)
from src.contexts.save.application.dtos import (
    BasketLineDto,
    BudgetBasketDto,
    ProviderBasketDto,
)


def _line(group: str, name: str, minor: int) -> BasketLineDto:
    return BasketLineDto(
        group=group,
        canonical_product_id="cid",
        name=name,
        unit_price_minor=minor,
        units=1,
        subtotal_minor=minor,
    )


def _basket(**over: object) -> ProviderBasketDto:
    defaults: dict = {
        "provider_id": "p1",
        "provider_name": "Bravo",
        "lines": (_line("Arroz", "Arroz Campos 20 Lb", 45_000),),
        "total_minor": 45_000,
        "remaining_minor": 5_000,
        "groups_covered": ("Arroz",),
        "groups_unavailable": (),
        "groups_unaffordable": (),
        "shortfall_minor": None,
    }
    return ProviderBasketDto(**{**defaults, **over})


class TestUnRubroQueLaTiendaNoVende:
    def test_the_comparison_names_the_groups_the_store_does_not_carry(self) -> None:
        result = BudgetBasketDto(
            budget_minor=50_000,
            providers=(_basket(groups_unavailable=("Pañales", "Café")),),
        )

        out = render_comparison(result)

        assert "not_sold_here=" in out
        assert "Pañales" in out and "Café" in out

    def test_the_store_detail_also_names_them(self) -> None:
        # El titular puede decirlo y el detalle callarlo: son dos textos distintos y el usuario
        # que pide «la lista de Bravo» ve SOLO el segundo.
        chosen = _basket(groups_unavailable=("Pañales",))
        result = BudgetBasketDto(budget_minor=50_000, providers=(chosen,))

        out = render_store_detail(result, chosen)

        assert "not_sold_here=" in out
        assert "Pañales" in out

    def test_not_carrying_a_group_is_NOT_reported_as_unaffordable(self) -> None:
        """La distinción de §7.5. Con más presupuesto uno se arregla y el otro no."""
        result = BudgetBasketDto(
            budget_minor=50_000,
            providers=(_basket(groups_unavailable=("Pañales",)),),
        )

        out = render_comparison(result)

        assert "did_not_fit=" not in out, "confundió «no lo vende» con «no te alcanzó»"

    def test_a_store_with_no_gaps_says_nothing_about_gaps(self) -> None:
        # La honestidad es simétrica: inventar un hueco que no existe también es mentir.
        result = BudgetBasketDto(budget_minor=50_000, providers=(_basket(),))

        out = render_comparison(result)

        assert "not_sold_here=" not in out
        assert "did_not_fit=" not in out
