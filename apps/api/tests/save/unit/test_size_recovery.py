"""Unit — RECUPERAR el tamaño que sí está en el nombre, en vez de tolerar su ausencia.

Aflojar el modelo (canónico sin tamaño) fue correcto SOLO para lo que genuinamente no tiene
tamaño — un plato para perro. Medido sobre el corpus real, los otros dos grupos sí lo traen y lo
perdíamos por límites del parser:

  1. El marcador de conteo viaja DESNUDO en el nombre, sin número: `FRESAS SELECTAS UN`,
     `Plátano Maduro Und`. Se vende por unidad → es 1, no "sin tamaño".
  2. La MARCA se cuela entre el número y la unidad: `Arroz Jasmine 5 Goya Lbs`. El tamaño está
     completo; lo que falla es exigir que número y unidad sean adyacentes.
  3. `PQ` (paquete) no estaba en el mapa de unidades, así que `AVIVA GALLETAS INTEGRAL 9 PQ`
     perdía el tamaño — y son NUEVE, no uno.

La regla estricta manda SIEMPRE: las de recuperación solo corren cuando aquella no encuentra nada.
Medido sobre los 297 productos que ya tienen tamaño: cero discrepancias, o sea cero regresión.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from src.contexts.save.domain.value_objects import (
    Quantity,
    UnitMeasure,
    normalize_size_text,
    parse_size,
)
from src.contexts.save.infrastructure.catalog_sources.size_from_name import extract_size


class TestElMarcadorDesnudoEsUnaUnidad:
    """`UN` / `Und` sin número: el producto se vende por unidad, así que la cantidad es 1."""

    @pytest.mark.parametrize("text", ["UN", "Und", "und", "uds", "Unidad", "u"])
    def test_un_marcador_de_conteo_solo_vale_1_unidad(self, text: str) -> None:
        assert parse_size(text) == Quantity(Decimal("1"), UnitMeasure.COUNT)

    @pytest.mark.parametrize("text", ["Lb", "Kg", "Oz", "Ml", "Litro"])
    def test_una_unidad_de_MASA_o_VOLUMEN_desnuda_NO_se_inventa(self, text: str) -> None:
        # "1 Lb" sería un peso INVENTADO. Solo el conteo tiene un valor implícito honesto.
        with pytest.raises(ValueError):
            parse_size(text)

    def test_el_display_lo_muestra_con_su_numero(self) -> None:
        assert normalize_size_text("Und") == "1 Un"

    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("ARROYO FRIO FRESAS SELECTAS UN", "UN"),
            ("Plátano Maduro Und", "Und"),
            ("Plátano Verde, Und", "Und"),  # con coma, tal cual viene de Bravo
        ],
    )
    def test_se_extrae_del_final_del_nombre(self, name: str, expected: str) -> None:
        assert extract_size(name) == expected


class TestElPaqueteEsUnaUnidadDeConteo:
    @pytest.mark.parametrize(("text", "expected"), [("9 PQ", 9), ("6 Paq", 6), ("2 paquetes", 2)])
    def test_pq_cuenta_paquetes(self, text: str, expected: int) -> None:
        assert parse_size(text) == Quantity(Decimal(expected), UnitMeasure.COUNT)

    def test_nueve_paquetes_NO_es_uno(self) -> None:
        # El riesgo real: sin `pq` en el mapa, la regla estricta falla y el fallback del marcador
        # desnudo lo leería como 1 — perdiendo un factor de 9.
        assert extract_size("AVIVA GALLETAS INTEGRAL 9 PQ") == "9 PQ"
        assert parse_size("9 PQ").amount == Decimal("9")

    def test_el_display_lo_canoniza_a_Un(self) -> None:
        assert normalize_size_text("9 PQ") == "9 Un"


class TestLaMarcaEntreElNumeroYLaUnidad:
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Arroz Jasmine 5 Goya  Lbs", "5 Lbs"),  # doble espacio, tal cual viene de Sirena
            ("Arroz Jasmine 5 Goya Lbs", "5 Lbs"),
            ("Aceite 1 Crisol Litro", "1 Litro"),
            ("Habichuela 15 La Famosa Oz", "15 Oz"),
        ],
    )
    def test_recupera_el_numero_con_su_unidad_descartando_lo_del_medio(
        self, name: str, expected: str
    ) -> None:
        assert extract_size(name) == expected

    def test_el_hueco_tiene_limite(self) -> None:
        # Con media frase entre el número y la unidad ya no hay evidencia de que sean el mismo
        # tamaño — devolver algo sería adivinar.
        assert extract_size("Combo 3 Cajas De Regalo Para La Casa Lb") == ""


class TestLaReglaEstrictaSiempreGana:
    def test_un_nombre_con_tamano_adyacente_no_cambia(self) -> None:
        assert extract_size("ARROZ SELECTO 10 LB") == "10 LB"

    def test_ante_ambos_manda_el_adyacente(self) -> None:
        # "2 Sabores ... Lt" sería un hueco válido, pero "1 Lt" está adyacente y es el tamaño real.
        assert extract_size("Jugo 2 Sabores Naranja 1 Lt") == "1 Lt"


class TestNoSeInventaLoQueNoEsta:
    def test_el_articulo_un_no_es_un_tamano(self) -> None:
        # "un" en español es artículo. Solo cuenta como marcador AL FINAL del nombre.
        assert extract_size("UN BUEN CAFE MOLIDO PREMIUM") == ""

    def test_una_unidad_de_masa_desnuda_en_el_nombre_no_se_recupera(self) -> None:
        # "Queso ... , Lb" se vende POR libra, pero cuánto pesa el empaque no lo dice el nombre.
        assert extract_size("Queso Manchego Curado Plata Don Bernardo, Lb") == ""

    def test_lo_que_de_verdad_no_tiene_tamano_sigue_sin_tenerlo(self) -> None:
        # El grupo 3 — el que justificó aflojar el modelo — no se toca.
        assert extract_size("Plato Para Perro Inoxidable Paws Premium") == ""
