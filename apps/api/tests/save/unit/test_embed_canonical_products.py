"""Unit — `EmbedCanonicalProducts`: backfill semántico. Embebe los canonical_product con embedding
NULL para que la etapa vectorial de la cascada (pgvector/BGE-M3) tenga contra qué matchear.

Sin este backfill la etapa vectorial es INERTE (siempre 0 candidatos): la cascada corre igual por
EAN+trgm+juez, pero pierde su blocking semántico. Se corre en la ingesta ANTES del matching. TDD
con repo + embedder falsos (sin red, sin modelo). Idempotente: una 2da corrida no re-embebe.
"""
from __future__ import annotations

from src.contexts.save.application.embed_canonical_products import EmbedCanonicalProducts
from src.contexts.save.domain.entities import CanonicalProduct
from src.contexts.save.domain.value_objects import parse_size


def _canonical(cid: str, name: str, brand: str, size: str) -> CanonicalProduct:
    return CanonicalProduct(
        cid, name, brand, parse_size(size),
        taxonomy_node_id="00000000-0000-4000-8000-000000000001",
        market_id="DO", display_size=size,
    )


class _FakeCanonicalRepo:
    """Guarda los canónicos + qué embeddings se escribieron; `list_without_embedding` excluye los ya escritos."""

    def __init__(self, products: list[CanonicalProduct]) -> None:
        self._products = products
        self.embeddings: dict[str, list[float]] = {}

    def list_without_embedding(self, market_id: str, limit: int = 500) -> list[CanonicalProduct]:
        pending = [
            c for c in self._products
            if c.market_id == market_id and c.id not in self.embeddings
        ]
        return pending[:limit]

    def set_embedding(self, product_id: str, embedding: list[float]) -> None:
        self.embeddings[product_id] = embedding


class _FakeEmbedder:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [[float(len(t))] * 4 for t in texts]


def test_embeds_all_pending_with_shared_text_recipe() -> None:
    repo = _FakeCanonicalRepo([
        _canonical("a", "Arroz Selecto", "Wala", "5 LB"),
        _canonical("b", "Leche Entera", "Rica", "1 L"),
    ])
    embedder = _FakeEmbedder()

    embedded = EmbedCanonicalProducts(repo, embedder).execute("DO")

    assert embedded == 2
    assert set(repo.embeddings) == {"a", "b"}
    # usa build_embedding_text (name brand display_size) — la MISMA receta que el lado store
    assert embedder.calls[0] == ["Arroz Selecto Wala 5 LB", "Leche Entera Rica 1 L"]


def test_is_idempotent_second_run_embeds_nothing() -> None:
    repo = _FakeCanonicalRepo([_canonical("a", "Azucar", "Bravo", "5 LB")])
    embedder = _FakeEmbedder()
    use_case = EmbedCanonicalProducts(repo, embedder)

    assert use_case.execute("DO") == 1
    assert use_case.execute("DO") == 0  # ya embebido → no re-embebe
    assert len(embedder.calls) == 1  # no vuelve a llamar al modelo


def test_only_embeds_requested_market() -> None:
    repo = _FakeCanonicalRepo([
        _canonical("do-1", "Arroz", "Wala", "5 LB"),
        CanonicalProduct(
            "us-1", "Rice", "Wala", parse_size("5 LB"),
            taxonomy_node_id="00000000-0000-4000-8000-000000000002",
            market_id="US", display_size="5 LB",
        ),
    ])

    embedded = EmbedCanonicalProducts(repo, _FakeEmbedder()).execute("DO")

    assert embedded == 1
    assert set(repo.embeddings) == {"do-1"}
