"""Repos SQLAlchemy de Save (infra · ADR 31). La `Session` ES el Unit of Work.

`record_observation` implementa el SCD-4 change-only (doc 10): busca el store_product por
(provider, external_id); inserta una fila `price` SOLO si el precio cambió (o es nuevo), y
siempre refresca `last_seen_at`. El brand se resuelve get-or-create por (market, name).
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, exists, func, or_, select, text, update
from sqlalchemy.orm import Session, aliased

from src.shared.money import Currency, Money

from ..domain.alerts import Alert, AlertNotification, AlertSubscription
from ..domain.basket import ProviderOffer
from ..domain.basket_taxonomy import mapping_pairs
from ..domain.classification import (
    CategoryCandidate,
    CategoryClassification,
    CategoryDecision,
    ClassifiableProduct,
)
from ..domain.canonical_catalog import (
    PRICE_STALENESS_THRESHOLD,
    CanonicalCatalogCursor,
    CanonicalCatalogFilters,
    CanonicalCatalogPage,
    CanonicalCatalogRow,
    CanonicalDuplicateCandidate,
    CanonicalEvidenceRow,
    CanonicalProviderPriceRow,
    CanonicalQualityStatus,
)
from ..domain.canonical_image import CanonicalImage
from ..domain.canonical_import import brand_key, normalize_amount_key, normalize_brand
from ..domain.comparison import StoreQuote
from ..domain.drops import PriceChange
from ..domain.coverage import CoveragePair, StaleCovered
from ..domain.entities import (
    BasketQuery,
    CanonicalProduct,
    Collection,
    MatchCandidate,
    PriceType,
    Provider,
    ProviderType,
    SourcePlatform,
    StoreProduct,
    StoreRegistry,
)
from ..domain.history import PricePoint
from ..domain.listing import OfferingRow
from ..domain.store_product_identity import StoreProductLocator
from ..domain.review_queue import StoreProductRawAttrs
from ..domain.slug import product_slug
from ..domain.taxonomy import CategoryNode, slugify
from ..domain.value_objects import Quantity, UnitMeasure, normalize_size_text
from .matching.cascade.embedding_text import build_embedding_text
from .mappers import (
    basket_query_to_entity,
    canonical_to_entity,
    provider_to_entity,
    store_product_to_entity,
    store_registry_to_entity,
)
from ..domain.admin_audit import AdminAuditEntry
from .models import (
    AdminAuditLogModel,
    CanonicalProductImageModel,
    StoreProductImageModel,
    AlertNotificationModel,
    BasketQueryModel,
    BrandModel,
    CanonicalProductModel,
    CategoryClassificationModel,
    CategoryDecisionModel,
    CollectionModel,
    CollectionProductModel,
    PriceAlertModel,
    PriceModel,
    ProductMatchModel,
    ProviderModel,
    PushTokenModel,
    StoreProductModel,
    StoreRegistryModel,
    TaxonomyNodeMarketModel,
    TaxonomyNodeModel,
)


def _parse_uuid(value: str) -> uuid.UUID | None:
    """UUID válido → UUID; malformado → None (para no reventar ante input externo arbitrario)."""
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


# Plegado de identidad de marca EN SQL — espejo de `brand_key` del dominio. Vive acá (no en el
# dominio) porque es una expresión SQLAlchemy: el dominio es PURO y no conoce la base (ADR 31).
# ⚠️ La misma expresión la usa el índice único de `save.brand` (migración `d7c4b2e91f58`). No hay
# `unaccent` instalada, y además `unaccent()` no es IMMUTABLE, así que no serviría para un índice:
# `translate()` sí lo es.
_BRAND_ACCENTS = "ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ"
_BRAND_PLAIN = "AAAAAEEEEIIIIOOOOOUUUUNC"

# Piso de similitud léxica de la búsqueda del USUARIO. Deliberadamente GENEROSO (§6.4): acá un
# resultado de más no hace daño, a diferencia del matching. Número a TUNEAR con el set etiquetado.
_LEXICAL_MIN_SIMILARITY = 0.35

# Piso de similitud SEMÁNTICA. Sin él, pgvector devuelve sus vecinos más cercanos por lejos que
# estén: «sonic screwdriver» traía 5 productos con cara de respuesta, y el agente los habría
# citado. Un catálogo honesto tiene que poder decir «no lo tengo» (§8.1).
# MEDIDO 2026-08-02 con BGE-M3 sobre este catálogo: consultas reales mín **0.5122**, consultas
# inexistentes máx **0.4145**. El piso va en medio del hueco.
_SEMANTIC_MIN_SIMILARITY = 0.46


def brand_key_sql(column):  # type: ignore[no-untyped-def]
    """`brand_key` como expresión SQL, para comparar e indexar sin traer filas a Python."""
    return func.translate(func.upper(func.btrim(column)), _BRAND_ACCENTS, _BRAND_PLAIN)


class SqlProviderRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def add(self, provider: Provider) -> None:
        self._s.add(
            ProviderModel(
                id=uuid.UUID(provider.id),
                name=provider.name,
                type=provider.type.value,
                platform=provider.platform.value,
                market_id=provider.market_id,
                logo_url=provider.logo_url,
            )
        )
        self._s.flush()

    def get_by_id(self, provider_id: str) -> Provider | None:
        pid = _parse_uuid(provider_id)
        m = self._s.get(ProviderModel, pid) if pid else None
        return provider_to_entity(m) if m else None

    def list_by_market(self, market_id: str, *, include_archived: bool = False) -> list[Provider]:
        stmt = select(ProviderModel).where(ProviderModel.market_id == market_id)
        if not include_archived:
            stmt = stmt.where(ProviderModel.archived_at.is_(None))
        models = self._s.scalars(stmt.order_by(ProviderModel.name)).all()
        return [provider_to_entity(m) for m in models]

    def update(self, provider: Provider) -> None:
        pid = _parse_uuid(provider.id)
        m = self._s.get(ProviderModel, pid) if pid else None
        if m is None:  # I/O puro (ADR 31): el "no encontrado" es regla de negocio del use case
            return
        m.name = provider.name
        m.type = provider.type.value
        m.platform = provider.platform.value
        m.market_id = provider.market_id
        m.logo_url = provider.logo_url
        self._s.flush()

    def set_archived(self, provider_id: str, *, archived: bool) -> bool:
        pid = _parse_uuid(provider_id)
        m = self._s.get(ProviderModel, pid) if pid else None
        if m is None:
            return False
        m.archived_at = datetime.now(timezone.utc) if archived else None
        self._s.flush()
        return True


class SqlStoreRegistryRepository:
    """Config de fuente de extracción por Provider — 1:1 (F2·B1/B3, Batch 3B)."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def add(self, source: StoreRegistry) -> None:
        self._s.add(
            StoreRegistryModel(
                id=uuid.UUID(source.id),
                provider_id=uuid.UUID(source.provider_id),
                platform=source.platform.value,
                base_url=source.base_url,
                endpoints=source.endpoints,
                headers=source.headers,
                auth=source.auth,
                enabled=source.enabled,
                health_status=source.health_status,
                paused_at=source.paused_at,
            )
        )
        self._s.flush()

    def get_by_id(self, source_id: str) -> StoreRegistry | None:
        sid = _parse_uuid(source_id)
        m = self._s.get(StoreRegistryModel, sid) if sid else None
        return store_registry_to_entity(m) if m else None

    def get_by_provider_id(self, provider_id: str) -> StoreRegistry | None:
        pid = _parse_uuid(provider_id)
        if pid is None:
            return None
        m = self._s.scalars(
            select(StoreRegistryModel).where(StoreRegistryModel.provider_id == pid)
        ).first()
        return store_registry_to_entity(m) if m else None

    def list_by_market(self, market_id: str) -> list[StoreRegistry]:
        models = self._s.scalars(
            select(StoreRegistryModel)
            .join(ProviderModel, StoreRegistryModel.provider_id == ProviderModel.id)
            .where(ProviderModel.market_id == market_id)
            .order_by(ProviderModel.name)
        ).all()
        return [store_registry_to_entity(m) for m in models]

    def update(self, source: StoreRegistry) -> None:
        sid = _parse_uuid(source.id)
        m = self._s.get(StoreRegistryModel, sid) if sid else None
        if m is None:  # I/O puro (ADR 31): el "no encontrado" es regla de negocio del use case
            return
        m.platform = source.platform.value
        m.base_url = source.base_url
        m.endpoints = source.endpoints
        m.headers = source.headers
        m.auth = source.auth
        m.enabled = source.enabled
        m.health_status = source.health_status
        m.paused_at = source.paused_at
        self._s.flush()


