"""Use case `EmbedCanonicalProduct` (SINGULAR): embebe UN canónico recién escrito, en el acto.

Hermano de `EmbedCanonicalProducts` (plural, el backfill de la ingesta). El backfill sigue siendo
la RED de seguridad — el invariante del repo deja `embedding` en NULL cada vez que cambia el texto
que se embebe (`SqlCanonicalProductRepository._embedding_text`), así que todo lo que este use case
no alcance a hacer lo levanta la próxima corrida. Éste sólo cierra la VENTANA: sin él, un canónico
creado o editado desde el admin queda invisible para la etapa vectorial hasta el siguiente backfill,
y como la cola de revisión es justo donde nacen los canónicos, esa ventana se retroalimenta (más
cola → más canónicos a mano → más agujeros en el índice → peor matching → más cola).

FAIL-SAFE por diseño: la llamada al modelo va envuelta porque un servicio de embeddings caído NO
puede tumbar la creación de un canónico ni bloquear la resolución de una fila de la cola. El peor
caso es un vector ausente (producto invisible hasta el backfill), nunca uno equivocado y nunca una
escritura perdida. La escritura de `set_embedding` NO se atrapa: eso es la transacción, y si falla
tiene que propagarse como cualquier otro error de base.

Usa la MISMA receta (`build_embedding_text`) que el lado query y que el backfill, o los vectores no
serían comparables.
"""
from __future__ import annotations

import logging

from ..domain.ports import CanonicalProductRepository
from ..domain.ports.repositories import EmbeddingProvider
from ..infrastructure.matching.cascade.embedding_text import build_embedding_text

logger = logging.getLogger(__name__)


class EmbedCanonicalProduct:
    def __init__(
        self, canonical_repo: CanonicalProductRepository, embedder: EmbeddingProvider
    ) -> None:
        self._repo = canonical_repo
        self._embedder = embedder

    def execute(self, canonical_product_id: str) -> bool:
        """Embebe ese canónico. `True` si quedó embebido; `False` si no se pudo (y queda NULL,
        que es exactamente lo que el backfill busca)."""
        canonical = self._repo.get_by_id(canonical_product_id)
        if canonical is None:
            return False

        text = build_embedding_text(
            canonical.name, canonical.brand, canonical.display_size or ""
        )
        try:
            vector = self._embedder.embed([text])[0]
        except Exception:  # noqa: BLE001 — ver el fail-safe del docstring
            logger.warning(
                "No se pudo embeber el canónico %s en el acto; queda para el backfill.",
                canonical_product_id,
                exc_info=True,
            )
            return False

        self._repo.set_embedding(canonical_product_id, vector)
        return True
