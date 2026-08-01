"""Unit — tamaños escritos como FRACCIÓN ("1/2 LB").

El parser se quedaba con el DENOMINADOR: `"ALBAHACA VERDE 1/2 LB"` se guardaba como `2 Lb` y
`"QUESO 1/4 LB"` como `4 Lb` — 4× y 16× de error, y en la dirección peor (media libra pasaba a dos).

No es cosmético: Save existe para comparar precios por producto, así que un tamaño 4× mal hace que
la comparación mienta. Además envenena el `size_gate` del matching, que usa el tamaño para decidir
si dos productos son el mismo: puede bloquear un match legítimo o permitir uno falso contra un
producto que de verdad pesa 2 Lb.

En RD el fresco se vende así (albahaca, ají, queso), o sea que crece con la cobertura.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.domain.value_objects import (
    UnitMeasure,
    normalize_size_text,
    parse_size,
)
from src.contexts.save.infrastructure.catalog_sources.size_from_name import extract_size


class TestLaFraccionSeLeeComoFraccion:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("1/2 LB", Decimal("0.5") * Decimal("0.45359237")),
            ("1/4 Lb", Decimal("0.25") * Decimal("0.45359237")),
            ("3/4 Kg", Decimal("0.75")),
            ("1/2 Litro", Decimal("0.5")),
        ],
    )
    def test_convierte_a_unidad_base_usando_el_valor_de_la_fraccion(self, text, expected) -> None:  # type: ignore[no-untyped-def]
        assert parse_size(text).amount == expected

    def test_media_libra_NO_es_dos_libras(self) -> None:
        """El bug exacto: quedarse con el denominador multiplicaba por 4."""
        assert parse_size("1/2 LB").amount < parse_size("1 LB").amount

    def test_una_fraccion_impropia_es_valida(self) -> None:
        """`PLATANO VERDE EN MALLA UN 6/1` — 6/1 son 6 unidades, no 1."""
        quantity = parse_size("6/1 Un")
        assert quantity.amount == Decimal("6")
        assert quantity.measure is UnitMeasure.COUNT


class TestElDisplayMuestraElValorReal:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [("1/2 LB", "0.5 Lb"), ("1/4 Lb", "0.25 Lb"), ("3/4 Kg", "0.75 Kg")],
    )
    def test_la_fraccion_se_canoniza_a_decimal(self, text, expected) -> None:  # type: ignore[no-untyped-def]
        # Decimal y no "1/2 Lb": el resto del display ya es decimal (`_clean_amount` convierte
        # "1,5" → "1.5"), y mezclar las dos notaciones haría la columna incomparable de un vistazo.
        assert normalize_size_text(text) == expected


class TestNoSeInventaUnTamanoDondeNoLoHay:
    @pytest.mark.parametrize("text", ["24/7", "1/2", "1/0 Lb", "0/5 Lb"])
    def test_lo_que_no_es_un_tamano_valido_se_rechaza(self, text) -> None:  # type: ignore[no-untyped-def]
        # sin unidad conocida, o con un denominador que no define una cantidad
        with pytest.raises(ValueError):
            parse_size(text)

    def test_normalize_devuelve_el_texto_TAL_CUAL_si_no_lo_entiende(self) -> None:
        assert normalize_size_text("24/7") == "24/7"

    def test_el_multipack_sigue_funcionando(self) -> None:
        assert parse_size("6x350 Ml").amount == Decimal("2.1")


class TestExtraccionDesdeElNombre:
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("ALBAHACA VERDE 1/2 LB", "1/2 LB"),
            ("AJI CUBANELA 1/2 LB", "1/2 LB"),
            ("QUESO GOUDA 1/4 LB", "1/4 LB"),
            ("ARROZ SELECTO 10 LB", "10 LB"),  # sin fracción, igual que antes
        ],
    )
    def test_captura_la_fraccion_ENTERA_no_solo_el_denominador(self, name, expected) -> None:  # type: ignore[no-untyped-def]
        assert extract_size(name) == expected

    def test_un_nombre_sin_tamano_sigue_devolviendo_vacio(self) -> None:
        assert extract_size("BACALAO NORUEGO SELECTO C/ESPINA") == ""
