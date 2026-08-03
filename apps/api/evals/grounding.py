"""Verificador de FIDELIDAD determinista: ¿cada cifra de la respuesta salió de una tool?

§12.3 lo llama el test más importante del proyecto y no exagera: un precio inventado en una app de
finanzas no es un bug cosmético, es la destrucción de la confianza que constituye el producto
(riesgo #4 de §13).

**Por qué determinista y no RAGAS.** El propio §12.3 observa que acá el contexto es *literal, no
recuperado*: es el output crudo de las tools, no pasajes semánticos. Cuando el contexto es literal,
«¿está este número en el contexto?» deja de ser una pregunta de semántica y pasa a ser una de
subcadena. Un juez LLM contestaría con un 0.87 sobre la pregunta equivocada, costaría dinero y
tardaría; esto devuelve **la lista exacta de lo que el modelo se inventó**, gratis, sin red, y
puede correr en CI.

**Lo que NO cubre, y hay que decirlo:** afirmaciones cualitativas mal encuadradas —«es la mejor
opción», «te conviene»— quedan fuera. Detectar eso sí necesita un juez. Este módulo ataca el modo
de fallo del precio inventado, que es el caro, no todos los modos de fallo.

La regla que hace esto posible es §5.5: **cada número viaja de Postgres a la tool a la respuesta sin
que el modelo lo toque.** Si esa regla se cumple, la intersección debe ser total. Cuando este
verificador marca algo, o el modelo calculó, o una tool cambió de formato — las dos cosas hay que
saberlas.
"""
from __future__ import annotations

import re

# Una cifra es de DINERO si la acompaña una marca de moneda, o si trae céntimos. Un número pelado
# NO discrimina: «24 artículos» y «RD$24.00» no son la misma clase de cosa, y marcar todo número
# llenaría el gate de falsos positivos hasta volverlo ruido. Es la doctrina de discriminación:
# el número PROPONE, la marca de moneda (o el céntimo) DISPONE.
_WITH_MARKER = re.compile(r"(?:RD\$|DOP|US\$|\$)\s*(\d[\d,.]*)", re.IGNORECASE)
_WITH_CENTS = re.compile(r"(?<![\d.,])(\d[\d,]*\.\d{2})(?!\d)")

_URL = re.compile(r"https?://[^\s,;)\]]+")


def _normalize(raw: str) -> str:
    """`10,000.00` y `10000.00` son el MISMO número; sin normalizar, el gate mentiría."""
    cleaned = raw.replace(",", "").rstrip(".")
    if "." not in cleaned:
        cleaned = f"{cleaned}.00"
    return cleaned


def money_claims(text: str) -> set[str]:
    """Las cifras de dinero que aparecen en `text`, normalizadas."""
    found = {m.group(1) for m in _WITH_MARKER.finditer(text)}
    found |= {m.group(1) for m in _WITH_CENTS.finditer(text)}
    return {_normalize(raw) for raw in found}


def url_claims(text: str) -> set[str]:
    return set(_URL.findall(text))


def unsupported_claims(answer: str, tool_outputs: list[str]) -> list[str]:
    """Lo que la respuesta afirma y NINGUNA tool respalda. Lista vacía = respuesta fiel.

    Devuelve TODO lo que encuentra, no el primero: un gate que corta al primer fallo obliga a N
    corridas para ver N problemas, y cada corrida cuesta una llamada al LLM.
    """
    context = "\n".join(tool_outputs)
    supported_money = money_claims(context)
    supported_urls = url_claims(context)

    unsupported = [c for c in sorted(money_claims(answer)) if c not in supported_money]
    unsupported += [u for u in sorted(url_claims(answer)) if u not in supported_urls]
    return unsupported
