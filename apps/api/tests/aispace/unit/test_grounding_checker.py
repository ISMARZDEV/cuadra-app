"""Unit — el verificador de fidelidad: ¿cada número de la respuesta salió de una tool?

§12.3 llama a esto «el test más importante del proyecto», y tiene razón: un precio inventado en una
app de finanzas no es un bug cosmético, es la destrucción de la confianza que constituye el producto.

Por qué es DETERMINISTA y no un juez LLM (RAGAS): el propio §12.3 dice que acá el contexto es
**literal, no recuperado** — el output crudo de las tools. Cuando el contexto es literal, «¿está este
número en el contexto?» es una pregunta de subcadena, no de semántica. Un juez LLM devolvería un
0.87 sobre la pregunta equivocada; esto devuelve la LISTA EXACTA de lo que el modelo se inventó, sin
costo, sin red y en CI.

Lo que NO cubre, dicho explícitamente: afirmaciones cualitativas mal encuadradas («es la mejor
opción») quedan fuera de su alcance — eso sí necesita un juez. Este verificador ataca el modo de
fallo #4 de §13, no todos.
"""
from __future__ import annotations

from evals.grounding import money_claims, unsupported_claims


class TestQueCuentaComoUnaCifraDeDINERO:
    """Un número pelado NO discrimina: «3 tiendas» y «RD$3.00» no son la misma clase de cosa.

    Es la doctrina de discriminación otra vez. Sin una señal de moneda o de céntimos, marcar todo
    número produciría falsos positivos en cada «20 artículos» y el gate se volvería ruido.
    """

    def test_a_number_with_a_currency_marker_is_money(self) -> None:
        assert money_claims("cuesta RD$175.75 en Bravo") == {"175.75"}

    def test_two_decimals_are_money_even_without_the_marker(self) -> None:
        assert money_claims("el total dio 1250.00") == {"1250.00"}

    def test_a_bare_count_is_NOT_money(self) -> None:
        assert money_claims("te alcanza para 24 artículos en 3 tiendas") == set()

    def test_thousand_separators_are_normalized(self) -> None:
        # La tool emite `DOP 10,000.00` y el modelo suele escribir `RD$10,000`. Es el MISMO número.
        assert money_claims("RD$10,000.00") == money_claims("DOP 10000.00")


class TestLoQueElModeloSeInvento:
    def test_a_price_that_came_from_a_tool_is_supported(self) -> None:
        answer = "El arroz Campos está a RD$175.75 en Nacional."
        tools = ["store=Nacional | price=DOP 175.75 | captured=2026-08-02"]

        assert unsupported_claims(answer, tools) == []

    def test_a_price_NOBODY_returned_is_flagged(self) -> None:
        # El fallo que destruye el producto: un precio verosímil que ninguna tool devolvió.
        answer = "El arroz Campos está a RD$180.00 en Nacional."
        tools = ["store=Nacional | price=DOP 175.75 | captured=2026-08-02"]

        assert unsupported_claims(answer, tools) == ["180.00"]

    def test_a_rounded_price_is_flagged_because_rounding_IS_inventing(self) -> None:
        """«RD$176» en vez de RD$175.75 suena inofensivo y no lo es: el LLM calculó."""
        answer = "sale como RD$176.00"
        tools = ["price=DOP 175.75"]

        assert unsupported_claims(answer, tools) == ["176.00"]

    def test_a_url_the_tools_never_returned_is_flagged(self) -> None:
        answer = "Mirá acá: https://nacional.com.do/arroz-campos"
        tools = ["store=Nacional | url=https://nacional.com.do/p/12345"]

        assert unsupported_claims(answer, tools) == ["https://nacional.com.do/arroz-campos"]

    def test_a_url_that_came_from_a_tool_is_supported(self) -> None:
        answer = "Comprá en https://nacional.com.do/p/12345"
        tools = ["url=https://nacional.com.do/p/12345"]

        assert unsupported_claims(answer, tools) == []

    def test_it_reports_EVERY_invention_not_just_the_first(self) -> None:
        # Un gate que se detiene en el primero obliga a N corridas para ver N problemas.
        answer = "RD$180.00 en Bravo y RD$210.00 en Sirena"
        tools = ["price=DOP 175.75", "price=DOP 199.80"]

        assert unsupported_claims(answer, tools) == ["180.00", "210.00"]

    def test_an_answer_with_no_numbers_at_all_is_trivially_supported(self) -> None:
        # «No tengo ese producto en el catálogo» es la respuesta HONESTA de §8.1: no debe fallar.
        assert unsupported_claims("No tengo ese producto en el catálogo.", []) == []
