"""Receta ÚNICA para embeddear una categoría (save-category-classification, Batch 5).

Index-side de la etapa semántica: la categoría se embeddea como `"{padre} {subcategoría}"` para
dar CONTEXTO (una subcategoría suelta como "Frutas" es ambigua; "Frutas & Verduras Frutas" no).
El producto (query-side) se embeddea con su propia receta de nombre — ambos caen en el MISMO
espacio BGE-M3, así que las distancias coseno son comparables aunque las recetas difieran.
"""
from __future__ import annotations


def build_category_embedding_text(node_name: str, parent_name: str | None) -> str:
    if parent_name:
        return f"{parent_name} {node_name}".strip()
    return node_name.strip()
