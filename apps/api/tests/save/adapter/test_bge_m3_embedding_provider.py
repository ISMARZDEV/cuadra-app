"""Adapter — `BgeM3EmbeddingProvider` (F2.0). Cliente de inferencia BGE-M3 mockeado: sin red,
sin carga de modelo real. Solo se prueba el wiring del adapter (Protocol `EmbeddingProvider`).
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.embeddings import BgeM3EmbeddingProvider

_DIM = 1024


def _fake_vector(seed: int) -> list[float]:
    return [float(seed)] * _DIM


def test_embed_returns_one_vector_per_input_text() -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_embed_fn(endpoint_url: str, texts: list[str]) -> list[list[float]]:
        calls.append((endpoint_url, texts))
        return [_fake_vector(i) for i in range(len(texts))]

    provider = BgeM3EmbeddingProvider(
        endpoint_url="http://bge-m3-tei.internal:8080",
        embed_fn=fake_embed_fn,
    )

    vectors = provider.embed(["Coca Cola 2L", "Arroz Selecto 5lb"])

    assert len(vectors) == 2
    assert all(len(vector) == _DIM for vector in vectors)


def test_embed_calls_underlying_client_with_endpoint_and_texts() -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_embed_fn(endpoint_url: str, texts: list[str]) -> list[list[float]]:
        calls.append((endpoint_url, texts))
        return [_fake_vector(0) for _ in texts]

    provider = BgeM3EmbeddingProvider(
        endpoint_url="http://bge-m3-tei.internal:8080",
        embed_fn=fake_embed_fn,
    )

    provider.embed(["Leche Entera 1L"])

    assert calls == [("http://bge-m3-tei.internal:8080", ["Leche Entera 1L"])]


def test_embed_strips_trailing_slash_from_endpoint_url() -> None:
    calls: list[tuple[str, list[str]]] = []

    def fake_embed_fn(endpoint_url: str, texts: list[str]) -> list[list[float]]:
        calls.append((endpoint_url, texts))
        return [_fake_vector(0) for _ in texts]

    provider = BgeM3EmbeddingProvider(
        endpoint_url="http://bge-m3-tei.internal:8080/",
        embed_fn=fake_embed_fn,
    )

    provider.embed(["x"])

    assert calls[0][0] == "http://bge-m3-tei.internal:8080"


def test_embed_with_empty_list_returns_empty_list_without_calling_client() -> None:
    called = False

    def fake_embed_fn(endpoint_url: str, texts: list[str]) -> list[list[float]]:
        nonlocal called
        called = True
        return []

    provider = BgeM3EmbeddingProvider(
        endpoint_url="http://bge-m3-tei.internal:8080",
        embed_fn=fake_embed_fn,
    )

    vectors = provider.embed([])

    assert vectors == []
    assert called is False


def test_embed_preserves_input_order() -> None:
    def fake_embed_fn(endpoint_url: str, texts: list[str]) -> list[list[float]]:
        return [[float(len(t))] * _DIM for t in texts]

    provider = BgeM3EmbeddingProvider(
        endpoint_url="http://bge-m3-tei.internal:8080",
        embed_fn=fake_embed_fn,
    )

    vectors = provider.embed(["a", "bb", "ccc"])

    assert [v[0] for v in vectors] == [1.0, 2.0, 3.0]
