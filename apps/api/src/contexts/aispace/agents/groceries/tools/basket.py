"""Tools de CANASTA del GroceriesAgent — la feature estrella y sus dos derivadas.

Todo el cálculo vive en `save/domain/basket.py` (puro). Estas tools solo traducen: el LLM elige
la tool y sus argumentos de negocio; **jamás suma, resta ni divide**.
"""
from __future__ import annotations

from langchain_core.tools import tool

from src.contexts.save.application.budget_basket import BudgetBasket
from src.contexts.save.application.dtos import BudgetBasketDto, ProviderBasketDto
from src.contexts.save.domain.basket import project_recurring_cost
# Alias a propósito: la TOOL se llama `worth_second_store` y sombrearía a la función de dominio
# dentro de su propio closure — se llamaría a sí misma.
from src.contexts.save.domain.basket import worth_second_store as evaluate_second_store
from src.contexts.save.infrastructure.repositories import SqlBasketOfferRepository

from ._shared import NO_DATA, SessionFactory, money

# El usuario habla en pesos ("con 10 mil"); la conversión a minor units la hace CÓDIGO, nunca el
# modelo. Es la frontera exacta donde §5.5 se aplica.
_MINOR_PER_MAJOR = 100


# El renderizado se separa de la tool porque es lo que §8.1 exige testear y la tool sólo se puede
# ejercitar con lo que haya en la base. Concreto: las 3 tiendas de dev cubren los 20 rubros, así
# que `groups_unavailable` está SIEMPRE vacío y por integración ese caso no se puede provocar.
# Funciones puras → el hueco se construye a mano y el test prueba de verdad.
def render_store_detail(result: BudgetBasketDto, chosen: ProviderBasketDto) -> str:
    """El detalle de UNA tienda (§5.4·B) — se pide, no se vuelca."""
    lines = [
        f"store={chosen.provider_name} | budget={money(result.budget_minor)} | "
        f"spent={money(chosen.total_minor)} | left={money(chosen.remaining_minor)}"
    ]
    lines += [
        f"item={line.name} | group={line.group} | units={line.units} | "
        f"subtotal={money(line.subtotal_minor)}"
        for line in chosen.lines
    ]
    if chosen.groups_unavailable:
        lines.append(f"not_sold_here={','.join(chosen.groups_unavailable)}")
    return "\n".join(lines)


def render_comparison(result: BudgetBasketDto) -> str:
    """El titular: una canasta por tienda, comparadas entre sí.

    Los dos huecos van por SEPARADO y nunca se colapsan (§7.5): «esta tienda no lo vende» y «no te
    alcanzó» son hechos distintos para quien compra —uno se arregla con más dinero, el otro no—.
    """
    lines = [f"budget={money(result.budget_minor)}"]
    for basket in result.providers:
        parts = [
            f"store={basket.provider_name}",
            f"groups_covered={len(basket.groups_covered)}",
            f"items={basket.items_count}",
            f"spent={money(basket.total_minor)}",
            f"left={money(basket.remaining_minor)}",
        ]
        if basket.groups_unavailable:
            parts.append(f"not_sold_here={','.join(basket.groups_unavailable)}")
        if basket.groups_unaffordable:
            parts.append(f"did_not_fit={','.join(basket.groups_unaffordable)}")
        if basket.shortfall_minor is not None:
            parts.append(f"short_by={money(basket.shortfall_minor)}")
        lines.append(" | ".join(parts))
    lines.append(
        "note: one basket per store, because that is how a real shopping trip works. "
        "A store covering FEWER groups is not automatically worse — say what it is missing"
    )
    return "\n".join(lines)


def build_basket_for_budget(session_factory: SessionFactory, market_id: str):  # type: ignore[no-untyped-def]
    @tool
    def basket_for_budget(amount: int, store: str = "") -> str:
        """Build the best household shopping basket that fits a budget, one per supermarket.

        Use it for "with RD$10,000, what can I buy for the house?", "make me a shopping list with
        X pesos", "how far does X get me at the supermarket". This is THE tool for any question
        that pairs an amount of money with a whole shopping trip. Pass `amount` in PESOS as the
        user said it (10000 for RD$10,000) — never in cents.

        Leave `store` EMPTY the first time: you get the comparison across supermarkets — groups
        covered, item count, total spent and money left for each. That headline is what the user
        wants first; a 20-line list is a wall of text nobody reads.

        Pass `store` with one supermarket's name ONLY when the user then asks to see that list
        ("dame la lista de Bravo", "qué lleva la de Sirena"). Then you get the items.

        Do NOT use it for a single product (compare_prices).
        """
        if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0:
            return "invalid_budget: the budget must be a positive amount in pesos"

        with session_factory() as session:
            result = BudgetBasket(SqlBasketOfferRepository(session)).execute(
                budget_minor=amount * _MINOR_PER_MAJOR, market_id=market_id
            )
        if not result.providers:
            return NO_DATA

        # §5.4·B — revelación progresiva: el TITULAR primero, el detalle sólo si lo piden.
        if store.strip():
            wanted = store.strip().lower()
            chosen = next(
                (b for b in result.providers if b.provider_name.lower() == wanted), None
            )
            if chosen is None:
                names = ", ".join(b.provider_name for b in result.providers)
                return f"no_match: '{store}' is not one of the stores. Available: {names}"
            return render_store_detail(result, chosen)

        return render_comparison(result)

    return basket_for_budget


