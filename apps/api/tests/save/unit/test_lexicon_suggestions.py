"""Unit — sugerencias de categoría a partir del léxico (F5, US-CP-D2c).

`lexicon_match` responde UNA hoja o `None`: es un clasificador, decide. Para SUGERIR hace falta lo
contrario — exponer los candidatos rankeados con su evidencia para que decida un humano. Por eso
esto es una función aparte y no un cambio de `lexicon_match`: son dos preguntas distintas sobre el
mismo índice.

Reglas del clasificador que estas sugerencias RESPETAN (SDD §5, US-CP-D2c):
- Nunca inventa: sin tokens que peguen, no hay sugerencias (el árbol completo es el fallback).
- Cada sugerencia trae su señal de origen — el operador ve POR QUÉ se le propone algo.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.classification.lexicon import (
    build_lexicon_index,
    lexicon_suggestions,
)

LEAVES = [
    ("leaf-arroz", "Arroz"),
    ("leaf-habichuela", "Habichuelas"),
    ("leaf-aceite", "Aceites y Vinagres"),
    ("leaf-leche", "Leche"),
]
INDEX = build_lexicon_index(LEAVES)


class TestLexiconSuggestions:
    def test_a_name_that_hits_a_leaf_suggests_it(self) -> None:
        result = lexicon_suggestions("Arroz Selecto Bisono 10 Lb", INDEX)

        assert [s.taxonomy_node_id for s in result] == ["leaf-arroz"]

    def test_every_suggestion_carries_its_signal(self) -> None:
        """US-CP-D2c: "cada sugerencia muestra su señal de origen — decisión informada, no caja
        negra"."""
        result = lexicon_suggestions("Arroz Bisono", INDEX)

        assert result[0].signal == "lexicon"
        assert result[0].matched_tokens == ["arroz"]

    def test_a_name_with_no_hits_suggests_NOTHING(self) -> None:
        """La regla sagrada del clasificador: ante duda, no inventar. Sin evidencia léxica el
        operador usa el árbol completo, que para eso está."""
        assert lexicon_suggestions("Producto Rarísimo Sin Tokens", INDEX) == []

    def test_it_ranks_by_how_many_tokens_matched(self) -> None:
        # "Aceites y Vinagres" aporta 2 tokens (aceites, vinagres); Arroz sólo 1.
        result = lexicon_suggestions("Aceites Vinagres Arroz", INDEX)

        assert result[0].taxonomy_node_id == "leaf-aceite"
        assert result[0].matched_tokens == ["aceites", "vinagres"]
        assert result[1].taxonomy_node_id == "leaf-arroz"

    def test_it_caps_the_number_of_suggestions(self) -> None:
        """El SDD pide top 3-5: una lista larga deja de ser una sugerencia y vuelve a ser el árbol."""
        result = lexicon_suggestions("Arroz Habichuelas Aceites Leche", INDEX, limit=2)

        assert len(result) == 2

    def test_the_brand_also_feeds_the_suggestion(self) -> None:
        """La marca a veces trae el token útil ("Leche Rica"), y descartarla perdería la señal."""
        result = lexicon_suggestions("Rica Entera", INDEX, brand="Leche Rica")

        assert [s.taxonomy_node_id for s in result] == ["leaf-leche"]

    def test_an_ambiguous_token_never_reaches_the_suggestions(self) -> None:
        """`build_lexicon_index` ya descarta el token que apunta a >1 hoja. Sugerir con un token
        ambiguo sería proponer a ciegas, que es lo que el índice existe para evitar."""
        ambiguous = build_lexicon_index([("a", "Salsa Tomate"), ("b", "Salsa Picante")])

        assert lexicon_suggestions("Salsa cualquiera", ambiguous) == []

    def test_case_and_accents_do_not_matter(self) -> None:
        assert lexicon_suggestions("ARRÓZ blanco", INDEX)[0].taxonomy_node_id == "leaf-arroz"

    def test_singular_does_NOT_match_a_plural_leaf(self) -> None:
        """Límite CONOCIDO del léxico, no un bug: matchea tokens exactos, sin stemming. "Aceite"
        no pega con la hoja "Aceites y Vinagres".

        No se corrige acá a propósito: `lexicon_match` comparte este índice y su precisión está
        MEDIDA sobre la cola real. Ablandar el matcheo para mejorar las sugerencias cambiaría el
        comportamiento del clasificador que ya corre en producción. Sin sugerencia, el operador
        cae al árbol completo — que es exactamente el fallback previsto.
        """
        assert lexicon_suggestions("Aceite de Oliva", INDEX) == []

    def test_the_same_token_twice_does_not_inflate_the_rank(self) -> None:
        """"Arroz Arroz Arroz" no es más "arroz" que "Arroz": contar repeticiones haría ganar a un
        nombre redundante sobre uno que realmente pega en dos conceptos distintos."""
        one = lexicon_suggestions("Aceites Vinagres", INDEX)[0]
        spam = lexicon_suggestions("Arroz Arroz Arroz Arroz", INDEX)[0]

        assert len(one.matched_tokens) == 2
        assert len(spam.matched_tokens) == 1
