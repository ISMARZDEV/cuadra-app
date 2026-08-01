"""Unit — quality gate de la cascada de matching (PURO). Ver `infrastructure/matching/cascade/
quality_gate.py`.

Medido 2026-08-01 sobre la primera corrida real con catálogo poblado: de 61 auto-enlaces, CINCO
canónicos habían absorbido SKUs distintos de la MISMA tienda — la firma de un falso merge, porque
una tienda no vende el mismo producto dos veces con nombres distintos. El peor:
`Arroz Pimco Selecto 10 Lbs` se comió TRES líneas (Premium, Selecto, Super Selecto Gourmet).

Y ocurrían hasta en confianza **1.000**: esta clase de error es, por construcción, misma marca +
mismo tamaño + misma categoría, así que los tres boosts la empujan al tope. Subir el piso no la
ataja; sólo una señal dura.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.quality_gate import qualities_conflict


class TestLosCasosRealesMedidos:
    def test_premium_contra_selecto(self) -> None:
        assert qualities_conflict("Arroz Premium Pimco Funda 10 Lb", "Arroz Pimco Selecto 10 Lbs")

    def test_super_selecto_contra_selecto(self) -> None:
        """`Super Selecto` NO es `Selecto`: gana la línea MÁS LARGA. Con match por token suelto
        los dos darían {selecto} y el gate no vería nada."""
        assert qualities_conflict("Arroz Super Selecto Pimco 5 Lb", "Arroz Pimco Selecto 5 Lbs")

    def test_super_selecto_gourmet_contra_selecto(self) -> None:
        assert qualities_conflict(
            "Arroz Super Selecto Pimco Gourmet 10 Lb", "Arroz Pimco Selecto 10 Lbs"
        )

    def test_el_enlace_CORRECTO_de_ese_mismo_canonico_sigue_pasando(self) -> None:
        # Contraparte obligatoria: de los 3 SKUs que se fusionaron, éste era el bueno.
        assert not qualities_conflict("Arroz Selecto Pimco 10 Lb", "Arroz Pimco Selecto 10 Lbs")


class TestContratoConservador:
    def test_un_solo_lado_con_linea_no_bloquea(self) -> None:
        # Sin contradicción POSITIVA no se bloquea — mismo criterio que el variant gate.
        assert not qualities_conflict("Arroz La Garza 10 Lb", "Arroz Premium La Garza 10 Lb")

    def test_ninguno_con_linea_no_bloquea(self) -> None:
        assert not qualities_conflict("LA GARZA ARROZ 10 LB", "Arroz La Garza 10 Lbs")

    def test_misma_linea_no_bloquea(self) -> None:
        assert not qualities_conflict("Arroz Premium Campos 5 Lb", "Arroz La Garza Premium 5 Lbs")

    def test_es_insensible_a_caja_y_acentos(self) -> None:
        assert qualities_conflict("ARROZ PREMIUM PIMCO", "arroz selecto pimco")


class TestLaCalidadCuradaDelCanonicoManda:
    def test_usa_el_campo_quality_cuando_esta(self) -> None:
        """`CanonicalProduct.quality` es curación del operador. Si está, gana sobre lo que se pueda
        leer del nombre — un canónico puede llamarse "Arroz Pimco 10 Lb" y ser la línea Premium."""
        assert qualities_conflict(
            "Arroz Selecto Pimco 10 Lb", "Arroz Pimco 10 Lb", canonical_quality="Premium"
        )

    def test_sin_campo_cae_al_nombre_del_canonico(self) -> None:
        assert qualities_conflict(
            "Arroz Selecto Pimco 10 Lb", "Arroz Premium Pimco 10 Lb", canonical_quality=None
        )

    def test_un_quality_vacio_no_cuenta_como_linea(self) -> None:
        assert not qualities_conflict(
            "Arroz Selecto Pimco 10 Lb", "Arroz Pimco 10 Lb", canonical_quality="  "
        )


class TestNoConfundePalabrasQueContienenUnaLinea:
    def test_match_por_palabra_completa(self) -> None:
        # "Extraordinario" contiene "extra" pero no es la línea Extra.
        assert not qualities_conflict("Arroz Extraordinario Pimco", "Arroz Premium Pimco")