class SqlBasketQueryRepository:
    """Canasta curada como dato — reemplaza `BASKET_QUERIES` hardcodeado (F2·B1/B3, Batch 3D)."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def add(self, query: BasketQuery) -> None:
        self._s.add(
            BasketQueryModel(
                id=uuid.UUID(query.id),
                market_id=query.market_id,
                category_label=query.category_label,
                query_text=query.query_text,
                position=query.position,
                active=query.active,
            )
        )
        self._s.flush()

    def get_by_id(self, query_id: str) -> BasketQuery | None:
        qid = _parse_uuid(query_id)
        m = self._s.get(BasketQueryModel, qid) if qid else None
        return basket_query_to_entity(m) if m else None

    def get_by_market_and_text(self, market_id: str, query_text: str) -> BasketQuery | None:
        m = self._s.scalars(
            select(BasketQueryModel).where(
                BasketQueryModel.market_id == market_id,
                BasketQueryModel.query_text == query_text,
            )
        ).first()
        return basket_query_to_entity(m) if m else None

    def list_by_market(self, market_id: str) -> list[BasketQuery]:
        models = self._s.scalars(
            select(BasketQueryModel)
            .where(BasketQueryModel.market_id == market_id)
            .order_by(BasketQueryModel.position)
        ).all()
        return [basket_query_to_entity(m) for m in models]

    def list_active(self, market_id: str) -> list[BasketQuery]:
        models = self._s.scalars(
            select(BasketQueryModel)
            .where(
                BasketQueryModel.market_id == market_id,
                BasketQueryModel.active.is_(True),
            )
            .order_by(BasketQueryModel.position)
        ).all()
        return [basket_query_to_entity(m) for m in models]

    def update(self, query: BasketQuery) -> None:
        qid = _parse_uuid(query.id)
        m = self._s.get(BasketQueryModel, qid) if qid else None
        if m is None:  # I/O puro (ADR 31): el "no encontrado" es regla de negocio del use case
            return
        m.category_label = query.category_label
        m.query_text = query.query_text
        m.position = query.position
        m.active = query.active
        self._s.flush()

    def remove(self, query_id: str) -> None:
        qid = _parse_uuid(query_id)
        m = self._s.get(BasketQueryModel, qid) if qid else None
        if m is None:
            return
        self._s.delete(m)
        self._s.flush()


class SqlCollectionRepository:
    """Colecciones curadas (A6). Orden por `position` en ambas consultas (rail y pertenencia)."""

    def __init__(self, session: Session) -> None:
        self._s = session

    @staticmethod
    def _to_entity(m: CollectionModel) -> Collection:
        return Collection(id=str(m.id), slug=m.slug, name=m.name, market_id=m.market_id)

    def list_by_market(self, market_id: str) -> list[Collection]:
        models = self._s.scalars(
            select(CollectionModel)
            .where(CollectionModel.market_id == market_id)
            .order_by(CollectionModel.position, CollectionModel.name)
        ).all()
        return [self._to_entity(m) for m in models]

    def get_by_slug(self, slug: str, market_id: str) -> Collection | None:
        m = self._s.scalars(
            select(CollectionModel).where(
                CollectionModel.market_id == market_id, CollectionModel.slug == slug
            )
        ).first()
        return self._to_entity(m) if m else None

    def list_product_ids(self, collection_id: str) -> list[str]:
        cid = _parse_uuid(collection_id)
        if cid is None:
            return []
        rows = self._s.scalars(
            select(CollectionProductModel.canonical_product_id)
            .where(CollectionProductModel.collection_id == cid)
            .order_by(CollectionProductModel.position)
        ).all()
        return [str(pid) for pid in rows]


class SqlCanonicalProductRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def _get_or_create_brand_id(self, name: str, market_id: str) -> uuid.UUID | None:
        """Busca por IDENTIDAD (`brand_key`), no por nombre exacto.

        La comparación exacta anterior es la que llenó la tabla de duplicados: `Bravo` y `BRAVO`,
        `LIDER`/`Líder`/`LÍDER` entraban como marcas distintas, ensuciando el filtro por marca y
        haciendo que reconocer una marca dependiera de cuál variante hubiera llegado primero.

        Se GUARDA `normalize_brand` (mayúscula, con acentos) y se COMPARA `brand_key` (además sin
        acentos): el nombre que se muestra sigue siendo el correcto, y aun así no puede duplicarse.
        """
        if not name.strip():
            return None
        # El plegado se hace en SQL (no cargando las marcas del mercado en memoria) para que use el
        # índice único funcional: la importación masiva crea muchos canónicos seguidos, y un
        # escaneo de la tabla por cada uno sería un N+1 encubierto.
        existing = self._s.scalars(
            select(BrandModel)
            .where(BrandModel.market_id == market_id)
            .where(brand_key_sql(BrandModel.name) == brand_key(name))
        ).first()
        if existing:
            return existing.id
        brand = BrandModel(name=normalize_brand(name), market_id=market_id)
        self._s.add(brand)
        self._s.flush()
        return brand.id

    def names_for(self, canonical_ids: list[str]) -> dict[str, str]:
        """`{id: nombre}` de N canónicos en UNA query. La usa el re-match para que el resumen del
        lote se pueda auditar leyendo nombres y no ids. Omite los que ya no existen."""
        if not canonical_ids:
            return {}
        rows = self._s.execute(
            select(CanonicalProductModel.id, CanonicalProductModel.name).where(
                CanonicalProductModel.id.in_(canonical_ids)
            )
        ).all()
        return {str(r[0]): r[1] or "" for r in rows}

    def name_and_brand_of(self, canonical_product_id: str) -> tuple[str, str | None] | None:
        """`(nombre, marca actual)` — lo justo que necesita "Clasificar marcas" para decidir si
        rellenar o saltar. `None` si el canónico ya no existe."""
        product = self.get_by_id(canonical_product_id)
        return (product.name, product.brand or None) if product is not None else None

    def set_brand(self, canonical_product_id: str, brand: str) -> None:
        """Delega en `update_attributes`, que ya resuelve el FK con get-or-create. Como la marca
        siempre viene RECONOCIDA del catálogo, ese get-or-create nunca crea filas nuevas."""
        self.update_attributes(canonical_product_id, brand=brand)

    def list_brand_names(self, market_id: str) -> list[str]:
        return list(
            self._s.scalars(
                select(BrandModel.name)
                .where(BrandModel.market_id == market_id)
                .where(BrandModel.name.isnot(None))
            ).all()
        )

    def add(self, product: CanonicalProduct) -> None:
        # Unidades canónicas también en el canónico: el display_size se guarda normalizado ("10 Lb").
        display_size = normalize_size_text(product.display_size)
        slug = product.slug or self._unique_slug(
            product_slug(product.name, product.brand, display_size), product.market_id
        )
        self._s.add(
            CanonicalProductModel(
                id=uuid.UUID(product.id),
                slug=slug,
                name=product.name,
                brand_id=self._get_or_create_brand_id(product.brand, product.market_id),
                quality=product.quality,
                display_size=display_size,
                image_url=product.image_url,
                origin_run_id=product.origin_run_id,
                description=product.description,
                size_amount=product.quantity.amount if product.quantity else None,
                size_measure=product.quantity.measure.value if product.quantity else None,
                taxonomy_node_id=(
                    uuid.UUID(product.taxonomy_node_id) if product.taxonomy_node_id else None
                ),
                market_id=product.market_id,
            )
        )
        self._s.flush()

    def update_attributes(
        self,
        canonical_product_id: str,
        *,
        name: str | None = None,
        brand: str | None = None,
        quantity: Quantity | None = None,
        quality: str | None = None,
        display_size: str | None = None,
        image_url: str | None = None,
        taxonomy_node_id: str | None = None,
        description: str | None = None,
        clear_taxonomy: bool = False,
    ) -> CanonicalProduct | None:
        """Edición de atributos del canónico (US-CP-L5/D2).

        ⚠️ El `slug` NO se toca. Es la llave PÚBLICA de la página del producto: regenerarlo al
        editar el nombre rompería enlaces compartidos y el canonical SEO en silencio.
        Regenerarlo es una acción EXPLÍCITA y aparte (US-CP-D2b).

        `None` significa "no cambiar". Para VACIAR la categoría hay que pedirlo con
        `clear_taxonomy=True` — si no, no habría forma de distinguir "dejala como está" de
        "sacásela".

        Si la edición cambia el TEXTO que se embebe (nombre/marca/tamaño de empaque) el `embedding`
        se invalida — ver `_embedding_text`.
        """
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return None
        m = self._s.get(CanonicalProductModel, pid)
        if m is None:
            return None
        embedding_text_before = self._embedding_text(m)

        if name is not None:
            m.name = name
        if brand is not None:
            m.brand_id = self._get_or_create_brand_id(brand, m.market_id)
        if quantity is not None:
            m.size_amount = quantity.amount
            m.size_measure = quantity.measure.value
        if quality is not None:
            m.quality = quality or None
        if display_size is not None:
            m.display_size = normalize_size_text(display_size)
        if image_url is not None:
            m.image_url = image_url or None
        if description is not None:
            m.description = description.strip() or None
        if clear_taxonomy:
            m.taxonomy_node_id = None
        elif taxonomy_node_id is not None:
            m.taxonomy_node_id = _parse_uuid(taxonomy_node_id)

        if self._embedding_text(m) != embedding_text_before:
            m.embedding = None  # el input del embedding cambió → invalidar para re-embed

        self._s.flush()
        return canonical_to_entity(m, self._brand_name(m.brand_id))

    def set_archived(self, canonical_product_id: str, *, archived: bool) -> datetime | None | bool:
        """Archiva o restaura (US-CP-L6/D12). Devuelve `False` si el canónico no existe.

        SOFT-delete: no se borra la fila ni se desenlazan las tiendas. Un `DELETE` real dejaría
        `store_product.canonical_product_id` colgando y rompería comparaciones ya publicadas.
        """
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return False
        m = self._s.get(CanonicalProductModel, pid)
        if m is None:
            return False
        m.archived_at = datetime.now(timezone.utc) if archived else None
        self._s.flush()
        return m.archived_at

    def set_internal_note(self, canonical_product_id: str, note: str | None) -> bool:
        """Nota interna del operador (US-CP-D10). Vacío → NULL, para no guardar cadenas en blanco
        que la UI tendría que distinguir de "sin nota"."""
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return False
        m = self._s.get(CanonicalProductModel, pid)
        if m is None:
            return False
        m.internal_note = (note or "").strip() or None
        self._s.flush()
        return True

    def slug_candidate(self, canonical_product_id: str) -> tuple[str, str] | None:
        """`(slug_actual, slug_que_tendría)` recalculado desde nombre/marca/tamaño (US-CP-D2b).

        PURO respecto a la base: no escribe. Es lo que alimenta el preview con advertencia SEO —
        el operador tiene que ver la URL nueva ANTES de romper la vieja.
        """
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return None
        m = self._s.get(CanonicalProductModel, pid)
        if m is None:
            return None
        base = product_slug(m.name, self._brand_name(m.brand_id), m.display_size)
        return m.slug, self._unique_slug(base, m.market_id, exclude_id=m.id)

    def regenerate_slug(self, canonical_product_id: str) -> tuple[str, str] | None:
        """Regenera el slug y devuelve `(viejo, nuevo)`. Acción EXPLÍCITA (US-CP-D2b): nunca la
        dispara una edición de nombre, porque cambiar la llave pública rompe enlaces compartidos
        y el canonical SEO en silencio."""
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return None
        m = self._s.get(CanonicalProductModel, pid)
        if m is None:
            return None
        old = m.slug
        base = product_slug(m.name, self._brand_name(m.brand_id), m.display_size)
        m.slug = self._unique_slug(base, m.market_id, exclude_id=m.id)
        self._s.flush()
        return old, m.slug

    def _unique_slug(
        self, base: str, market_id: str, *, exclude_id: uuid.UUID | None = None
    ) -> str:
        """Slug único por-mercado: si `base` ya existe, sufija -2, -3… (invariante del catálogo).

        `exclude_id` es para REGENERAR: el slug que "ya existe" suele ser el del propio producto,
        y sin excluirse a sí mismo regenerar sin haber cambiado nada renombraría `arroz-10-lb` a
        `arroz-10-lb-2` — un cambio de URL pública a cambio de nada.
        """
        base = base or "producto"
        candidate, n = base, 2
        while True:
            clash = select(CanonicalProductModel.id).where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.slug == candidate,
            )
            if exclude_id is not None:
                clash = clash.where(CanonicalProductModel.id != exclude_id)
            if self._s.scalars(clash).first() is None:
                return candidate
            candidate, n = f"{base}-{n}", n + 1

    def get_by_slug(self, slug: str, market_id: str) -> CanonicalProduct | None:
        # `archived_at IS NULL`: para el sitio público un canónico archivado NO EXISTE. Es la
        # razón de ser del archivado — si siguiera resolviendo, la acción sería una mentira.
        m = self._s.scalars(
            select(CanonicalProductModel).where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.slug == slug,
                CanonicalProductModel.archived_at.is_(None),
            )
        ).first()
        return canonical_to_entity(m, self._brand_name(m.brand_id)) if m else None

    def _brand_name(self, brand_id: uuid.UUID | None) -> str:
        if brand_id is None:
            return ""
        b = self._s.get(BrandModel, brand_id)
        return b.name if b else ""

    def _embedding_text(self, m: CanonicalProductModel) -> str:
        """El texto que la etapa vectorial embebe para este canónico.

        Se compara ANTES y DESPUÉS de una edición para saber si el `embedding` guardado quedó
        describiendo al producto VIEJO. Un vector obsoleto es PEOR que uno ausente: el ausente sólo
        vuelve invisible al producto, el obsoleto lo devuelve como candidato por un nombre que ya
        no existe. Y `list_without_embedding` sólo levanta los NULL, así que sin invalidar acá el
        backfill NUNCA podría repararlo. Mismo patrón que `SqlTaxonomyRepository.set_terms`.

        Deriva de `build_embedding_text`, no de una lista de campos copiada a mano: si la receta
        cambia, esta comparación la sigue sola.
        """
        return build_embedding_text(m.name, self._brand_name(m.brand_id), m.display_size or "")

    def get_by_id(self, product_id: str) -> CanonicalProduct | None:
        pid = _parse_uuid(product_id)
        if pid is None:  # id malformado → None (evita ValueError→500; da 404 limpio, SEO)
            return None
        m = self._s.get(CanonicalProductModel, pid)
        return canonical_to_entity(m, self._brand_name(m.brand_id)) if m else None

    def search(self, query: str, market_id: str) -> list[CanonicalProduct]:
        models = self._s.scalars(
            select(CanonicalProductModel).where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.name.ilike(f"%{query}%"),
                CanonicalProductModel.archived_at.is_(None),
            )
        ).all()
        return [canonical_to_entity(m, self._brand_name(m.brand_id)) for m in models]

    def search_lexical(
        self, query: str, market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        # `word_similarity(q, target)`, NO `similarity`: la consulta del usuario es CORTA y el
        # nombre del catálogo es largo ("Arroz Campos Premium 20 Lb"). `similarity` divide por la
        # unión de trigramas, así que "arroz" contra ese nombre puntúa bajísimo; `word_similarity`
        # compara la consulta contra el mejor TRAMO del nombre, que es la pregunta real.
        name_score = func.word_similarity(query, CanonicalProductModel.name)
        brand_score = func.coalesce(func.word_similarity(query, BrandModel.name), 0.0)
        score = func.greatest(name_score, brand_score).label("score")
        rows = self._s.execute(
            select(CanonicalProductModel.id, score)
            .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
            .where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.archived_at.is_(None),
                score > _LEXICAL_MIN_SIMILARITY,
            )
            .order_by(score.desc())
            .limit(limit)
        ).all()
        return [MatchCandidate(canonical_product_id=str(r.id), score=float(r.score)) for r in rows]

    def search_semantic(
        self, embedding: list[float], market_id: str, limit: int = 20
    ) -> list[MatchCandidate]:
        distance = CanonicalProductModel.embedding.cosine_distance(embedding).label("distance")
        rows = self._s.execute(
            select(CanonicalProductModel.id, distance)
            .where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.archived_at.is_(None),
                CanonicalProductModel.embedding.is_not(None),  # sin vector no hay vecindad
            )
            .order_by(distance)
            .limit(limit)
        ).all()
        # El puerto habla en SIMILITUD [0,1] (como trgm); pgvector devuelve DISTANCIA coseno.
        # El piso se aplica ACÁ y no en el SQL: el índice HNSW ordena por distancia, así que
        # filtrar después de traer el top-N no cuesta nada y mantiene la query indexada.
        candidates = [
            MatchCandidate(canonical_product_id=str(r.id), score=1.0 - float(r.distance))
            for r in rows
        ]
        return [c for c in candidates if c.score >= _SEMANTIC_MIN_SIMILARITY]

    def get_many(
        self, product_ids: Sequence[str], market_id: str
    ) -> list[CanonicalProduct]:
        uuids = [u for u in (_parse_uuid(pid) for pid in product_ids) if u is not None]
        if not uuids:
            return []
        models = self._s.scalars(
            select(CanonicalProductModel).where(
                CanonicalProductModel.id.in_(uuids),
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.archived_at.is_(None),
            )
        ).all()
        return [canonical_to_entity(m, self._brand_name(m.brand_id)) for m in models]

    def list_by_market(
        self, market_id: str, limit: int = 1000, offset: int = 0
    ) -> list[CanonicalProduct]:
        models = self._s.scalars(
            select(CanonicalProductModel)
            .where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.archived_at.is_(None),
            )
            .order_by(CanonicalProductModel.name)
            .limit(limit)
            .offset(offset)
        ).all()
        return [canonical_to_entity(m, self._brand_name(m.brand_id)) for m in models]

    def list_without_embedding(
        self, market_id: str, limit: int = 500
    ) -> list[CanonicalProduct]:
        models = self._s.scalars(
            select(CanonicalProductModel)
            .where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.embedding.is_(None),
            )
            .limit(limit)
        ).all()
        return [canonical_to_entity(m, self._brand_name(m.brand_id)) for m in models]

    def set_embedding(self, product_id: str, embedding: list[float]) -> None:
        pid = _parse_uuid(product_id)
        m = self._s.get(CanonicalProductModel, pid) if pid else None
        if m is None:  # I/O puro (ADR 31): el "no encontrado" lo maneja el use case
            return
        m.embedding = embedding
        self._s.flush()


class SqlStoreProductRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def _replace_store_images(self, store_product_id: uuid.UUID, urls: tuple[str, ...]) -> None:
        """Reemplaza ENTERA la galería de la tienda (F5, tarea 9).

        Reemplazo total y no merge: la tienda puede agregar, quitar o REORDENAR sus fotos, y
        conservar las viejas mostraría imágenes que ya no publica. Si la observación no trae
        ninguna (adapters que aún no las mandan), no se toca lo que había — borrar por omisión
        vaciaría la galería en cada corrida parcial.
        """
        if not urls:
            return
        current = self._s.scalars(
            select(StoreProductImageModel)
            .where(StoreProductImageModel.store_product_id == store_product_id)
            .order_by(StoreProductImageModel.position)
        ).all()
        if [m.url for m in current] == list(urls):
            return  # sin cambios: no reescribir en cada corrida

        for model in current:
            self._s.delete(model)
        self._s.flush()  # antes del insert: si no, choca `UNIQUE(store_product, position)`
        for index, url in enumerate(urls, start=1):
            self._s.add(
                StoreProductImageModel(
                    store_product_id=store_product_id, url=url, position=index
                )
            )
        self._s.flush()

    def list_store_images(self, store_product_id: str) -> list[str]:
        """URLs que publica la tienda, en su orden. Alimentan las candidatas de la galería."""
        pid = _parse_uuid(store_product_id)
        if pid is None:
            return []
        return list(
            self._s.scalars(
                select(StoreProductImageModel.url)
                .where(StoreProductImageModel.store_product_id == pid)
                .order_by(StoreProductImageModel.position)
            ).all()
        )

    def _find(self, provider_id: str, external_id: str) -> StoreProductModel | None:
        return self._s.scalars(
            select(StoreProductModel).where(
                StoreProductModel.provider_id == uuid.UUID(provider_id),
                StoreProductModel.external_id == external_id,
            )
        ).first()

    def exists(self, provider_id: str, external_id: str) -> bool:
        return self._find(provider_id, external_id) is not None

    def max_last_seen_at(self, provider_id: str) -> datetime | None:
        return self._s.scalar(
            select(func.max(StoreProductModel.last_seen_at)).where(
                StoreProductModel.provider_id == uuid.UUID(provider_id)
            )
        )

    def count_by_provider(self, provider_id: str) -> int:
        return self._s.scalar(
            select(func.count(StoreProductModel.id)).where(
                StoreProductModel.provider_id == uuid.UUID(provider_id)
            )
        ) or 0

    def set_brand(self, store_product_id: str, brand: str) -> None:
        sp = self._s.get(StoreProductModel, _parse_uuid(store_product_id))
        if sp is None:
            return
        sp.brand = brand
        self._s.flush()

    def brands_by_canonical(self, canonical_ids: list[str]) -> dict[str, list[str]]:
        """UNA query para todo el lote — misma técnica que las galerías de `list_providers`."""
        ids = [pid for pid in (_parse_uuid(cid) for cid in canonical_ids) if pid is not None]
        if not ids:
            return {}
        brands: dict[str, list[str]] = {}
        for canonical_id, brand in self._s.execute(
            select(StoreProductModel.canonical_product_id, StoreProductModel.brand)
            .where(StoreProductModel.canonical_product_id.in_(ids))
            .where(StoreProductModel.brand.isnot(None))
            .order_by(StoreProductModel.id)  # orden estable → desempate reproducible
        ).all():
            brands.setdefault(str(canonical_id), []).append(brand)
        return brands

    def link_to_canonical(self, store_product_id: str, canonical_product_id: str) -> None:
        # Escritor del FK denormalizado (F2.0 matching). No commitea: la Session es el UoW y el
        # use case de la cascada confirma la transacción junto al product_match correspondiente.
        sp = self._s.get(StoreProductModel, uuid.UUID(store_product_id))
        if sp is None:
            return
        sp.canonical_product_id = uuid.UUID(canonical_product_id)
        self._s.flush()

    # ------------------------------------------------ acciones por proveedor del detalle canónico

    def unlink_from_canonical(self, store_product_id: str) -> None:
        """Limpia el FK denormalizado. Inversa exacta de `link_to_canonical`, y por la misma razón
        no commitea: el use case (`UnlinkStoreProduct`) confirma junto al `product_match`."""
        sp = self._s.get(StoreProductModel, uuid.UUID(store_product_id))
        if sp is None:
            return
        sp.canonical_product_id = None
        self._s.flush()

    def get_locator(self, store_product_id: str) -> StoreProductLocator | None:
        """El par `(provider_id, external_id)` que IDENTIFICA al producto para la ingesta — lo que
        `RefreshPrices` consulta con `exists(...)`. Se lee antes de un borrado duro porque después
        no hay de dónde sacarlo, y sin él la auditoría no podría decir qué se destruyó."""
        sp = self._s.get(StoreProductModel, uuid.UUID(store_product_id))
        if sp is None:
            return None
        return StoreProductLocator(
            provider_id=str(sp.provider_id), external_id=sp.external_id
        )

    def count_prices(self, store_product_id: str) -> int:
        """Cuántas observaciones de precio se llevaría un borrado duro (`price` es ON DELETE
        CASCADE). Alimenta el diálogo de confirmación: un borrado irreversible tiene que decir
        cuánto cuesta ANTES de ejecutarse."""
        return self._s.scalar(
            select(func.count(PriceModel.id)).where(
                PriceModel.store_product_id == uuid.UUID(store_product_id)
            )
        ) or 0

    def delete(self, store_product_id: str) -> None:
        """Borrado DURO. Libera la identidad `(provider_id, external_id)` para que la próxima
        corrida lo re-ingiera desde cero (`refresh_prices.py:118`).

        REQUIERE que su `product_match` ya no exista (`ON DELETE NO ACTION`); el orden lo garantiza
        `DiscardStoreProduct`. La base propaga en cascada a `price`, `store_product_image` y
        `category_classification`, y pone en NULL `canonical_product_image.source_store_product_id`.
        """
        sp = self._s.get(StoreProductModel, uuid.UUID(store_product_id))
        if sp is None:
            return
        self._s.delete(sp)
        self._s.flush()

    def record_observation(
        self,
        *,
        provider_id: str,
        external_id: str,
        canonical_product_id: str | None,
        price: Money,
        captured_at: datetime,
        price_type: PriceType,
        source: str,
        url: str | None = None,
        ean: str | None = None,
        name: str | None = None,
        brand: str | None = None,
        size_text: str | None = None,
        image_urls: tuple[str, ...] = (),
        description: str | None = None,
        source_category: str | None = None,
        source_ref: dict | None = None,
    ) -> str:
        # Unidades canónicas desde la FUENTE: el tamaño se guarda ya normalizado ("20 Lbs" → "20 Lb").
        size_text = normalize_size_text(size_text)
        # La principal es la PRIMERA de la tienda; se denormaliza en `store_product.image_url`
        # para no romper a quien ya la lee (cola de revisión, comparación, candidatas).
        image_url = image_urls[0] if image_urls else None
        sp = self._find(provider_id, external_id)
        changed = False
        if sp is None:
            sp = StoreProductModel(
                provider_id=uuid.UUID(provider_id),
                canonical_product_id=(
                    uuid.UUID(canonical_product_id) if canonical_product_id else None
                ),
                external_id=external_id,
                current_price_minor=price.amount_minor,
                currency=price.currency.code,
                url=url,
                ean=ean,
                name=name,
                brand=brand,
                size_text=size_text,
                image_url=image_url,
                description=description,
                source_category=source_category,
                source_ref=source_ref,
                last_seen_at=captured_at,
                is_available=True,
            )
            self._s.add(sp)
            self._s.flush()
            changed = True
        else:
            sp.last_seen_at = captured_at
            sp.is_available = True  # F3.0: re-observado = vuelve a estar disponible
            # F2·B1 (1.9-1.10): refresca los atributos crudos cuando llegan (nunca los borra con
            # None — una observación posterior sin estos campos no debe pisar los ya conocidos).
            if name is not None:
                sp.name = name
            if brand is not None:
                sp.brand = brand
            if size_text is not None:
                sp.size_text = size_text
            if image_url is not None:
                sp.image_url = image_url
            if description is not None:
                sp.description = description
            if source_category is not None:
                sp.source_category = source_category
            if source_ref is not None:  # §15.3: se refresca el localizador de detalle cuando llega
                sp.source_ref = source_ref
            if ean is not None:
                # §15.5: hay fuentes cuyo BROWSE no trae barcode y cuyo DETALLE sí (Bravo). Como
                # `price_refresh` ya pide el detalle de todo lo conocido, el EAN se rellena solo, sin
                # requests extra. Misma regla que arriba: un browse posterior (ean=None) NO lo borra.
                sp.ean = ean
            if sp.current_price_minor != price.amount_minor or sp.currency != price.currency.code:
                sp.current_price_minor = price.amount_minor
                sp.currency = price.currency.code
                changed = True

        if changed:  # SCD-4: fila de histórico SOLO cuando cambia
            self._s.add(
                PriceModel(
                    store_product_id=sp.id,
                    value_minor=price.amount_minor,
                    currency=price.currency.code,
                    captured_at=captured_at,
                    price_type=price_type.value,
                    source=source,
                )
            )
        self._s.flush()
        self._replace_store_images(sp.id, image_urls)
        return str(sp.id)

    def set_availability(self, store_product_id: str, available: bool) -> None:
        sid = _parse_uuid(store_product_id)
        m = self._s.get(StoreProductModel, sid) if sid else None
        if m is None:  # I/O puro (ADR 31): el "no encontrado" es regla del use case
            return
        m.is_available = available
        self._s.flush()

    def repair_locator(self, store_product_id: str, external_id: str, url: str | None) -> None:
        """F3.2b: apunta el `store_product` al nuevo localizador. NO toca `canonical_product_id`: es
        el MISMO producto, solo se movió de dirección — el enlace al canónico sigue siendo válido.
        `url` solo se pisa si la búsqueda trajo una (un candidato sin url no debe borrar la vieja)."""
        sid = _parse_uuid(store_product_id)
        m = self._s.get(StoreProductModel, sid) if sid else None
        if m is None:  # I/O puro (ADR 31): el "no encontrado" es regla del use case
            return
        m.external_id = external_id
        if url:
            m.url = url
        self._s.flush()

    def list_uncovered(self, market_id: str) -> list[CoveragePair]:
        # CROSS JOIN canónico×tienda del mercado (join por market_id) − LEFT JOIN store_product IS NULL
        # = los pares sin cubrir. Solo tiendas SUPERMARKET (no bancos/aseguradoras del vertical F3).
        #
        # R5: además, SOLO los canónicos ALCANZABLES POR BARCODE. El Proceso 2 identifica POR barcode
        # ("¿tenés el artículo con el código X?"); sin X conocido no hay consulta posible, y listar el
        # par solo produce requests inútiles contra APIs de terceros.
        #
        # "Alcanzable" es DERIVADO, no una columna: `canonical_product` no tiene `ean`. Significa
        # "algún store_product ligado a él tiene barcode" — el código vive en el store y el canónico
        # es el hub. En cuanto Sirena (100% de cobertura) lo descubre y matchea, el canónico se vuelve
        # alcanzable y el job por EAN de Bravo empieza a servirle (R7).
        cp = CanonicalProductModel
        pr = ProviderModel
        sp = StoreProductModel
        seeder = aliased(StoreProductModel)  # la presencia (de cualquier tienda) que aporta el barcode
        rows = self._s.execute(
            select(cp.id, pr.id)
            .select_from(cp)
            .join(pr, pr.market_id == cp.market_id)
            .outerjoin(sp, and_(sp.canonical_product_id == cp.id, sp.provider_id == pr.id))
            .where(
                cp.market_id == market_id,
                pr.type == ProviderType.SUPERMARKET.value,
                sp.id.is_(None),
                exists().where(
                    and_(seeder.canonical_product_id == cp.id, seeder.ean.is_not(None))
                ),
            )
        ).all()
        return [CoveragePair(str(cid), str(pid)) for cid, pid in rows]

    def find_ean_for_canonical(self, canonical_product_id: str) -> str | None:
        cid = _parse_uuid(canonical_product_id)
        if cid is None:
            return None
        return self._s.execute(
            select(StoreProductModel.ean)
            .where(
                StoreProductModel.canonical_product_id == cid,
                StoreProductModel.ean.is_not(None),
            )
            .limit(1)
        ).scalar_one_or_none()

    def has_other_product_from_provider(
        self, canonical_product_id: str, provider_id: str, excluding_store_product_id: str
    ) -> bool:
        """Invariante de proveedor único — ver el puerto. Ids malformados → `False` (no bloquea):
        el gate nunca puede convertir un dato raro en un rechazo silencioso."""
        cid = _parse_uuid(canonical_product_id)
        pid = _parse_uuid(provider_id)
        if cid is None or pid is None:
            return False
        stmt = select(StoreProductModel.id).where(
            StoreProductModel.canonical_product_id == cid,
            StoreProductModel.provider_id == pid,
        )
        excluded = _parse_uuid(excluding_store_product_id)
        if excluded is not None:
            stmt = stmt.where(StoreProductModel.id != excluded)
        return self._s.execute(stmt.limit(1)).first() is not None

    def list_stale_covered(
        self,
        market_id: str,
        now: datetime | None = None,
        *,
        visible_ttl_hours: int = 18,
        hidden_ttl_hours: int = 72,
        limit: int = 500,
        provider_id: str | None = None,
    ) -> list[StaleCovered]:
        return self._list_stale(
            market_id, now, covered_only=True,
            visible_ttl_hours=visible_ttl_hours, hidden_ttl_hours=hidden_ttl_hours, limit=limit,
            provider_id=provider_id,
        )

    def list_stale_known(
        self,
        market_id: str,
        now: datetime | None = None,
        *,
        visible_ttl_hours: int = 18,
        hidden_ttl_hours: int = 72,
        limit: int = 500,
        provider_id: str | None = None,
    ) -> list[StaleCovered]:
        # TODO lo conocido y viejo (matcheado O en revisión) → re-precio por id (Prices Batch de SRD).
        return self._list_stale(
            market_id, now, covered_only=False,
            visible_ttl_hours=visible_ttl_hours, hidden_ttl_hours=hidden_ttl_hours, limit=limit,
            provider_id=provider_id,
        )

    def _list_stale(
        self,
        market_id: str,
        now: datetime | None,
        *,
        covered_only: bool,
        visible_ttl_hours: int,
        hidden_ttl_hours: int,
        limit: int,
        provider_id: str | None = None,
    ) -> list[StaleCovered]:
        ref = now or datetime.now(timezone.utc)
        visible_cut = ref - timedelta(hours=visible_ttl_hours)
        hidden_cut = ref - timedelta(hours=hidden_ttl_hours)
        sp = StoreProductModel
        pr = ProviderModel
        conds = [
            pr.market_id == market_id,
            or_(
                and_(sp.is_available.is_(True), sp.last_seen_at < visible_cut),
                and_(sp.is_available.is_(False), sp.last_seen_at < hidden_cut),
            ),
        ]
        if covered_only:
            conds.append(sp.canonical_product_id.is_not(None))  # F3.2a: solo lo YA cubierto
        # El `limit` es un cupo: sin acotar por tienda, la más atrasada se lo lleva entero.
        if provider_id:
            conds.append(sp.provider_id == _parse_uuid(provider_id))
        rows = self._s.execute(
            # `canonical_product_id` = la llave de recuperación de F3.2b (§14.3): si el camino A dice
            # "ya no está", con ella se pide el EAN del canónico y se le repregunta a la tienda.
            select(
                sp.id, sp.provider_id, sp.external_id, sp.url, pr.platform, sp.source_ref,
                sp.canonical_product_id,
            )
            .join(pr, pr.id == sp.provider_id)
            .where(*conds)
            .order_by(sp.last_seen_at.asc())  # el más viejo primero
            .limit(limit)
        ).all()
        return [
            StaleCovered(
                store_product_id=str(spid),
                provider_id=str(pid),
                external_id=ext,
                url=url,
                platform=SourcePlatform(platform),
                source_ref=source_ref,
                canonical_product_id=str(cid) if cid else None,
            )
            for spid, pid, ext, url, platform, source_ref, cid in rows
        ]

    def list_by_canonical(self, canonical_product_id: str) -> list[StoreProduct]:
        models = self._s.scalars(
            select(StoreProductModel).where(
                StoreProductModel.canonical_product_id == uuid.UUID(canonical_product_id)
            )
        ).all()
        return [store_product_to_entity(m) for m in models]

    def get_raw_attrs(self, store_product_id: str) -> StoreProductRawAttrs | None:
        sid = _parse_uuid(store_product_id)
        if sid is None:
            return None
        # JOIN a provider para la "Tienda origen" + market_id (Etapa A); `external_id` = SKU de la
        # tienda. LEFT JOIN a la clasificación ACTIVA (Etapa B) + su hoja → categoría sugerida.
        cc = CategoryClassificationModel
        tn = TaxonomyNodeModel
        row = self._s.execute(
            select(
                StoreProductModel,
                ProviderModel.name,
                ProviderModel.market_id,
                cc.taxonomy_node_id,
                tn.name,
            )
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .outerjoin(
                cc, and_(cc.store_product_id == StoreProductModel.id, cc.status == "active")
            )
            .outerjoin(tn, tn.id == cc.taxonomy_node_id)
            .where(StoreProductModel.id == sid)
        ).first()
        if row is None:
            return None
        sp, provider_name, market_id, suggested_leaf_id, suggested_leaf_name = row
        return StoreProductRawAttrs(
            store_product_id=str(sp.id),
            name=sp.name,
            brand=sp.brand,
            size_text=sp.size_text,
            image_url=sp.image_url,
            sku=sp.external_id,
            ean=sp.ean,
            url=sp.url,
            provider_name=provider_name,
            market_id=market_id,
            suggested_taxonomy_node_id=str(suggested_leaf_id) if suggested_leaf_id else None,
            suggested_category_name=suggested_leaf_name,
        )

    def list_price_history(self, canonical_product_id: str) -> list[PricePoint]:
        rows = self._s.execute(
            select(PriceModel, StoreProductModel.provider_id, ProviderModel.name)
            .join(StoreProductModel, PriceModel.store_product_id == StoreProductModel.id)
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .where(StoreProductModel.canonical_product_id == uuid.UUID(canonical_product_id))
            .order_by(PriceModel.captured_at)
        ).all()
        return [
            PricePoint(
                provider_id=str(provider_id),
                provider_name=name,
                price=Money(p.value_minor, Currency(p.currency)),
                captured_at=p.captured_at,
                price_type=PriceType(p.price_type),
            )
            for p, provider_id, name in rows
        ]

    def list_price_changes(self, market_id: str, since: datetime) -> list[PriceChange]:
        """Pares previous→current vía LAG por store_product; el dominio clasifica la bajada."""
        lagged = (
            select(
                PriceModel.store_product_id,
                PriceModel.value_minor,
                PriceModel.currency,
                PriceModel.captured_at,
                PriceModel.price_type,
                func.lag(PriceModel.value_minor)
                .over(partition_by=PriceModel.store_product_id, order_by=PriceModel.captured_at)
                .label("prev_minor"),
                func.lag(PriceModel.currency)
                .over(partition_by=PriceModel.store_product_id, order_by=PriceModel.captured_at)
                .label("prev_currency"),
            )
        ).subquery()

        rows = self._s.execute(
            select(
                lagged,
                StoreProductModel.canonical_product_id,
                StoreProductModel.provider_id,
                ProviderModel.name.label("provider_name"),
                CanonicalProductModel.name.label("product_name"),
            )
            .join(StoreProductModel, lagged.c.store_product_id == StoreProductModel.id)
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .join(
                CanonicalProductModel,
                StoreProductModel.canonical_product_id == CanonicalProductModel.id,
            )
            .where(
                lagged.c.prev_minor.is_not(None),
                lagged.c.captured_at >= since,
                ProviderModel.market_id == market_id,
            )
            .order_by(lagged.c.captured_at)
        ).all()
        return [
            PriceChange(
                canonical_product_id=str(r.canonical_product_id),
                product_name=r.product_name,
                provider_id=str(r.provider_id),
                provider_name=r.provider_name,
                previous=Money(r.prev_minor, Currency(r.prev_currency)),
                current=Money(r.value_minor, Currency(r.currency)),
                captured_at=r.captured_at,
                price_type=PriceType(r.price_type),
            )
            for r in rows
        ]

    def list_quotes_by_canonical(self, canonical_product_id: str) -> list[StoreQuote]:
        rows = self._s.execute(
            select(StoreProductModel, ProviderModel.name)
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .where(
                StoreProductModel.canonical_product_id == uuid.UUID(canonical_product_id),
                StoreProductModel.is_available.is_(True),  # F3.0: no comparar/linkear lo agotado
            )
        ).all()
        return [
            StoreQuote(
                provider_id=str(sp.provider_id),
                provider_name=name,
                price=Money(sp.current_price_minor, Currency(sp.currency)),
                url=sp.url,
            )
            for sp, name in rows
        ]

    def _offerings(self, whereclause) -> list[OfferingRow]:
        """Filas producto×tienda con marca/presentación/precio, filtradas por `whereclause`.

        Punto ÚNICO por donde salen los rails, las categorías y las páginas de tienda del sitio
        público: el filtro de archivados va acá y cubre las tres de una vez.
        """
        rows = self._s.execute(
            select(
                CanonicalProductModel.id,
                CanonicalProductModel.slug,
                CanonicalProductModel.name,
                BrandModel.name.label("brand"),
                CanonicalProductModel.quality,
                CanonicalProductModel.display_size,
                CanonicalProductModel.image_url,
                CanonicalProductModel.size_amount,
                CanonicalProductModel.size_measure,
                StoreProductModel.provider_id,
                ProviderModel.name.label("provider_name"),
                StoreProductModel.current_price_minor,
                StoreProductModel.currency,
            )
            .join(
                StoreProductModel,
                StoreProductModel.canonical_product_id == CanonicalProductModel.id,
            )
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .join(BrandModel, CanonicalProductModel.brand_id == BrandModel.id, isouter=True)
            .where(whereclause, CanonicalProductModel.archived_at.is_(None))
        ).all()
        return [
            OfferingRow(
                product_id=str(r.id),
                slug=r.slug,
                name=r.name,
                brand=r.brand or "",
                quality=r.quality,
                display_size=r.display_size,
                image_url=r.image_url,
                quantity=(
                    Quantity(r.size_amount, UnitMeasure(r.size_measure))
                    if r.size_amount is not None and r.size_measure
                    else None
                ),
                provider_id=str(r.provider_id),
                provider_name=r.provider_name,
                price=Money(r.current_price_minor, Currency(r.currency)),
            )
            for r in rows
        ]

    def list_category_offerings(self, node_ids: list[str]) -> list[OfferingRow]:
        node_uuids = [u for u in (_parse_uuid(i) for i in node_ids) if u is not None]
        if not node_uuids:
            return []
        return self._offerings(CanonicalProductModel.taxonomy_node_id.in_(node_uuids))

    def list_market_offerings(self, market_id: str) -> list[OfferingRow]:
        return self._offerings(CanonicalProductModel.market_id == market_id)


class SqlAlertRepository:
    """Alertas de precio (G4): suscripciones + feed de notificaciones. `user_id` cross-context."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def subscribe(
        self, user_id: str, canonical_product_id: str, market_id: str, threshold_minor: int | None
    ) -> str:
        uid = uuid.UUID(user_id)
        cid = uuid.UUID(canonical_product_id)
        existing = self._s.scalars(
            select(PriceAlertModel).where(
                PriceAlertModel.user_id == uid,
                PriceAlertModel.canonical_product_id == cid,
            )
        ).first()
        if existing is not None:  # re-suscribir = actualizar el umbral
            existing.threshold_minor = threshold_minor
            self._s.flush()
            return str(existing.id)
        alert = PriceAlertModel(
            user_id=uid,
            canonical_product_id=cid,
            market_id=market_id,
            threshold_minor=threshold_minor,
        )
        self._s.add(alert)
        self._s.flush()
        return str(alert.id)

    def list_by_user(self, user_id: str) -> list[Alert]:
        rows = self._s.execute(
            select(PriceAlertModel, CanonicalProductModel.name)
            .join(
                CanonicalProductModel,
                PriceAlertModel.canonical_product_id == CanonicalProductModel.id,
            )
            .where(PriceAlertModel.user_id == uuid.UUID(user_id))
            .order_by(PriceAlertModel.created_at.desc())
        ).all()
        return [
            Alert(
                id=str(a.id),
                canonical_product_id=str(a.canonical_product_id),
                product_name=name,
                threshold_minor=a.threshold_minor,
                created_at=a.created_at,
            )
            for a, name in rows
        ]

    def unsubscribe(self, user_id: str, alert_id: str) -> bool:
        aid = _parse_uuid(alert_id)
        if aid is None:
            return False
        alert = self._s.get(PriceAlertModel, aid)
        if alert is None or str(alert.user_id) != user_id:
            return False
        self._s.delete(alert)
        self._s.flush()
        return True

    def list_active_subscriptions(self, market_id: str) -> list[AlertSubscription]:
        rows = self._s.scalars(
            select(PriceAlertModel).where(PriceAlertModel.market_id == market_id)
        ).all()
        return [
            AlertSubscription(
                alert_id=str(a.id),
                user_id=str(a.user_id),
                canonical_product_id=str(a.canonical_product_id),
                threshold_minor=a.threshold_minor,
            )
            for a in rows
        ]

    def record_notification(
        self,
        *,
        alert_id: str,
        user_id: str,
        canonical_product_id: str,
        product_name: str,
        provider_name: str,
        previous_minor: int,
        current_minor: int,
        currency: str,
        drop_bps: int,
        captured_at: datetime,
    ) -> bool:
        exists = self._s.scalars(
            select(AlertNotificationModel).where(
                AlertNotificationModel.price_alert_id == uuid.UUID(alert_id),
                AlertNotificationModel.provider_name == provider_name,
                AlertNotificationModel.captured_at == captured_at,
            )
        ).first()
        if exists is not None:
            return False  # ya notificada (idempotente)
        self._s.add(
            AlertNotificationModel(
                price_alert_id=uuid.UUID(alert_id),
                user_id=uuid.UUID(user_id),
                canonical_product_id=uuid.UUID(canonical_product_id),
                product_name=product_name,
                provider_name=provider_name,
                previous_minor=previous_minor,
                current_minor=current_minor,
                currency=currency,
                drop_bps=drop_bps,
                captured_at=captured_at,
            )
        )
        self._s.flush()
        return True

    def list_notifications(self, user_id: str) -> list[AlertNotification]:
        rows = self._s.scalars(
            select(AlertNotificationModel)
            .where(AlertNotificationModel.user_id == uuid.UUID(user_id))
            .order_by(AlertNotificationModel.triggered_at.desc())
        ).all()
        return [
            AlertNotification(
                id=str(n.id),
                canonical_product_id=str(n.canonical_product_id),
                product_name=n.product_name,
                provider_name=n.provider_name,
                previous_minor=n.previous_minor,
                current_minor=n.current_minor,
                currency=n.currency,
                drop_bps=n.drop_bps,
                triggered_at=n.triggered_at,
                read=n.read_at is not None,
            )
            for n in rows
        ]

    def mark_notifications_read(self, user_id: str) -> int:
        result = self._s.execute(
            update(AlertNotificationModel)
            .where(
                AlertNotificationModel.user_id == uuid.UUID(user_id),
                AlertNotificationModel.read_at.is_(None),
            )
            .values(read_at=func.now())
        )
        return result.rowcount

    def register_push_token(self, user_id: str, token: str, platform: str) -> None:
        existing = self._s.scalars(
            select(PushTokenModel).where(PushTokenModel.token == token)
        ).first()
        if existing is not None:  # el token identifica el dispositivo → reasigna el user si cambió
            existing.user_id = uuid.UUID(user_id)
            existing.platform = platform
            self._s.flush()
            return
        self._s.add(
            PushTokenModel(user_id=uuid.UUID(user_id), token=token, platform=platform)
        )
        self._s.flush()

    def list_push_tokens(self, user_id: str) -> list[str]:
        return list(
            self._s.scalars(
                select(PushTokenModel.token).where(
                    PushTokenModel.user_id == uuid.UUID(user_id)
                )
            ).all()
        )


