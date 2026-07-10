"""Unit — ClassifyBackfill (save-category-classification, Batch 8). Fakes, sin DB.

Snapshot-then-classify (lee TODO lo sin clasificar antes de mutar → evita el loop infinito de los
productos que quedan sin resolver). Idempotente: una 2ª corrida procesa solo lo que sigue sin
clasificar.
"""
from __future__ import annotations

from src.contexts.save.application.classify_backfill import ClassifyBackfill
from src.contexts.save.domain.classification import ClassifiableProduct, ClassificationResult


class _FakeRepo:
    def __init__(self, unclassified_ids: list[str]) -> None:
        self._ids = list(unclassified_ids)
        self.classified: set[str] = set()

    def list_unclassified(self, market_id, *, is_canonical, limit, offset=0):  # type: ignore[no-untyped-def]
        remaining = [i for i in self._ids if i not in self.classified]
        page = remaining[offset : offset + limit]
        return [ClassifiableProduct(ref_id=i, is_canonical=is_canonical, name=f"p-{i}") for i in page]


class _FakeClassifier:
    def __init__(self, repo: _FakeRepo, resolve: bool = True) -> None:
        self._repo = repo
        self._resolve = resolve
        self.calls: list[str] = []

    def execute(self, product, market_id):  # type: ignore[no-untyped-def]
        self.calls.append(product.ref_id)
        if self._resolve:
            self._repo.classified.add(product.ref_id)  # queda clasificado
        node = "leaf-1" if self._resolve else None
        return ClassificationResult(node, 0.9 if self._resolve else 0.0, "hybrid", "auto_link")


def test_processes_all_unclassified_once() -> None:
    repo = _FakeRepo(["a", "b", "c"])
    classifier = _FakeClassifier(repo)
    count = ClassifyBackfill(repo, classifier).execute("DO", is_canonical=False, batch_size=2)
    assert count == 3
    assert sorted(classifier.calls) == ["a", "b", "c"]


def test_second_run_processes_zero() -> None:
    repo = _FakeRepo(["a", "b"])
    classifier = _FakeClassifier(repo)
    ClassifyBackfill(repo, classifier).execute("DO", is_canonical=False, batch_size=10)
    count2 = ClassifyBackfill(repo, classifier).execute("DO", is_canonical=False, batch_size=10)
    assert count2 == 0


def test_unresolved_products_do_not_loop_forever() -> None:
    # el clasificador NUNCA resuelve → los productos siguen sin clasificar, pero el backfill
    # los procesa UNA vez cada uno y termina (no bucle infinito)
    repo = _FakeRepo(["a", "b", "c"])
    classifier = _FakeClassifier(repo, resolve=False)
    count = ClassifyBackfill(repo, classifier).execute("DO", is_canonical=False, batch_size=2)
    assert count == 3
    assert classifier.calls == ["a", "b", "c"]
