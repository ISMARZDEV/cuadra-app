"""Sugerencias de escritura para el carrusel del chat (nivel T2 de su cascada).

El cliente resuelve primero lo que puede sin gastar un token:

    T0  el historial del propio usuario        0 tokens · 0 ms
    T1  el catálogo de Save por pg_trgm        0 tokens · ~150 ms
    T2  ESTE módulo                            ~200 tokens · ~600 ms

T1 cubre todo lo que es un PRODUCTO: «guan» → «Guandules Verdes Goya» sale de `word_similarity`,
sin modelo. T2 existe sólo para lo que el catálogo no puede ver por definición — «cuánto gasté
este mes» no es un producto de supermercado, es una pregunta sobre las finanzas del usuario.

Misma forma que `flows/expense/categories.py`, que es el precedente de un consumidor de LLM que no
es un agente: una función, salida estructurada, y **degradación silenciosa**. No hay puerto nuevo:
`get_chat_model` YA es el puerto del modelo (§7.8).
"""
from __future__ import annotations

from typing import cast

from pydantic import BaseModel, Field

from src.shared.llm import get_chat_model

# Cuántas sugerencias caben en el carrusel sin obligar a un swipe para ver la tercera.
_MAX = 3

# Por debajo de esto el borrador no discrimina nada y la llamada sería ruido pago. El cliente ya
# tiene su catálogo estático para cubrir ese momento.
_MIN_DRAFT = 3

# Patrón `cuadra-agent-prompts`: las INSTRUCCIONES en inglés (mejor adherencia y más baratas), el
# TEXTO QUE VE EL USUARIO en su idioma, inyectado como valor concreto y no como una regla vaga.
#
# «Complete, don't answer» es la línea que carga el peso: sin ella el modelo responde la pregunta
# del usuario en vez de terminársela de escribir, y el carrusel se llena de respuestas en lugar de
# prompts que se puedan enviar.
_PROMPT = """The user is typing a message to a personal-finance assistant and has written so far:
"{draft}"

Complete it into {max} SHORT, natural questions they might be about to send. Complete — do NOT
answer. Each one MUST be a message the user could send as-is, written in {language}, under 60
characters, and DISTINCT from the others. Rank them most-likely first.

The assistant can talk about spending, income, budgets, savings and supermarket prices."""

_LANG = {"es": "Spanish", "en": "English", "pt": "Portuguese"}


class _Prompts(BaseModel):
    items: list[str] = Field(description="the completed messages, in the user's language")


def suggest_prompts(draft: str, lang: str) -> list[str]:
    """Hasta `_MAX` formas de terminar lo que el usuario está escribiendo.

    Devuelve `[]` —nunca lanza— si el borrador es demasiado corto para significar algo o si el
    modelo falla: son una COMODIDAD, y el cliente se queda con su catálogo estático. Un chat que se
    cae porque no pudo sugerir sería un pésimo negocio.
    """
    text = draft.strip()
    if len(text) < _MIN_DRAFT:
        return []

    language = _LANG.get(lang[:2].lower(), "Spanish")
    try:
        model = get_chat_model("fast").with_structured_output(_Prompts)
        # `with_structured_output` está tipado como `dict | BaseModel` porque acepta cualquier
        # esquema; el cast recupera el que ACABAMOS de pasarle dos líneas arriba. No es aflojar el
        # tipo: es afirmar lo único que ese Runnable puede devolver. (El precedente,
        # `flows/expense/categories.py`, resolvió esto quedándose en el backlog de mypy — sumar un
        # archivo nuevo ahí sería empeorar el trinquete que ese backlog existe para frenar.)
        result = cast(_Prompts, model.invoke(_PROMPT.format(draft=text, max=_MAX, language=language)))
    except Exception:  # noqa: BLE001 — ver el docstring: degradar en silencio es el contrato
        return []

    out: list[str] = []
    for item in result.items:
        candidate = item.strip()
        # Sin duplicados: dos píldoras con el mismo texto son una píldora y un hueco desperdiciado.
        if candidate and candidate not in out:
            out.append(candidate)
    return out[:_MAX]