class SqlTaxonomyRepository:
    """Read-only sobre `taxonomy_node` (árbol self-FK). El slug sale de la KEY (identidad estable),
    no de la etiqueta — ver `domain/taxonomy.py`. Sin key (nivel ≥2) cae a `slugify(name)`."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def _to_node(
        self, m: TaxonomyNodeModel, children: tuple[CategoryNode, ...] = ()
    ) -> CategoryNode:
        return CategoryNode(
            id=str(m.id),
            name=m.name,
            slug=m.key.rsplit(".", 1)[-1] if m.key else slugify(m.name),
            level=m.level,
            parent_id=str(m.parent_id) if m.parent_id else None,
            key=m.key,
            children=children,
        )

    def _market_nodes(self, market_id: str) -> list[TaxonomyNodeModel]:
        """Nodos que ESE mercado lleva (Fase 2b): el árbol es global, `taxonomy_node_market.active`
        dice cuáles usa cada país — mamajuana es dominicana, y US tiene pasillos que RD no tiene."""
        return list(
            self._s.scalars(
                select(TaxonomyNodeModel)
                .join(
                    TaxonomyNodeMarketModel,
                    TaxonomyNodeMarketModel.node_id == TaxonomyNodeModel.id,
                )
                .where(
                    TaxonomyNodeMarketModel.market_id == market_id,
                    TaxonomyNodeMarketModel.active.is_(True),
                )
                .order_by(TaxonomyNodeModel.level, TaxonomyNodeModel.name)
            ).all()
        )

    def _brand_name(self, brand_id: uuid.UUID | None) -> str:
        if brand_id is None:
            return ""
        b = self._s.get(BrandModel, brand_id)
        return b.name if b else ""

    def list_tree(self, market_id: str) -> list[CategoryNode]:
        models = self._market_nodes(market_id)
        by_parent: dict[str | None, list[TaxonomyNodeModel]] = {}
        for m in models:
            by_parent.setdefault(str(m.parent_id) if m.parent_id else None, []).append(m)

        def build(parent_id: str | None) -> tuple[CategoryNode, ...]:
            return tuple(self._to_node(m, build(str(m.id))) for m in by_parent.get(parent_id, []))

        return list(build(None))

    def ancestors(self, node_id: str) -> list[CategoryNode]:
        chain: list[CategoryNode] = []
        current = self._s.get(TaxonomyNodeModel, uuid.UUID(node_id))
        while current is not None:
            chain.append(self._to_node(current))
            current = (
                self._s.get(TaxonomyNodeModel, current.parent_id) if current.parent_id else None
            )
        return list(reversed(chain))

    def descendant_ids(self, node_id: str) -> list[str]:
        """Ids del nodo + toda su descendencia.

        Recorre el árbol GLOBAL (Fase 2b): el nodo ya no sabe a qué mercado pertenece, y no debe —
        la rama de conceptos es la misma para todos. Filtrar por mercado acá recortaría la rama y
        haría que un producto colgado de una hoja "inactiva en este país" desapareciera del listado
        de su categoría padre. Quién LLEVA cada categoría se decide en `list_tree`, que es la que
        arma el árbol navegable.
        """
        node = self._s.get(TaxonomyNodeModel, uuid.UUID(node_id))
        if node is None:
            return []
        children_of: dict[str | None, list[str]] = {}
        for m in self._s.scalars(select(TaxonomyNodeModel)).all():
            children_of.setdefault(str(m.parent_id) if m.parent_id else None, []).append(str(m.id))
        # BFS: node_id + todos sus descendientes
        ids: list[str] = []
        stack = [node_id]
        while stack:
            current = stack.pop()
            ids.append(current)
            stack.extend(children_of.get(current, []))
        return ids

    def list_products_under(self, node_id: str) -> list[CanonicalProduct]:
        ids = self.descendant_ids(node_id)
        if not ids:
            return []
        products = self._s.scalars(
            select(CanonicalProductModel)
            .where(CanonicalProductModel.taxonomy_node_id.in_([uuid.UUID(i) for i in ids]))
            .order_by(CanonicalProductModel.name)
        ).all()
        return [canonical_to_entity(p, self._brand_name(p.brand_id)) for p in products]


def _classification_to_entity(m: CategoryClassificationModel) -> CategoryClassification:
    return CategoryClassification(
        id=str(m.id),
        store_product_id=str(m.store_product_id) if m.store_product_id else None,
        canonical_product_id=str(m.canonical_product_id) if m.canonical_product_id else None,
        taxonomy_node_id=str(m.taxonomy_node_id),
        confidence=float(m.confidence),
        method=m.method,
        status=m.status,
    )


class SqlCategoryClassificationRepository:
    """Registro de decisión de clasificación (A2). Única `active` por producto (índice parcial)."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def _ref_column(self, is_canonical: bool):  # type: ignore[no-untyped-def]
        return (
            CategoryClassificationModel.canonical_product_id
            if is_canonical
            else CategoryClassificationModel.store_product_id
        )

    def active_for(self, ref_id: str, *, is_canonical: bool) -> CategoryClassification | None:
        col = self._ref_column(is_canonical)
        m = self._s.scalars(
            select(CategoryClassificationModel).where(
                col == uuid.UUID(ref_id), CategoryClassificationModel.status == "active"
            )
        ).first()
        return _classification_to_entity(m) if m else None

    def save_active(self, classification: CategoryClassification) -> None:
        is_canonical = classification.canonical_product_id is not None
        ref_id = classification.canonical_product_id or classification.store_product_id
        assert ref_id is not None  # invariante XOR garantizada por el CHECK de la tabla
        col = self._ref_column(is_canonical)
        # 1) supersede la activa previa del mismo producto (antes del insert → no choca el índice parcial)
        self._s.execute(
            update(CategoryClassificationModel)
            .where(col == uuid.UUID(ref_id), CategoryClassificationModel.status == "active")
            .values(status="superseded")
        )
        # 2) inserta la nueva activa (misma transacción / UoW)
        self._s.add(
            CategoryClassificationModel(
                id=uuid.UUID(classification.id),
                store_product_id=(
                    uuid.UUID(classification.store_product_id)
                    if classification.store_product_id
                    else None
                ),
                canonical_product_id=(
                    uuid.UUID(classification.canonical_product_id)
                    if classification.canonical_product_id
                    else None
                ),
                taxonomy_node_id=uuid.UUID(classification.taxonomy_node_id),
                confidence=Decimal(str(classification.confidence)),
                method=classification.method,
                status="active",
            )
        )
        self._s.flush()

    def list_unclassified(
        self, market_id: str, *, is_canonical: bool, limit: int, offset: int = 0
    ) -> list[ClassifiableProduct]:
        cc = CategoryClassificationModel
        if is_canonical:
            stmt = (
                select(
                    CanonicalProductModel.id,
                    CanonicalProductModel.name,
                    BrandModel.name.label("brand"),
                    CanonicalProductModel.display_size,
                )
                .outerjoin(BrandModel, BrandModel.id == CanonicalProductModel.brand_id)
                .outerjoin(
                    cc,
                    and_(cc.canonical_product_id == CanonicalProductModel.id, cc.status == "active"),
                )
                .where(CanonicalProductModel.market_id == market_id, cc.id.is_(None))
                .order_by(CanonicalProductModel.id)
                .limit(limit)
                .offset(offset)
            )
        else:
            # store_product no tiene market_id → se deriva por el provider
            stmt = (
                select(
                    StoreProductModel.id,
                    StoreProductModel.name,
                    StoreProductModel.brand,
                    StoreProductModel.size_text,
                    StoreProductModel.source_category,  # Etapa B: 2ª señal (r[4])
                )
                .join(ProviderModel, ProviderModel.id == StoreProductModel.provider_id)
                .outerjoin(
                    cc,
                    and_(cc.store_product_id == StoreProductModel.id, cc.status == "active"),
                )
                .where(ProviderModel.market_id == market_id, cc.id.is_(None))
                .order_by(StoreProductModel.id)
                .limit(limit)
                .offset(offset)
            )
        rows = self._s.execute(stmt).all()
        return [
            ClassifiableProduct(
                ref_id=str(r[0]),
                is_canonical=is_canonical,
                name=r[1] or "",
                brand=r[2] or "",
                size_text=r[3] or "",
                # canonical no tiene categoría de origen (es atributo de tienda) → ""; el conditional
                # corta antes de tocar r[4], que solo existe en el SELECT de store_product.
                source_category=("" if is_canonical else (r[4] or "")),
            )
            for r in rows
        ]


    def classifiable_for_matches(
        self, match_ids: list[str]
    ) -> list[tuple[str, ClassifiableProduct]]:
        """Productos detrás de N matches de la cola, para clasificarlos en lote.

        UNA sola query para todo el lote (no N+1): el operador puede seleccionar decenas de filas y
        pedirlas de a una convertiría un clic en decenas de round-trips a Postgres.
        """
        if not match_ids:
            return []
        stmt = (
            select(
                ProductMatchModel.id,
                StoreProductModel.id,
                StoreProductModel.name,
                StoreProductModel.brand,
                StoreProductModel.size_text,
                StoreProductModel.source_category,  # Etapa B: 2ª señal, independiente del nombre
            )
            .join(StoreProductModel, StoreProductModel.id == ProductMatchModel.store_product_id)
            .where(ProductMatchModel.id.in_(match_ids))
        )
        return [
            (
                str(r[0]),
                ClassifiableProduct(
                    ref_id=str(r[1]),
                    is_canonical=False,
                    name=r[2] or "",
                    brand=r[3] or "",
                    size_text=r[4] or "",
                    source_category=r[5] or "",
                ),
            )
            for r in self._s.execute(stmt).all()
        ]


