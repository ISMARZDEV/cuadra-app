"""¿El candidato cubre lo que el usuario REALMENTE escribió? DOMINIO PURO.

Nace de un fallo concreto (2026-08-02): «arroz Rica» resolvía a **Galleta Arroz Ricecrisps Sesamo
100G** — y con los enlaces de tienda encendidos, eso dejó de ser una respuesta fea para volverse un
botón que invita a COMPRAR el producto equivocado. No existe «arroz Rica»: Rica es marca de
lácteos, y los arroces del catálogo son Campos, Pimco, Bisonó, Goya.

## Por qué un umbral no servía

La similitud trigram es de **cadena completa**, así que un acierto fuerte en un token TAPA un fallo
total en otro. Medido sobre el catálogo real:

| consulta | top-1 | ¿correcto? |
|---|---:|---|
| `arroz Rica` → Galleta Arroz Ricecrisps | **0.818** | ❌ |
| `café Santo Domingo` → Café Molido Santo Domingo | 0.737 | ✅ |
| `arroz campos 20 lb` → Arroz Campos Premium 20 Lb | 0.704 | ✅ |
| `leche Rica` → Leche Entera Rica 1 Lt | 0.611 | ✅ |

**El mal match está más arriba que tres buenos.** Para rechazarlo con un piso habría que ponerlo
sobre 0.818 y matar los tres. Es exactamente la trampa que describe la doctrina de discriminación:
*el mal match no es un match débil*, y subir el umbral liquida primero los verdaderos positivos.

La señal independiente que sí discrimina es **estructural**: ¿aparece cada token significativo del
usuario en el nombre o la marca del candidato? `Ricecrisps` no es `Rica`; `Rica` en «Leche Entera
Rica» sí lo es. El score no distingue esos dos casos; la cobertura sí.

## Dónde se aplica, y dónde NO

En **resolver** (elegir UN producto), nunca en **buscar** (listar candidatos). El costo del falso
positivo no es simétrico: en la búsqueda un resultado de más es inofensivo y conviene ser generoso;
al resolver, el producto equivocado es una mentira con un botón de compra debajo.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

# Palabras que no discriminan nada: exigirlas rechazaría matches legítimos («aceite DE oliva»).
_FILLER = frozenset(
    {
        "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
        "para", "con", "y", "en", "of", "the", "for", "with", "and", "da", "do", "com",
    }
)
# Menos de 3 caracteres no identifica un producto (y las unidades tipo «lb» viven en el nombre,
# donde igual aparecen; exigirlas por separado sólo agrega falsos rechazos).
_MIN_TOKEN = 3
# Cuánto se le permite a un token del usuario diferir del de la ficha. Calibrado con el caso que
# NO puede morir: `arros` vs `arroz` da 0.80 — la búsqueda híbrida existe justamente para eso.
# `rica` vs `ricecrisps` da 0.43 y queda fuera con margen amplio.
_TOKEN_RATIO = 0.8


def _fold(text: str) -> str:
    """Minúsculas sin acentos: `PAÑALES` y `pañales` son la misma palabra."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def _significant_tokens(text: str) -> list[str]:
    return [
        tok
        for tok in re.findall(r"[a-z0-9]+", _fold(text))
        if len(tok) >= _MIN_TOKEN and tok not in _FILLER
    ]


def _is_present(token: str, candidate_tokens: list[str]) -> bool:
    return any(
        token == other or SequenceMatcher(None, token, other).ratio() >= _TOKEN_RATIO
        for other in candidate_tokens
    )


def covers_query(query: str, candidate_text: str) -> bool:
    """¿Cada token significativo de `query` aparece en `candidate_text` (nombre + marca)?

    Sin tokens significativos devuelve `True`: no hay nada que exigir, y fabricar un rechazo ahí
    sería inventar un criterio que el usuario no dio.
    """
    wanted = _significant_tokens(query)
    if not wanted:
        return True
    available = _significant_tokens(candidate_text)
    return all(_is_present(token, available) for token in wanted)
