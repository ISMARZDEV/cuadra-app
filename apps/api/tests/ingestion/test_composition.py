"""Unit — composition root de la ingesta (ingestion.save.composition): selección del
`EmbeddingProvider`. Sin red, sin DB, sin LLM real (el juez se neutraliza).

Invariante crítico (cuadra-save-matching, gotcha #5 — one embedding model per index): el matcher
y el backfill de canónicos DEBEN embeber con el MISMO provider. Si el índice se escribe con un
provider y la query se hace con otro, viven en espacios vectoriales distintos y la etapa semántica
queda inerte/corrupta. Sin `SAVE_BGE_M3_ENDPOINT_URL` ambos caen a BGE-M3 in-process; con la URL
seteada, ambos usan el endpoint HTTP. Los dos providers usan el MISMO modelo (`BAAI/bge-m3`).
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from ingestion.save import composition
from src.config import settings
from src.contexts.save.infrastructure.matching.embeddings import (
    BgeM3EmbeddingProvider,
    SentenceTransformersEmbeddingProvider,
)


@pytest.fixture
def _cascade_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "save_matching_cascade_enabled", True)
    # Construir un LlmJudge real armaría un cliente LLM (get_chat_model): fuera del scope de
    # este test de wiring — lo reemplazamos por un stub.
    monkeypatch.setattr(composition, "LlmJudge", lambda: MagicMock())


def test_embedding_provider_falls_back_to_in_process_without_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "")
    assert isinstance(
        composition.build_embedding_provider(), SentenceTransformersEmbeddingProvider
    )


def test_embedding_provider_uses_http_endpoint_when_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "http://bge:8080")
    assert isinstance(composition.build_embedding_provider(), BgeM3EmbeddingProvider)


def test_matcher_and_canonical_embedder_share_provider_in_process(
    _cascade_enabled: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    # in-process (sin endpoint): matcher e índice DEBEN usar el mismo provider → vectores comparables
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "")
    session = MagicMock()

    matcher = composition.build_matcher(session)
    embedder = composition.build_canonical_embedder(session)

    assert matcher is not None and embedder is not None
    assert type(matcher._embedder) is type(embedder._embedder)
    assert isinstance(matcher._embedder, SentenceTransformersEmbeddingProvider)


def test_matcher_uses_http_provider_when_endpoint_set(
    _cascade_enabled: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "save_bge_m3_endpoint_url", "http://bge:8080")

    matcher = composition.build_matcher(MagicMock())

    assert matcher is not None
    assert isinstance(matcher._embedder, BgeM3EmbeddingProvider)
