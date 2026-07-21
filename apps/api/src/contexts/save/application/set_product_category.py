"""`SetProductCategory` — override HUMANO de la categoría de un store_product.

Cierra un hueco que el propio código tenía anotado ("el override manual de categoría es un
follow-up", `CreateCanonicalPanel`). Sin él, todo lo que el clasificador deja sin decidir —que es
mucho y A PROPÓSITO: banda gris, conflicto de señales, o falta de la etapa vectorial— quedaba
atascado sin forma de destrabarse desde la consola.

Se registra como `method="human"` con confianza 1.0. Eso NO es cosmético: separa la decisión humana
de las automáticas en las métricas, para que la tasa de auto-enlace siga midiendo lo único que
tiene que medir — si el pipeline se sostiene SIN nosotros.
"""
from __future__ import annotations

import uuid

from ..domain.classification import CategoryClassification
from ..domain.ports.repositories import CategoryClassificationRepository

# Quién decidió. El vocabulario de `method` ya distingue las señales automáticas
# (`lexicon`/`vector`/`llm`/`source`/`source_name`); ésta es la del operador.
HUMAN_METHOD = "human"


class SetProductCategory:
    def __init__(self, classifications: CategoryClassificationRepository) -> None:
        self._classifications = classifications

    def execute(self, *, store_product_id: str, taxonomy_node_id: str, decided_by: str) -> None:
        # "Sin categoría" NO se persiste: la AUSENCIA de fila activa ya significa exactamente eso.
        # Una clasificación `active` apuntando a nada sería una afirmación de que sí sabemos.
        if not taxonomy_node_id:
            raise ValueError("taxonomy_node_id es obligatorio para fijar una categoría")
        del decided_by  # el QUIÉN lo registra la auditoría del controller (T2), no esta fila
        # `save_active` supersede la activa previa e inserta la nueva en la MISMA transacción
        # (invariante del repo: a lo sumo una activa por producto). Corregir una categoría
        # equivocada es el caso normal, así que no se comprueba que no exista una previa.
        self._classifications.save_active(
            CategoryClassification(
                id=str(uuid.uuid4()),
                store_product_id=store_product_id,
                canonical_product_id=None,
                taxonomy_node_id=taxonomy_node_id,
                confidence=1.0,
                method=HUMAN_METHOD,
                status="active",
            )
        )
