"""Precio por unidad de PRESENTACIÓN de Save, PURO (ADR 31).

Responde a una pregunta distinta que `unit_price`, y confundirlas fue el defecto:

- `unit_price` (ver `units.py`) normaliza SIEMPRE a kg/L/und. Es la clave de **ORDEN**: la única
  comparación justa entre envases de distinto tamaño. No se toca.
- `display_unit_price` es lo que **LEE** el usuario. Una lata de 900 Gr a «RD$227.78 X kg» es
  correcta y ajena; «RD$22.78 X 100 Gr» es la misma verdad en la unidad del envase.

⭐ La regla es la del ENVASE: dividir por lo que declara y rotular con lo que declara. Es la única
indiscutible para quien compra, y es la que ya aplicaba la tarjeta del basket.

⚠️ **Esto vivía en el CLIENTE, tres veces** —tarjeta móvil (en float, parseando el string de
tamaño), detalle móvil y web— y por eso la tarjeta decía «RD$22.78 X 100 Gr» y el detalle
«RD$227.78 X kg» del MISMO producto. En un comparador, dos cifras para un dato destruyen justo lo
que se vende. Aquí, una sola vez, en enteros y half-up (regla sagrada §12·B).

⚠️⚠️ **NO reusa `parse_size`, y no es duplicación: es una frontera.** Ese parser alimenta el
`size_gate` de la cascada de matching (además de `PromoteStoreProduct` y `BulkCreateCanonicals`).
Ampliarle el vocabulario para que la app rotule mejor cambiaría qué tamaños sabe comparar la
cascada, o sea las decisiones de fusión — con riesgo de falsos merges, que es corromper el
catálogo. **Leer no puede mover lo que decide qué se fusiona.** Por eso este módulo tiene su propio
vocabulario, deliberadamente MÁS ancho, y no puede hacer daño: lo peor que le pasa es rotular en la
unidad base, que es lo que se hacía antes.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from src.shared.money import Currency, Money

from .units import Quantity, UnitMeasure


@dataclass(frozen=True, slots=True)
class DisplayUnitPrice:
    """Precio por la unidad que el usuario LEE, con su rótulo ya resuelto."""

    amount_minor: int
    currency: Currency
    label: str


@dataclass(frozen=True, slots=True)
class _DisplayUnit:
    label: str
    measure: UnitMeasure
    #: Cuánto vale UNA de estas unidades en la unidad base de su magnitud (kg / L / und).
    in_base: Decimal


# ⭐ El factor de cada rótulo se declara UNA vez, contra la unidad base. Todo lo demás se DERIVA de
# aquí, y ésa es la razón de que exista esta tabla en vez de una columna de «cuántos caben»: la
# tabla del cliente escribía ese número a mano y lo tenía INVERTIDO para el galón
# (`baseAmount: 3.78541` con una fórmula que multiplicaba), o sea 14× de error hacia arriba. Un
# factor derivado no se puede invertir.
_LB = _DisplayUnit("Lb", UnitMeasure.MASS, Decimal("0.45359237"))
_KG = _DisplayUnit("Kg", UnitMeasure.MASS, Decimal("1"))
_OZ = _DisplayUnit("Oz", UnitMeasure.MASS, Decimal("0.028349523125"))
_100GR = _DisplayUnit("100 Gr", UnitMeasure.MASS, Decimal("0.1"))
_GR = _DisplayUnit("Gr", UnitMeasure.MASS, Decimal("0.001"))
_LT = _DisplayUnit("Lt", UnitMeasure.VOLUME, Decimal("1"))
_100ML = _DisplayUnit("100 Ml", UnitMeasure.VOLUME, Decimal("0.1"))
_UN = _DisplayUnit("Un", UnitMeasure.COUNT, Decimal("1"))

#: La unidad de reposo de cada magnitud: a esto se cae cuando el envase no dice nada legible.
_BASE_FOR: dict[UnitMeasure, _DisplayUnit] = {
    UnitMeasure.MASS: _KG,
    UnitMeasure.VOLUME: _LT,
    UnitMeasure.COUNT: _UN,
}

# ⭐ Los gramos y los mililitros se leen por CIEN, no por uno. «RD$0.23 X Gr» obliga a mover la coma
# mentalmente para comparar; «RD$22.78 X 100 Gr» se lee de un vistazo. Es la misma decisión que ya
# había tomado la tarjeta del basket, y la etiqueta de las góndolas de media Europa.
_DISPLAY_FOR_TOKEN: dict[str, _DisplayUnit] = {}


def _register(unit: _DisplayUnit, *tokens: str) -> None:
    for token in tokens:
        _DISPLAY_FOR_TOKEN[token] = unit


# masa
_register(_LB, "lb", "lbs", "libra", "libras", "pound", "pounds", "#")
_register(_KG, "kg", "kgs", "kilo", "kilos", "kilogramo", "kilogramos", "kilogram", "kilograms")
_register(_OZ, "oz", "onz", "onza", "onzas", "ounce", "ounces")
_register(_100GR, "g", "gr", "grs", "gramo", "gramos", "gram", "grams")
# Los sub-múltiplos se leen por GRAMO: «100 Gr» de un producto que viene en miligramos sería una
# cifra que no existe en ningún envase.
_register(_GR, "mg", "mgs", "miligramo", "miligramos", "milligram", "milligrams")
_register(_GR, "cg", "cgs", "centigramo", "centigramos", "centigram", "centigrams")
_register(_GR, "dg", "dgs", "decigramo", "decigramos", "decigram", "decigrams")
# volumen
_register(_LT, "l", "lt", "lts", "ltr", "litro", "litros", "liter", "liters", "litre", "litres")
_register(_100ML, "ml", "mls", "mililitro", "mililitros", "milliliter", "milliliters")
_register(_LT, "gl", "gal", "galon", "galón", "galones", "gallon", "gallons")
_register(_100ML, "floz", "fluidoz", "fluidounce", "fluidounces", "ozliquida", "ozliquidas")
# conteo — incluidos los ENVASES, que el catálogo dominicano usa como unidad de venta
_register(_UN, "und", "un", "u", "uds", "unidad", "unidades", "unit", "units")
_register(_UN, "pza", "pzas", "pieza", "piezas", "piece", "pieces")
_register(_UN, "pack", "packs", "pq", "paq", "paquete", "paquetes", "package", "packages")
_register(_UN, "bolsa", "bolsas", "bols", "bag", "bags")
_register(_UN, "caja", "cajas", "box", "boxes")
_register(_UN, "botella", "botellas", "bot", "bottle", "bottles")
_register(_UN, "lata", "latas", "can", "cans")
_register(_UN, "frasco", "frascos", "jar", "jars")
_register(_UN, "sobre", "sobres", "sachet", "sachets")
_register(_UN, "rollo", "rollos", "roll", "rolls")
_register(_UN, "docena", "docenas", "dozen", "dozens")

#: El token de unidad de un tamaño declarado. Sólo interesa la UNIDAD: cuánto hay ya lo dice
#: `Quantity`, que se midió en la ingesta y no se vuelve a adivinar aquí.
_TOKEN = re.compile(r"[a-zA-ZáéíóúñÁÉÍÓÚÑ#]+(?:\s*\.?\s*[a-zA-Z]+)?\s*\.?\s*$")


def _token_of(display_size: str) -> str:
    """La cola alfabética del tamaño, sin puntos ni espacios internos («fl. oz» → `floz`)."""
    match = _TOKEN.search(display_size.strip())
    if not match:
        return ""
    return re.sub(r"[\s.]", "", match.group(0)).lower()


def display_unit_of(display_size: str | None, measure: UnitMeasure) -> _DisplayUnit:
    """Qué unidad usar para LEER, con la magnitud de la cantidad como árbitro.

    ⭐ Ante el desacuerdo manda la MAGNITUD, no el texto: si el tamaño dice «12 Oz» (masa) pero la
    cantidad guardada es de volumen —los refrescos, donde «oz» son onzas líquidas—, rotular «X Oz»
    sobre un número por litro daría un precio que no es ni lo uno ni lo otro. La cantidad es la que
    se midió; el texto sólo propone.
    """
    base = _BASE_FOR[measure]
    if not display_size:
        return base

    unit = _DISPLAY_FOR_TOKEN.get(_token_of(display_size))
    # Una unidad desconocida cae a la base y NUNCA al token crudo: rotular «X cucharada» sería
    # afirmar una conversión que nadie hizo.
    if unit is None or unit.measure is not measure:
        return base
    return unit


def display_unit_price(
    price: Money, quantity: Quantity, display_size: str | None
) -> DisplayUnitPrice | None:
    """Precio por la unidad del envase, en minor units (half-up), o `None` si no dice nada nuevo.

    `None` cuando el envase ES exactamente una unidad de display: una botella de 1 Lt a RD$100.00
    daría «RD$100.00 X Lt» al lado de «RD$100.00». El mismo número dos veces no es un dato.
    """
    unit = display_unit_of(display_size, quantity.measure)
    if quantity.amount == unit.in_base:
        return None

    minor = (Decimal(price.amount_minor) * unit.in_base / quantity.amount).to_integral_value(
        rounding=ROUND_HALF_UP
    )
    return DisplayUnitPrice(int(minor), price.currency, unit.label)


def display_unit_price_or_none(
    price: Money, quantity: Quantity | None, display_size: str | None
) -> DisplayUnitPrice | None:
    """Igual, tolerando el producto SIN cantidad declarada — ver `unit_price_or_none`."""
    return None if quantity is None else display_unit_price(price, quantity, display_size)
