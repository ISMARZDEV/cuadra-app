"""Integration — CreateCanonicalAndLink (F2 · B1, tareas 1.15-1.16). Requiere DB.

Cubre el flujo "crear canónico nuevo desde la cola de revisión": el revisor decide que NINGÚN
candidato ofrecido es el producto correcto, así que crea un `canonical_product` nuevo (slug
autogen vía `SqlCanonicalProductRepository.add`) Y enlaza el match pendiente a él, en el MISMO
flujo. El use case NO reimplementa el invariante de misma-transacción (FK + product_match) —
compone con `ResolveReview` (F2·B1, ya probado en `test_resolve_review.py`), que es el único
lugar que lo posee.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from src.contexts.save.application.create_canonical_and_link import (
    CreateCanonicalAndLink,
    NewCanonicalProduct,
)
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import (
    CanonicalProductModel,
    ProductMatchModel,
    StoreProductModel,
    TaxonomyNodeModel,
)
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalProductRepository,
    SqlStoreProductRepository,
)

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _make_use_case(db_session) -> CreateCanonicalAndLink:  # type: ignore[no-untyped-def]
    match_repo = SqlProductMatchRepository(db_session)
    return CreateCanonicalAndLink(
        canonical_repo=SqlCanonicalProductRepository(db_session),
        resolver=ResolveReview(
            match_repo=match_repo, store_repo=SqlStoreProductRepository(db_session)
        ),
    )


def test_creates_canonical_with_autogen_slug_and_links_the_match(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _existing_cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)  # sin canonical (pendiente de revisión)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )
    node = TaxonomyNodeModel(name="Arroz", level=0, market_id="DO")
    db_session.add(node)
    db_session.flush()
    use_case = _make_use_case(db_session)
    product = NewCanonicalProduct(
        name="Arroz Selecto La Garza 10lb",
        brand="La Garza",
        quantity=Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
        taxonomy_node_id=str(node.id),
        market_id="DO",
    )

    canonical_id = use_case.execute(match_id=match_id, product=product, decided_by="admin-123")

    canonical_row = db_session.get(CanonicalProductModel, uuid.UUID(canonical_id))
    assert canonical_row is not None
    assert canonical_row.name == "Arroz Selecto La Garza 10lb"
    assert canonical_row.slug  # autogen — nunca vacío
    match_row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert match_row is not None
    assert match_row.status == "auto_linked"
    assert str(match_row.canonical_product_id) == canonical_id
    assert match_row.decided_by == "admin-123"
    # el FK denormalizado también quedó enlazado (invariante de ResolveReview, reutilizado)
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None
    assert str(sp_row.canonical_product_id) == canonical_id


def test_two_canonicals_with_same_name_get_distinct_slugs(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _existing_cid = _seed_provider_and_canonical(db_session)
    node = TaxonomyNodeModel(name="Detergentes", level=0, market_id="DO")
    db_session.add(node)
    db_session.flush()

    def _create(name: str) -> tuple[str, str]:  # type: ignore[no-untyped-def]
        sp_id = _seed_store_product(db_session, pid)
        match_repo = SqlProductMatchRepository(db_session)
        match_id = match_repo.record_match(
            store_product_id=sp_id, canonical_product_id=None,
            confidence=0.3, method="human", status="pending_review",
        )
        use_case = _make_use_case(db_session)
        product = NewCanonicalProduct(
            name=name, brand="Ariel",
            quantity=Quantity(Decimal("1"), UnitMeasure.VOLUME),
            taxonomy_node_id=str(node.id), market_id="DO",
        )
        canonical_id = use_case.execute(match_id=match_id, product=product, decided_by="admin-1")
        return match_id, canonical_id

    _match_1, cid_1 = _create("Detergente Ariel Concentrado")
    _match_2, cid_2 = _create("Detergente Ariel Concentrado")

    slug_1 = db_session.get(CanonicalProductModel, uuid.UUID(cid_1)).slug
    slug_2 = db_session.get(CanonicalProductModel, uuid.UUID(cid_2)).slug
    assert slug_1 != slug_2  # el sufijo -2 del repo evita colisión de slug
