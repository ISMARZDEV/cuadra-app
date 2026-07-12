"""Cobertura de Loop B (F3.1), PURO (ADR 31).

Un `CoveragePair` = un (canónico × tienda) que aún NO tiene `store_product` — lo que Loop B tiene que
ir a cubrir (buscar el canónico en esa tienda, validar con la cascada, enlazar). Si ya está vinculado,
no aparece acá (se salta). La versión runtime la deriva el repo por LEFT JOIN; F3.2 la materializa.
"""
from __future__ import annotations

from collections import OrderedDict
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CoveragePair:
    canonical_product_id: str
    provider_id: str


def round_robin_by_store(pairs: Sequence[CoveragePair]) -> list[CoveragePair]:
    """PURO: reordena los pares para REPARTIR la carga entre tiendas (patrón SRD `scrape-many.ts:11-77`).

    En vez de martillar UNA tienda con todos sus pares seguidos (lo que dispara rate-limits / 503),
    intercala una ronda por tienda: `A,A,B` → `A,B,A`. Preserva el orden relativo dentro de cada
    tienda. Es la base para el abort-on-down: al intercalar, una tienda caída se detecta temprano y
    sus pares restantes (aún sin procesar) se pueden saltar sin haberla martillado.
    """
    groups: OrderedDict[str, list[CoveragePair]] = OrderedDict()
    for pair in pairs:
        groups.setdefault(pair.provider_id, []).append(pair)

    ordered: list[CoveragePair] = []
    queues = list(groups.values())
    while queues:
        remaining: list[list[CoveragePair]] = []
        for queue in queues:
            ordered.append(queue.pop(0))
            if queue:
                remaining.append(queue)
        queues = remaining
    return ordered
