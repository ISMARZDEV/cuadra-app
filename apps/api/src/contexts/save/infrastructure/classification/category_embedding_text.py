"""Receta ÚNICA para embeddear una categoría (save-category-classification, Batch 5).

Index-side de la etapa semántica del clasificador. La receta tiene DOS variantes, ambas medidas
contra el índice real de 120 hojas (30 productos repartidos por toda la taxonomía):

- **Con `terms`** (descriptores del dominio): `"{padre} > {hoja}. Ejemplos: {terms}"`. Es la
  variante buena — **top-1 43%→77%**. Una ETIQUETA corta ("Bebidas Agua") no discrimina un SKU de
  marca ("Habichuelas Rojas La Famosa"): BGE-M3 denso deja todas las categorías apiñadas en
  coseno ~0.40–0.48 y el ganador sale casi al azar (medido: "Habichuelas" → "Agua"). Sembrar cada
  hoja con ejemplos del dominio ("arroz, habichuelas, guandules") separa las clases. Los `terms`
  viven en `taxonomy_node.classification_terms` (data curable, no código), generados offline +
  revisados.
- **Sin `terms`** (fallback, hoja aún sin sembrar): `"{padre} {hoja}"` — la receta original, ~43%
  top-1. Se conserva para no romper una hoja recién creada antes de generarle términos.

El producto (query-side) se embeddea con su propia receta de nombre — ambos caen en el MISMO
espacio BGE-M3, así que las distancias coseno son comparables aunque las recetas difieran.

CORRECCIÓN 2026-07-18: el docstring anterior afirmaba que `"{padre} {hoja}"` DESAMBIGUA ("una
subcategoría suelta como 'Frutas' es ambigua; 'Frutas & Verduras Frutas' no"). **Medido: NO lo
hace** — es exactamente el caso de fallo. La desambiguación real la dan los `terms`.
"""
from __future__ import annotations


def build_category_embedding_text(
    node_name: str, parent_name: str | None, terms: str | None = None
) -> str:
    if terms and terms.strip():
        label = f"{parent_name} > {node_name}" if parent_name else node_name
        return f"{label}. Ejemplos: {terms.strip()}"
    # Fallback sin términos: la receta original medida ("{padre} {hoja}").
    if parent_name:
        return f"{parent_name} {node_name}".strip()
    return node_name.strip()
