"""Unit — LlmCircuitBreaker. PURO, sin DB ni red.

Corta el retry-storm cuando el LLM está caído/sin cuota: tras N fallos SEGUIDOS el breaker "abre" y
los jueces dejan de llamar la API por el resto del batch (degradan directo). Un éxito lo resetea.
"""
from __future__ import annotations

from src.contexts.save.infrastructure.llm_circuit_breaker import LlmCircuitBreaker


def test_starts_closed() -> None:
    assert LlmCircuitBreaker(threshold=2).is_open is False


def test_opens_after_threshold_consecutive_failures() -> None:
    b = LlmCircuitBreaker(threshold=2)
    b.record_failure()
    assert b.is_open is False  # 1 < 2
    b.record_failure()
    assert b.is_open is True    # 2 >= 2 → abierto


def test_success_resets_the_counter() -> None:
    b = LlmCircuitBreaker(threshold=2)
    b.record_failure()
    b.record_success()          # resetea
    b.record_failure()
    assert b.is_open is False   # el conteo se reinició, va 1 de nuevo


def test_stays_open_once_tripped() -> None:
    b = LlmCircuitBreaker(threshold=1)
    b.record_failure()
    assert b.is_open is True
    b.record_failure()
    assert b.is_open is True
