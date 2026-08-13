"""Unit — el endpoint de sugerencias de escritura (`POST /aispace/suggest`).

Es el nivel T2 del carrusel del chat, y la parte cara: cada llamada gasta tokens. Lo que se prueba
acá es el CONTRATO del borde — que el idioma que llega es el que el usuario eligió, y que el
handler nunca convierte un fallo del modelo en un error para el cliente.
"""
from __future__ import annotations

from unittest.mock import patch

from src.api.v1.controllers.aispace import SuggestRequest, SuggestResponse, post_suggest


def _call(body: SuggestRequest, returns: list[str]) -> SuggestResponse:
    with patch(
        "src.api.v1.controllers.aispace.suggest_prompts", return_value=returns
    ) as suggest:
        response = post_suggest(body, user_id="u1")
    _call.last = suggest  # type: ignore[attr-defined]
    return response


def test_returns_the_suggestions_for_the_draft() -> None:
    response = _call(SuggestRequest(draft="cuanto gaste", locale="es"), ["¿Cuánto gasté este mes?"])

    assert response.suggestions == ["¿Cuánto gasté este mes?"]


# El idioma sale del LOCALE QUE ELIGIÓ el usuario, no de detectarlo sobre el borrador. Un fragmento
# a medio escribir («cuanto gast») es pésima evidencia para un detector de idioma, y estas píldoras
# se leen junto al resto del chrome ya localizado — mismo criterio que `ui_language` en el chat.
def test_uses_the_locale_the_user_chose_rather_than_sniffing_the_draft() -> None:
    _call(SuggestRequest(draft="how much did i", locale="en"), [])

    assert _call.last.call_args.args[1] == "en"  # type: ignore[attr-defined]


def test_an_unsupported_locale_falls_back_instead_of_failing() -> None:
    _call(SuggestRequest(draft="cuanto gaste", locale="kl"), [])

    assert _call.last.call_args.args[1] == "es"  # type: ignore[attr-defined]


def test_a_missing_locale_falls_back_too() -> None:
    _call(SuggestRequest(draft="cuanto gaste", locale=None), [])

    assert _call.last.call_args.args[1] == "es"  # type: ignore[attr-defined]


# Sin sugerencias NO es un error: el cliente ya tiene su catálogo estático. Devolver 500 acá
# rompería el chat por no haber podido ofrecer una comodidad.
def test_no_suggestions_is_an_empty_list_not_a_failure() -> None:
    response = _call(SuggestRequest(draft="xyz", locale="es"), [])

    assert response.suggestions == []
