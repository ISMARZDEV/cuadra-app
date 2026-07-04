"""Repos SQLAlchemy de Save (infra · ADR 31). La `Session` ES el Unit of Work.

`record_observation` implementa el SCD-4 change-only (doc 10): busca el store_product por
(provider, external_id); inserta una fila `price` SOLO si el precio cambió (o es nuevo), y
siempre refresca `last_seen_at`. El brand se resuelve get-or-create por (market, name).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.shared.money import Currency, Money

from ..domain.comparison import StoreQuote
from ..domain.drops import PriceChange
from ..domain.entities import CanonicalProduct, PriceType, Provider, StoreProduct
from ..domain.history import PricePoint
from ..domain.listing import OfferingRow
from ..domain.taxonomy import CategoryNode, slugify
from ..domain.value_objects import Quantity, UnitMeasure
from .mappers import canonical_to_entity, provider_to_entity, store_product_to_entity
from .models import (
    BrandModel,
    CanonicalProductModel,
    PriceModel,
    ProviderModel,
    StoreProductModel,
    TaxonomyNodeModel,
)


def _parse_uuid(value: str) -> uuid.UUID | None:
    """UUID válido → UUID; malformado → None (para no reventar ante input externo arbitrario)."""
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


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
            )
        )
        self._s.flush()

    def get_by_id(self, provider_id: str) -> Provider | None:
        m = self._s.get(ProviderModel, uuid.UUID(provider_id))
        return provider_to_entity(m) if m else None


class SqlCanonicalProductRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def _get_or_create_brand_id(self, name: str, market_id: str) -> uuid.UUID | None:
        if not name.strip():
            return None
        existing = self._s.scalars(
            select(BrandModel).where(
                BrandModel.market_id == market_id, BrandModel.name == name
            )
        ).first()
        if existing:
            return existing.id
        brand = BrandModel(name=name, market_id=market_id)
        self._s.add(brand)
        self._s.flush()
        return brand.id

    def add(self, product: CanonicalProduct) -> None:
        self._s.add(
            CanonicalProductModel(
                id=uuid.UUID(product.id),
                name=product.name,
                brand_id=self._get_or_create_brand_id(product.brand, product.market_id),
                size_amount=product.quantity.amount,
                size_measure=product.quantity.measure.value,
                taxonomy_node_id=(
                    uuid.UUID(product.taxonomy_node_id) if product.taxonomy_node_id else None
                ),
                market_id=product.market_id,
            )
        )
        self._s.flush()

    def _brand_name(self, brand_id: uuid.UUID | None) -> str:
        if brand_id is None:
            return ""
        b = self._s.get(BrandModel, brand_id)
        return b.name if b else ""

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
            )
        ).all()
        return [canonical_to_entity(m, self._brand_name(m.brand_id)) for m in models]

    def list_by_market(
        self, market_id: str, limit: int = 1000, offset: int = 0
    ) -> list[CanonicalProduct]:
        models = self._s.scalars(
            select(CanonicalProductModel)
            .where(CanonicalProductModel.market_id == market_id)
            .order_by(CanonicalProductModel.name)
            .limit(limit)
            .offset(offset)
        ).all()
        return [canonical_to_entity(m, self._brand_name(m.brand_id)) for m in models]


class SqlStoreProductRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def _find(self, provider_id: str, external_id: str) -> StoreProductModel | None:
        return self._s.scalars(
            select(StoreProductModel).where(
                StoreProductModel.provider_id == uuid.UUID(provider_id),
                StoreProductModel.external_id == external_id,
            )
        ).first()

    def exists(self, provider_id: str, external_id: str) -> bool:
        return self._find(provider_id, external_id) is not None

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
    ) -> str:
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
                last_seen_at=captured_at,
            )
            self._s.add(sp)
            self._s.flush()
            changed = True
        else:
            sp.last_seen_at = captured_at
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
        return str(sp.id)

    def list_by_canonical(self, canonical_product_id: str) -> list[StoreProduct]:
        models = self._s.scalars(
            select(StoreProductModel).where(
                StoreProductModel.canonical_product_id == uuid.UUID(canonical_product_id)
            )
        ).all()
        return [store_product_to_entity(m) for m in models]

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
            .where(StoreProductModel.canonical_product_id == uuid.UUID(canonical_product_id))
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

    def list_category_offerings(self, node_ids: list[str]) -> list[OfferingRow]:
        node_uuids = [u for u in (_parse_uuid(i) for i in node_ids) if u is not None]
        if not node_uuids:
            return []
        rows = self._s.execute(
            select(
                CanonicalProductModel.id,
                CanonicalProductModel.name,
                BrandModel.name.label("brand"),
                CanonicalProductModel.quality,
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
            .where(CanonicalProductModel.taxonomy_node_id.in_(node_uuids))
        ).all()
        return [
            OfferingRow(
                product_id=str(r.id),
                name=r.name,
                brand=r.brand or "",
                quality=r.quality,
                quantity=Quantity(r.size_amount, UnitMeasure(r.size_measure)),
                provider_id=str(r.provider_id),
                provider_name=r.provider_name,
                price=Money(r.current_price_minor, Currency(r.currency)),
            )
            for r in rows
        ]


class SqlTaxonomyRepository:
    """Read-only sobre `taxonomy_node` (árbol self-FK). El slug se deriva del nombre (sin columna)."""

    def __init__(self, session: Session) -> None:
        self._s = session

    def _to_node(
        self, m: TaxonomyNodeModel, children: tuple[CategoryNode, ...] = ()
    ) -> CategoryNode:
        return CategoryNode(
            id=str(m.id),
            name=m.name,
            slug=slugify(m.name),
            level=m.level,
            parent_id=str(m.parent_id) if m.parent_id else None,
            children=children,
        )

    def _market_nodes(self, market_id: str) -> list[TaxonomyNodeModel]:
        return list(
            self._s.scalars(
                select(TaxonomyNodeModel)
                .where(TaxonomyNodeModel.market_id == market_id)
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
        node = self._s.get(TaxonomyNodeModel, uuid.UUID(node_id))
        if node is None:
            return []
        children_of: dict[str | None, list[str]] = {}
        for m in self._market_nodes(node.market_id):
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
