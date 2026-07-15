"""`Collection` — colección curada (A6): un grupo hand-pick de productos para un carrusel.

PURA (ADR 31). NO responde a la taxonomía ni a "en oferta": es una selección editorial (ej.
"Protector solar", "Limpieza"). La pertenencia producto↔colección es M:N (un producto puede vivir
en varias colecciones) → vive en una tabla de unión en infra, no acá. Multi-país por `market_id`
(ADR 33: por ID, sin FK cross-context). El `slug` es la llave pública (URL de la página propia).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Collection:
    id: str
    slug: str
    name: str
    market_id: str  # "DO" → "US" → "CO" … (ADR 33: por ID)

    def __post_init__(self) -> None:
        if not self.slug.strip():
            raise ValueError("Collection.slug no puede estar vacío (es la llave pública)")
        if not self.name.strip():
            raise ValueError("Collection.name no puede estar vacío")
        if not self.market_id.strip():
            raise ValueError("Collection.market_id es obligatorio (multi-país)")
