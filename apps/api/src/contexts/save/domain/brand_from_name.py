"""Reconocer una marca CONOCIDA dentro del nombre de un producto. PURO (ADR 31), sin red ni DB.

Ni Magento (Nacional/Jumbo) ni Bravo exponen marca — verificado en vivo el 2026-07-30: el
`brand_text` de Magento existe en el esquema pero viene VACÍO en todo el catálogo (y `aggregations`
no ofrece faceta de marca), y el `marcaArticulo` de Bravo son cuatro códigos internos ("01"/"03"/
"04") que agrupan por TIPO de producto, no por marca. Pero el NOMBRE sí la lleva.

RECONOCER, NO ADIVINAR. Sólo se acepta una marca que YA existe en nuestro catálogo — el que puebla
Sirena/VTEX, que sí la publica. Deducir una marca nueva a partir de un nombre sería FABRICAR
catálogo, que es justo lo que la regla sagrada del módulo prohíbe. La cobertura crece sola conforme
crece el catálogo de marcas: medido sobre datos reales con sólo 29 marcas conocidas ya recupera el
66.7% de los productos de Nacional y el 51.9% de los de Bravo que estaban sin marca.

Por qué no sirve "el primer token": la posición cambia según la cadena. Bravo la pone al principio
("LA GARZA ARROZ 10 LB"); Nacional, en el medio ("Arroz Enriquecido La Garza 5 Lb").
"""
from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable

_NON_ALNUM = re.compile(r"[^A-Z0-9 ]+")

# Una "marca" de una o dos letras aparece por casualidad en cualquier nombre. Exigir tres
# caracteres alfanuméricos descarta el ruido sin perder marcas reales.
_MIN_BRAND_CHARS = 3

# Ninguna marca del catálogo tiene más de cuatro palabras; acotar el barrido evita recorrer
# combinaciones que nunca van a existir.
_MAX_BRAND_TOKENS = 4

# Marca normalizada (tupla de tokens) → nombre tal como está guardado en el catálogo.
BrandIndex = dict[tuple[str, ...], str]


def _tokens(text: str) -> list[str]:
    """Tokens comparables: sin acentos, en mayúsculas y sin puntuación ("Líder" → ["LIDER"])."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_only = "".join(c for c in decomposed if not unicodedata.combining(c))
    return _NON_ALNUM.sub(" ", ascii_only.upper()).split()


def build_brand_index(names: Iterable[str]) -> BrandIndex:
    """Índice de búsqueda a partir de las marcas conocidas del catálogo.

    `save.brand` viene SUCIO: tiene duplicados que sólo difieren en mayúsculas o acentos
    ('BRAVO'/'Bravo', 'LIDER'/'LÍDER'/'Líder'). Todos colapsan a la misma clave, así que se ordena
    la entrada y se conserva la PRIMERA: dos corridas sobre el mismo catálogo devuelven siempre la
    misma marca, sin depender del orden en que la base entregó las filas.
    """
    index: BrandIndex = {}
    for name in sorted({n for n in names if n and n.strip()}):
        key = tuple(_tokens(name))
        if not key or len("".join(key)) < _MIN_BRAND_CHARS:
            continue
        index.setdefault(key, name)
    return index


def match_brand(product_name: str, index: BrandIndex) -> str | None:
    """La marca conocida contenida en el nombre, o `None` si no hay ninguna.

    Compara por SECUENCIA DE TOKENS, no por subcadena: "GOYA" no puede matchear dentro de
    "GOYANA". Gana la coincidencia MÁS LARGA, para que "LA FAMOSA" le gane a "FAMOSA" — quedarse
    con la corta cambiaría el producto de marca.
    """
    if not index:
        return None
    tokens = _tokens(product_name)
    if not tokens:
        return None

    for size in range(min(_MAX_BRAND_TOKENS, len(tokens)), 0, -1):
        for start in range(len(tokens) - size + 1):
            hit = index.get(tuple(tokens[start : start + size]))
            if hit is not None:
                return hit
    return None


def brand_appears_in(brand: str, text: str) -> bool:
    """`True` si `brand` aparece dentro de `text` como SECUENCIA COMPLETA de tokens.

    Es la pregunta INVERSA a `match_brand` — no "¿qué marca hay en este nombre?" sino "¿está ESTA
    marca en este texto?" — y por eso no necesita índice. La usa el brand gate de la cascada para
    saber si un `store_product` corrobora la marca del canónico candidato.

    Comparte la regla de `match_brand`: por secuencia de tokens y nunca por subcadena, así que
    "Goya" no aparece en "GOYANA" ni "La Famosa" en "FAMOSA ARROZ" (son marcas distintas, y darlas
    por equivalentes cambiaría el producto de marca). Una marca vacía no aparece en NINGÚN texto:
    la secuencia vacía es subsecuencia de todas, y devolver `True` haría que el gate nunca dispare.
    """
    needle = _tokens(brand)
    if not needle:
        return False
    haystack = _tokens(text)
    span = len(needle)
    return any(
        haystack[start : start + span] == needle for start in range(len(haystack) - span + 1)
    )
