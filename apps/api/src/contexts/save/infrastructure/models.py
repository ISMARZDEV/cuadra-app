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

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
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
    # Descriptores del dominio de la hoja para la receta de embedding del clasificador
    # ("arroz, habichuelas, guandules") — data curable (generada offline + revisada), editable
    # desde el admin. Sembrar/editar esto DEBE poner `embedding=NULL` (re-embed). NULL = fallback
    # a la receta padre+nombre. Solo tiene sentido en hojas (level=1). Ver category_embedding_text.
    classification_terms: Mapped[str | None] = mapped_column(Text)
    # BGE-M3 (mismo modelo que canonical_product.embedding) — índice semántico de categorías
    # (save-category-classification). NULL hasta que EmbedCategories lo puebla. Solo hojas (level=1).
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024))


class CollectionModel(Base):
    """Colección curada (A6): grupo hand-pick de productos para un carrusel. Única por (market, slug)."""

    __tablename__ = "collection"
    __table_args__ = (
        UniqueConstraint("market_id", "slug", name="uq_collection_market_slug"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    slug: Mapped[str] = mapped_column(Text, nullable=False)   # llave pública (URL)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    market_id: Mapped[str] = mapped_column(Text, nullable=False)  # por ID (ADR 33)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")


class CollectionProductModel(Base):
    """Pertenencia producto↔colección (M:N) con orden. Única por (colección, producto)."""

    __tablename__ = "collection_product"
    __table_args__ = (
        UniqueConstraint(
            "collection_id", "canonical_product_id", name="uq_collection_product"
        ),
        Index("ix_collection_product_collection", "collection_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.collection.id", ondelete="CASCADE"), nullable=False
    )
    canonical_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("save.canonical_product.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")


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
    logo_url: Mapped[str | None] = mapped_column(Text)  # F2·B1/B3: logo del súper (migración 09526c5ccaca)


class StoreRegistryModel(Base):
    """Config de fuente de extracción por Provider — 1:1 (F2·B1/B3, Batch 3B). Reemplaza el
    wiring hardcodeado en `ingestion/save/sources.py::build_sources`."""

    __tablename__ = "store_registry"
    __table_args__ = (
        UniqueConstraint("provider_id", name="uq_store_registry_provider"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.provider.id"), nullable=False
    )
    platform: Mapped[str] = mapped_column(Text, nullable=False)
    base_url: Mapped[str] = mapped_column(Text, nullable=False)
    endpoints: Mapped[dict | None] = mapped_column(JSONB)
    headers: Mapped[dict | None] = mapped_column(JSONB)
    auth: Mapped[dict | None] = mapped_column(JSONB)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    health_status: Mapped[str | None] = mapped_column(Text)  # solo-lectura desde 3B; lo escribe 3E
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BasketQueryModel(Base):
    """Canasta curada como dato (F2·B1/B3, Batch 3D) — reemplaza `BASKET_QUERIES` hardcodeado en
    `ingestion/save/sources.py` (backfill en la migración de este batch)."""

    __tablename__ = "basket_query"
    __table_args__ = (
        UniqueConstraint("market_id", "query_text", name="uq_basket_query_market_text"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    market_id: Mapped[str] = mapped_column(Text, nullable=False)
    category_label: Mapped[str | None] = mapped_column(Text)
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CanonicalProductModel(Base):
    """Producto canónico (resultado del matching), POR-MERCADO. Cuelga de una hoja de taxonomía."""

    __tablename__ = "canonical_product"
    __table_args__ = (
        Index("ix_canonical_product_market", "market_id"),
        Index("ix_canonical_product_origin_run", "origin_run_id"),
        UniqueConstraint("market_id", "slug", name="uq_canonical_product_market_slug"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    slug: Mapped[str] = mapped_column(Text, nullable=False)  # llave PÚBLICA URL-safe (SEO)
    # Corrida de cuyo descubrimiento nació este canónico (F4 #4.5). La escribe
    # `CreateCanonicalAndLink` desde el match que el humano resolvió. Es lo que hace contable
    # `new_canonicals_count` sin ventanas de tiempo: `count(WHERE origin_run_id = X)`.
    # NULL = anterior a F4, del bootstrap, o creado sin venir de una corrida.
    origin_run_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.brand.id")
    )
    quality: Mapped[str | None] = mapped_column(Text)            # Premium|Selecto|…
    display_size: Mapped[str | None] = mapped_column(Text)       # tamaño original ("10 LB")
    image_url: Mapped[str | None] = mapped_column(Text)
    size_amount: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)  # Quantity (VO)
    size_measure: Mapped[str] = mapped_column(Text, nullable=False)               # mass|volume|count
    taxonomy_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.taxonomy_node.id")
    )
    market_id: Mapped[str] = mapped_column(Text, nullable=False)
    # semántico (F2.0 matching, cascada Batch 7): BGE-M3 dim=1024, poblado a escritura de ingesta.
    # Un solo modelo por deployment — ver CONSTRAINT NOTE en la migración 614e370d452c.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024))


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
    # F3.0 (Loop B): disponibilidad por tienda. False = Loop B lo buscó y ya no lo vende (no se borra).
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # F2·B1 (tarea 1.1/1.10): atributos crudos que la ingesta hoy descarta tras el matching —
    # el revisor humano los necesita ver (poblados en write-time por record_observation).
    name: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(Text)
    size_text: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)
    # Etapa B (save-category-classification): categoría CRUDA de la fuente (path del adapter, ej.
    # "Despensa > Arroz y Granos"). Segunda señal — la cascada la cruza con el nombre para clasificar.
    source_category: Mapped[str | None] = mapped_column(Text)
    # §15.3: localizador(es) extra para el re-fetch por-producto (camino A) cuando `external_id` no
    # alcanza — p.ej. Bravo {"id_articulo": "29866"} (el /get usa idArticulo, no idexterno). NULL salvo
    # las fuentes que lo necesitan.
    source_ref: Mapped[dict | None] = mapped_column(JSONB)


class PriceAlertModel(Base):
    """Suscripción de un usuario a las bajadas de un producto (G4). `user_id` sin FK (ADR 33)."""

    __tablename__ = "price_alert"
    __table_args__ = (
        UniqueConstraint("user_id", "canonical_product_id", name="uq_price_alert_user_product"),
        Index("ix_price_alert_user", "user_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # cross-context
    canonical_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.canonical_product.id", ondelete="CASCADE"), nullable=False
    )
    market_id: Mapped[str] = mapped_column(Text, nullable=False)
    threshold_minor: Mapped[int | None] = mapped_column(BigInteger)  # null = cualquier bajada
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AlertNotificationModel(Base):
    """Evento de alerta disparado (feed in-app). Único por (alerta, tienda, captured_at) → idempotente."""

    __tablename__ = "alert_notification"
    __table_args__ = (
        UniqueConstraint(
            "price_alert_id", "provider_name", "captured_at", name="uq_alert_notification_dedup"
        ),
        Index("ix_alert_notification_user", "user_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    price_alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.price_alert.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    canonical_product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    product_name: Mapped[str] = mapped_column(Text, nullable=False)
    provider_name: Mapped[str] = mapped_column(Text, nullable=False)
    previous_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    current_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    drop_bps: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PushTokenModel(Base):
    """Expo push token de un dispositivo del usuario (G4). Único por token; user_id sin FK (ADR 33)."""

    __tablename__ = "push_token"
    __table_args__ = (
        UniqueConstraint("token", name="uq_push_token_token"),
        Index("ix_push_token_user", "user_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    token: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(Text, nullable=False)  # ios|android
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


class ProductMatchModel(Base):
    """Fuente de verdad del enlace store_product<->canonical_product (F2.0, cascada de matching).

    Único por `store_product_id`: la cascada UPSERTEA (nunca duplica) el intento de enlace de un
    store_product. `decided_by` es TEXT plano (ADR 33: sin FK cruzando schemas hacia `identity`).
    """

    __tablename__ = "product_match"
    __table_args__ = (
        UniqueConstraint("store_product_id", name="uq_product_match_store_product"),
        # Deep-link corrida→cola: `/admin/review-queue?run_id=` filtra por (corrida, estado).
        # Compuesto porque la consulta SIEMPRE lleva las dos: "lo que ESTA corrida dejó pendiente".
        Index("ix_product_match_run_status", "run_id", "status"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    store_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.store_product.id"), nullable=False
    )
    canonical_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.canonical_product.id")
    )  # NULL mientras status == "pending_review" (aún sin candidato confirmado)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)  # ean|trgm|vector|hybrid|llm|human
    status: Mapped[str] = mapped_column(Text, nullable=False)  # auto_linked|pending_review|rejected
    # Corrida que produjo este match (F4 #4.5). Habilita el deep-link corrida→cola (`?run_id=`) y
    # atribuir canónicos a la corrida que los descubrió. NULL = anterior a F4, o creado a mano.
    # TEXT y no FK: el id lo emite el runner (Dagster), que es un sistema externo.
    run_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(Text)  # 'system' | admin user_id
    reason_code: Mapped[str | None] = mapped_column(Text)  # motivo del rechazo (F2·B1, active-learning)
    reason_note: Mapped[str | None] = mapped_column(Text)
    # F2·B1 (tarea 1.2/1.14): costo del juez por fila, SOLO en el camino grey-band/llm — nunca
    # se recalcula, es observabilidad (percentiles p50/p95/p99), no una entrada a la decisión.
    judge_input_tokens: Mapped[int | None] = mapped_column(Integer)
    judge_output_tokens: Mapped[int | None] = mapped_column(Integer)
    judge_model: Mapped[str | None] = mapped_column(Text)


class CategoryClassificationModel(Base):
    """Registro de decisión de clasificación de categoría (save-category-classification, A2).

    Tabla dedicada (NO columna en store_product): guarda la HOJA asignada + confianza + método +
    estado, para store_product Y canonical_product de forma uniforme. Invariantes:
    - CHECK XOR: exactamente uno de (store_product_id, canonical_product_id) NO nulo.
    - Índice único parcial `WHERE status='active'` por FK: a lo sumo UNA clasificación activa por
      producto (la 'actual'). Re-clasificar marca la anterior 'superseded' e inserta una nueva
      'active' (historial preservado, sin anomalía de actualización — normalización).
    """

    __tablename__ = "category_classification"
    __table_args__ = (
        CheckConstraint(
            "(store_product_id IS NULL) <> (canonical_product_id IS NULL)",
            name="ck_category_classification_xor_ref",
        ),
        Index(
            "uq_category_classification_active_store_product",
            "store_product_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index(
            "uq_category_classification_active_canonical",
            "canonical_product_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    store_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.store_product.id", ondelete="CASCADE")
    )
    canonical_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.canonical_product.id", ondelete="CASCADE")
    )
    taxonomy_node_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.taxonomy_node.id"), nullable=False
    )  # la HOJA asignada; el badge/filtro tope se deriva por ancestros
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)  # lexicon|trgm|vector|hybrid|llm|human
    status: Mapped[str] = mapped_column(Text, nullable=False)  # active|superseded|rejected
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ReviewCandidateModel(Base):
    """Snapshot de los top-5 candidatos ofrecidos al revisor humano de un `product_match`
    `pending_review` (F2·B1, tarea 1.3/1.11-1.12) — capturado en el momento de la cascada
    (score CRUDO por-etapa, no el score fusionado por RRF), nunca recalculado después.
    CASCADE al borrar el `product_match`; nunca se persisten filas para un match `auto_linked`
    (lo decide el use case, `MatchStoreProduct._to_review` vs `_auto_link` — no esta tabla)."""

    __tablename__ = "review_candidate"
    __table_args__ = (
        UniqueConstraint(
            "product_match_id", "canonical_product_id", name="uq_review_candidate_match_canonical"
        ),
        Index("ix_review_candidate_product_match", "product_match_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    product_match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.product_match.id", ondelete="CASCADE"), nullable=False
    )
    canonical_product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("save.canonical_product.id"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(Text)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AdminAuditLogModel(Base):
    """Registro APPEND-ONLY de mutaciones del admin/OFV (T2). Nunca UPDATE/DELETE. `actor_user_id`
    es TEXT plano (ADR 33: sin FK cruzando schemas hacia `identity`). `payload_summary` = resumen
    del cambio (JSONB). Indexado por entidad y por recencia para las vistas de actividad."""

    __tablename__ = "admin_audit_log"
    __table_args__ = (
        Index("ix_admin_audit_target", "target_type", "target_id"),
        Index("ix_admin_audit_market_created", "market_id", "created_at"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    actor_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[str] = mapped_column(Text, nullable=False)
    payload_summary: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    market_id: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class OrchestrationGlobalConfigModel(Base):
    """Defaults operativos por mercado (F4). Una fila por `market_id`; el override por policy gana."""

    __tablename__ = "orchestration_global_config"
    __table_args__ = (
        UniqueConstraint("market_id", name="uq_orchestration_config_market"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    market_id: Mapped[str] = mapped_column(Text, nullable=False)
    default_query_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    default_timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="America/Santo_Domingo"
    )
    default_sla_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_runs_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class OrchestrationPolicyModel(Base):
    """Política operativa por provider-flow (o por asset). El admin es su fuente de verdad; Dagster
    sigue siendo el runner.

    `execution_mode` distingue quién dispara: `manual` (solo Ejecutar ahora), `automatic_chain` (lo
    arrastra una AutomationCondition) o `cron` (por reloj). El invariante "solo `cron` lleva
    cron_expression" lo impone la ENTIDAD (`domain/entities/orchestration.py`), no un CHECK: es una
    regla de negocio con mensaje de error propio, y el dominio es puro.

    Soft-delete con `deleted_at` — NUNCA hard-delete (§5.3): retirar una policy no puede romper el
    histórico de runs, que es append-only y sagrado. El índice único es PARCIAL (`deleted_at IS
    NULL`) para que una policy retirada no bloquee crear su reemplazo.
    """

    __tablename__ = "orchestration_policy"
    __table_args__ = (
        Index(
            "uq_orchestration_policy_active",
            "scope",
            "provider_id",
            "market_id",
            "flow_key",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_orchestration_policy_market", "market_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    scope: Mapped[str] = mapped_column(Text, nullable=False)
    market_id: Mapped[str] = mapped_column(Text, nullable=False)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{_SCHEMA}.provider.id", ondelete="CASCADE"), nullable=True
    )
    flow_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    asset_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    execution_mode: Mapped[str] = mapped_column(Text, nullable=False, server_default="manual")
    cron_expression: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="America/Santo_Domingo"
    )
    sla_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    query_limit_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    priority: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class OrchestrationRunSnapshotModel(Base):
    """Métricas de UNA corrida, medidas por nuestra ingesta (F4 #4.5).

    Qué NO tiene, a propósito:
    - **estado**: esta fila la escribe la corrida DESDE ADENTRO, así que un estado guardado sería
      siempre "en curso" — una columna garantizada a estar mal. El estado lo da el bridge en vivo.
    - **new_canonicals**: se DERIVA por `canonical_product.origin_run_id`. El trabajo humano sobre
      la cola de esta corrida sigue ocurriendo días después; un número congelado al terminar diría
      siempre cero.

    `dagster_run_id` es TEXT y no FK: lo emite el runner, que es un sistema externo. Único, porque
    un reintento de la misma corrida debe ACTUALIZAR — dos filas mostrarían la corrida duplicada y
    los totales sumados dos veces.
    """

    __tablename__ = "orchestration_run_snapshot"
    __table_args__ = (
        UniqueConstraint("dagster_run_id", name="uq_run_snapshot_dagster_run"),
        Index("ix_run_snapshot_policy", "policy_id"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    dagster_run_id: Mapped[str] = mapped_column(Text, nullable=False)
    market_id: Mapped[str] = mapped_column(Text, nullable=False)
    policy_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.orchestration_policy.id", ondelete="SET NULL"),
        nullable=True,
    )
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey(f"{_SCHEMA}.provider.id", ondelete="SET NULL"), nullable=True
    )
    flow_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    seen: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    refreshed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    unmatched: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    matched: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    discarded: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    auto_linked: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    queued_for_review: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # §14 #14 — progreso por QUERIES (distinto de `seen`, que cuenta productos devueltos).
    queries_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    queries_processed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
