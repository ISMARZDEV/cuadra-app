"""Consulta dirigida de Loop B (cobertura, F3.1), PURO (ADR 31).

Loop B busca un canónico EXACTO en cada tienda. Decisión resuelta (SDD §12.1): **EAN primero** cuando
la tienda soporta búsqueda por barcode (Sirena/VTEX), **nombre compuesto** (`name` + `display_size`)
como fallback (Magento busca por término). Es donde Cuadra le gana a SupermercadosRD: con EAN el match
es exacto y barato; sin EAN, la cascada semántica valida el candidato del término.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class DirectedQuery:
    """Qué buscar en la tienda para cubrir un canónico. `by_ean` decide el modo de búsqueda."""

    text: str
    by_ean: bool


def build_directed_query(
    *,
    name: str,
    display_size: str | None,
    ean: str | None,
    store_supports_ean: bool,
) -> DirectedQuery:
    """EAN si hay y la tienda lo soporta; si no, `name` + `display_size` (omite el tamaño si falta)."""
    if ean and store_supports_ean:
        return DirectedQuery(text=ean, by_ean=True)
    parts = [p.strip() for p in (name, display_size) if p and p.strip()]
    return DirectedQuery(text=" ".join(parts), by_ean=False)
