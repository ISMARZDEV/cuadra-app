"""Unit — GenerateCategoryTerms (save-category-classification). Fakes, sin DB, sin LLM real.

Backfill offline de `taxonomy_node.classification_terms`: para cada hoja SIN términos, pide al
generador (LLM) los descriptores del dominio y los persiste. `set_terms` DEBE invalidar el embedding
(el input del vector cambió) para que EmbedCategories la re-embeba con la receta nueva. Idempotente.
"""
from __future__ import annotations

from src.contexts.save.application.generate_category_terms import GenerateCategoryTerms


class _FakeIndexRepo:
    def __init__(self, leaves: list[tuple[str, str, str | None]]) -> None:
        self._leaves = list(leaves)
        self.terms: dict[str, str] = {}
        self.embedding_cleared: list[str] = []

    def leaves_without_terms(
        self, market_id: str, limit: int
    ) -> list[tuple[str, str, str | None]]:
        pending = [lf for lf in self._leaves if lf[0] not in self.terms]
        return pending[:limit]

    def set_terms(self, node_id: str, terms: str) -> None:
        self.terms[node_id] = terms
        self.embedding_cleared.append(node_id)  # invalida el vector (re-embed)


class _FakeGenerator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []

    def generate(self, leaf_name: str, parent_name: str | None) -> str:
        self.calls.append((leaf_name, parent_name))
        return f"ejemplos de {leaf_name.lower()}"


def test_generates_and_persists_terms_for_all_leaves() -> None:
    repo = _FakeIndexRepo([
        ("n1", "Arroz, Granos & Legumbres", "Despensa & Abarrotes"),
        ("n2", "Agua", "Bebidas"),
    ])
    gen = _FakeGenerator()
    count = GenerateCategoryTerms(repo, gen).execute("DO", batch_size=10)

    assert count == 2
    assert repo.terms == {
        "n1": "ejemplos de arroz, granos & legumbres",
        "n2": "ejemplos de agua",
    }
    assert ("Agua", "Bebidas") in gen.calls


def test_set_terms_invalidates_embedding_for_reembed() -> None:
    repo = _FakeIndexRepo([("n1", "Agua", "Bebidas")])
    GenerateCategoryTerms(repo, _FakeGenerator()).execute("DO", batch_size=10)
    assert repo.embedding_cleared == ["n1"]  # el vector viejo se invalidó


def test_idempotent_second_run_generates_zero() -> None:
    repo = _FakeIndexRepo([("n1", "Agua", "Bebidas")])
    gen = _FakeGenerator()
    GenerateCategoryTerms(repo, gen).execute("DO", batch_size=10)
    count2 = GenerateCategoryTerms(repo, gen).execute("DO", batch_size=10)
    assert count2 == 0
    assert len(gen.calls) == 1  # no re-generó


def test_blank_generation_is_skipped_not_persisted() -> None:
    """Si el generador no produce nada útil (LLM degradado), NO se persiste basura: la hoja queda
    sin términos y se reintenta en otra corrida (no inventa descriptores vacíos)."""
    class _BlankGen:
        def generate(self, leaf_name: str, parent_name: str | None) -> str:
            return "   "

    repo = _FakeIndexRepo([("n1", "Agua", "Bebidas")])
    count = GenerateCategoryTerms(repo, _BlankGen()).execute("DO", batch_size=10)
    assert count == 0
    assert repo.terms == {}
