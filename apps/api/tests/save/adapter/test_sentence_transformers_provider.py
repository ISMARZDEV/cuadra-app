"""Unit — `SentenceTransformersEmbeddingProvider`: BGE-M3 in-process (sin endpoint HTTP).

El `encode_fn` se inyecta para testear el wiring del adapter SIN cargar torch/el modelo real (mismo
patrón que `BgeM3EmbeddingProvider.embed_fn`). Carga perezosa del modelo: importar este módulo NO
debe requerir sentence-transformers instalado.
"""
from __future__ import annotations

import pytest

from src.contexts.save.infrastructure.matching import embeddings as embeddings_module
from src.contexts.save.infrastructure.matching.embeddings import (
    SentenceTransformersEmbeddingProvider,
)


class _FakeVector:
    def tolist(self) -> list[float]:
        return [0.1, 0.2]


class _FakeModel:
    def encode(self, texts: list[str], normalize_embeddings: bool = False) -> list[_FakeVector]:
        return [_FakeVector() for _ in texts]


@pytest.fixture
def clean_model_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """El caché es de PROCESO: sin aislarlo, un test se comería la carga del siguiente."""
    monkeypatch.setattr(embeddings_module, "_MODEL_CACHE", {})


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


class TestElModeloEsUnRecursoDeProceso:
    """BGE-M3 son 568M de parámetros: cargarlo dos veces en un proceso NUNCA es correcto.

    Medido el 2026-08-02: la inferencia son **20 ms**; recargar el modelo son **8 s**. 400x. Como
    `_resolve()` construye un embedder nuevo en cada tool call, memoizar POR INSTANCIA no memoiza
    nada — el modelo se releía de disco en cada llamada y se comía el TTFT del agente entero.
    """

    def test_the_model_loads_ONCE_across_many_instances(self, clean_model_cache: None) -> None:
        loads: list[str] = []

        def counting_loader(name: str) -> _FakeModel:
            loads.append(name)
            return _FakeModel()

        for _ in range(3):
            SentenceTransformersEmbeddingProvider(model_loader=counting_loader).embed(["arroz"])

        assert loads == ["BAAI/bge-m3"], "cada instancia nueva volvió a cargar el modelo"

    def test_separate_instances_share_the_very_same_model_object(
        self, clean_model_cache: None
    ) -> None:
        # No basta con contar cargas: lo que prueba que es UN recurso es que sea EL MISMO objeto.
        loaded = [_FakeModel(), _FakeModel()]
        first = SentenceTransformersEmbeddingProvider(model_loader=lambda _: loaded.pop(0))
        second = SentenceTransformersEmbeddingProvider(model_loader=lambda _: loaded.pop(0))

        first.embed(["arroz"])
        second.embed(["aceite"])

        assert len(loaded) == 1, "la segunda instancia cargó su propio modelo"

    def test_an_injected_encode_fn_still_never_touches_the_model(
        self, clean_model_cache: None
    ) -> None:
        # La costura de test previa sigue mandando: `encode_fn` cortocircuita antes del caché.
        def boom(_: str) -> _FakeModel:
            raise AssertionError("no debe cargar el modelo cuando hay encode_fn")

        provider = SentenceTransformersEmbeddingProvider(
            encode_fn=lambda texts: [[0.5] for _ in texts], model_loader=boom
        )

        assert provider.embed(["arroz"]) == [[0.5]]
