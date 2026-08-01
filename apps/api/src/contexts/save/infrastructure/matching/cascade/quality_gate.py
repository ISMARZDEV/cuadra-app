"""Quality gate de la cascada de matching (PURO).

La LÍNEA DE CALIDAD distingue SKUs que comparten todo lo demás: `Arroz Selecto Pimco 10 Lb` y
`Arroz Premium Pimco Funda 10 Lb` son la misma marca, el mismo tamaño y la misma categoría, y son
productos DISTINTOS con precios distintos.

Medido 2026-08-01 en la primera corrida con catálogo poblado: de 61 auto-enlaces, CINCO canónicos
habían absorbido SKUs distintos de la MISMA tienda (una tienda no vende el mismo producto dos veces
con nombres distintos). `Arroz Pimco Selecto 10 Lbs` se comió TRES líneas: Premium, Selecto y Super
Selecto Gourmet.

**Por qué el piso no alcanzaba.** Esos falsos merges llegaban a confianza **1.000**. No es
casualidad: la clase de error es por construcción misma-marca + mismo-tamaño + misma-categoría, así
que los tres boosts (`+0.10`, `+0.05`, `+0.05`) la empujan al tope y el clamp la deja en 1.0. Los
boosts premian justo las dimensiones que NO discriminan acá. Contra eso sólo sirve una señal dura.

Contrato conservador, igual que `variant_gate`: bloquea SÓLO ante contradicción POSITIVA — ambos
lados nombran una línea y son distintas. Un solo lado, o ninguno, no bloquea.

**Gana la línea MÁS LARGA** (`super selecto` le gana a `selecto`): con match por token suelto los dos
lados darían `{selecto}` y el gate no vería el conflicto — que es exactamente el falso merge medido.
Por eso el barrido es por SECUENCIA de tokens de mayor a menor, como `brand_from_name.match_brand`.

`canonical_quality` (el campo `CanonicalProduct.quality`) es CURACIÓN del operador y manda sobre lo
que se pueda leer del nombre: un canónico puede llamarse "Arroz Pimco 10 Lb" y ser la línea Premium.
"""
from __future__ import annotations

import re
import unicodedata

# Líneas de calidad del arroz/víveres en RD, de más específica a más general. El ORDEN de esta
# tabla no importa (el barrido va por longitud), pero sí que cada entrada sea una línea COMERCIAL
# mutuamente excluyente. Deliberadamente FUERA: "enriquecido", que es un claim nutricional y puede
# convivir con cualquier línea ("Arroz Selecto Enriquecido Bisono") — tratarlo como línea daría
# conflictos falsos.
_QUALITY_LINES: tuple[tuple[str, ...], ...] = (
    ("super", "selecto"),
    ("selecto",),
    ("premium",),
    ("gourmet",),
    ("superior",),
    ("especial",),
    ("extra",),
)

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> list[str]:
    """Tokens comparables: sin acentos, en minúsculas, sin puntuación."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    return _TOKEN_RE.findall(ascii_only.lower())


def _line_in(text: str) -> str | None:
    """Línea de calidad nombrada en `text`, la MÁS LARGA; `None` si no nombra ninguna.

    Compara por SECUENCIA de tokens, nunca por subcadena: "Extraordinario" no es la línea "Extra".
    """
    tokens = _tokens(text)
    if not tokens:
        return None
    for line in sorted(_QUALITY_LINES, key=len, reverse=True):
        span = len(line)
        for start in range(len(tokens) - span + 1):
            if tuple(tokens[start : start + span]) == line:
                return " ".join(line)
    return None


def qualities_conflict(
    store_name: str, canonical_name: str, canonical_quality: str | None = None
) -> bool:
    """`True` = ambos lados nombran una línea de calidad y son DISTINTAS → distinto SKU, no
    auto-linkear. Ver el docstring del módulo."""
    store_line = _line_in(store_name)
    if store_line is None:
        return False
    canonical_line = (
        _line_in(canonical_quality)
        if canonical_quality and canonical_quality.strip()
        else _line_in(canonical_name)
    )
    if canonical_line is None:
        return False
    return store_line != canonical_line