class SqlCategoryIndexRepository:
    """Index-side de embeddings de categoría — hojas (level=1) del market."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def leaves_without_embedding(
        self, market_id: str, limit: int
    ) -> list[tuple[str, str, str | None, str | None]]:
        parent = aliased(TaxonomyNodeModel)
        rows = self._s.execute(
            select(
                TaxonomyNodeModel.id,
                TaxonomyNodeModel.name,
                parent.name,
                TaxonomyNodeMarketModel.classification_terms,
            )
            .join(
                TaxonomyNodeMarketModel,
                TaxonomyNodeMarketModel.node_id == TaxonomyNodeModel.id,
            )
            .outerjoin(parent, parent.id == TaxonomyNodeModel.parent_id)
            .where(
                TaxonomyNodeMarketModel.market_id == market_id,
                TaxonomyNodeMarketModel.active.is_(True),
                TaxonomyNodeModel.level == 1,
                TaxonomyNodeMarketModel.embedding.is_(None),
            )
            .limit(limit)
        ).all()
        return [(str(r[0]), r[1], r[2], r[3]) for r in rows]

    def set_embedding(self, node_id: str, embedding: list[float], market_id: str) -> None:
        row = self._market_row(node_id, market_id)
        row.embedding = embedding
        self._s.flush()

    def leaves_without_terms(
        self, market_id: str, limit: int
    ) -> list[tuple[str, str, str | None]]:
        parent = aliased(TaxonomyNodeModel)
        rows = self._s.execute(
            select(TaxonomyNodeModel.id, TaxonomyNodeModel.name, parent.name)
            .join(
                TaxonomyNodeMarketModel,
                TaxonomyNodeMarketModel.node_id == TaxonomyNodeModel.id,
            )
            .outerjoin(parent, parent.id == TaxonomyNodeModel.parent_id)
            .where(
                TaxonomyNodeMarketModel.market_id == market_id,
                TaxonomyNodeMarketModel.active.is_(True),
                TaxonomyNodeModel.level == 1,
                TaxonomyNodeMarketModel.classification_terms.is_(None),
            )
            .limit(limit)
        ).all()
        return [(str(r[0]), r[1], r[2]) for r in rows]

    def set_terms(self, node_id: str, terms: str, market_id: str) -> None:
        row = self._market_row(node_id, market_id)
        row.classification_terms = terms
        row.embedding = None  # el input del embedding cambió → invalidar para re-embed
        self._s.flush()

    def _market_row(self, node_id: str, market_id: str) -> TaxonomyNodeMarketModel:
        """La fila (nodo, mercado). La crea si falta: un concepto puede existir globalmente y que
        este mercado todavía no lo tenga registrado — pedir términos para él lo da de alta."""
        nid = uuid.UUID(node_id)
        row = self._s.get(TaxonomyNodeMarketModel, (nid, market_id))
        if row is None:
            row = TaxonomyNodeMarketModel(node_id=nid, market_id=market_id)
            self._s.add(row)
        return row


class SqlCategoryCandidateRepository:
    """Búsqueda de hojas candidatas (level=1) por trgm (léxico) y pgvector (semántico)."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def find_leaves_trgm(self, name: str, market_id: str, limit: int) -> list[CategoryCandidate]:
        score = func.similarity(TaxonomyNodeModel.name, name)
        rows = self._s.execute(
            select(TaxonomyNodeModel.id, TaxonomyNodeModel.name, score)
            .join(
                TaxonomyNodeMarketModel,
                TaxonomyNodeMarketModel.node_id == TaxonomyNodeModel.id,
            )
            .where(
                TaxonomyNodeMarketModel.market_id == market_id,
                TaxonomyNodeMarketModel.active.is_(True),
                TaxonomyNodeModel.level == 1,
            )
            .order_by(score.desc())
            .limit(limit)
        ).all()
        return [
            CategoryCandidate(
                taxonomy_node_id=str(r[0]), name=r[1], score=float(r[2]), source="trgm"
            )
            for r in rows
        ]

    def find_leaves_vector(
        self, embedding: list[float], market_id: str, limit: int
    ) -> list[CategoryCandidate]:
        dist = TaxonomyNodeMarketModel.embedding.cosine_distance(embedding)
        rows = self._s.execute(
            select(TaxonomyNodeModel.id, TaxonomyNodeModel.name, dist)
            .join(
                TaxonomyNodeMarketModel,
                TaxonomyNodeMarketModel.node_id == TaxonomyNodeModel.id,
            )
            .where(
                TaxonomyNodeMarketModel.market_id == market_id,
                TaxonomyNodeMarketModel.active.is_(True),
                TaxonomyNodeModel.level == 1,
                TaxonomyNodeMarketModel.embedding.is_not(None),
            )
            .order_by(dist.asc())
            .limit(limit)
        ).all()
        return [
            CategoryCandidate(
                taxonomy_node_id=str(r[0]), name=r[1], score=1.0 - float(r[2]), source="vector"
            )
            for r in rows
        ]


