"""Use case `BudgetBasket` (§7): «con RD$X, ¿qué me alcanza para la compra del hogar?».

Arma **una canasta por proveedor** y las compara entre sí. La canasta es de UNA sola tienda a
propósito: es como la gente compra de verdad, y convierte la pregunta del presupuesto en una
comparación entre súpers, que es la que tiene valor.

El reparto de responsabilidades:
  - el **repositorio** resuelve, en UNA query, qué producto de cada proveedor satisface cada rubro,
  - el **dominio** (`plan_basket`) decide qué entra en el presupuesto — puro y testeable sin DB,
  - este use-case orquesta y ordena el resultado.

Ningún número lo calcula un LLM, y ninguno es float.
"""
from __future__ import annotations

from ..domain.basket import BasketGroup, ProviderBasket, ProviderOffer, plan_basket
from ..domain.ports import BasketOfferRepository
from .dtos import BudgetBasketDto, ProviderBasketDto


class BudgetBasket:
    def __init__(self, offer_repo: BasketOfferRepository) -> None:
        self._repo = offer_repo

    def execute(self, *, budget_minor: int, market_id: str) -> BudgetBasketDto:
        offers = self._repo.list_basket_offers(market_id)

        groups = sorted(
            {(o.group, o.priority) for o in offers}, key=lambda pair: (pair[1], pair[0])
        )
        basket_groups = [BasketGroup(label=label, priority=priority) for label, priority in groups]

        by_provider: dict[tuple[str, str], list[ProviderOffer]] = {}
        for offer in offers:
            by_provider.setdefault((offer.provider_id, offer.provider_name), []).append(offer)

        baskets: list[ProviderBasketDto] = []
        for (provider_id, provider_name), provider_offers in by_provider.items():
            basket: ProviderBasket = plan_basket(
                basket_groups,
                [o.as_offer() for o in provider_offers],
                budget_minor=budget_minor,
            )
            baskets.append(
                ProviderBasketDto.from_domain(provider_id, provider_name, basket)
            )

        # Orden de la comparación: primero quien CUBRE más rubros (es la pregunta del usuario), y
        # a igual cobertura, quien mete más artículos. El precio total NO ordena: todos gastan
        # aproximadamente el mismo presupuesto, así que ordenar por total premiaría al que menos
        # compró.
        baskets.sort(key=lambda b: (len(b.groups_covered), b.items_count), reverse=True)

        # "Más barato" se juzga por total gastado dentro de la canasta; el primero en empate gana.
        if baskets:
            cheapest_total = min(b.total_minor for b in baskets)
            for b in baskets:
                b.is_cheapest = b.total_minor == cheapest_total

        return BudgetBasketDto(budget_minor=budget_minor, providers=tuple(baskets))
