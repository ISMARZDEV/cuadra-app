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
    PriceModel,
    ProviderModel,
    StoreProductModel,
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

# Arroz Enriquecido La Garza 10 LB — (external_id, precio minor DOP).
# Cadenas con fuente API viva (Sirena/Nacional/Jumbo): external_id = SKU REAL verificado en vivo
# (doc 09) → `python -m seeds.save_refresh` refresca su precio desde el adapter. El resto (sin
# API aún): llave sintética "garza-10lb" + precio de SupermercadosRD como bootstrap.
_GARZA_10LB_PRICES: dict[str, tuple[str, int]] = {
    "Merca Jumbo": ("garza-10lb", 42400),  # RD$424.00 (mejor precio)
    "Bravo": ("garza-10lb", 43800),        # RD$438.00
    "Jumbo": ("2010981", 44000),           # RD$440.00 — SKU real Magento (Store: jumbo)
    "Ritmo": ("garza-10lb", 44800),        # RD$448.00
    "Nacional": ("2010981", 45495),        # RD$454.95 — SKU real Magento (mismo id CCN)
    "Carrefour": ("garza-10lb", 45995),    # RD$459.95
    "Plaza Lama": ("garza-10lb", 47400),   # RD$474.00
    "Sirena": ("14210", 47500),            # RD$475.00 — productId real VTEX
}

_ARROZ_PATH = ["Despensa & Abarrotes", "Arroz, Granos & Legumbres", "Arroz", "Arroz Blanco"]

# Taxonomía semilla (categorías + subcategorías, alineada a SupermercadosRD / Imagen #6). El árbol
# real se sembrará desde las fuentes (VTEX/Magento) en F2; esto da datos para la UI de categorías.
_TOP_CATEGORIES = [
    "Alcohol", "Bebés", "Bebidas", "Carnes & Pescados", "Cuidado Del Hogar", "Cuidado Personal",
    "Despensa & Abarrotes", "Embutidos & Delicatessen", "Escolares & Oficina", "Frutas & Verduras",
    "Lácteos & Huevos", "Mascotas", "Panadería & Tortillería", "Salud & Farmacia", "Snacks & Dulces",
]
_DESPENSA_SUBCATEGORIES = [
    "Aceite & Vinagre", "Arroz, Granos & Legumbres", "Café", "Caldos & Sopas",
    "Chocolate Para Beber", "Condimentos & Especias", "Desayuno & Cereal", "Endulzantes",
    "Enlatados & Conservas", "Harinas", "Pastas", "Repostería", "Salsas",
    "Semillas & Frutos Secos", "Té & Infusiones",
]


def provider_id(name: str) -> uuid.UUID:
    """ID determinista del provider (uuid5). Público: lo comparte el wiring de ingesta.

    Bridge de F1: en producción los providers vendrán de un `store_registry` (doc 06), no del
    seed; hasta entonces esta derivación es la única fuente de verdad de sus IDs.
    """
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


def _drop_legacy_key(session: Session, provider_uuid: uuid.UUID, current_external_id: str) -> None:
    """Borra el store_product legacy "garza-10lb" (y su histórico) si el provider ya usa SKU real.

    DBs de dev sembradas antes del wiring quedarían con DOS cotizaciones por tienda (la llave
    sintética vieja + la real). Dev-only: el seed es la única fuente de esas filas.
    """
    if current_external_id == "garza-10lb":
        return
    legacy = session.scalars(
        select(StoreProductModel).where(
            StoreProductModel.provider_id == provider_uuid,
            StoreProductModel.external_id == "garza-10lb",
        )
    ).first()
    if legacy is None:
        return
    for price in session.scalars(select(PriceModel).where(PriceModel.store_product_id == legacy.id)):
        session.delete(price)
    session.delete(legacy)
    session.flush()


def seed_save(session: Session) -> None:
    prov_repo = SqlProviderRepository(session)
    canon_repo = SqlCanonicalProductRepository(session)
    store_repo = SqlStoreProductRepository(session)

    # 1) proveedores (cadenas RD)
    for name, platform in _PROVIDERS:
        pid = provider_id(name)
        if session.get(ProviderModel, pid) is None:
            prov_repo.add(Provider(str(pid), name, ProviderType.SUPERMARKET, platform, "DO"))

    # 2) taxonomía: categorías top + subcategorías de Despensa + la hoja "Arroz Blanco"
    for cat in _TOP_CATEGORIES:
        _taxonomy_leaf(session, "DO", [cat])
    for sub in _DESPENSA_SUBCATEGORIES:
        _taxonomy_leaf(session, "DO", ["Despensa & Abarrotes", sub])
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
    for name, (external_id, minor) in _GARZA_10LB_PRICES.items():
        _drop_legacy_key(session, provider_id(name), external_id)
        store_repo.record_observation(
            provider_id=str(provider_id(name)),
            external_id=external_id,
            canonical_product_id=str(cid),
            price=Money(minor, DOP),
            captured_at=now,
            price_type=PriceType.ONLINE,
            source="seed",
        )
