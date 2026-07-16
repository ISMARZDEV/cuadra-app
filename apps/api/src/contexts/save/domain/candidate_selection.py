"""Verificación del candidato que devuelve una búsqueda por BARCODE (Loop B / Cobertura). PURO (ADR 31).

Historia, porque explica por qué esto es tan chico:

1. Loop B ingestaba TODOS los ~65 resultados de la búsqueda dirigida y matcheaba cada uno contra
   CUALQUIER canónico → el objetivo se cubría por casualidad (1/23, hallazgo live 2026-07-12). Se
   pasó a elegir UN candidato para el objetivo: EAN exacto → o el nombre más parecido (trigram).
2. **R4 (2026-07-16) sacó la mitad del nombre.** La Cobertura es **barcode puro**: se le pregunta a
   la tienda por un artículo PUNTUAL, por su código. Si ningún candidato trae ese código, no hay
   candidato — punto.

Por qué se fue el fallback por nombre, que es el corazón de este módulo:

En una consulta POR BARCODE, tomar "el más parecido por nombre" es una adivinanza disfrazada de
lookup exacto. Existía para no volver con las manos vacías, y es EXACTAMENTE la forma de los cinco
bugs que ya pagó la ingesta: **un fallback indistinguible del resultado real**. Le pedimos a la
tienda *"el artículo con barcode X"*; si devuelve otra cosa, la lectura correcta es *"ignoró el
filtro"* o *"no lo tiene"* — nunca *"encontré el producto"*. Con el fallback, una tienda que ignorara
`filterByEan` y devolviera su catálogo entero parecería estar cubriendo canónicos, y nadie lo
notaría: se vería como cobertura funcionando.

No se pierde nada: sin candidato la Cobertura DESCARTA (no encola — el par sigue sin cubrir hasta la
próxima corrida), y el producto igual se descubre por NOMBRE en el Proceso 1, que sí tiene cola y
revisión humana. La división es **Cobertura = barcode puro / Descubrimiento = texto**.

Esto ELIGE cuál candidato validar; la decisión autoritativa la sigue tomando la cascada de matching
(EAN→trgm→vector→boosts→gates→banding), que vuelve a verificar el barcode por su cuenta.
"""
from __future__ import annotations

from typing import Protocol, TypeVar


class _Candidate(Protocol):
    ean: str | None


C = TypeVar("C", bound=_Candidate)


def select_ean_match(*, target_ean: str, candidates: list[C]) -> C | None:
    """El candidato cuyo barcode ES el del objetivo, o `None` si ninguno lo es.

    `None` es un resultado sano y esperado: la tienda no lo tiene, o ignoró el filtro. En ambos casos
    lo correcto es no cubrir el par, no adivinar cuál de lo que devolvió "se le parece".

    Los dos lados vienen NORMALIZADOS a GTIN-14 (`pick_global_ean`): un UPC-A `760593023182` y su
    forma `0760593023182` son el MISMO barcode, y si no convergen a la misma cadena esta comparación
    no los une — un falso negativo invisible (medido: era el 52% de las filas con EAN de Sirena).
    """
    for cand in candidates:
        if cand.ean and cand.ean == target_ean:
            return cand
    return None
