"""Circuit-breaker para los jueces LLM (matching + clasificación) — PURO, sin red ni estado global.

Problema: si el LLM está caído o sin cuota (429), cada producto en banda gris llama la API, come el
error, reintenta con backoff y recién degrada → un retry-storm que arrastra la ingesta. El breaker
lo corta: tras N fallos SEGUIDOS "abre" y el juez deja de llamar la API por el resto del batch
(devuelve 'uncertain' directo, sin round-trip). Un éxito lo cierra de nuevo.

Vive por-juez y por-batch (el juez se construye una vez por corrida de ingesta), así el estado se
acumula durante el batch y se descarta al terminar — sin estado global ni compartido entre procesos.
"""
from __future__ import annotations


class LlmCircuitBreaker:
    def __init__(self, threshold: int = 3) -> None:
        """`threshold` = fallos SEGUIDOS que abren el breaker (default 3: tolera un par de baches
        transitorios pero corta rápido ante un LLM realmente caído)."""
        self._threshold = threshold
        self._consecutive_failures = 0

    @property
    def is_open(self) -> bool:
        """`True` = el LLM viene fallando; el juez debe degradar SIN llamar la API."""
        return self._consecutive_failures >= self._threshold

    def record_failure(self) -> None:
        self._consecutive_failures += 1

    def record_success(self) -> None:
        self._consecutive_failures = 0
