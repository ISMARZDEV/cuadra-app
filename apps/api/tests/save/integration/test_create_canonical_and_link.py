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

from src.contexts.save.application.bulk_create_canonicals import BulkCreateCanonicals
from src.contexts.save.application.create_canonical_and_link import (
    CreateCanonicalAndLink,
    NewCanonicalProduct,
)
from src.contexts.save.application.embed_canonical_product import EmbedCanonicalProduct
from src.contexts.save.application.resolve_review import ResolveReview
from src.contexts.save.domain.classification import CategoryClassification, ClassifiableProduct
from src.contexts.save.domain.value_objects import Quantity, UnitMeasure
from src.contexts.save.infrastructure.matching.repository.product_match_repository import (
    SqlProductMatchRepository,
)
from src.contexts.save.infrastructure.models import (
    CanonicalProductImageModel,
    CanonicalProductModel,
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

from ._taxonomy import taxonomy_node



def _make_use_case(db_session, embedder=None) -> CreateCanonicalAndLink:  # type: ignore[no-untyped-def]
    match_repo = SqlProductMatchRepository(db_session)
    return CreateCanonicalAndLink(
        canonical_repo=SqlCanonicalProductRepository(db_session),
        resolver=ResolveReview(
            match_repo=match_repo, store_repo=SqlStoreProductRepository(db_session)
        ),
        match_repo=match_repo,
        store_repo=SqlStoreProductRepository(db_session),
        image_repo=SqlCanonicalImageRepository(db_session),
        embedder=embedder,
    )


class _StubEmbeddingProvider:
    """BGE-M3 falso: 1024 dims (la dimensión de la columna) sin red ni modelo."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 1024 for _ in texts]


class _ExplodingEmbeddingProvider:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("BGE-M3 endpoint caído")


def _seed_store_images(db_session, store_product_id: str, urls: list[str]) -> None:  # type: ignore[no-untyped-def]
    """Galería tal como la deja `record_observation`: posición 1 = principal de la tienda."""
    for position, url in enumerate(urls, start=1):
        db_session.add(
            StoreProductImageModel(
                store_product_id=uuid.UUID(store_product_id), url=url, position=position
            )
        )
    db_session.flush()


def _pending_match(db_session, provider_id: str) -> tuple[str, str]:  # type: ignore[no-untyped-def]
    sp_id = _seed_store_product(db_session, provider_id)  # sin canonical (pendiente de revisión)
    match_id = SqlProductMatchRepository(db_session).record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )
    return sp_id, match_id


def _new_product(taxonomy_node_id: str, name: str = "Bebida Gasificada Zero 330 ml") -> NewCanonicalProduct:
    return NewCanonicalProduct(
        name=name,
        brand="Sanpellegrino",
        quantity=Quantity(Decimal("0.33"), UnitMeasure.VOLUME),
        taxonomy_node_id=taxonomy_node_id,
        market_id="DO",
    )


def _leaf(db_session, name: str = "Bebidas Hidratantes") -> str:  # type: ignore[no-untyped-def]
    node = taxonomy_node(db_session, name=name, level=0, market_id="DO")
    db_session.add(node)
    db_session.flush()
    return str(node.id)


class _StubProducts:
    """Lo único del lote que no interesa acá: de dónde salen los productos y su categoría."""

    def __init__(self, rows: dict[str, ClassifiableProduct], leaf_id: str) -> None:
        self._rows = rows
        self._leaf_id = leaf_id

    def classifiable_for_matches(self, match_ids):  # type: ignore[no-untyped-def]
        return [(m, self._rows[m]) for m in match_ids if m in self._rows]

    def active_for(self, ref_id, *, is_canonical):  # type: ignore[no-untyped-def]
        return CategoryClassification(
            id="c1", store_product_id=ref_id, canonical_product_id=None,
            taxonomy_node_id=self._leaf_id, confidence=0.9, method="lexicon", status="active",
        )


def _gallery(db_session, canonical_id: str) -> list[CanonicalProductImageModel]:  # type: ignore[no-untyped-def]
    return list(
        db_session.query(CanonicalProductImageModel)
        .filter(CanonicalProductImageModel.canonical_product_id == uuid.UUID(canonical_id))
        .order_by(CanonicalProductImageModel.position)
        .all()
    )


def test_creates_canonical_with_autogen_slug_and_links_the_match(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _existing_cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)  # sin canonical (pendiente de revisión)
    match_repo = SqlProductMatchRepository(db_session)
    match_id = match_repo.record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )
    node = taxonomy_node(db_session, name="Arroz", level=0, market_id="DO")
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


def _create_one(db_session, embedder, name: str) -> str:  # type: ignore[no-untyped-def]
    """Crea un canónico desde una fila pendiente de la cola y devuelve su id."""
    pid, _existing_cid = _seed_provider_and_canonical(db_session)
    sp_id = _seed_store_product(db_session, pid)
    match_id = SqlProductMatchRepository(db_session).record_match(
        store_product_id=sp_id, canonical_product_id=None,
        confidence=0.3, method="human", status="pending_review",
    )
    node = taxonomy_node(db_session, name="Arroz", level=0, market_id="DO")
    db_session.add(node)
    db_session.flush()
    return _make_use_case(db_session, embedder=embedder).execute(
        match_id=match_id,
        product=NewCanonicalProduct(
            name=name, brand="La Garza",
            quantity=Quantity(Decimal("4.5359237"), UnitMeasure.MASS),
            taxonomy_node_id=str(node.id), market_id="DO",
        ),
        decided_by="admin-123",
    )


def test_the_new_canonical_is_embedded_on_creation(db_session) -> None:  # type: ignore[no-untyped-def]
    """US-CP-L14: nacía SIN vector, o sea invisible para la etapa semántica hasta el próximo
    backfill. Como la cola es donde nacen los canónicos, esa ventana se retroalimentaba."""
    embedder = EmbedCanonicalProduct(
        SqlCanonicalProductRepository(db_session), _StubEmbeddingProvider()
    )

    cid = _create_one(db_session, embedder, "Zqx Arroz Embebido Al Nacer")

    row = db_session.get(CanonicalProductModel, uuid.UUID(cid))
    assert row is not None
    assert row.embedding is not None


def test_a_dead_embedding_service_never_blocks_the_creation(db_session) -> None:  # type: ignore[no-untyped-def]
    """Fail-safe: ningún vector vale bloquear la resolución de una fila de la cola. El canónico se
    crea igual y queda con `embedding` NULL — que es exactamente lo que el backfill busca."""
    embedder = EmbedCanonicalProduct(
        SqlCanonicalProductRepository(db_session), _ExplodingEmbeddingProvider()
    )

    cid = _create_one(db_session, embedder, "Zqx Arroz Sin Servicio")

    row = db_session.get(CanonicalProductModel, uuid.UUID(cid))
    assert row is not None
    assert row.embedding is None


def test_two_canonicals_with_same_name_get_distinct_slugs(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _existing_cid = _seed_provider_and_canonical(db_session)
    node = taxonomy_node(db_session, name="Detergentes", level=0, market_id="DO")
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


# ------------------------------------------------------- herencia de la galería del proveedor --
#
# Un canónico que nace de un `store_product` hereda las fotos que ya publicó esa tienda. La
# información ya está en `store_product_image` (la ingesta la refresca en cada corrida); obligar al
# operador a re-agregarlas a mano una por una era trabajo inventado.


def test_the_new_canonical_inherits_the_whole_provider_gallery_in_order(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id, match_id = _pending_match(db_session, pid)
    urls = [
        "https://cdn.tienda.do/sanpellegrino-frente.jpg",
        "https://cdn.tienda.do/sanpellegrino-lateral.jpg",
        "https://cdn.tienda.do/sanpellegrino-nutricional.jpg",
    ]
    _seed_store_images(db_session, sp_id, urls)

    canonical_id = _make_use_case(db_session).execute(
        match_id=match_id, product=_new_product(_leaf(db_session)), decided_by="admin-1"
    )

    gallery = _gallery(db_session, canonical_id)
    assert [image.url for image in gallery] == urls  # mismo orden que publicó la tienda
    assert [image.position for image in gallery] == [1, 2, 3]  # sin huecos, 1 = principal
    # trazabilidad: cada foto recuerda de qué store_product salió
    assert all(str(image.source_store_product_id) == sp_id for image in gallery)
    # y el espejo denormalizado que lee el sitio público apunta a la posición 1
    canonical_row = db_session.get(CanonicalProductModel, uuid.UUID(canonical_id))
    assert canonical_row.image_url == urls[0]


def test_the_inherited_gallery_is_capped_so_one_provider_cannot_flood_it(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id, match_id = _pending_match(db_session, pid)
    urls = [f"https://cdn.tienda.do/foto-{n:02d}.jpg" for n in range(1, 13)]  # 12 fotos
    _seed_store_images(db_session, sp_id, urls)

    canonical_id = _make_use_case(db_session).execute(
        match_id=match_id, product=_new_product(_leaf(db_session)), decided_by="admin-1"
    )

    gallery = _gallery(db_session, canonical_id)
    assert [image.url for image in gallery] == urls[:10]  # las 10 primeras, no las 12


def test_a_repeated_url_in_the_provider_gallery_does_not_break_the_creation(db_session) -> None:  # type: ignore[no-untyped-def]
    """Dos posiciones con la misma foto no es una galería: se hereda UNA sola vez y sin reventar."""
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id, match_id = _pending_match(db_session, pid)
    _seed_store_images(
        db_session,
        sp_id,
        [
            "https://cdn.tienda.do/a.jpg",
            "https://cdn.tienda.do/b.jpg",
            "https://cdn.tienda.do/a.jpg",
        ],
    )

    canonical_id = _make_use_case(db_session).execute(
        match_id=match_id, product=_new_product(_leaf(db_session)), decided_by="admin-1"
    )

    gallery = _gallery(db_session, canonical_id)
    assert [image.url for image in gallery] == [
        "https://cdn.tienda.do/a.jpg",
        "https://cdn.tienda.do/b.jpg",
    ]


def test_without_a_gallery_it_falls_back_to_the_stores_denormalized_image(db_session) -> None:  # type: ignore[no-untyped-def]
    """Hay `store_product` observados ANTES de que los adapters capturaran el array completo:
    esos sólo tienen la principal denormalizada, y perderla sería un retroceso."""
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id, match_id = _pending_match(db_session, pid)
    sp_row = db_session.get(StoreProductModel, uuid.UUID(sp_id))
    sp_row.image_url = "https://cdn.tienda.do/unica.jpg"
    db_session.flush()

    canonical_id = _make_use_case(db_session).execute(
        match_id=match_id, product=_new_product(_leaf(db_session)), decided_by="admin-1"
    )

    gallery = _gallery(db_session, canonical_id)
    assert [image.url for image in gallery] == ["https://cdn.tienda.do/unica.jpg"]
    canonical_row = db_session.get(CanonicalProductModel, uuid.UUID(canonical_id))
    assert canonical_row.image_url == "https://cdn.tienda.do/unica.jpg"


def test_a_provider_without_any_photo_still_creates_the_canonical(db_session) -> None:  # type: ignore[no-untyped-def]
    pid, _cid = _seed_provider_and_canonical(db_session)
    _sp_id, match_id = _pending_match(db_session, pid)

    canonical_id = _make_use_case(db_session).execute(
        match_id=match_id, product=_new_product(_leaf(db_session)), decided_by="admin-1"
    )

    assert _gallery(db_session, canonical_id) == []
    canonical_row = db_session.get(CanonicalProductModel, uuid.UUID(canonical_id))
    assert canonical_row is not None  # la falta de fotos NUNCA bloquea la creación
    assert canonical_row.image_url is None


def test_linking_to_an_EXISTING_canonical_never_touches_its_gallery(db_session) -> None:  # type: ignore[no-untyped-def]
    """La herencia es sólo al CREAR. Un canónico con 5 proveedores no debe acumular 30 fotos que
    nadie decidió: aprobar un candidato existente deja la galería curada intacta."""
    pid, existing_cid = _seed_provider_and_canonical(db_session)
    sp_id, match_id = _pending_match(db_session, pid)
    _seed_store_images(db_session, sp_id, ["https://cdn.tienda.do/x.jpg"])

    ResolveReview(
        match_repo=SqlProductMatchRepository(db_session),
        store_repo=SqlStoreProductRepository(db_session),
    ).execute(match_id=match_id, canonical_product_id=existing_cid, decided_by="admin-1")

    assert _gallery(db_session, existing_cid) == []


def test_the_bulk_path_inherits_the_gallery_too(db_session) -> None:  # type: ignore[no-untyped-def]
    """`BulkCreateCanonicals` no reimplementa la creación: delega en este mismo use case. Se prueba
    con el creator REAL (el unit test del lote usa uno falso y no podría ver la galería)."""
    pid, _cid = _seed_provider_and_canonical(db_session)
    leaf_id = _leaf(db_session)
    rows: dict[str, ClassifiableProduct] = {}
    expected: dict[str, list[str]] = {}
    for index in (1, 2):
        sp_id, match_id = _pending_match(db_session, pid)
        urls = [f"https://cdn.tienda.do/lote{index}-{n}.jpg" for n in (1, 2)]
        _seed_store_images(db_session, sp_id, urls)
        rows[match_id] = ClassifiableProduct(
            ref_id=sp_id, is_canonical=False,
            name=f"Arroz Selecto {index}", brand="Selecto", size_text="5 Lb",
        )
        expected[match_id] = urls

    result = BulkCreateCanonicals(
        scope=db_session,  # SAVEPOINT real por fila
        products=_StubProducts(rows, leaf_id),
        creator=_make_use_case(db_session),
        market_id="DO",
    ).execute(list(rows), fallback_taxonomy_node_id=None, decided_by="admin-1")

    assert result.created == 2 and not result.failed and not result.skipped
    for canonical_id, match_id in zip(result.canonical_ids, rows, strict=True):
        assert [image.url for image in _gallery(db_session, canonical_id)] == expected[match_id]


def test_the_use_case_still_works_without_the_image_collaborators(db_session) -> None:  # type: ignore[no-untyped-def]
    """`store_repo`/`image_repo` son opcionales igual que `match_repo` (F4): sin ellos la creación
    funciona, sólo que el canónico nace sin galería."""
    pid, _cid = _seed_provider_and_canonical(db_session)
    sp_id, match_id = _pending_match(db_session, pid)
    _seed_store_images(db_session, sp_id, ["https://cdn.tienda.do/y.jpg"])
    use_case = CreateCanonicalAndLink(
        canonical_repo=SqlCanonicalProductRepository(db_session),
        resolver=ResolveReview(
            match_repo=SqlProductMatchRepository(db_session),
            store_repo=SqlStoreProductRepository(db_session),
        ),
    )

    canonical_id = use_case.execute(
        match_id=match_id, product=_new_product(_leaf(db_session)), decided_by="admin-1"
    )

    assert _gallery(db_session, canonical_id) == []
