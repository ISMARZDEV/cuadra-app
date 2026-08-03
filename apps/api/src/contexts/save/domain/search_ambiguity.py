"""¿La consulta del usuario identifica UN producto, o una familia? DOMINIO PURO.

Cuando alguien escribe «arroz» hay 60 arroces que satisfacen esa palabra igual de bien. Elegir uno
es adivinar, y **una comparación del producto equivocado es exactamente lo que un usuario detecta y
castiga**. Preguntar cuesta un turno; equivocarse cuesta la credibilidad.

## La señal, medida (2026-08-02)

RRF **no sirve** para decidir esto: comprime todo al mismo rango (0.0164 / 0.0161) tanto para una
consulta ambigua como para una específica. Su trabajo es ordenar por consenso, no medir confianza.

El score CRUDO de la etapa léxica sí discrimina, y de forma tajante:

| consulta | n | top-1 | top-2/top-1 |
|---|---:|---:|---:|
| `arroz` · `aceite` · `leche` · `café` | 6-10 | **1.000** | **1.000** |
| `café santo domingo` · `pañales pampers` | 1 | — | — |
| `arroz campos 20 lb` | 10 | 0.704 | 0.972 |
| `aceite mazola 48 oz` | 2 | 0.714 | 0.500 |

**Ambiguo = varios candidatos matchean PERFECTO y por IGUAL.** Es decir: nada de lo que el usuario
dijo distingue entre ellos. No es «el sistema duda» — es «el usuario no dijo lo suficiente», y por
eso la respuesta correcta es preguntarle a él, no subir un umbral.

Es la doctrina de discriminación aplicada al revés: cuando un token no discrimina, en vez de
inventar un desempate, **se pide el desempate a quien lo tiene**.
"""
from __future__ import annotations

from collections.abc import Sequence

# Un match PERFECTO: la consulta aparece entera dentro del nombre. Con varios así, la consulta
# nombra una familia (arroz, aceite), no un producto.
_PERFECT = 1.0
# Cuánto tienen que parecerse top-1 y top-2 para considerarlos empatados.
_TIE_RATIO = 0.995
# Con menos de esto no vale la pena gastar un turno preguntando: se responde con el mejor.
_MIN_CANDIDATES = 3


def is_ambiguous(scores: Sequence[float]) -> bool:
    """`scores` son los scores CRUDOS de la etapa léxica, mejor primero."""
    if len(scores) < _MIN_CANDIDATES:
        return False
    top, second = scores[0], scores[1]
    if top < _PERFECT:
        return False  # ni siquiera el mejor es exacto → la consulta ya discrimina algo
    return second / top >= _TIE_RATIO if top else False
