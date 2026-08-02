"""Unit — el embedder que puede usar la API (sin el grupo `ingestion`). Sin red ni modelo real.

Por qué existe: desde el admin, «Clasificar seleccionados» no llegaba nunca al juez LLM. No era el
flag — era que la cascada corta ANTES:

    if self._embedder is None:
        return ClassificationResult(None, 0.0, "none", "grey")   # ← retorna acá
    ...
    if band == "grey":
        verdict = self._judge.judge(...)                          # ← el juez vive acá

O sea que el juez sólo se alcanza pasando por la etapa vectorial. Inyectarlo sin embedder no hace
nada.

El embedder in-process (`sentence-transformers`/BGE-M3) vive en el grupo de dependencias
`ingestion`, que la imagen de la API deliberadamente NO lleva. Por eso la fábrica prueba en orden:
endpoint HTTP → import protegido → None. El import protegido es lo que la vuelve segura en
producción: allá el paquete no está, salta `ImportError`, y la API se comporta igual que antes en
vez de reventar.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.matching.embeddings import build_api_embedder


def test_it_prefers_the_http_endpoint_when_configured() -> None:
    # El camino de PRODUCCIÓN: un servicio BGE-M3 aparte, sin cargar el modelo en la API.
    embedder = build_api_embedder(endpoint_url="http://bge:8080")

    assert embedder is not None
    assert type(embedder).__name__ == "BgeM3EmbeddingProvider"


def test_without_endpoint_it_falls_back_to_the_in_process_model() -> None:
    # El camino de DEV: el grupo `ingestion` sí está instalado, así que se puede embeber local.
    embedder = build_api_embedder(endpoint_url="", loader=lambda: "MODELO-FAKE")

    assert embedder == "MODELO-FAKE"


def test_a_missing_package_degrades_to_none_instead_of_crashing() -> None:
    """LA guarda de producción. Allá `sentence-transformers` NO está instalado.

    Sin esto, la API reventaría al clasificar — un fallo que en local no se ve porque el grupo sí
    está. Devolver `None` reproduce exactamente el comportamiento previo: la cascada se queda con
    léxico + señal de origen y se abstiene en la banda gris, que es lo que la regla sagrada manda.
    """

    def _no_instalado():  # type: ignore[no-untyped-def]
        raise ImportError("No module named 'sentence_transformers'")

    assert build_api_embedder(endpoint_url="", loader=_no_instalado) is None


def test_any_loader_failure_also_degrades_to_none() -> None:
    # No sólo el ImportError: cargar un modelo puede fallar por memoria o por un peso corrupto, y
    # ninguna de esas cosas debería tumbar una request del admin.
    def _revienta():  # type: ignore[no-untyped-def]
        raise RuntimeError("sin memoria")

    assert build_api_embedder(endpoint_url="", loader=_revienta) is None
