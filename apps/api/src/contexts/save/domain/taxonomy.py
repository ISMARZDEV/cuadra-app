"""Read model de la taxonomía canónica (categorías/subcategorías). PURO (ADR 31).

`CategoryNode` = un nodo del árbol de categorías con su slug URL-safe (derivado del nombre, sin
columna nueva). Alimenta la página de categorías (Imagen #6), el listado por categoría (Imagen #8)
y el breadcrumb del producto (Imagen #5). El slug se computa igual que en la web (slugify).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field


def slugify(text: str) -> str:
    """"Despensa & Abarrotes" → "despensa-abarrotes". Igual criterio que la web (src/lib/utils)."""
    normalized = unicodedata.normalize("NFD", text.lower())
    stripped = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", stripped))


@dataclass(frozen=True, slots=True)
class CategoryNode:
    id: str
    name: str
    slug: str
    level: int
    parent_id: str | None
    children: tuple["CategoryNode", ...] = field(default_factory=tuple)