class SqlAdminAuditRepository:
    """Persistencia del audit log del admin (T2). Append-only: solo insert + lectura."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def record(self, entry: AdminAuditEntry) -> None:
        self._s.add(
            AdminAuditLogModel(
                id=uuid.UUID(entry.id),
                actor_user_id=entry.actor_user_id,
                action=entry.action,
                target_type=entry.target_type,
                target_id=entry.target_id,
                payload_summary=entry.payload_summary,
                market_id=entry.market_id,
                created_at=entry.created_at,
            )
        )
        self._s.flush()

    def list_recent(
        self, *, market_id: str, limit: int = 50, target_type: str | None = None,
        target_id: str | None = None,
    ) -> list[AdminAuditEntry]:
        stmt = select(AdminAuditLogModel).where(AdminAuditLogModel.market_id == market_id)
        if target_type is not None:
            stmt = stmt.where(AdminAuditLogModel.target_type == target_type)
        if target_id is not None:
            stmt = stmt.where(AdminAuditLogModel.target_id == target_id)
        stmt = stmt.order_by(AdminAuditLogModel.created_at.desc()).limit(limit)
        return [
            AdminAuditEntry(
                id=str(m.id),
                actor_user_id=m.actor_user_id,
                action=m.action,
                target_type=m.target_type,
                target_id=m.target_id,
                payload_summary=m.payload_summary or {},
                market_id=m.market_id,
                created_at=m.created_at,
            )
            for m in self._s.execute(stmt).scalars()
        ]


class SqlAdminCanonicalCatalogRepository:
    """Read model del catálogo canónico para la consola admin (F5).

    Todo el SQL del listado vive ACÁ, no en el controller (ADR 31). Las métricas
    (`matched_provider_count`, `ean_reachable`, `possible_duplicate_count`, `last_match_at`) se
    calculan en SQL y no en Python **porque el `total` de la paginación tiene que contarse sobre
    las filas ya filtradas** — derivar en Python obligaría a traer el catálogo entero para poder
    filtrar, y el total dejaría de ser real.

    ⚠️ Acoplamiento consciente: los filtros por `quality_status` ESPEJAN en SQL las reglas de
    `domain/canonical_catalog.py`. Si cambiás una regla allá, cambiala acá. Es el precio de poder
    filtrar y paginar en la base; la alternativa (traer todo y filtrar en memoria) rompe el total.
    """

    def __init__(self, session: Session) -> None:
        self._s = session

    # ------------------------------------------------------------------ subqueries derivadas --

    @staticmethod
    def _provider_metrics():  # type: ignore[no-untyped-def]
        """Proveedores DISTINTOS por canónico + el precio visto más reciente + el rango de precio.

        MIN/MAX se calculan sobre TODAS las tiendas enlazadas, sin filtrar `is_available`: es el
        mismo universo que `list_canonical_providers` (el modal que se abre desde esta fila), y si
        los dos no coincidieran la columna diría un precio y su drill-down otro.

        `func.min`/`func.max` ignoran NULL, así que un canónico sin ningún precio da NULL y la UI
        muestra guion en vez de inventar un cero.
        """
        return (
            select(
                StoreProductModel.canonical_product_id.label("cp_id"),
                func.count(func.distinct(StoreProductModel.provider_id)).label("provider_count"),
                func.max(StoreProductModel.last_seen_at).label("last_price_seen_at"),
                func.min(StoreProductModel.current_price_minor).label("min_price_minor"),
                func.max(StoreProductModel.current_price_minor).label("max_price_minor"),
                # Un canónico vive en UN mercado, así que sus tiendas comparten moneda; `max` es
                # sólo la forma de sacar un representante dentro del GROUP BY.
                func.max(StoreProductModel.currency).label("price_currency"),
            )
            .where(StoreProductModel.canonical_product_id.isnot(None))
            .group_by(StoreProductModel.canonical_product_id)
            .subquery()
        )

    @staticmethod
    def _ean_reachable():  # type: ignore[no-untyped-def]
        """≥1 store_product enlazado CON EAN + el código representativo.

        La PRESENCIA (`cp_id is not null`) sigue siendo la señal de si el job de matcheo-por-barcode
        puede cubrirlo; el código además se muestra, porque un operador que ve el barcode puede
        buscarlo en otro lado y una etiqueta que sólo dice "EAN" no le sirve para nada.

        `nullif(ean,'')` evita que un string vacío gane el `max` frente a un código real.
        """
        return (
            select(
                StoreProductModel.canonical_product_id.label("cp_id"),
                func.max(func.nullif(StoreProductModel.ean, "")).label("ean"),
            )
            .where(
                StoreProductModel.canonical_product_id.isnot(None),
                func.coalesce(StoreProductModel.ean, "") != "",
            )
            .group_by(StoreProductModel.canonical_product_id)
            .subquery()
        )

    @staticmethod
    def _last_match():  # type: ignore[no-untyped-def]
        """Último match del canónico. `decided_at` gana sobre `created_at`: lo que le importa al
        operador es cuándo se RESOLVIÓ el vínculo, no cuándo se propuso."""
        return (
            select(
                ProductMatchModel.canonical_product_id.label("cp_id"),
                func.max(
                    func.coalesce(ProductMatchModel.decided_at, ProductMatchModel.created_at)
                ).label("last_match_at"),
            )
            .where(ProductMatchModel.canonical_product_id.isnot(None))
            .group_by(ProductMatchModel.canonical_product_id)
            .subquery()
        )

    @staticmethod
    def _duplicate_counts():  # type: ignore[no-untyped-def]
        """Colisión de EAN: cuántos OTROS canónicos comparten EAN con éste (R4).

        Es la señal MÁS fuerte de duplicado — mucho más que la similitud de nombre. Dos canónicos
        cuyos store_products comparten el mismo EAN normalizado son, casi con certeza, el mismo
        producto. Sólo ALERTA: merge/split está fuera de alcance.
        """
        other = aliased(StoreProductModel)
        return (
            select(
                StoreProductModel.canonical_product_id.label("cp_id"),
                func.count(func.distinct(other.canonical_product_id)).label("dup_count"),
            )
            .join(
                other,
                and_(
                    other.ean == StoreProductModel.ean,
                    other.canonical_product_id != StoreProductModel.canonical_product_id,
                    other.canonical_product_id.isnot(None),
                ),
            )
            .where(
                StoreProductModel.canonical_product_id.isnot(None),
                func.coalesce(StoreProductModel.ean, "") != "",
            )
            .group_by(StoreProductModel.canonical_product_id)
            .subquery()
        )

    # ------------------------------------------------------------------------------ listado --

    def list_catalog(
        self,
        *,
        market_id: str,
        filters: CanonicalCatalogFilters | None = None,
        limit: int = 50,
        offset: int = 0,
        sort: str = "name",
        now: datetime | None = None,
    ) -> CanonicalCatalogPage:
        f = filters or CanonicalCatalogFilters()
        now = now or datetime.now(timezone.utc)
        metrics = self._provider_metrics()
        eans = self._ean_reachable()
        matches = self._last_match()
        dups = self._duplicate_counts()

        provider_count = func.coalesce(metrics.c.provider_count, 0)
        dup_count = func.coalesce(dups.c.dup_count, 0)
        has_image = func.coalesce(CanonicalProductModel.image_url, "") != ""
        has_category = CanonicalProductModel.taxonomy_node_id.isnot(None)
        has_display_size = func.coalesce(CanonicalProductModel.display_size, "") != ""
        has_brand = CanonicalProductModel.brand_id.isnot(None)
        stale_cutoff = now - PRICE_STALENESS_THRESHOLD
        is_stale = and_(
            provider_count > 0,
            or_(
                metrics.c.last_price_seen_at.is_(None),
                metrics.c.last_price_seen_at < stale_cutoff,
            ),
        )

        # Categoría: la HOJA (join directo por `taxonomy_node_id`) MÁS su ancestro TOPE. La
        # taxonomía es de 2 niveles, así que el tope es el padre de la hoja; COALESCE cae a la
        # hoja si por defensa el nodo fuera level-0. Mismo criterio que la cola de revisión.
        top = aliased(TaxonomyNodeModel)
        category_top_name = func.coalesce(top.name, TaxonomyNodeModel.name)
        query = (
            select(
                CanonicalProductModel,
                BrandModel.name.label("brand_name"),
                TaxonomyNodeModel.name.label("category_name"),
                provider_count.label("provider_count"),
                metrics.c.last_price_seen_at,
                eans.c.cp_id.isnot(None).label("has_ean"),
                matches.c.last_match_at,
                dup_count.label("dup_count"),
                category_top_name.label("category_top_name"),
                eans.c.ean.label("ean"),
                metrics.c.min_price_minor,
                metrics.c.max_price_minor,
                metrics.c.price_currency,
            )
            .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
            .outerjoin(
                TaxonomyNodeModel,
                CanonicalProductModel.taxonomy_node_id == TaxonomyNodeModel.id,
            )
            .outerjoin(top, top.id == TaxonomyNodeModel.parent_id)
            .outerjoin(metrics, CanonicalProductModel.id == metrics.c.cp_id)
            .outerjoin(eans, CanonicalProductModel.id == eans.c.cp_id)
            .outerjoin(matches, CanonicalProductModel.id == matches.c.cp_id)
            .outerjoin(dups, CanonicalProductModel.id == dups.c.cp_id)
            .where(CanonicalProductModel.market_id == market_id)
        )

        # Search: nombre, slug Y marca (US-CP-L2) — buscar sólo por nombre obliga al operador a
        # saber cómo se llama exactamente el producto, que es justo lo que no sabe.
        if f.search:
            term = f"%{f.search}%"
            query = query.where(
                or_(
                    CanonicalProductModel.name.ilike(term),
                    CanonicalProductModel.slug.ilike(term),
                    BrandModel.name.ilike(term),
                )
            )
        if f.brand_id:
            brand_uuid = _parse_uuid(f.brand_id)
            if brand_uuid is None:
                return CanonicalCatalogPage(rows=[], total=0)
            query = query.where(CanonicalProductModel.brand_id == brand_uuid)
        if f.taxonomy_node_id:
            node_uuid = _parse_uuid(f.taxonomy_node_id)
            if node_uuid is None:
                return CanonicalCatalogPage(rows=[], total=0)
            query = query.where(CanonicalProductModel.taxonomy_node_id == node_uuid)
        if f.ean_reachable is not None:
            query = query.where(
                eans.c.cp_id.isnot(None) if f.ean_reachable else eans.c.cp_id.is_(None)
            )
        if f.has_brand is not None:
            # `has_brand` ya estaba calculada acá arriba para el score de completitud; el filtro
            # sólo la expone, sin sumar una expresión nueva.
            query = query.where(has_brand if f.has_brand else ~has_brand)
        if f.min_provider_count is not None:
            query = query.where(provider_count >= f.min_provider_count)
        if f.updated_since is not None:
            query = query.where(metrics.c.last_price_seen_at >= f.updated_since)
        if not f.include_archived:
            query = query.where(CanonicalProductModel.archived_at.is_(None))

        # Espejo SQL de `derive_quality_statuses` — ver la advertencia del docstring.
        # Un valor desconocido (ej. `no_quality`, retirado, sobreviviendo en un bookmark) se IGNORA:
        # que un filtro viejo tumbe la pantalla entera con un 500 es peor que no filtrar.
        try:
            status = CanonicalQualityStatus(f.quality_status) if f.quality_status else None
        except ValueError:
            status = None
        if status is not None:
            if status is CanonicalQualityStatus.COMPLETE:
                query = query.where(
                    has_image, has_category, provider_count > 0,
                    ~is_stale, dup_count == 0,
                )
            elif status is CanonicalQualityStatus.NO_IMAGE:
                query = query.where(~has_image)
            elif status is CanonicalQualityStatus.NO_CATEGORY:
                query = query.where(~has_category)
            elif status is CanonicalQualityStatus.NO_PROVIDERS:
                query = query.where(provider_count == 0)
            elif status is CanonicalQualityStatus.STALE_PRICE:
                query = query.where(is_stale)
            elif status is CanonicalQualityStatus.POSSIBLE_DUPLICATE:
                query = query.where(dup_count > 0)

        total = self._s.scalar(select(func.count()).select_from(query.subquery())) or 0

        # Ordenar por completitud = ordenar por la SUMA de campos presentes (0-5). Da exactamente
        # el mismo orden que el porcentaje y evita repetir la aritmética del dominio en SQL.
        present_sum = (
            _as_int(has_image)
            + _as_int(has_category)
            + _as_int(provider_count > 0)
            + _as_int(has_brand)
            + _as_int(has_display_size)
        )
        order = {
            "name": CanonicalProductModel.name.asc(),
            "-name": CanonicalProductModel.name.desc(),
            "providers": provider_count.asc(),
            "-providers": provider_count.desc(),
            "completeness": present_sum.asc(),
            "-completeness": present_sum.desc(),
            "updated": metrics.c.last_price_seen_at.asc().nullsfirst(),
            "-updated": metrics.c.last_price_seen_at.desc().nullslast(),
        }.get(sort, CanonicalProductModel.name.asc())

        rows = self._s.execute(query.order_by(order).limit(limit).offset(offset)).all()
        return CanonicalCatalogPage(
            rows=[self._to_row(r) for r in rows],
            total=total,
        )

    def get_catalog_row(
        self, *, market_id: str, canonical_product_id: str | None = None, slug: str | None = None
    ) -> CanonicalCatalogRow | None:
        """Una fila por id o por slug, con EXACTAMENTE las mismas métricas que el listado —
        que el detalle y la lista discrepen es la clase de incoherencia que quema confianza."""
        if canonical_product_id is not None:
            pid = _parse_uuid(canonical_product_id)
            if pid is None:
                return None
            key = CanonicalProductModel.id == pid
        elif slug is not None:
            key = CanonicalProductModel.slug == slug
        else:
            return None

        metrics = self._provider_metrics()
        eans = self._ean_reachable()
        matches = self._last_match()
        dups = self._duplicate_counts()
        # Hoja + tope, igual que el listado (ver comentario allá): el detalle y la lista NO pueden
        # discrepar en la categoría que muestran.
        top = aliased(TaxonomyNodeModel)
        row = self._s.execute(
            select(
                CanonicalProductModel,
                BrandModel.name.label("brand_name"),
                TaxonomyNodeModel.name.label("category_name"),
                func.coalesce(metrics.c.provider_count, 0).label("provider_count"),
                metrics.c.last_price_seen_at,
                eans.c.cp_id.isnot(None).label("has_ean"),
                matches.c.last_match_at,
                func.coalesce(dups.c.dup_count, 0).label("dup_count"),
                func.coalesce(top.name, TaxonomyNodeModel.name).label("category_top_name"),
                eans.c.ean.label("ean"),
                metrics.c.min_price_minor,
                metrics.c.max_price_minor,
                metrics.c.price_currency,
            )
            .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
            .outerjoin(
                TaxonomyNodeModel,
                CanonicalProductModel.taxonomy_node_id == TaxonomyNodeModel.id,
            )
            .outerjoin(top, top.id == TaxonomyNodeModel.parent_id)
            .outerjoin(metrics, CanonicalProductModel.id == metrics.c.cp_id)
            .outerjoin(eans, CanonicalProductModel.id == eans.c.cp_id)
            .outerjoin(matches, CanonicalProductModel.id == matches.c.cp_id)
            .outerjoin(dups, CanonicalProductModel.id == dups.c.cp_id)
            .where(CanonicalProductModel.market_id == market_id, key)
        ).first()
        return self._to_row(row) if row is not None else None

    def get_catalog_cursor(
        self,
        *,
        market_id: str,
        canonical_product_id: str,
        filters: CanonicalCatalogFilters | None = None,
        sort: str = "name",
        now: datetime | None = None,
    ) -> CanonicalCatalogCursor:
        """Posición de un canónico dentro de un listado filtrado/ordenado, más sus vecinos.

        Implementado con UNA sola query CTE + window functions para que el prev/next sea
        determinista y escale sin traer páginas enteras. El orden SIEMPRE incluye `id` como
        tie-breaker para que dos productos con la misma clave no bailen de posición.
        """
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return CanonicalCatalogCursor(total=0, position=None, previous_id=None, next_id=None)

        f = filters or CanonicalCatalogFilters()
        now = now or datetime.now(timezone.utc)
        metrics = self._provider_metrics()
        eans = self._ean_reachable()
        matches = self._last_match()
        dups = self._duplicate_counts()

        provider_count = func.coalesce(metrics.c.provider_count, 0)
        dup_count = func.coalesce(dups.c.dup_count, 0)
        has_image = func.coalesce(CanonicalProductModel.image_url, "") != ""
        has_category = CanonicalProductModel.taxonomy_node_id.isnot(None)
        has_display_size = func.coalesce(CanonicalProductModel.display_size, "") != ""
        has_brand = CanonicalProductModel.brand_id.isnot(None)
        stale_cutoff = now - PRICE_STALENESS_THRESHOLD
        is_stale = and_(
            provider_count > 0,
            or_(
                metrics.c.last_price_seen_at.is_(None),
                metrics.c.last_price_seen_at < stale_cutoff,
            ),
        )

        top = aliased(TaxonomyNodeModel)
        present_sum = (
            _as_int(has_image)
            + _as_int(has_category)
            + _as_int(provider_count > 0)
            + _as_int(has_brand)
            + _as_int(has_display_size)
        )
        query = (
            select(
                CanonicalProductModel.id,
                CanonicalProductModel.name,
                provider_count.label("provider_count"),
                metrics.c.last_price_seen_at,
                dup_count.label("dup_count"),
                present_sum.label("present_sum"),
            )
            .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
            .outerjoin(
                TaxonomyNodeModel,
                CanonicalProductModel.taxonomy_node_id == TaxonomyNodeModel.id,
            )
            .outerjoin(top, top.id == TaxonomyNodeModel.parent_id)
            .outerjoin(metrics, CanonicalProductModel.id == metrics.c.cp_id)
            .outerjoin(eans, CanonicalProductModel.id == eans.c.cp_id)
            .outerjoin(matches, CanonicalProductModel.id == matches.c.cp_id)
            .outerjoin(dups, CanonicalProductModel.id == dups.c.cp_id)
            .where(CanonicalProductModel.market_id == market_id)
        )

        if f.search:
            term = f"%{f.search}%"
            query = query.where(
                or_(
                    CanonicalProductModel.name.ilike(term),
                    CanonicalProductModel.slug.ilike(term),
                    BrandModel.name.ilike(term),
                )
            )
        if f.brand_id:
            brand_uuid = _parse_uuid(f.brand_id)
            if brand_uuid is None:
                return CanonicalCatalogCursor(total=0, position=None, previous_id=None, next_id=None)
            query = query.where(CanonicalProductModel.brand_id == brand_uuid)
        if f.taxonomy_node_id:
            node_uuid = _parse_uuid(f.taxonomy_node_id)
            if node_uuid is None:
                return CanonicalCatalogCursor(total=0, position=None, previous_id=None, next_id=None)
            query = query.where(CanonicalProductModel.taxonomy_node_id == node_uuid)
        if f.ean_reachable is not None:
            query = query.where(
                eans.c.cp_id.isnot(None) if f.ean_reachable else eans.c.cp_id.is_(None)
            )
        if f.has_brand is not None:
            # `has_brand` ya estaba calculada acá arriba para el score de completitud; el filtro
            # sólo la expone, sin sumar una expresión nueva.
            query = query.where(has_brand if f.has_brand else ~has_brand)
        if f.min_provider_count is not None:
            query = query.where(provider_count >= f.min_provider_count)
        if f.updated_since is not None:
            query = query.where(metrics.c.last_price_seen_at >= f.updated_since)
        if not f.include_archived:
            query = query.where(CanonicalProductModel.archived_at.is_(None))

        try:
            status = CanonicalQualityStatus(f.quality_status) if f.quality_status else None
        except ValueError:
            status = None
        if status is not None:
            if status is CanonicalQualityStatus.COMPLETE:
                query = query.where(
                    has_image, has_category, provider_count > 0,
                    ~is_stale, dup_count == 0,
                )
            elif status is CanonicalQualityStatus.NO_IMAGE:
                query = query.where(~has_image)
            elif status is CanonicalQualityStatus.NO_CATEGORY:
                query = query.where(~has_category)
            elif status is CanonicalQualityStatus.NO_PROVIDERS:
                query = query.where(provider_count == 0)
            elif status is CanonicalQualityStatus.STALE_PRICE:
                query = query.where(is_stale)
            elif status is CanonicalQualityStatus.POSSIBLE_DUPLICATE:
                query = query.where(dup_count > 0)

        base = query.subquery()
        order = {
            "name": [base.c.name.asc(), base.c.id.asc()],
            "-name": [base.c.name.desc(), base.c.id.desc()],
            "providers": [base.c.provider_count.asc(), base.c.id.asc()],
            "-providers": [base.c.provider_count.desc(), base.c.id.desc()],
            "completeness": [base.c.present_sum.asc(), base.c.id.asc()],
            "-completeness": [base.c.present_sum.desc(), base.c.id.desc()],
            "updated": [base.c.last_price_seen_at.asc().nullsfirst(), base.c.id.asc()],
            "-updated": [base.c.last_price_seen_at.desc().nullslast(), base.c.id.desc()],
        }.get(sort, [base.c.name.asc(), base.c.id.asc()])

        ranked = (
            select(
                base.c.id,
                func.row_number().over(order_by=order).label("position"),
                func.lag(base.c.id).over(order_by=order).label("prev_id"),
                func.lead(base.c.id).over(order_by=order).label("next_id"),
                func.count().over().label("total"),
            )
            .select_from(base)
            .cte("ranked")
        )

        result = self._s.execute(
            select(ranked.c.position, ranked.c.prev_id, ranked.c.next_id, ranked.c.total)
            .where(ranked.c.id == pid)
        ).first()

        if result is None:
            total = self._s.scalar(select(func.count()).select_from(base)) or 0
            return CanonicalCatalogCursor(total=total, position=None, previous_id=None, next_id=None)

        return CanonicalCatalogCursor(
            total=result.total,
            position=result.position,
            previous_id=str(result.prev_id) if result.prev_id is not None else None,
            next_id=str(result.next_id) if result.next_id is not None else None,
        )

    @staticmethod
    def _to_row(r) -> CanonicalCatalogRow:  # type: ignore[no-untyped-def]
        cp = r[0]
        return CanonicalCatalogRow(
            canonical_product_id=str(cp.id),
            slug=cp.slug,
            name=cp.name,
            brand=r[1] or "",
            size_amount=cp.size_amount,
            size_measure=cp.size_measure,
            display_size=cp.display_size,
            image_url=cp.image_url,
            category=r[2],
            category_top=r[8],
            ean=r[9],
            min_price_minor=r[10],
            max_price_minor=r[11],
            price_currency=r[12],
            quality=cp.quality,
            taxonomy_node_id=str(cp.taxonomy_node_id) if cp.taxonomy_node_id else None,
            origin_run_id=cp.origin_run_id,
            matched_provider_count=r[3] or 0,
            last_price_seen_at=r[4],
            ean_reachable=bool(r[5]),
            last_match_at=r[6],
            possible_duplicate_count=r[7] or 0,
            description=cp.description,
            created_at=cp.created_at,
            internal_note=cp.internal_note,
            archived_at=cp.archived_at,
        )

    # ------------------------------------------------------------------ identidad (importación) --

    def find_existing_identities(
        self, *, market_id: str, names: list[str]
    ) -> set[tuple[str, str, str, str]]:
        """Qué identidades (nombre+marca+tamaño+unidad) YA existen, en UNA sola query.

        Se filtra por los nombres del archivo en vez de traer el catálogo entero: el preview de
        un CSV de 500 filas no puede costar leer 100.000 canónicos.
        """
        if not names:
            return set()
        rows = self._s.execute(
            select(
                func.lower(CanonicalProductModel.name),
                func.coalesce(BrandModel.name, ""),
                CanonicalProductModel.size_amount,
                CanonicalProductModel.size_measure,
            )
            .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
            .where(
                CanonicalProductModel.market_id == market_id,
                func.lower(CanonicalProductModel.name).in_([n.lower() for n in names]),
            )
        ).all()
        # La marca se compara en MAYÚSCULA y la cantidad normalizada: el catálogo tiene marcas
        # cargadas por la ingesta con casing arbitrario y `Numeric(18,8)` devuelve `1.00000000`
        # donde el CSV trae `1`. Sin normalizar los dos lados, un duplicado real no se detecta.
        return {
            (n, (b or "").upper(), normalize_amount_key(amount), measure)
            for n, b, amount, measure in rows
        }

    # --------------------------------------------------------------------------- proveedores --

    def list_providers(self, canonical_product_id: str) -> list[CanonicalProviderPriceRow]:
        """Tiendas que venden este canónico, MÁS BARATA PRIMERO (US-CP-L4/D5).

        `is_cheapest` se marca sobre la fila real más barata, no sobre "la primera": si dos
        tiendas empatan en el precio mínimo, ambas quedan destacadas — inventar un desempate
        arbitrario le mentiría al operador sobre cuál conviene.
        """
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return []
        rows = self._s.execute(
            select(
                StoreProductModel.id,
                StoreProductModel.provider_id,
                ProviderModel.name,
                ProviderModel.logo_url,
                StoreProductModel.current_price_minor,
                StoreProductModel.currency,
                StoreProductModel.url,
                StoreProductModel.last_seen_at,
                StoreProductModel.image_url,
                StoreProductModel.description,
                # Los tres crudos de la tienda: son lo que el servidor deriva al promover a canónico
                # nuevo, y lo que la pestaña Auditoría muestra como "Nombre en la tienda".
                StoreProductModel.name,
                StoreProductModel.brand,
                StoreProductModel.size_text,
            )
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .where(StoreProductModel.canonical_product_id == pid)
            .order_by(StoreProductModel.current_price_minor.asc())
        ).all()
        if not rows:
            return []
        cheapest = min(r[4] for r in rows)
        # Galería de cada tienda en UNA query: pedirla por fila sería N+1 sobre un panel que se
        # abre en cada detalle.
        galleries: dict[str, list[str]] = {}
        for sp_id, url in self._s.execute(
            select(StoreProductImageModel.store_product_id, StoreProductImageModel.url)
            .where(StoreProductImageModel.store_product_id.in_([r[0] for r in rows]))
            .order_by(StoreProductImageModel.position)
        ).all():
            galleries.setdefault(str(sp_id), []).append(url)

        previous = self._previous_prices([r[0] for r in rows])

        return [
            CanonicalProviderPriceRow(
                store_product_id=str(r[0]),
                provider_id=str(r[1]),
                provider_name=r[2],
                provider_logo_url=r[3],
                price_minor=r[4],
                currency=r[5],
                url=r[6],
                last_seen_at=r[7],
                store_product_image_url=r[8],
                store_product_image_urls=galleries.get(str(r[0]), []),
                store_product_description=r[9],
                store_product_name=r[10],
                store_product_brand=r[11],
                store_product_size_text=r[12],
                is_cheapest=(r[4] == cheapest),
                previous_price_minor=previous.get(str(r[0])),
            )
            for r in rows
        ]

    def _previous_prices(self, store_product_ids: list[uuid.UUID]) -> dict[str, int]:
        """Último precio DISTINTO al vigente, por store_product, en UNA query.

        `DISTINCT ON` sobre `(store_product_id)` ordenado por `captured_at DESC` se queda con la
        observación más reciente de cada tienda entre las que YA se filtraron por ser distintas
        al precio de hoy. El índice `ix_price_store_product_captured` cubre exactamente ese orden.

        El filtro `value_minor != current_price_minor` es el corazón: sin él, la respuesta sería
        casi siempre el mismo precio vigente (la ingesta escribe una fila por corrida aunque nada
        se mueva) y la UI pintaría un tachado que no representa ninguna bajada.
        """
        if not store_product_ids:
            return {}
        rows = self._s.execute(
            select(PriceModel.store_product_id, PriceModel.value_minor)
            .join(StoreProductModel, StoreProductModel.id == PriceModel.store_product_id)
            .where(
                PriceModel.store_product_id.in_(store_product_ids),
                PriceModel.value_minor != StoreProductModel.current_price_minor,
            )
            .distinct(PriceModel.store_product_id)
            .order_by(PriceModel.store_product_id, PriceModel.captured_at.desc())
        ).all()
        return {str(sp_id): value for sp_id, value in rows}

    # ----------------------------------------------------------------------------- evidencia --

    def list_evidence(self, canonical_product_id: str) -> list[CanonicalEvidenceRow]:
        """Datos CRUDOS por tienda + cómo se enlazó cada uno (US-CP-D8). Sólo lectura."""
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return []
        latest_match = (
            select(
                ProductMatchModel.store_product_id.label("sp_id"),
                func.max(
                    func.coalesce(ProductMatchModel.decided_at, ProductMatchModel.created_at)
                ).label("matched_at"),
            )
            .where(ProductMatchModel.canonical_product_id == pid)
            .group_by(ProductMatchModel.store_product_id)
            .subquery()
        )
        rows = self._s.execute(
            select(
                StoreProductModel,
                ProviderModel.name,
                ProductMatchModel.method,
                ProductMatchModel.confidence,
                latest_match.c.matched_at,
            )
            .join(ProviderModel, StoreProductModel.provider_id == ProviderModel.id)
            .outerjoin(latest_match, latest_match.c.sp_id == StoreProductModel.id)
            .outerjoin(
                ProductMatchModel,
                and_(
                    ProductMatchModel.store_product_id == StoreProductModel.id,
                    func.coalesce(ProductMatchModel.decided_at, ProductMatchModel.created_at)
                    == latest_match.c.matched_at,
                ),
            )
            .where(StoreProductModel.canonical_product_id == pid)
            .order_by(ProviderModel.name)
        ).all()
        return [
            CanonicalEvidenceRow(
                store_product_id=str(sp.id),
                provider_id=str(sp.provider_id),
                provider_name=provider_name,
                raw_name=sp.name or "",
                raw_brand=sp.brand,
                raw_size_text=sp.size_text,
                ean=sp.ean,
                sku=sp.external_id,
                image_url=sp.image_url,
                store_product_url=sp.url,
                match_method=method,
                match_confidence=float(confidence) if confidence is not None else None,
                matched_at=matched_at,
            )
            for sp, provider_name, method, confidence, matched_at in rows
        ]

    # ---------------------------------------------------------------------------- duplicados --

    def list_duplicate_candidates(
        self, *, canonical_product_id: str, market_id: str, limit: int = 20
    ) -> list[CanonicalDuplicateCandidate]:
        """Canónicos sospechosos de ser el MISMO producto (US-CP-D11).

        Dos señales, en orden de fuerza: colisión de EAN primero (casi certeza), y luego misma
        marca + mismo tamaño con nombre parecido. Sólo alerta.
        """
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return []
        target = self._s.get(CanonicalProductModel, pid)
        if target is None:
            return []

        signals: dict[str, list[str]] = {}

        # Señal 1 — colisión de EAN (la más fuerte).
        mine = aliased(StoreProductModel)
        other = aliased(StoreProductModel)
        ean_hits = self._s.execute(
            select(func.distinct(other.canonical_product_id))
            .select_from(mine)
            .join(
                other,
                and_(
                    other.ean == mine.ean,
                    other.canonical_product_id != mine.canonical_product_id,
                    other.canonical_product_id.isnot(None),
                ),
            )
            .where(mine.canonical_product_id == pid, func.coalesce(mine.ean, "") != "")
        ).scalars().all()
        for cid in ean_hits:
            signals.setdefault(str(cid), []).append("ean_collision")

        # Señal 2 — misma marca + mismo tamaño (léxica, mucho más débil).
        lexical = self._s.execute(
            select(CanonicalProductModel.id)
            .where(
                CanonicalProductModel.market_id == market_id,
                CanonicalProductModel.id != pid,
                CanonicalProductModel.brand_id == target.brand_id,
                CanonicalProductModel.size_amount == target.size_amount,
                CanonicalProductModel.size_measure == target.size_measure,
            )
            .limit(limit)
        ).scalars().all()
        for cid in lexical:
            signals.setdefault(str(cid), []).append("same_brand_size")

        if not signals:
            return []

        rows = self._s.execute(
            select(CanonicalProductModel, BrandModel.name, TaxonomyNodeModel.name)
            .outerjoin(BrandModel, CanonicalProductModel.brand_id == BrandModel.id)
            .outerjoin(
                TaxonomyNodeModel,
                CanonicalProductModel.taxonomy_node_id == TaxonomyNodeModel.id,
            )
            .where(CanonicalProductModel.id.in_([_parse_uuid(k) for k in signals]))
        ).all()

        candidates = [
            CanonicalDuplicateCandidate(
                canonical_product_id=str(cp.id),
                slug=cp.slug,
                name=cp.name,
                brand=brand_name or "",
                display_size=cp.display_size,
                category=category_name,
                signals=signals[str(cp.id)],
            )
            for cp, brand_name, category_name in rows
        ]
        # La colisión de EAN ordena POR ENCIMA de las señales léxicas (regla del SDD).
        candidates.sort(key=lambda c: (not c.has_ean_collision, c.name))
        return candidates[:limit]


def _as_int(condition):  # type: ignore[no-untyped-def]
    """`bool` SQL → 0/1 para poder sumarlo. Postgres no suma booleanos directamente."""
    from sqlalchemy import Integer, case, cast

    return cast(case((condition, 1), else_=0), Integer)


class DuplicateImageError(ValueError):
    """Esa URL ya está en la galería. Dos posiciones con la misma foto no es una galería."""


class SqlCanonicalImageRepository:
    """Galería ORDENADA de imágenes del canónico (F5).

    ⚠️ INVARIANTE que toda escritura mantiene: `canonical_product.image_url` = URL de la POSICIÓN
    1 (o `NULL` si la galería quedó vacía). El sitio público lee esa columna — og:image, canonical,
    tarjetas y rails — así que desincronizarla haría que el admin muestre una imagen y el público
    otra, sin que nadie se entere hasta que un usuario lo reporte.

    ⚠️ Reordenar NO puede actualizar posición por posición: `UNIQUE(canonical_product_id, position)`
    choca a mitad de camino cuando dos filas comparten número. Se hace en DOS fases, pasando por
    posiciones negativas (que ningún registro válido usa).
    """

    def __init__(self, session: Session) -> None:
        self._s = session

    def list_images(self, canonical_product_id: str) -> list[CanonicalImage]:
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return []
        rows = self._s.scalars(
            select(CanonicalProductImageModel)
            .where(CanonicalProductImageModel.canonical_product_id == pid)
            .order_by(CanonicalProductImageModel.position)
        ).all()
        return [
            CanonicalImage(
                id=str(m.id),
                url=m.url,
                position=m.position,
                source_store_product_id=(
                    str(m.source_store_product_id) if m.source_store_product_id else None
                ),
            )
            for m in rows
        ]

    def add_image(
        self,
        canonical_product_id: str,
        *,
        url: str,
        source_store_product_id: str | None = None,
    ) -> CanonicalImage | None:
        pid = _parse_uuid(canonical_product_id)
        if pid is None or self._s.get(CanonicalProductModel, pid) is None:
            return None

        existing = self.list_images(canonical_product_id)
        if any(image.url == url for image in existing):
            raise DuplicateImageError(url)

        model = CanonicalProductImageModel(
            canonical_product_id=pid,
            url=url,
            position=len(existing) + 1,  # se agrega al FINAL; el orden lo decide el operador
            source_store_product_id=_parse_uuid(source_store_product_id or ""),
        )
        self._s.add(model)
        self._s.flush()
        self._sync_primary(pid)
        return CanonicalImage(
            id=str(model.id),
            url=model.url,
            position=model.position,
            source_store_product_id=source_store_product_id,
        )

    def reorder(self, canonical_product_id: str, image_ids: list[str]) -> bool:
        """Fija el orden. Exige la lista COMPLETA: mandar un subconjunto dejaría imágenes sin
        posición, y adivinar dónde van sería inventar la decisión del operador."""
        pid = _parse_uuid(canonical_product_id)
        if pid is None:
            return False
        current = {image.id for image in self.list_images(canonical_product_id)}
        if current != set(image_ids) or len(image_ids) != len(set(image_ids)):
            return False

        # Fase 1: a posiciones NEGATIVAS. Sin este paso intermedio, mover la 3 a la 1 choca con
        # la que ya ocupa la 1 y la constraint aborta la transacción.
        for index, image_id in enumerate(image_ids):
            self._s.execute(
                update(CanonicalProductImageModel)
                .where(CanonicalProductImageModel.id == uuid.UUID(image_id))
                .values(position=-(index + 1))
            )
        self._s.flush()
        # Fase 2: al positivo definitivo.
        for index, image_id in enumerate(image_ids):
            self._s.execute(
                update(CanonicalProductImageModel)
                .where(CanonicalProductImageModel.id == uuid.UUID(image_id))
                .values(position=index + 1)
            )
        self._s.flush()
        self._sync_primary(pid)
        return True

    def remove_image(self, canonical_product_id: str, image_id: str) -> bool:
        """Quita una imagen y COMPACTA el resto: un hueco (1, 3) haría que la "2da imagen" no
        exista aunque haya dos fotos."""
        pid = _parse_uuid(canonical_product_id)
        iid = _parse_uuid(image_id)
        if pid is None or iid is None:
            return False
        model = self._s.get(CanonicalProductImageModel, iid)
        if model is None or model.canonical_product_id != pid:
            return False

        self._s.delete(model)
        self._s.flush()

        remaining = self.list_images(canonical_product_id)
        # Reusar `reorder` haría el doble de escrituras; acá el orden relativo ya es el correcto
        # y sólo hay que cerrar el hueco, siempre hacia ABAJO (nunca choca con una posición viva).
        for index, image in enumerate(remaining):
            if image.position != index + 1:
                self._s.execute(
                    update(CanonicalProductImageModel)
                    .where(CanonicalProductImageModel.id == uuid.UUID(image.id))
                    .values(position=index + 1)
                )
        self._s.flush()
        self._sync_primary(pid)
        return True

    def _sync_primary(self, canonical_product_id: uuid.UUID) -> None:
        """Espeja la posición 1 en `canonical_product.image_url` (o la vacía si no queda ninguna)."""
        first = self._s.scalars(
            select(CanonicalProductImageModel)
            .where(CanonicalProductImageModel.canonical_product_id == canonical_product_id)
            .order_by(CanonicalProductImageModel.position)
            .limit(1)
        ).first()
        self._s.execute(
            update(CanonicalProductModel)
            .where(CanonicalProductModel.id == canonical_product_id)
            .values(image_url=first.url if first else None)
        )
        self._s.flush()


class SqlCategoryDecisionRecorder:
    """Adapter de `CategoryDecisionRecorder` — bitácora append-only de decisiones de clasificación.

    Append-only a propósito: cada corrida deja su rastro y ninguna pisa a la anterior. Eso permite
    comparar el comportamiento de la cascada ENTRE corridas (¿el cambio de vocabulario mejoró o
    empeoró?), que es justamente la pregunta que hoy no se puede responder.

    No falla la ingesta: registrar es observabilidad, y una bitácora rota nunca debe tumbar una
    corrida de precios. Ver `record`.
    """

    def __init__(self, session: Session) -> None:
        self._s = session

    def record(self, decision: CategoryDecision) -> None:
        ref = _parse_uuid(decision.ref_id)
        if ref is None:
            return  # ref no-UUID (tests/fixtures): nada que registrar, y nada que romper
        row = CategoryDecisionModel(
            store_product_id=None if decision.is_canonical else ref,
            canonical_product_id=ref if decision.is_canonical else None,
            market_id=decision.market_id,
            method=decision.method,
            taxonomy_node_id=_parse_uuid(decision.taxonomy_node_id or ""),
            confidence=decision.confidence,  # type: ignore[arg-type]
            band=decision.band,
            source_leaf_id=_parse_uuid(decision.source_leaf_id or ""),
            name_leaf_id=_parse_uuid(decision.name_leaf_id or ""),
            matched_tokens=", ".join(decision.matched_tokens) or None,
            # Se guarda como objeto (no lista suelta) para poder sumarle claves después sin migrar.
            vector_top=(
                {
                    "candidates": [
                        {"node_id": c.taxonomy_node_id, "score": c.score, "name": c.name}
                        for c in decision.vector_top
                    ]
                }
                if decision.vector_top
                else None
            ),
        )
        self._s.add(row)
        self._s.flush()


class SqlBasketOfferRepository:
    """Resuelve la canasta curada contra el catálogo con precios, en UNA sola query.

    Une `basket_query` (los 20 rubros del hogar) → `canonical_product` por similitud léxica →
    `store_product` por proveedor, y se queda con el MÁS BARATO de cada (rubro × proveedor).

    Por qué léxico y no la búsqueda híbrida: resolver las 213 queries una por una a través de
    `SearchProducts` costaría 213 llamadas al embedder POR REQUEST. Acá la resolución vive donde
    están los datos. Medido: con el catálogo actual la cobertura léxica de la canasta es del 100%.
    """

    def __init__(self, session: Session) -> None:
        self._s = session

    def list_basket_offers(self, market_id: str) -> list[ProviderOffer]:
        pairs = mapping_pairs()
        rows = self._s.execute(
            text(
                """
                WITH allowed(grp, node_name) AS (
                    SELECT * FROM unnest(CAST(:groups AS text[]), CAST(:nodes AS text[]))
                ),
                matched AS (
                    SELECT bq.category_label AS group_label,
                           MIN(bq.position) OVER (PARTITION BY bq.category_label) AS priority,
                           cp.id   AS canonical_id,
                           cp.name AS canonical_name,
                           sp.provider_id,
                           pr.name AS provider_name,
                           sp.current_price_minor AS price_minor,
                           ROW_NUMBER() OVER (
                               PARTITION BY bq.category_label, sp.provider_id
                               ORDER BY sp.current_price_minor ASC, cp.name ASC
                           ) AS rn
                      FROM save.basket_query bq
                      JOIN save.canonical_product cp
                        ON cp.market_id = bq.market_id
                       AND cp.archived_at IS NULL
                       AND word_similarity(bq.query_text, cp.name) > :threshold
                      JOIN save.taxonomy_node leaf ON leaf.id = cp.taxonomy_node_id
                      LEFT JOIN save.taxonomy_node p1 ON p1.id = leaf.parent_id
                      LEFT JOIN save.taxonomy_node p2 ON p2.id = p1.parent_id
                      LEFT JOIN save.taxonomy_node p3 ON p3.id = p2.parent_id
                      JOIN save.store_product sp
                        ON sp.canonical_product_id = cp.id
                       AND sp.is_available
                      JOIN save.provider pr
                        ON pr.id = sp.provider_id
                       AND pr.archived_at IS NULL
                     WHERE bq.market_id = :market
                       AND bq.active
                       AND bq.category_label IS NOT NULL
                       -- El nombre PROPONE, la taxonomía DISPONE: el producto entra sólo si su
                       -- hoja o algún ancestro está permitido para el rubro. Un rubro SIN mapeo
                       -- (nuevo, creado desde el admin) no se filtra: degrada, no desaparece.
                       AND (
                             NOT EXISTS (
                                 SELECT 1 FROM allowed a WHERE a.grp = bq.category_label
                             )
                             OR EXISTS (
                                 SELECT 1 FROM allowed a
                                  WHERE a.grp = bq.category_label
                                    AND a.node_name IN (leaf.name, p1.name, p2.name, p3.name)
                             )
                           )
                )
                SELECT group_label, priority, canonical_id, canonical_name,
                       provider_id, provider_name, price_minor
                  FROM matched
                 WHERE rn = 1
                 ORDER BY priority, group_label, provider_name
                """
            ),
            {
                "market": market_id,
                "threshold": _LEXICAL_MIN_SIMILARITY,
                "groups": [g for g, _ in pairs],
                "nodes": [n for _, n in pairs],
            },
        ).all()
        return [
            ProviderOffer(
                provider_id=str(r.provider_id),
                provider_name=r.provider_name,
                group=r.group_label,
                priority=int(r.priority),
                canonical_product_id=str(r.canonical_id),
                name=r.canonical_name,
                price_minor=int(r.price_minor),
            )
            for r in rows
        ]
