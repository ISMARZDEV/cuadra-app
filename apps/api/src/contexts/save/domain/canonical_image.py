"""Imagen de la galería del canónico (F5). PURO (ADR 31).

`position` empieza en 1 y no tiene huecos: la posición 1 es la que ve el público, y un hueco haría
que "la 2da imagen" no exista aunque haya dos fotos.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CanonicalImage:
    id: str
    url: str
    position: int
    # De qué `store_product` se tomó. `None` = URL cargada a mano. Sin este dato no se puede decir
    # "la 2da la tomamos de Sirena" ni volver a ella si la tienda la cambia.
    source_store_product_id: str | None = None

    @property
    def is_primary(self) -> bool:
        """La que ve el público (og:image, canonical, tarjetas)."""
        return self.position == 1
