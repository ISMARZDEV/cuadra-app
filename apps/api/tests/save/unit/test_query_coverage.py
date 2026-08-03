"""Unit — ¿el candidato cubre lo que el usuario REALMENTE escribió? DOMINIO PURO.

El defecto que cierra (medido 2026-08-02): «arroz Rica» devolvía **Galleta Arroz Ricecrisps Sesamo
100G**, y con los enlaces de tienda encendidos eso pasó a ser un botón para COMPRAR el producto
equivocado. No existe «arroz Rica»: Rica es marca de lácteos; los arroces del catálogo son Campos,
Pimco, Bisonó, Goya.

## Por qué un umbral NO servía (medido, no supuesto)

La similitud trigram es de CADENA COMPLETA, así que un acierto fuerte en un token TAPA un fallo
total en otro. Los scores reales:

| consulta | top-1 | ¿correcto? |
|---|---:|---|
| `arroz Rica` → Galleta Arroz Ricecrisps | **0.818** | ❌ |
| `café Santo Domingo` → Café Molido Santo Domingo | 0.737 | ✅ |
| `arroz campos 20 lb` → Arroz Campos Premium 20 Lb | 0.704 | ✅ |
| `leche Rica` → Leche Entera Rica 1 Lt | 0.611 | ✅ |

**El mal match está MÁS ARRIBA que tres buenos.** Subir el piso mata primero los verdaderos
positivos. Es la doctrina de discriminación: hace falta una señal INDEPENDIENTE, no un número más
grande. Acá esa señal es estructural — ¿aparece cada token significativo del usuario en el nombre
o la marca del candidato?

## Dónde se aplica, y dónde no

En RESOLVER (elegir UN producto), no en BUSCAR (listar candidatos). El costo del falso positivo no
es simétrico: en la búsqueda un resultado de más es inofensivo y conviene ser generoso; al resolver,
el producto equivocado es una mentira con un botón de compra debajo.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.query_coverage import covers_query


class TestElCasoQueLoOrigino:
    def test_arroz_Rica_does_NOT_cover_a_rice_cracker(self) -> None:
        assert not covers_query("arroz Rica", "Galleta Arroz Ricecrisps Sesamo Neg 100G")

    def test_but_leche_Rica_DOES_cover_the_dairy_brand(self) -> None:
        # Mismo token «Rica», resultado opuesto — porque acá SÍ está la palabra.
        assert covers_query("leche Rica", "Leche Entera Rica 1 Lt")


class TestCoberturaDeTokens:
    @pytest.mark.parametrize(
        ("query", "candidate"),
        [
            ("arroz Campos", "Arroz Campos Premium Saco 30 Lb"),
            ("arroz campos 20 lb", "Arroz Campos Premium 20 Lb"),
            ("café Santo Domingo", "Café Molido Santo Domingo 1 Lb"),
            ("aceite Mazola", "Aceite Vegetal Mazola 48 Oz"),
            ("pañales Pampers", "Pañales Pampers Baby Dry Etapa 3 44 Un"),
            ("aceite", "Aceite Vegetal Crisol 1 Gl"),
        ],
    )
    def test_a_real_match_is_covered(self, query: str, candidate: str) -> None:
        assert covers_query(query, candidate)

    @pytest.mark.parametrize(
        ("query", "candidate"),
        [
            ("leche Zzqwx", "Leche Evaporada Carnation 12 Oz"),
            ("arroz Bisono", "Arroz Campos Premium 20 Lb"),
            ("café Bustelo", "Café Molido Santo Domingo 1 Lb"),
        ],
    )
    def test_a_brand_the_candidate_does_not_have_is_NOT_covered(
        self, query: str, candidate: str
    ) -> None:
        assert not covers_query(query, candidate)


class TestLoQueNoDebeRomper:
    def test_a_typo_still_covers(self) -> None:
        """«arros» es el caso que justifica la búsqueda híbrida: no puede morir acá."""
        assert covers_query("arros", "Arroz Pimco Premium 10 Lbs")

    def test_accents_do_not_decide(self) -> None:
        assert covers_query("cafe santo domingo", "Café Molido Santo Domingo 1 Lb")
        assert covers_query("PAÑALES pampers", "Pañales Pampers Baby Dry 44 Un")

    def test_filler_words_are_not_required(self) -> None:
        # «de» y «para» no discriminan nada: exigirlos rechazaría matches buenos.
        assert covers_query("aceite de oliva", "Aceite Oliva Carbonell 500 Ml")

    def test_an_empty_query_covers_anything(self) -> None:
        # Sin tokens no hay nada que exigir; el gate no debe inventar un rechazo.
        assert covers_query("   ", "Arroz Campos Premium 20 Lb")

    def test_the_brand_counts_as_covering_text(self) -> None:
        # La marca suele NO estar en el nombre. Si el gate mira sólo el nombre, rechaza de más.
        assert covers_query("arroz Bisono", "Arroz Selecto Enriquecido 20 Lbs Bisono")