def build_monthly_cost(session_factory: SessionFactory, market_id: str):  # type: ignore[no-untyped-def]
    @tool
    def monthly_cost(group: str, times_per_month: int = 0) -> str:
        """Cost of ONE basket of a single household group (baby, cleaning, coffee, meat...).

        Use it for "how much does a baby cost me?", "what do I spend on cleaning?". It returns the
        cost of one basket of that group per store, and what it includes.

        `times_per_month` is OPTIONAL and must come from the USER. Leave it at 0 unless the user
        told you how often they buy it: projecting a month without knowing their consumption would
        be inventing the number. If they did say it, pass it and you will get the projection.
        """
        with session_factory() as session:
            offers = SqlBasketOfferRepository(session).list_basket_offers(market_id)

        matching = [o for o in offers if o.group.lower() == group.strip().lower()]
        if not matching:
            available = sorted({o.group for o in offers})
            return f"no_match: '{group}' is not a household group. Available: {', '.join(available)}"

        by_store: dict[str, list] = {}
        for offer in matching:
            by_store.setdefault(offer.provider_name, []).append(offer)

        lines = [f"group={matching[0].group}"]
        for store, store_offers in sorted(by_store.items()):
            total = sum(o.price_minor for o in store_offers)
            parts = [
                f"store={store}",
                f"basket_cost={money(total)}",
                f"items={len(store_offers)}",
            ]
            if times_per_month:
                parts.append(
                    f"projected_monthly={money(project_recurring_cost(total, times_per_month=times_per_month))}"
                    f" (at {times_per_month}x/month, a frequency the USER gave)"
                )
            lines.append(" | ".join(parts))
        lines.append(f"includes: {', '.join(sorted({o.name for o in matching}))}")
        if not times_per_month:
            lines.append(
                "note: this is ONE basket, not a month. Do NOT multiply it yourself — ask the "
                "user how often they buy it"
            )
        return "\n".join(lines)

    return monthly_cost


def build_worth_second_store(session_factory: SessionFactory, market_id: str):  # type: ignore[no-untyped-def]
    @tool
    def worth_second_store(amount: int) -> str:
        """Is a second supermarket stop worth it for a given budget?

        Use it for "is it worth going to two stores?", "should I split my shopping?". It compares
        buying everything at the single best store against taking the cheapest option for each
        group across stores, and returns the GROSS saving.

        CRITICAL: report it as a THRESHOLD, never as a recommendation — "it is worth it only if
        getting to the second store costs you less than X, and that you know better than I do".
        Never estimate transport cost: you do not know if the user has a car, a motorbike or takes
        the bus. If the saving is negligible, say plainly that it is not worth it.
        """
        if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0:
            return "invalid_budget: the budget must be a positive amount in pesos"

        with session_factory() as session:
            offers = SqlBasketOfferRepository(session).list_basket_offers(market_id)
        if not offers:
            return NO_DATA

        # Mejor tienda única: la que cubre más rubros con el total más bajo entre sus propios
        # rubros. Repartido: por cada rubro, el más barato de cualquier tienda.
        by_store: dict[str, dict[str, int]] = {}
        for offer in offers:
            by_store.setdefault(offer.provider_name, {})
            current = by_store[offer.provider_name].get(offer.group)
            if current is None or offer.price_minor < current:
                by_store[offer.provider_name][offer.group] = offer.price_minor

        if len(by_store) < 2:
            return "no_data: only one store carries this basket, so there is no second stop to weigh"

        best_store, best_prices = max(
            by_store.items(), key=lambda kv: (len(kv[1]), -sum(kv[1].values()))
        )
        groups = set(best_prices)
        split_total = 0
        cheaper_elsewhere = 0
        for group in groups:
            options = [
                prices[group] for prices in by_store.values() if group in prices
            ]
            cheapest = min(options)
            split_total += cheapest
            if cheapest < best_prices[group]:
                cheaper_elsewhere += 1

        verdict = evaluate_second_store(
            single_store_total_minor=sum(best_prices.values()),
            split_total_minor=split_total,
            products_cheaper_elsewhere=cheaper_elsewhere,
        )
        lines = [
            f"single_store={best_store} | total={money(verdict.single_store_total_minor)}",
            f"split_across_stores | total={money(verdict.split_total_minor)}",
            f"gross_saving={money(verdict.gross_saving_minor)} "
            f"across {verdict.products_cheaper_elsewhere} groups",
            f"break_even={money(verdict.break_even_minor)}",
        ]
        lines.append(
            "verdict=not_worth_it: the saving is too small to justify a second trip"
            if verdict.is_negligible
            else "verdict=conditional: worth it ONLY if the trip costs less than break_even. "
            "State it as a condition and let the user decide"
        )
        return "\n".join(lines)

    return worth_second_store
