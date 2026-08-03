"""La canasta del hogar por presupuesto (§7). DOMINIO PURO — sin DB, sin LLM, sin float.

## Por qué NO es un problema de mochila

Porque no buscamos el óptimo: buscamos una canasta **realista y explicable**. Un óptimo de mochila
maximizaría artículos por peso y devolvería *30 paquetes de sal* — matemáticamente superior e
inútil para ir al súper. La cobertura por prioridad es greedy, `O(n log n)`, determinista y trivial
de testear; y sobre todo produce un resultado que una persona puede AUDITAR: «primero lo esencial,
un artículo por rubro, y con lo que sobra repetimos». «Maximicé el valor sujeto a restricción
presupuestaria» no es una frase que nadie pueda verificar.

## El algoritmo

    ronda 1 (COBERTURA): por prioridad de rubro, el artículo más barato que quepa en lo que resta
    ronda 2+ (SOBRANTE): repetir sobre los rubros ya cubiertos, con tope de unidades por artículo,
                         hasta que no entre nada más

## Honestidad

Un rubro sin oferta en ese proveedor se **reporta**, jamás se rellena con otra cosa; y se distingue
del rubro que sí tenía oferta pero no entró en el presupuesto. Son dos hechos distintos para quien
compra: uno es «esta tienda no lo vende», el otro es «no te alcanzó».
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

_DEFAULT_MAX_UNITS_PER_ITEM = 3
# Por debajo de esto, el ahorro de una segunda parada no justifica ni la conversación (§7.6).
_NEGLIGIBLE_SAVING_MINOR = 5_000  # RD$50.00


@dataclass(frozen=True, slots=True)
class BasketGroup:
    """Un rubro del hogar. `priority` viene de `basket_query.position`: menor = más esencial."""

    label: str
    priority: int


@dataclass(frozen=True, slots=True)
class BasketOffer:
    """Un producto concreto disponible en UN proveedor, con su precio en minor units."""

    group: str
    canonical_product_id: str
    name: str
    price_minor: int


@dataclass(frozen=True, slots=True)
class ProviderOffer:
    """Una oferta ya atribuida a un proveedor — el read-model que alimenta la comparación.

    Lo produce el repositorio en UNA sola query. Resolver las 213 queries de la canasta una por una
    a través de la búsqueda híbrida costaría 213 llamadas al embedder por request: la resolución
    léxica se hace en SQL, que es donde están los datos.
    """

    provider_id: str
    provider_name: str
    group: str
    priority: int
    canonical_product_id: str
    name: str
    price_minor: int

    def as_offer(self) -> BasketOffer:
        return BasketOffer(
            group=self.group,
            canonical_product_id=self.canonical_product_id,
            name=self.name,
            price_minor=self.price_minor,
        )


@dataclass(frozen=True, slots=True)
class BasketLine:
    group: str
    canonical_product_id: str
    name: str
    unit_price_minor: int
    units: int

    @property
    def subtotal_minor(self) -> int:
        return self.unit_price_minor * self.units


@dataclass(frozen=True, slots=True)
class ProviderBasket:
    lines: tuple[BasketLine, ...]
    total_minor: int
    remaining_minor: int
    groups_covered: tuple[str, ...]
    groups_unavailable: tuple[str, ...]   # el proveedor NO los vende
    groups_unaffordable: tuple[str, ...]  # los vende, pero no entraron en el presupuesto
    # Cuánto FALTA para el artículo más barato, cuando no alcanzó ni para uno. `None` si compró algo.
    shortfall_minor: int | None = None


def plan_basket(
    groups: Sequence[BasketGroup],
    offers: Iterable[BasketOffer],
    *,
    budget_minor: int,
    max_units_per_item: int = _DEFAULT_MAX_UNITS_PER_ITEM,
) -> ProviderBasket:
    """Arma la canasta de UN proveedor. Todo entero: nunca entra ni sale un float."""
    if isinstance(budget_minor, bool) or not isinstance(budget_minor, int):
        raise TypeError(f"budget_minor debe ser int (minor units): {budget_minor!r}")
    if budget_minor <= 0:
        raise ValueError(f"presupuesto inválido: {budget_minor} (debe ser mayor que cero)")

    cheapest_by_group: dict[str, BasketOffer] = {}
    for offer in offers:
        current = cheapest_by_group.get(offer.group)
        if current is None or offer.price_minor < current.price_minor:
            cheapest_by_group[offer.group] = offer

    ordered = sorted(groups, key=lambda g: (g.priority, g.label))
    unavailable = tuple(g.label for g in ordered if g.label not in cheapest_by_group)

    remaining = budget_minor
    units: dict[str, int] = {}

    # Ronda 1 — COBERTURA: un artículo de cada rubro, por prioridad.
    for group in ordered:
        first = cheapest_by_group.get(group.label)
        if first is None or first.price_minor > remaining:
            continue
        units[group.label] = 1
        remaining -= first.price_minor

    # Rondas 2+ — SOBRANTE: repetir sobre lo ya cubierto hasta que no entre nada.
    # Se recorre en el mismo orden de prioridad, así que lo esencial también se repite primero.
    progressed = True
    while progressed:
        progressed = False
        for group in ordered:
            taken = units.get(group.label, 0)
            if taken == 0 or taken >= max_units_per_item:
                continue
            offer = cheapest_by_group[group.label]
            if offer.price_minor > remaining:
                continue
            units[group.label] = taken + 1
            remaining -= offer.price_minor
            progressed = True

    lines = tuple(
        BasketLine(
            group=group.label,
            canonical_product_id=cheapest_by_group[group.label].canonical_product_id,
            name=cheapest_by_group[group.label].name,
            unit_price_minor=cheapest_by_group[group.label].price_minor,
            units=units[group.label],
        )
        for group in ordered
        if units.get(group.label)
    )
    total = sum(line.subtotal_minor for line in lines)
    unaffordable = tuple(
        g.label for g in ordered if g.label in cheapest_by_group and not units.get(g.label)
    )

    shortfall = None
    if not lines and cheapest_by_group:
        cheapest = min(o.price_minor for o in cheapest_by_group.values())
        shortfall = cheapest - budget_minor

    return ProviderBasket(
        lines=lines,
        total_minor=total,
        remaining_minor=budget_minor - total,
        groups_covered=tuple(line.group for line in lines),
        groups_unavailable=unavailable,
        groups_unaffordable=unaffordable,
        shortfall_minor=shortfall,
    )


@dataclass(frozen=True, slots=True)
class SecondStoreVerdict:
    """El veredicto de §7.6: un UMBRAL, nunca una recomendación.

    `break_even_minor` es la única cifra honesta que podemos dar — «te conviene SI llegar a la otra
    tienda te cuesta menos que esto». El costo del viaje lo sabe el usuario; los precios los sabemos
    nosotros. Cada uno aporta lo que tiene.
    """

    single_store_total_minor: int
    split_total_minor: int
    gross_saving_minor: int
    products_cheaper_elsewhere: int

    @property
    def break_even_minor(self) -> int:
        return self.gross_saving_minor

    @property
    def is_negligible(self) -> bool:
        """Si el ahorro es ridículo hay que decirlo. Un comparador que siempre empuja a comparar
        más pierde credibilidad; uno que a veces dice «quedate donde estás» la gana."""
        return self.gross_saving_minor < _NEGLIGIBLE_SAVING_MINOR


def worth_second_store(
    *,
    single_store_total_minor: int,
    split_total_minor: int,
    products_cheaper_elsewhere: int,
) -> SecondStoreVerdict:
    """¿Vale la pena la segunda parada? Es una resta — por eso vive en el dominio puro."""
    if split_total_minor > single_store_total_minor:
        raise ValueError(
            "repartir la compra salió más caro que comprar todo en una tienda "
            f"({split_total_minor} > {single_store_total_minor}): hay un error aguas arriba"
        )
    return SecondStoreVerdict(
        single_store_total_minor=single_store_total_minor,
        split_total_minor=split_total_minor,
        gross_saving_minor=single_store_total_minor - split_total_minor,
        products_cheaper_elsewhere=products_cheaper_elsewhere,
    )


def project_recurring_cost(basket_total_minor: int, *, times_per_month: int) -> int:
    """Proyecta el costo de una canasta a un mes — SOLO con una frecuencia que dio el usuario.

    ⚠️ **La trampa del «al mes».** Proyectar exige saber cuántas unidades se consumen, y eso no lo
    sabemos: multiplicar por cuatro sería inventar un patrón de consumo y presentarlo como dato.
    Por eso `times_per_month` es OBLIGATORIO y no tiene default. Si el usuario no lo dice, no hay
    proyección — se devuelve el costo de UNA canasta y se declara qué incluye. Así el supuesto es
    suyo, no nuestro.
    """
    if isinstance(times_per_month, bool) or not isinstance(times_per_month, int):
        raise TypeError(f"times_per_month debe ser int: {times_per_month!r}")
    if times_per_month <= 0:
        raise ValueError(
            f"frecuencia inválida: {times_per_month}. La frecuencia la da el USUARIO; "
            "sin ella no se proyecta nada."
        )
    return basket_total_minor * times_per_month
