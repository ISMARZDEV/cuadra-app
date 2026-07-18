"""Unit — EmbedCategories backfill (save-category-classification, Batch 5). Fakes, sin DB.

Mirror de test_embed_canonical_products: recorre las hojas sin embedding, las embeddea con la
receta compartida y las persiste, batched, hasta vaciar.
"""
from __future__ import annotations

from src.contexts.save.application.embed_categories import EmbedCategories


class _FakeIndexRepo:
    def __init__(self, leaves: list[tuple[str, str, str | None, str | None]]) -> None:
        self._leaves = list(leaves)
        self.embeddings: dict[str, list[float]] = {}

    def leaves_without_embedding(
        self, market_id: str, limit: int
    ) -> list[tuple[str, str, str | None, str | None]]:
        pending = [lf for lf in self._leaves if lf[0] not in self.embeddings]
        return pending[:limit]

    def set_embedding(self, node_id: str, embedding: list[float]) -> None:
        self.embeddings[node_id] = embedding


class _FakeEmbedder:
    def __init__(self) -> None:
        self.seen_texts: list[str] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.seen_texts.extend(texts)
        return [[float(len(t))] * 4 for t in texts]


def test_embeds_all_leaves_using_recipe() -> None:
    repo = _FakeIndexRepo([
        ("n1", "Arroz, Granos & Legumbres", "Despensa & Abarrotes", None),
        ("n2", "Frutas", "Frutas & Verduras", None),
    ])
    embedder = _FakeEmbedder()
    count = EmbedCategories(repo, embedder).execute("DO", batch_size=10)

    assert count == 2
    assert set(repo.embeddings) == {"n1", "n2"}
    # sin términos → receta fallback parent+name (contexto)
    assert "Despensa & Abarrotes Arroz, Granos & Legumbres" in embedder.seen_texts


def test_uses_descriptive_terms_when_leaf_has_them() -> None:
    repo = _FakeIndexRepo([
        ("n1", "Arroz, Granos & Legumbres", "Despensa & Abarrotes", "arroz, habichuelas, guandules"),
    ])
    embedder = _FakeEmbedder()
    EmbedCategories(repo, embedder).execute("DO", batch_size=10)

    assert (
        "Despensa & Abarrotes > Arroz, Granos & Legumbres. Ejemplos: arroz, habichuelas, guandules"
        in embedder.seen_texts
    )


def test_idempotent_second_run_embeds_zero() -> None:
    repo = _FakeIndexRepo([("n1", "Frutas", "Frutas & Verduras", None)])
    embedder = _FakeEmbedder()
    EmbedCategories(repo, embedder).execute("DO", batch_size=10)
    count2 = EmbedCategories(repo, embedder).execute("DO", batch_size=10)
    assert count2 == 0
