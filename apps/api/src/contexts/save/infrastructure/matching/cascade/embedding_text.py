"""Texto canónico que se EMBEBE para el matching semántico (F2.0).

DEBE ser idéntico en el lado query (store_product entrante, `MatchStoreProduct`) y en el lado índice
(canonical_product, backfill `EmbedCanonicalProducts`): vectores de textos construidos con recetas
distintas NO son comparables y romperían el matching en silencio. Por eso vive en UN solo lugar y
ambos lados lo importan.
"""
from __future__ import annotations


def build_embedding_text(name: str, brand: str, size: str) -> str:
    """`"{name} {brand} {size}"` sin espacios sobrantes en los bordes."""
    return f"{name} {brand} {size}".strip()
