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

import logging
import threading
from collections.abc import Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_EMBED_TIMEOUT_SECONDS = 30.0

# El modelo es un recurso de PROCESO, no de instancia. BGE-M3 son 568M de parámetros: cargarlo dos
# veces en el mismo proceso nunca es correcto —son los mismos pesos y duplica la memoria—, y en el
# camino de lectura del agente es carísimo. Medido el 2026-08-02: la inferencia son **20 ms** y
# recargar el modelo **8 s**. 400x.
#
# La memoización vivía en `self._model`, o sea POR INSTANCIA, y `_resolve()` construye un embedder
# nuevo en cada tool call → no memoizaba nada. Cachear acá lo vuelve imposible de usar mal: ningún
# sitio de llamada puede pagar la carga dos veces, por descuidado que sea.
_MODEL_CACHE: dict[str, Any] = {}
_MODEL_LOCK = threading.Lock()


def _load_sentence_transformer(name: str) -> Any:
    from sentence_transformers import SentenceTransformer  # dep pesada, import perezoso

    return SentenceTransformer(name)


def _shared_model(name: str, loader: Callable[[str], Any]) -> Any:
    """El modelo cargado UNA vez por proceso. El lock evita que dos requests lo carguen a la vez."""
    with _MODEL_LOCK:
        if name not in _MODEL_CACHE:
            _MODEL_CACHE[name] = loader(name)
        return _MODEL_CACHE[name]


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


class SentenceTransformersEmbeddingProvider:
    """`EmbeddingProvider` BGE-M3 IN-PROCESS (sentence-transformers), sin endpoint HTTP.

    Para la ingesta batch (dev o despliegues chicos): el modelo corre en el mismo proceso, no en un
    servicio aparte. Es un patrón válido de producción para un pipeline batch (los embeddings se
    computan en la escritura de la ingesta, no en el path de request). Carga PEREZOSA del modelo y
    **compartida por proceso** (`_shared_model`) — la dep pesada (torch) vive solo en el dep-group
    de ingesta y solo se importa al usarse de verdad. La instancia es BARATA y descartable: crear
    diez no cuesta diez cargas. MISMO modelo (`BAAI/bge-m3`, 1024-dim) que el adapter HTTP → los
    vectores son comparables (regla de oro de embeddings).

    Dos costuras de test, y no son intercambiables: `encode_fn` reemplaza el encoding entero (no
    toca el modelo ni el caché); `model_loader` reemplaza SOLO la carga, y sirve para verificar que
    de verdad se carga una sola vez."""

    _MODEL_NAME = "BAAI/bge-m3"

    def __init__(
        self,
        encode_fn: Callable[[list[str]], list[list[float]]] | None = None,
        model_loader: Callable[[str], Any] | None = None,
    ) -> None:
        self._encode_fn = encode_fn
        self._model_loader = model_loader or _load_sentence_transformer

    def _encode(self, texts: list[str]) -> list[list[float]]:
        # El modelo NO se guarda en la instancia: vive en el caché de proceso (`_shared_model`).
        # Guardarlo acá es exactamente el defecto que costó 8s por tool call.
        model = _shared_model(self._MODEL_NAME, self._model_loader)
        return [v.tolist() for v in model.encode(texts, normalize_embeddings=True)]

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return (self._encode_fn or self._encode)(texts)


def build_api_embedder(
    *,
    endpoint_url: str,
    loader: Callable[[], Any] | None = None,
) -> Any | None:
    """Embedder utilizable desde la API, que NO lleva el grupo de dependencias `ingestion`.

    Existe porque, desde el admin, «Clasificar seleccionados» nunca llegaba al juez LLM. No era el
    flag: la cascada corta ANTES de la etapa vectorial cuando no hay embedder, y el juez vive
    DESPUÉS de ella (`_classify_by_name`). Sin embedder, inyectar el juez no cambia nada.

    Orden de preferencia, y por qué:
      1. **Endpoint HTTP** (`SAVE_BGE_M3_ENDPOINT_URL`) — el camino de PRODUCCIÓN. El modelo corre
         en un servicio aparte y la API sólo hace una request; nada pesado en su imagen.
      2. **Modelo in-process** — el camino de DEV, donde el grupo `ingestion` sí está instalado.
      3. **`None`** — comportamiento previo exacto: la cascada se queda con léxico + señal de
         origen y se abstiene en la banda gris. La regla sagrada intacta.

    El paso 2 usa un import PROTEGIDO y perezoso, y ahí está la seguridad: en producción el paquete
    no existe, salta `ImportError`, y la API sigue comportándose como antes en vez de reventar.
    Cargarlo al importar el módulo —que es lo que la composición evitaba— sí la habría tumbado al
    arrancar, con un fallo invisible en local porque acá el grupo está.
    """
    if endpoint_url:
        return BgeM3EmbeddingProvider(endpoint_url)

    def _default_loader() -> Any:
        return SentenceTransformersEmbeddingProvider()

    try:
        return (loader or _default_loader)()
    except Exception:  # noqa: BLE001 — cualquier fallo de carga degrada, nunca tumba la request
        logger.warning(
            "build_api_embedder: sin endpoint y sin modelo local — la clasificación desde el "
            "admin se queda con léxico + señal de origen (banda gris sin juez)",
            exc_info=True,
        )
        return None
