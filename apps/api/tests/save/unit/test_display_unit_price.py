"""Unit — el precio por unidad de PRESENTACIÓN de Save.

Distinto del de `test_unit_price.py`, y la diferencia es el motivo de existir de este módulo:

- `unit_price` normaliza SIEMPRE a kg/L/und. Es la clave de ORDEN — la única comparación justa
  entre envases distintos. No se toca.
- `display_unit_price` responde a otra pregunta: **qué lee el usuario**. Una lata de 900 Gr a
  «RD$227.78 X kg» es correcta y ajena; «RD$22.78 X 100 Gr» es la misma verdad en la unidad del
  envase. La regla es la del envase: dividir por lo que declara y rotular con lo que declara.

Existía en el CLIENTE, tres veces y en float (tarjeta móvil, detalle móvil, web), y por eso la
tarjeta y el detalle enseñaban números distintos del mismo producto. Aquí, en enteros y half-up.

⚠️ NO reusa `parse_size`: ese parser alimenta el `size_gate` de la cascada de matching, y ampliarle
el vocabulario cambiaría decisiones de matching. Leer no puede mover lo que decide qué se fusiona.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.domain.value_objects.display_units import (
    DisplayUnitPrice,
    display_unit_price,
)
from src.contexts.save.domain.value_objects.units import Quantity, UnitMeasure
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _dop(minor: int) -> Money:
    return Money(minor, DOP)


def _mass(kg: str) -> Quantity:
    return Quantity(Decimal(kg), UnitMeasure.MASS)


# --------------------------------------------------------------------------------------
# Los TRES productos de la captura del usuario (2026-08-22). Son el ancla: el detalle tiene
# que decir exactamente lo que ya decía la tarjeta.
# --------------------------------------------------------------------------------------


def test_pasta_de_tomate_900_gr() -> None:
    """RD$205.00 / 900 Gr → RD$22.78 por 100 Gr. El detalle decía «RD$227.78 X kg»."""
    got = display_unit_price(_dop(20500), _mass("0.9"), "900 Gr")

    assert got == DisplayUnitPrice(2278, DOP, "100 Gr")


def test_lata_de_8_oz() -> None:
    """RD$65.00 / 8 Oz → RD$8.13 por Oz (half-up sobre 812.5)."""
    got = display_unit_price(_dop(6500), _mass("0.226796185"), "8 Oz")

    assert got is not None
    assert got.amount_minor == 813
    assert got.label == "Oz"


def test_pina_colada_12_oz() -> None:
    """RD$140.00 / 12 Oz → RD$11.67 por Oz."""
    got = display_unit_price(_dop(14000), _mass("0.3401942775"), "12 Oz")

    assert got is not None
    assert got.amount_minor == 1167


# --------------------------------------------------------------------------------------
# El vocabulario GENERAL que pidió el usuario, con el defecto de la tabla del cliente corregido
# --------------------------------------------------------------------------------------


def test_el_galon_DIVIDE_no_multiplica() -> None:
    """EL DEFECTO DE LA TABLA DEL CLIENTE, que no se copia.

    `basket-product-card.tsx` traía `gal → baseUnit "Lt", baseAmount: 3.78541` con la fórmula
    `(precio / cantidad) * baseAmount`, o sea precio × 3.78541 — cuando un galón SON 3.78541 litros
    y hay que dividir. Un galón de RD$100.00 se pintaba «RD$378.54 X Lt» en vez de RD$26.42: 14× de
    error, y hacia arriba. Aquí el factor se DERIVA de la unidad base, así que no se puede invertir.
    """
    got = display_unit_price(
        _dop(10000), Quantity(Decimal("3.78541"), UnitMeasure.VOLUME), "1 Gal"
    )

    assert got is not None
    assert got.label == "Lt"
    assert got.amount_minor == 2642  # RD$26.42/L, no RD$378.54


def test_mililitros_van_por_100_ml() -> None:
    # RD$75.00 / 500 Ml → RD$15.00 por 100 Ml
    got = display_unit_price(_dop(7500), Quantity(Decimal("0.5"), UnitMeasure.VOLUME), "500 Ml")

    assert got == DisplayUnitPrice(1500, DOP, "100 Ml")


def test_libras_se_quedan_en_libras() -> None:
    """RD$450.00 / 5 Lb → RD$90.00 por Lb. Convertirlo a kg es lo que hacía el detalle."""
    got = display_unit_price(_dop(45000), _mass("2.26796185"), "5 Lb")

    assert got == DisplayUnitPrice(9000, DOP, "Lb")


def test_ingles_y_abreviaturas_dominicanas_dan_lo_mismo() -> None:
    """El catálogo mezcla idiomas y abreviaturas; el rótulo no puede depender de cuál llegó."""
    for texto in ("900 Gr", "900 gramos", "900 grams", "900 g", "900 GR."):
        got = display_unit_price(_dop(20500), _mass("0.9"), texto)
        assert got is not None, texto
        assert got.label == "100 Gr", texto
        assert got.amount_minor == 2278, texto


def test_multipack_reparte_entre_las_piezas() -> None:
    # RD$120.00 un paquete de 12 → RD$10.00 la pieza. La tarjeta no lo calculaba: para un
    # multipack, el precio por pieza es justo el dato que decide la compra.
    got = display_unit_price(_dop(12000), Quantity(Decimal("12"), UnitMeasure.COUNT), "12 Und")

    assert got == DisplayUnitPrice(1000, DOP, "Un")


# --------------------------------------------------------------------------------------
# Degradación: leer nunca puede reventar ni inventar
# --------------------------------------------------------------------------------------


def test_sin_tamano_declarado_cae_a_la_unidad_BASE() -> None:
    """Sin `display_size` no se sabe qué unidad usó el envase, pero el precio por kg sigue siendo
    cierto. Se degrada al comportamiento de hoy en vez de no enseñar nada."""
    got = display_unit_price(_dop(20500), _mass("0.9"), None)

    assert got is not None
    assert got.label == "Kg"
    assert got.amount_minor == 22778


def test_una_unidad_desconocida_no_inventa_rotulo() -> None:
    """Cae a la base, nunca al token crudo: rotular «X cucharada» sería afirmar una conversión que
    nadie hizo."""
    got = display_unit_price(_dop(20500), _mass("0.9"), "3 cucharadas")

    assert got is not None
    assert got.label == "Kg"


def test_una_unidad_de_OTRA_MAGNITUD_se_ignora() -> None:
    """EL DEFECTO QUE ESTO EVITA: si el tamaño dice «12 Oz» (masa) pero la cantidad guardada es de
    VOLUMEN —pasa con los refrescos, donde «oz» son onzas líquidas—, rotular «X Oz» sobre un número
    por litro daría un precio que no es ni lo uno ni lo otro. Ante el desacuerdo manda la magnitud
    de la CANTIDAD, que es la que se midió."""
    got = display_unit_price(_dop(14000), Quantity(Decimal("0.355"), UnitMeasure.VOLUME), "12 Oz")

    assert got is not None
    assert got.label == "Lt"


def test_cuando_el_envase_ES_una_unidad_no_se_repite_el_precio() -> None:
    """Una botella de 1 Lt a RD$100.00 daría «RD$100.00 X Lt» al lado de «RD$100.00»: el mismo
    número dos veces, que no es un dato sino ruido."""
    assert display_unit_price(_dop(10000), Quantity(Decimal("1"), UnitMeasure.VOLUME), "1 Lt") is None
    assert display_unit_price(_dop(20500), Quantity(Decimal("1"), UnitMeasure.COUNT), "Und") is None


def test_sin_cantidad_no_hay_nada_que_dividir() -> None:
    from src.contexts.save.domain.value_objects.display_units import display_unit_price_or_none

    assert display_unit_price_or_none(_dop(12500), None, "900 Gr") is None
