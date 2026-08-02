"""Unit — brand gate de la cascada de matching (PURO). Ver `infrastructure/matching/cascade/
brand_gate.py`.

El falso positivo medido 2026-07-21 (aispace-men #822): `ARROZ SELECTO 10 LB` de Bravo auto-linkeó
a `Arroz Selecto Wala 10 Lb` en 0.850. Bravo no declara marca y su nombre no nombra a Wala por
ningún lado — o sea, CERO evidencia de que ese arroz sea Wala, pero el parecido del nombre alcanzó
para mergearlo dentro de un canónico de marca.

Este gate tiene un contrato distinto al de los otros cuatro (size/category/ean/variant): esos
bloquean ante CONTRADICCIÓN positiva, éste bloquea ante AUSENCIA de evidencia. La asimetría es
deliberada — ver el docstring del módulo.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.cascade.brand_gate import brand_unsupported


class TestBloqueaCuandoNoHayEvidenciaDeMarca:
    def test_el_caso_real_arroz_selecto_sin_marca_contra_un_canonico_wala(self) -> None:
        assert brand_unsupported("", "ARROZ SELECTO 10 LB", "Wala")

    def test_marca_declarada_DISTINTA_a_la_del_canonico(self) -> None:
        # Contradicción positiva: la clase que el gate cubre "de rebote", y la más peligrosa.
        assert brand_unsupported("Campo", "Arroz Campo 10 Lb", "Wala")


class TestNoBloqueaCuandoElStoreCorroboraLaMarca:
    def test_la_marca_viene_en_el_campo_marca(self) -> None:
        # Sirena/VTEX sí publica marca — el camino normal no debe cambiar en nada.
        assert not brand_unsupported("La Famosa", "Habichuelas Negras 15 Oz", "La Famosa")

    def test_la_marca_viene_en_el_NOMBRE_aunque_el_campo_este_vacio(self) -> None:
        # Bravo no declara marca pero la escribe primero. Éste es uno de los 11 matches BUENOS de
        # la corrida medida: el gate no puede romperlo.
        assert not brand_unsupported("", "LA FAMOSA HABICHUELAS NEGRAS 15 OZ", "La Famosa")

    def test_la_marca_en_el_medio_del_nombre_como_la_escribe_nacional(self) -> None:
        assert not brand_unsupported("", "Arroz Enriquecido La Garza 5 Lb", "La Garza")

    def test_el_campo_marca_trae_la_razon_social_completa(self) -> None:
        # "LA FAMOSA, C. POR A." contiene la secuencia "LA FAMOSA" → corrobora igual.
        assert not brand_unsupported("LA FAMOSA, C. POR A.", "Habichuelas Negras", "La Famosa")

    def test_ignora_acentos_y_mayusculas(self) -> None:
        assert not brand_unsupported("lider", "ARROZ 5 LB", "LÍDER")


class TestNoBloqueaCuandoNoHayNadaQueCorroborar:
    def test_canonico_SIN_marca_nunca_dispara_el_gate(self) -> None:
        # Genéricos (produce suelto, pan de la casa): no hay marca que exigir → no bloquea.
        assert not brand_unsupported("", "PLATANO BARAHONERO UNIDAD", "")

    def test_canonico_con_marca_None_nunca_dispara(self) -> None:
        assert not brand_unsupported("Campo", "Arroz Campo 10 Lb", None)

    def test_canonico_con_marca_en_blanco_nunca_dispara(self) -> None:
        assert not brand_unsupported("", "ARROZ SELECTO 10 LB", "   ")


class TestNoConfundeMarcasQueSeContienen:
    def test_famosa_no_corrobora_a_la_famosa(self) -> None:
        # Son marcas DISTINTAS; quedarse con la secuencia corta cambiaría el producto de marca.
        assert brand_unsupported("", "FAMOSA ARROZ 5 LB", "La Famosa")

    def test_goyana_no_corrobora_a_goya(self) -> None:
        assert brand_unsupported("", "GOYANA ARROZ 5 LB", "Goya")
