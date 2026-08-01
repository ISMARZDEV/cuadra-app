"""Read model de la taxonomía canónica (categorías/subcategorías). PURO (ADR 31).

`CategoryNode` = un nodo del árbol de categorías con su slug URL-safe. Alimenta la página de
categorías (Imagen #6), el listado por categoría (Imagen #8) y el breadcrumb del producto (Imagen #5).

El slug sale de la **key** del nodo (identidad estable, ver `taxonomy_node.key`), NO de la etiqueta:
la etiqueta se traduce y la URL no puede moverse con el idioma — `/categorias/lacteos-huevos` no
puede volverse `/categories/dairy-eggs` al cambiar de locale, ni romperse al renombrar. Para los
nodos sin key (nivel ≥2, que no vienen del markdown) se cae a `slugify(name)`, que es el
comportamiento histórico. Hoy ambos coinciden en las 150 keys: el cambio es no-op y deja las URLs
estables hacia adelante.
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
    # Identidad estable e independiente del idioma ("lacteos-huevos"). `name` es sólo la ETIQUETA
    # y se traduce; la key no. El cliente la usa para resolver la etiqueta localizada y caer a
    # `name` si su bundle no la tiene. `None` en los nodos que no vienen del markdown (nivel ≥2).
    key: str | None = None
    children: tuple["CategoryNode", ...] = field(default_factory=tuple)
