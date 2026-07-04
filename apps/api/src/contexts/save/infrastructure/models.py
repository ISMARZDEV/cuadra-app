"""SQLAlchemy models de Save — schema 'save' (ADR 33). Solo infra (ADR 31).

NORMALIZACIÓN (3NF salvo value-objects, igual que insights):
- `brand` y `taxonomy_node` en tablas propias → NO se repite la marca ni el path de categoría en
  cada producto (evita anomalías de update). `taxonomy_node` es un ÁRBOL (self-FK `parent_id`).
- `quality` (Premium/Selecto) queda como columna (atributo de baja cardinalidad, no amerita tabla).
- value-objects atómicos inline: `Money` → (amount_minor, currency); `Quantity` → (size_amount, size_measure).

HISTÓRICO = SCD Type 4: el precio ACTUAL vive en `store_product.current_price` (+ `last_seen_at`,
change-only); la historia en `price` append-only (nunca UPDATE) = el foso temporal, auto-contenido
(lleva su currency) para exportarlo a frío sin joins.

`market_id` es cross-context (identity) → por ID, SIN FK (ADR 33). FKs SOLO intra-contexto (`save.*`).
Dinero en BIGINT (§12·B).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.db.base import Base

_SCHEMA = "save"


class TaxonomyNodeModel(Base):
    """Nodo de la taxonomía canónica — ÁRBOL (self-FK). Único por (market, parent, name)."""

    __tablename__ = "taxonomy_node"
    __table_args__ = (
        UniqueConstraint("market_id", "parent_id", "name", name="uq_taxonomy_market_parent_name"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.taxonomy_node.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    market_id: Mapped[str] = mapped_column(Text, nullable=False)  # cross-context, sin FK


class BrandModel(Base):
    """Marca normalizada (como `merchant` en insights). Única por (market, name)."""

    __tablename__ = "brand"
    __table_args__ = (
        UniqueConstraint("market_id", "name", name="uq_brand_market_name"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    market_id: Mapped[str] = mapped_column(Text, nullable=False)


class ProviderModel(Base):
    """Tienda/proveedor. `base_url` alimenta el adapter de ingesta."""

    __tablename__ = "provider"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)       # supermarket|bank|insurer
    platform: Mapped[str] = mapped_column(Text, nullable=False)   # vtex|magento|shopify|aggregator|spa
    market_id: Mapped[str] = mapped_column(Text, nullable=False)  # "DO"|"US"|"CO" — por ID (ADR 33)
    base_url: Mapped[str | None] = mapped_column(Text)


class CanonicalProductModel(Base):
    """Producto canónico (resultado del matching), POR-MERCADO. Cuelga de una hoja de taxonomía."""

    __tablename__ = "canonical_product"
    __table_args__ = (
        Index("ix_canonical_product_market", "market_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.brand.id")
    )
    quality: Mapped[str | None] = mapped_column(Text)            # Premium|Selecto|…
    size_amount: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)  # Quantity (VO)
    size_measure: Mapped[str] = mapped_column(Text, nullable=False)               # mass|volume|count
    taxonomy_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.taxonomy_node.id")
    )
    market_id: Mapped[str] = mapped_column(Text, nullable=False)


class StoreProductModel(Base):
    """Presentación del canónico en una tienda + precio ACTUAL (SCD-4). Único por (provider, external_id)."""

    __tablename__ = "store_product"
    __table_args__ = (
        UniqueConstraint("provider_id", "external_id", name="uq_store_product_provider_external"),
        Index("ix_store_product_canonical", "canonical_product_id"),  # hot-path: comparar
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.provider.id"), nullable=False
    )
    canonical_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.canonical_product.id")
    )  # nullable: puede estar sin matchear (cola de revisión)
    external_id: Mapped[str] = mapped_column(Text, nullable=False)   # sku en la tienda (idempotencia)
    current_price_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)  # Money (VO)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    url: Mapped[str | None] = mapped_column(Text)
    ean: Mapped[str | None] = mapped_column(Text)                    # señal fuerte del matching
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # change-only
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PriceModel(Base):
    """Histórico de precio APPEND-ONLY (SCD-4, el foso · §6.2). Nunca UPDATE. Auto-contenido."""

    __tablename__ = "price"
    __table_args__ = (
        Index("ix_price_store_product_captured", "store_product_id", "captured_at"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    store_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.store_product.id", ondelete="CASCADE"), nullable=False
    )
    value_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)  # Money (VO)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    price_type: Mapped[str] = mapped_column(Text, nullable=False)  # online|delivery|shelf|receipt
    source: Mapped[str] = mapped_column(Text, nullable=False)
