"""Unit — `SentenceTransformersEmbeddingProvider`: BGE-M3 in-process (sin endpoint HTTP).

El `encode_fn` se inyecta para testear el wiring del adapter SIN cargar torch/el modelo real (mismo
patrón que `BgeM3EmbeddingProvider.embed_fn`). Carga perezosa del modelo: importar este módulo NO
debe requerir sentence-transformers instalado.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.embeddings import (
    SentenceTransformersEmbeddingProvider,
)


def test_embed_delegates_to_injected_encode_fn() -> None:
    calls: list[list[str]] = []

    def fake_encode(texts: list[str]) -> list[list[float]]:
        calls.append(list(texts))
        return [[0.1, 0.2, 0.3] for _ in texts]

    provider = SentenceTransformersEmbeddingProvider(encode_fn=fake_encode)
    vectors = provider.embed(["Arroz Wala 5 LB", "Leche Rica 1 L"])

    assert calls == [["Arroz Wala 5 LB", "Leche Rica 1 L"]]
    assert vectors == [[0.1, 0.2, 0.3], [0.1, 0.2, 0.3]]


def test_embed_empty_returns_empty_without_touching_model() -> None:
    def boom(texts: list[str]) -> list[list[float]]:
        raise AssertionError("no debe llamar al modelo con lista vacía")

    provider = SentenceTransformersEmbeddingProvider(encode_fn=boom)
    assert provider.embed([]) == []
