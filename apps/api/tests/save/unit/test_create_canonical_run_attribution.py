"""Unit — a qué corrida se le atribuye un canónico nuevo (F4 #4.5).

`new_canonicals_count` responde "¿cuántos canónicos salieron de lo que ESTA corrida descubrió?".
La corrida no crea canónicos (ver #4.3): los crea un HUMANO resolviendo la cola. El hilo que une
las dos cosas es el `run_id` del match que el humano resolvió.
"""
from __future__ import annotations

from src.contexts.save.application.create_canonical_and_link import (
    CreateCanonicalAndLink,
    NewCanonicalProduct,
)
from src.contexts.save.domain.entities import CanonicalProduct
from src.contexts.save.domain.entities.product_match import ProductMatch
from src.contexts.save.domain.value_objects import Quantity


class FakeCanonicalRepo:
    def __init__(self) -> None:
        self.added: list[CanonicalProduct] = []

    def add(self, product: CanonicalProduct) -> None:
        self.added.append(product)


class FakeMatchRepo:
    def __init__(self, match: ProductMatch | None) -> None:
        self._match = match

    def get_by_id(self, match_id: str) -> ProductMatch | None:
        return self._match


class FakeResolver:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def execute(self, *, match_id: str, canonical_product_id: str, decided_by: str) -> None:
        self.calls.append(
            {"match_id": match_id, "canonical_product_id": canonical_product_id,
             "decided_by": decided_by}
        )


def _new_product() -> NewCanonicalProduct:
    return NewCanonicalProduct(
        name="Arroz Integral Goya 2 Lb",
        brand="GOYA",
        quantity=Quantity(2.0, "LB"),
        taxonomy_node_id="tax-1",
        market_id="DO",
    )


def _use_case(match: ProductMatch | None):  # type: ignore[no-untyped-def]
    canonical_repo = FakeCanonicalRepo()
    use_case = CreateCanonicalAndLink(
        canonical_repo=canonical_repo,
        resolver=FakeResolver(),
        match_repo=FakeMatchRepo(match),
    )
    return use_case, canonical_repo


def _match(run_id: str | None) -> ProductMatch:
    return ProductMatch(
        store_product_id="sp-1",
        canonical_product_id=None,
        confidence=0.0,
        method="human",
        status="pending_review",
        run_id=run_id,
    )


def test_the_canonical_is_attributed_to_the_run_that_queued_the_match() -> None:
    use_case, repo = _use_case(_match(run_id="run-x"))

    use_case.execute(match_id="m-1", product=_new_product(), decided_by="u-9")

    assert repo.added[0].origin_run_id == "run-x"


def test_a_canonical_from_a_match_without_a_run_has_no_attribution() -> None:
    """Filas anteriores a F4, o un match creado a mano. `None` es honesto: no sabemos de qué
    corrida vino, y inventarle una la contaría en un total que no le corresponde."""
    use_case, repo = _use_case(_match(run_id=None))

    use_case.execute(match_id="m-1", product=_new_product(), decided_by="u-9")

    assert repo.added[0].origin_run_id is None


def test_a_missing_match_does_not_block_creating_the_canonical() -> None:
    """El dueño de la frontera transaccional es `ResolveReview`; si el match no existe, es ÉL quien
    debe fallar con su propio error. La atribución es un dato accesorio: no puede ser lo que
    reviente el flujo, ni inventar una corrida."""
    use_case, repo = _use_case(None)

    use_case.execute(match_id="m-1", product=_new_product(), decided_by="u-9")

    assert repo.added[0].origin_run_id is None
