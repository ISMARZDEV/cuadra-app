"""`Provider` — tienda/proveedor del catálogo, PURO (ADR 31). Multi-país por `market_id`.

`type` prevé los verticales del marketplace (supermercado hoy; banco/seguro después) y
`platform` la fuente de datos (la escalabilidad: un adapter por plataforma sirve N países).
`market_id` (ISO 3166-1 alpha-2) va por ID, sin FK a otro contexto (ADR 33).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ProviderType(StrEnum):
    SUPERMARKET = "supermarket"
    BANK = "bank"
    INSURER = "insurer"


class SourcePlatform(StrEnum):
    VTEX = "vtex"
    MAGENTO = "magento"
    SHOPIFY = "shopify"
    AGGREGATOR = "aggregator"  # PedidosYa / UberEats
    SPA = "spa"                # sitio custom → agente-IA


@dataclass(frozen=True, slots=True)
class Provider:
    id: str
    name: str
    type: ProviderType
    platform: SourcePlatform
    market_id: str  # "DO" → "US" → "CO" … (ADR 33: por ID)

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("Provider.name no puede estar vacío")
        if not self.market_id.strip():
            raise ValueError("Provider.market_id es obligatorio (multi-país)")
