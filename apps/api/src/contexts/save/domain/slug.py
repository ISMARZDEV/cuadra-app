"""`product_slug` — llave PÚBLICA URL-safe del producto canónico (SEO, ancla F1). PURO (ADR 31).

En vez de exponer el UUID en la URL (`/product/<uuid>`), el producto se resuelve por un slug
legible (`/product/arroz-selecto-wala-5-lb`) → destraba `og:image` y `<link rel=canonical>`. Se
deriva de nombre + marca + tamaño original reusando el mismo `slugify` que la taxonomía (un solo
criterio en todo el dominio y la web). La UNICIDAD por-mercado (sufijo `-2` en colisión) la
resuelve quien inserta (seed/repo) porque conoce los slugs existentes; acá solo el slug BASE.
"""
from __future__ import annotations

from .taxonomy import slugify


def product_slug(name: str, brand: str | None = None, display_size: str | None = None) -> str:
    """"Arroz Enriquecido" + "Pimco" + "10 LB" → "arroz-enriquecido-pimco-10-lb".

    La marca se omite si ya está contenida en el nombre (evita "arroz-la-garza-la-garza-10-lb");
    el tamaño original desambigua las variantes de un mismo producto (5 LB vs 10 LB).
    """
    base = slugify(name)
    parts = [base]
    if brand:
        brand_slug = slugify(brand)
        if brand_slug and brand_slug not in base:
            parts.append(brand_slug)
    if display_size:
        size_slug = slugify(display_size)
        if size_slug:
            parts.append(size_slug)
    return "-".join(p for p in parts if p)
