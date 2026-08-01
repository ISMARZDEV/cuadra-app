"""Unit — `EmbedCanonicalProduct` (SINGULAR): embebe UN canónico recién escrito, en el acto.

Complementa al backfill `EmbedCanonicalProducts` (plural), que sigue siendo la red de seguridad:
el invariante del repo deja el `embedding` en NULL cada vez que cambia el texto que se embebe, así
que todo lo que este use case no alcance a hacer lo levanta la próxima corrida de ingesta.

Por eso es FAIL-SAFE: un canónico creado desde la cola no puede quedar sin crearse porque el
servicio de embeddings esté caído. Peor caso = vector ausente (producto invisible para la etapa
semántica hasta el backfill), nunca una resolución de cola bloqueada.
"""
from __future__ import annotations

from src.contexts.save.application.embed_canonical_product import EmbedCanonicalProduct
from src.contexts.save.domain.entities import CanonicalProduct
from src.contexts.save.domain.value_objects import parse_size


def _canonical(cid: str = "c-1", name: str = "Arroz Selecto", brand: str = "Wala") -> CanonicalProduct:
    return CanonicalProduct(
        cid, name, brand, parse_size("5 LB"),
        taxonomy_node_id="00000000-0000-4000-8000-000000000001",
        market_id="DO", display_size="5 LB",
    )


class _FakeRepo:
    def __init__(self, products: dict[str, CanonicalProduct]) -> None:
        self._products = products
        self.embeddings: dict[str, list[float]] = {}

    def get_by_id(self, product_id: str) -> CanonicalProduct | None:
        return self._products.get(product_id)

    def set_embedding(self, product_id: str, embedding: list[float]) -> None:
        self.embeddings[product_id] = embedding


class _FakeEmbedder:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [[1.0, 2.0, 3.0] for _ in texts]


class _ExplodingEmbedder:
    def embed(self, texts: list[str]) -> list[list[float]]:
        raise RuntimeError("BGE-M3 endpoint caído")


def test_embeds_with_the_shared_text_recipe() -> None:
    repo = _FakeRepo({"c-1": _canonical()})
    embedder = _FakeEmbedder()

    assert EmbedCanonicalProduct(repo, embedder).execute("c-1") is True

    # MISMA receta que el lado query y que el backfill, o los vectores no serían comparables.
    assert embedder.calls == [["Arroz Selecto Wala 5 LB"]]
    assert repo.embeddings == {"c-1": [1.0, 2.0, 3.0]}


def test_a_failing_embedder_never_propagates() -> None:
    # La regla: ninguna caída del servicio de embeddings puede tumbar la escritura del canónico.
    repo = _FakeRepo({"c-1": _canonical()})

    assert EmbedCanonicalProduct(repo, _ExplodingEmbedder()).execute("c-1") is False

    assert repo.embeddings == {}  # queda NULL → lo levanta el backfill


def test_unknown_canonical_does_not_call_the_model() -> None:
    repo = _FakeRepo({})
    embedder = _FakeEmbedder()

    assert EmbedCanonicalProduct(repo, embedder).execute("no-existe") is False

    assert embedder.calls == []
