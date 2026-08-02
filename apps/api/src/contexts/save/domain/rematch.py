"""Modelo de dominio de la RE-evaluación de filas ya encoladas. PURO (ADR 31).

- `RematchableProduct`: lo que la cascada necesita para volver a evaluar un `store_product` que ya
  está en la cola de revisión.

Vive en `domain` y no en `application` a propósito: `infrastructure` (el repositorio que lo lee)
NUNCA importa de `application` en este contexto — es la regla de capas del proyecto, y devolver
directamente el `IncomingStoreProduct` del use-case la rompería. El use-case hace la conversión,
que es adonde pertenece.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class RematchableProduct:
    """Un `store_product` de la cola, listo para volver a pasar por la cascada.

    Espeja los campos que la cascada LEE (`IncomingStoreProduct` sin `market_id` ni `run_id`): el
    mercado lo pone el caller, y el `run_id` no viaja porque una re-evaluación no es un hallazgo de
    una corrida — atribuirla a una corrida de ingesta falsearía el embudo de esa corrida.
    """

    store_product_id: str
    name: str
    brand: str = ""
    size: str = ""
    ean: str | None = None
    source_category: str = ""
