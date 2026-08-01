"""Integration — las cuatro acciones por proveedor del DETALLE canónico (menú `ProvidersPanel`).

Operan sobre UN `store_product` ya matcheado a un canónico, identificándolo por `store_product_id`
(que es lo que la pantalla tiene a mano; el `match_id` se resuelve adentro):

1. `DiscardStoreProduct`  — borrado DURO, re-ingerible (decisión del usuario, 2026-07-29).
2. `UnlinkStoreProduct`   — lo devuelve a la cola de revisión, sacándolo del canónico equivocado.
3. `RelinkStoreProduct`   — lo mueve a OTRO canónico existente.
4. `PromoteStoreProductToCanonical` — crea un canónico nuevo desde este store_product y lo enlaza.

Las cuatro comparten el invariante de misma-transacción de `_auto_link`/`ResolveReview`: el FK
denormalizado (`store_product.canonical_product_id`) y el `product_match` se escriben juntos o no
se escriben. 3 y 4 NO reimplementan nada — componen con `ResolveReview` y `CreateCanonicalAndLink`.

Por qué el borrado duro de #1 es re-ingerible: `RefreshPrices` decide con
`exists(provider_id, external_id)` (`refresh_prices.py:118`). Si la fila no está, la próxima
corrida la materializa de nuevo y le corre la cascada limpia. No hay denylist ni tombstone.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from src.contexts.save.application.discard_store_product import DiscardStoreProduct
from src.contexts.save.application.promote_store_product import PromoteStoreProductToCanonical
from src.contexts.save.application.relink_store_product import RelinkStoreProduct
from src.contexts.save.application.unlink_store_product import UnlinkStoreProduct
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import (
    CanonicalProductImageModel,
    PriceModel,
    ProductMatchModel,
    StoreProductImageModel,
    StoreProductModel,
)
from src.contexts.save.infrastructure.repositories import (
    SqlCanonicalImageRepository,
    SqlCanonicalProductRepository,
    SqlStoreProductRepository,
)

from .test_product_match_repository import _seed_provider_and_canonical, _seed_store_product


def _seed_price(db_session, store_product_id: str, value_minor: int) -> None:  # type: ignore[no-untyped-def]
    db_session.add(
        PriceModel(
            store_product_id=uuid.UUID(store_product_id),
            value_minor=value_minor,
            currency="DOP",
            captured_at=datetime.now(timezone.utc),
            price_type="online",
            source="test",
        )
    )
    db_session.flush()


def _seed_linked(db_session, *, status: str = "auto_linked") -> tuple[str, str, str, str]:  # type: ignore[no-untyped-def]
    """(provider_id, canonical_id, store_product_id, match_id) de un store_product YA enlazado.

    Se le ponen `name`/`brand`/`size_text` porque la acción #4 los DERIVA de ahí (`get_raw_attrs` +
    `parse_size`): sin nombre, promover falla a propósito y no se podría probar el camino feliz.
    """
    pid, cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid, canonical_product_id=cid)
    sp = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    sp.name = "Arroz La Garza Premium"
    sp.brand = "La Garza"
    sp.size_text = "1 kg"
    db_session.flush()
    match_id = SqlProductMatchRepository(db_session).record_match(
        store_product_id=sp_id,
        canonical_product_id=cid,
        confidence=0.93,
        method="vector",
        status=status,
    )
    return pid, cid, sp_id, match_id


# ---------------------------------------------------------------------------- #1 · borrado duro


def test_discard_hard_deletes_match_store_product_and_price_history(db_session) -> None:  # type: ignore[no-untyped-def]
    _pid, _cid, sp_id, match_id = _seed_linked(db_session)
    _seed_price(db_session, sp_id, 16495)
    _seed_price(db_session, sp_id, 17000)

    DiscardStoreProduct(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
    ).execute(store_product_id=sp_id, decided_by="admin-1")

    # El match se borra ANTES del store_product: su FK es ON DELETE NO ACTION y bloquearía el DELETE.
    assert db_session.get(ProductMatchModel, uuid.UUID(match_id)) is None
    assert db_session.get(StoreProductModel, uuid.UUID(sp_id)) is None
    # `price` es ON DELETE CASCADE: el historial se va con la fila. Es el costo aceptado de #1.
    remaining = (
        db_session.query(PriceModel).filter(PriceModel.store_product_id == uuid.UUID(sp_id)).count()
    )
    assert remaining == 0


def test_discard_frees_the_identity_so_the_next_run_reingests_it(db_session) -> None:  # type: ignore[no-untyped-def]
    """El corazón del pedido: "poder volver a ingerirlo si hace falta"."""
    pid, cid = _seed_provider_and_canonical(db_session)
    sp = StoreProductModel(
        provider_id=uuid.UUID(pid),
        canonical_product_id=uuid.UUID(cid),
        external_id="sku-reingest",
        current_price_minor=16495,
        currency="DOP",
    )
    db_session.add(sp)
    db_session.flush()
    sp_id = str(sp.id)
    SqlProductMatchRepository(db_session).record_match(
        store_product_id=sp_id, canonical_product_id=cid,
        confidence=0.9, method="vector", status="auto_linked",
    )
    store_repo = SqlStoreProductRepository(db_session)
    assert store_repo.exists(pid, "sku-reingest") is True

    DiscardStoreProduct(
        match_repo=SqlProductMatchRepository(db_session), store_repo=store_repo
    ).execute(store_product_id=sp_id, decided_by="admin-1")

    # `RefreshPrices` vuelve a verlo como DESCONOCIDO → lo materializa y le corre la cascada.
    assert store_repo.exists(pid, "sku-reingest") is False


def test_discard_reports_what_it_destroyed(db_session) -> None:  # type: ignore[no-untyped-def]
    """El conteo alimenta el diálogo de confirmación y la fila de auditoría: un borrado
    irreversible tiene que poder decir CUÁNTO se llevó."""
    pid, _cid, sp_id, _match_id = _seed_linked(db_session)
    external_id = db_session.get(StoreProductModel, uuid.UUID(sp_id)).external_id
    _seed_price(db_session, sp_id, 16495)
    _seed_price(db_session, sp_id, 17000)
    _seed_price(db_session, sp_id, 17500)

    result = DiscardStoreProduct(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
    ).execute(store_product_id=sp_id, decided_by="admin-1")

    assert result.deleted_price_count == 3
    # La identidad que queda LIBRE para la re-ingestión — es el dato que hace auditable el borrado:
    # sin él, la fila de auditoría no permitiría reconstruir qué se destruyó.
    assert result.provider_id == pid
    assert result.external_id == external_id


def test_discard_on_unknown_store_product_raises_and_writes_nothing(db_session) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError, match="store_product"):
        DiscardStoreProduct(
            match_repo=SqlProductMatchRepository(db_session),
            store_repo=SqlStoreProductRepository(db_session),
        ).execute(store_product_id=str(uuid.uuid4()), decided_by="admin-1")


# ------------------------------------------------------------------- #2 · devolver a la cola


def test_unlink_sends_it_back_to_the_review_queue(db_session) -> None:  # type: ignore[no-untyped-def]
    _pid, _cid, sp_id, match_id = _seed_linked(db_session)

    UnlinkStoreProduct(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
    ).execute(store_product_id=sp_id, decided_by="admin-1", reason_code="wrong_match")

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert row.status == "pending_review"
    assert row.canonical_product_id is None
    assert row.decided_by == "admin-1"
    assert row.reason_code == "wrong_match"
    # El FK denormalizado se limpia en la MISMA transacción: dejarlo apuntando al canónico
    # equivocado lo seguiría mostrando en el sitio público mientras espera revisión.
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None
    assert sp_row.canonical_product_id is None


def test_unlink_requires_a_reason_code(db_session) -> None:  # type: ignore[no-untyped-def]
    """Misma regla que rechazar en la cola (regla sagrada #4): desenlazar sin motivo no es
    trazable. Se bloquea ANTES de escribir."""
    _pid, cid, sp_id, match_id = _seed_linked(db_session)

    with pytest.raises(ValueError, match="reason_code"):
        UnlinkStoreProduct(
            match_repo=SqlProductMatchRepository(db_session),
            store_repo=SqlStoreProductRepository(db_session),
        ).execute(store_product_id=sp_id, decided_by="admin-1", reason_code="  ")

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert row.status == "auto_linked"  # sin cambios
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None and str(sp_row.canonical_product_id) == cid


# ------------------------------------------------------------- #3 · rematchear a otro canónico


def test_relink_moves_the_store_product_to_another_canonical(db_session) -> None:  # type: ignore[no-untyped-def]
    _pid, cid, sp_id, match_id = _seed_linked(db_session)
    other_id = str(uuid.uuid4())
    SqlCanonicalProductRepository(db_session).add(
        _canonical(other_id, "Arroz Blanco Selecto", db_session)
    )

    RelinkStoreProduct(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
    ).execute(store_product_id=sp_id, canonical_product_id=other_id, decided_by="admin-1")

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None
    assert str(row.canonical_product_id) == other_id
    assert row.status == "auto_linked"
    assert row.method == "human"  # lo decidió una persona, no la cascada
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None and str(sp_row.canonical_product_id) == other_id
    assert str(sp_row.canonical_product_id) != cid


def test_relink_to_a_nonexistent_canonical_leaves_everything_untouched(db_session) -> None:  # type: ignore[no-untyped-def]
    """Invariante de misma-transacción: el FK revienta y el product_match NO se toca."""
    _pid, cid, sp_id, match_id = _seed_linked(db_session)

    # Savepoint anidado: acota el rollback a ESTA operación. Un `db_session.rollback()` a secas
    # deshace TODO el savepoint del fixture, seed incluido, y el test no podría comprobar nada.
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            RelinkStoreProduct(
                match_repo=SqlProductMatchRepository(db_session),
                store_repo=SqlStoreProductRepository(db_session),
            ).execute(
                store_product_id=sp_id,
                canonical_product_id=str(uuid.uuid4()),
                decided_by="admin-1",
            )

    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None and str(row.canonical_product_id) == cid
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None and str(sp_row.canonical_product_id) == cid


# --------------------------------------------------------- #4 · crear canónico nuevo desde este


def test_promote_creates_a_new_canonical_and_relinks_the_store_product(db_session) -> None:  # type: ignore[no-untyped-def]
    _pid, cid, sp_id, match_id = _seed_linked(db_session)
    node_id = db_session.execute(
        __import__("sqlalchemy").text("SELECT id FROM save.taxonomy_node LIMIT 1")
    ).scalar_one()

    # Solo la CATEGORÍA viaja: nombre/marca/cantidad los deriva el servidor del store_product
    # (`get_raw_attrs` + `parse_size` del dominio), igual que `bulk-create-canonical`.
    new_id = PromoteStoreProductToCanonical(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
        canonical_repo=SqlCanonicalProductRepository(db_session),
        market_id="DO",
    ).execute(
        store_product_id=sp_id,
        taxonomy_node_id=str(node_id),
        decided_by="admin-1",
    )

    assert new_id != cid
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    assert sp_row is not None and str(sp_row.canonical_product_id) == new_id
    row = db_session.get(ProductMatchModel, uuid.UUID(match_id))
    assert row is not None and str(row.canonical_product_id) == new_id
    assert row.method == "human"


def test_promote_makes_the_new_canonical_inherit_the_provider_gallery(db_session) -> None:  # type: ignore[no-untyped-def]
    """Mismo criterio que la cola de revisión: un canónico nacido de un store_product hereda las
    fotos de esa tienda, no sólo la principal denormalizada."""
    _pid, cid, sp_id, _match_id = _seed_linked(db_session)
    urls = ["https://cdn.tienda.do/p1.jpg", "https://cdn.tienda.do/p2.jpg"]
    for position, url in enumerate(urls, start=1):
        db_session.add(
            StoreProductImageModel(
                store_product_id=uuid.UUID(sp_id), url=url, position=position
            )
        )
    db_session.flush()
    node_id = db_session.execute(text("SELECT id FROM save.taxonomy_node LIMIT 1")).scalar_one()

    new_id = PromoteStoreProductToCanonical(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
        canonical_repo=SqlCanonicalProductRepository(db_session),
        image_repo=SqlCanonicalImageRepository(db_session),
        market_id="DO",
    ).execute(store_product_id=sp_id, taxonomy_node_id=str(node_id), decided_by="admin-1")

    gallery = (
        db_session.query(CanonicalProductImageModel)
        .filter(CanonicalProductImageModel.canonical_product_id == uuid.UUID(new_id))
        .order_by(CanonicalProductImageModel.position)
        .all()
    )
    assert [image.url for image in gallery] == urls
    # y el canónico VIEJO no gana fotos: la herencia es sólo del que nace
    assert (
        db_session.query(CanonicalProductImageModel)
        .filter(CanonicalProductImageModel.canonical_product_id == uuid.UUID(cid))
        .count()
        == 0
    )


def _canonical(cid: str, name: str, db_session):  # type: ignore[no-untyped-def]
    from sqlalchemy import text

    from src.contexts.save.domain.entities import CanonicalProduct

    node_id = db_session.execute(text("SELECT id FROM save.taxonomy_node LIMIT 1")).scalar_one()
    return CanonicalProduct(cid, name, "Selecto", Quantity(Decimal("1"), UnitMeasure.MASS), str(node_id), "DO")
