"""`BgeM3EmbeddingProvider`: impl del puerto `EmbeddingProvider` (F2.0 matching cascade).

Envuelve un cliente de inferencia BGE-M3 auto-hosteado (HF Text Embeddings Inference u otro
wrapper equivalente sobre sentence-transformers) expuesto como un endpoint HTTP `/embed`. El
cliente/endpoint se inyecta por constructor (`embed_fn`, igual patrón que `VtexAdapter.http_get`)
para poder testear el wiring del adapter sin red y sin cargar el modelo real. Se invoca de forma
SÍNCRONA, únicamente en el momento de escritura de la ingesta (etapa semántica de la cascada de
matching), nunca en el camino de lectura.

IMPORTANTE — el modelo de embeddings está FIJO para este despliegue: los vectores de un modelo
distinto NO son comparables entre sí (viven en un espacio vectorial distinto). Cambiar de modelo
significa: (1) una nueva implementación de `EmbeddingProvider` (este mismo puerto, otro adapter),
y (2) una migración de backfill que re-embeda TODO `save.canonical_product.embedding` y reconstruya
el índice HNSW — nunca un flip de configuración/env var sobre este mismo adapter.
"""
from __future__ import annotations

from collections.abc import Callable

import httpx

_EMBED_TIMEOUT_SECONDS = 30.0


class BgeM3EmbeddingProvider:
    """Adapter de infraestructura sobre un endpoint BGE-M3 (HF TEI `/embed` o equivalente)."""

    def __init__(
        self,
        endpoint_url: str,
        embed_fn: Callable[[str, list[str]], list[list[float]]] | None = None,
    ) -> None:
        self._endpoint_url = endpoint_url.rstrip("/")
        self._embed_fn = embed_fn or self._default_embed

    @staticmethod
    def _default_embed(endpoint_url: str, texts: list[str]) -> list[list[float]]:
        resp = httpx.post(
            f"{endpoint_url}/embed",
            json={"inputs": texts},
            timeout=_EMBED_TIMEOUT_SECONDS,
        )
        resp.raise_for_status()
        return resp.json()

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return self._embed_fn(self._endpoint_url, texts)
