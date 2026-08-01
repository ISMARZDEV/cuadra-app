"""Unit — el catálogo canónico embebe en el acto lo que escribe (US-CP-L14).

Un canónico sin vector es INVISIBLE para la etapa semántica de la cascada. Como la cola de revisión
es justo donde nacen los canónicos, esa ventana se retroalimenta: más cola → más canónicos a mano →
más agujeros en el índice → peor matching → más cola.

El embedder es un colaborador OPCIONAL, igual que `match_repo`/`image_repo` en
`CreateCanonicalAndLink`: sin él la escritura funciona idéntico y el `embedding` queda NULL, que es
exactamente lo que el backfill (`EmbedCanonicalProducts`) busca. Nada de esto puede bloquear al
operador.
"""
from __future__ import annotations

from decimal import Decimal

from src.contexts.save.application.canonical_catalog import (
    CreateCanonicalProduct,
    UpdateCanonicalProduct,
)


class _FakeCanonicalRepo:
    def __init__(self, *, update_finds: bool = True) -> None:
        self.added: list[object] = []
        self.updated: list[tuple[str, dict]] = []
        self._update_finds = update_finds

    def add(self, product) -> None:  # type: ignore[no-untyped-def]
        self.added.append(product)

    def update_attributes(self, canonical_product_id: str, **kwargs):  # type: ignore[no-untyped-def]
        self.updated.append((canonical_product_id, kwargs))
        return object() if self._update_finds else None


class _FakeCatalogRepo:
    def get_catalog_row(self, *, market_id: str, canonical_product_id: str):  # type: ignore[no-untyped-def]
        return object()


class _SpyEmbedder:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def execute(self, canonical_product_id: str) -> bool:
        self.calls.append(canonical_product_id)
        return True


class TestCreateCanonicalProduct:
    def test_the_new_canonical_is_embedded_right_away(self) -> None:
        repo, embedder = _FakeCanonicalRepo(), _SpyEmbedder()
        use_case = CreateCanonicalProduct(repo, _FakeCatalogRepo(), embedder=embedder)

        use_case.execute(
            market_id="DO", name="Arroz Selecto", size_amount=Decimal("5"), size_measure="mass"
        )

        assert embedder.calls == [repo.added[0].id]  # type: ignore[attr-defined]

    def test_without_an_embedder_it_still_creates(self) -> None:
        repo = _FakeCanonicalRepo()
        use_case = CreateCanonicalProduct(repo, _FakeCatalogRepo())

        use_case.execute(
            market_id="DO", name="Arroz Selecto", size_amount=Decimal("5"), size_measure="mass"
        )

        assert len(repo.added) == 1


class TestUpdateCanonicalProduct:
    def test_an_edit_re_embeds_the_canonical(self) -> None:
        # El repo ya dejó el embedding en NULL si el texto cambió; esto cierra la ventana en el acto
        # en vez de esperar al backfill.
        repo, embedder = _FakeCanonicalRepo(), _SpyEmbedder()
        use_case = UpdateCanonicalProduct(repo, _FakeCatalogRepo(), embedder=embedder)

        use_case.execute(market_id="DO", canonical_product_id="c-1", name="Arroz Nuevo")

        assert embedder.calls == ["c-1"]

    def test_a_canonical_that_does_not_exist_is_never_embedded(self) -> None:
        repo, embedder = _FakeCanonicalRepo(update_finds=False), _SpyEmbedder()
        use_case = UpdateCanonicalProduct(repo, _FakeCatalogRepo(), embedder=embedder)

        assert use_case.execute(market_id="DO", canonical_product_id="fantasma") is None
        assert embedder.calls == []

    def test_without_an_embedder_it_still_updates(self) -> None:
        repo = _FakeCanonicalRepo()
        use_case = UpdateCanonicalProduct(repo, _FakeCatalogRepo())

        use_case.execute(market_id="DO", canonical_product_id="c-1", name="Arroz Nuevo")

        assert repo.updated[0][0] == "c-1"
