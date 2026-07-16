"""Mercado que ingiere Save.

Esto era el "bridge F1": el wiring HARDCODEADO de las fuentes de catálogo —`build_sources`, con las
base_url de Sirena/Nacional/Jumbo y el `store_code="jumbo"` escritos en código— más el tuple
`BASKET_QUERIES` con los 213 términos de la canasta. Su propio docstring lo admitía: *"Los IDs de
provider salen del seed (bridge de F1 hasta que exista `store_registry`)"*.

`store_registry` existe desde F2·B1, y R1 (2026-07-16) terminó el cutover:

- **Las tiendas** salen de `store_registry` (activo × capacidad by_text) →
  `composition.query_catalog_partition_keys` / `build_query_catalog_sources_for`. Sumar un súper es
  una FILA, no un deploy (regla SAGRADA #4), y pausarlo desde el admin por fin lo saca de la ingesta.
- **La canasta** sale de la tabla `basket_query` → `composition.build_basket_queries` (Fase 0).
- **La config por-plataforma** (el header `Store: jumbo`, el profile de Bravo) sale del registry y la
  arma `CatalogSourceFactory`.

Queda solo el mercado, que sigue siendo una constante mientras Save opere un país (el multi-país es
F3: `market_id` ya se carga por ID en todo el pipeline).
"""
from __future__ import annotations

SAVE_MARKET = "DO"
