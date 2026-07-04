"""Seed idempotente del contexto Save (§11) — canasta curada (bootstrap del matcher, doc 05).

Carga una canasta REAL: "Arroz Enriquecido La Garza 10 LB" con precios de 8 cadenas RD (tomados
del comparador SupermercadosRD, mercado DO). Matcheo MANUAL (todos apuntan al mismo canonical) →
bootstrap para el matching automático de F2. UUIDs deterministas (uuid5) + record_observation
change-only → seguro de correr N veces.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.contexts.save.domain.entities import (
    CanonicalProduct,
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
)
from src.contexts.save.domain.value_objects import parse_size
from src.contexts.save.infrastructure.models import (
    CanonicalProductModel,
    ProviderModel,
    TaxonomyNodeModel,
)
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlProviderRepository,
    SqlStoreProductRepository,
)
from src.shared.money import Currency, Money

_NS = uuid.UUID("5a5e0000-0000-4000-8000-000000000001")  # namespace fijo del seed de Save
DOP = Currency("DOP")

# cadenas RD (mercado DO) + su plataforma detectada (spikes docs 02/09)
_PROVIDERS: list[tuple[str, SourcePlatform]] = [
    ("Merca Jumbo", SourcePlatform.MAGENTO),
    ("Bravo", SourcePlatform.SPA),
    ("Jumbo", SourcePlatform.MAGENTO),
    ("Ritmo", SourcePlatform.AGGREGATOR),
    ("Nacional", SourcePlatform.MAGENTO),
    ("Carrefour", SourcePlatform.AGGREGATOR),
    ("Plaza Lama", SourcePlatform.SPA),
    ("Sirena", SourcePlatform.VTEX),
]

# Arroz Enriquecido La Garza 10 LB — precios reales (SupermercadosRD, minor units DOP)
_GARZA_10LB_PRICES: dict[str, int] = {
    "Merca Jumbo": 42400,   # RD$424.00 (mejor precio)
    "Bravo": 43800,         # RD$438.00
    "Jumbo": 44000,         # RD$440.00
    "Ritmo": 44800,         # RD$448.00
    "Nacional": 45495,      # RD$454.95
    "Carrefour": 45995,     # RD$459.95
    "Plaza Lama": 47400,    # RD$474.00
    "Sirena": 47500,        # RD$475.00
}

_ARROZ_PATH = ["Despensa & Abarrotes", "Arroz, Granos & Legumbres", "Arroz", "Arroz Blanco"]


def _provider_id(name: str) -> uuid.UUID:
    return uuid.uuid5(_NS, f"provider:DO:{name}")


def _taxonomy_leaf(session: Session, market_id: str, path: list[str]) -> str:
    """Crea (idempotente) el árbol de taxonomía y devuelve el id de la HOJA."""
    parent: uuid.UUID | None = None
    accum = market_id
    node_id: uuid.UUID | None = None
    for level, name in enumerate(path):
        accum = f"{accum}/{name}"
        node_id = uuid.uuid5(_NS, f"taxonomy:{accum}")
        if session.get(TaxonomyNodeModel, node_id) is None:
            session.add(
                TaxonomyNodeModel(
                    id=node_id, parent_id=parent, name=name, level=level, market_id=market_id
                )
            )
            session.flush()
        parent = node_id
    assert node_id is not None
    return str(node_id)


def seed_save(session: Session) -> None:
    prov_repo = SqlProviderRepository(session)
    canon_repo = SqlCanonicalProductRepository(session)
    store_repo = SqlStoreProductRepository(session)

    # 1) proveedores (cadenas RD)
    for name, platform in _PROVIDERS:
        pid = _provider_id(name)
        if session.get(ProviderModel, pid) is None:
            prov_repo.add(Provider(str(pid), name, ProviderType.SUPERMARKET, platform, "DO"))

    # 2) taxonomía (hoja "Arroz Blanco")
    node_id = _taxonomy_leaf(session, "DO", _ARROZ_PATH)

    # 3) producto canónico (matcheo manual = todos los store_products apuntan acá)
    cid = uuid.uuid5(_NS, "canonical:DO:arroz-la-garza-10lb")
    if session.get(CanonicalProductModel, cid) is None:
        canon_repo.add(
            CanonicalProduct(
                str(cid),
                "Arroz Enriquecido La Garza",
                "La Garza",
                parse_size("10 Lbs"),
                taxonomy_node_id=node_id,
                market_id="DO",
            )
        )

    # 4) precios por tienda (change-only)
    now = datetime.now(timezone.utc)
    for name, minor in _GARZA_10LB_PRICES.items():
        store_repo.record_observation(
            provider_id=str(_provider_id(name)),
            external_id="garza-10lb",
            canonical_product_id=str(cid),
            price=Money(minor, DOP),
            captured_at=now,
            price_type=PriceType.ONLINE,
            source="seed",
        )
