"""Corrida de pipeline vista por la OFV — PURO (ADR 31).

Este módulo traduce el vocabulario del RUNNER al vocabulario del OPERADOR. La traducción vive en el
dominio, no en el adapter, porque no es un detalle de transporte: define qué ve el operador y qué
acciones le habilitamos. Si viviera en el adapter, cambiar de runner cambiaría la semántica de la
consola.

Sobre el runner concreto: Dagster expone NUEVE estados (introspectados de `dagster-graphql` 1.13.12
— la documentación pública NO es confiable acá, ya se detectó desactualizada). El spec original
asumía cinco; `QUEUED` y `STARTING` se le escapaban, y sin ellos una corrida encolada se ve como
"no pasó nada".

Y algo que condiciona el diseño: **Dagster declara su API GraphQL INESTABLE** ("still evolving and
subject to breaking changes"). Por eso un estado desconocido DEGRADA a `UNKNOWN` en vez de reventar:
un upgrade del runner no puede tumbar la consola.
"""
from __future__ import annotations

from enum import StrEnum


class RunState(StrEnum):
    """Estado operativo de una corrida. `UNKNOWN` es un estado de primera clase, no un error: es la
    respuesta honesta cuando el runner dice algo que no sabemos interpretar."""

    QUEUED = "queued"
    RUNNING = "running"
    CANCELING = "canceling"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    UNKNOWN = "unknown"

    @property
    def is_terminal(self) -> bool:
        """¿Terminó? `CANCELING` NO es terminal: la cancelación está en curso y el desenlace todavía
        puede ser `CANCELED` o `FAILED`."""
        return self in _TERMINAL

    @property
    def is_cancellable(self) -> bool:
        """Solo lo que está en vuelo. `CANCELING` ya se está cancelando — volver a ofrecer
        "Cancelar" es un botón que no hace nada, y eso erosiona la confianza en la consola."""
        return self in {RunState.QUEUED, RunState.RUNNING}

    @property
    def is_retryable(self) -> bool:
        """Reintentar una corrida EXITOSA no es un retry: es una corrida nueva, y tiene su propio
        botón. Confundirlos duplicaría trabajo sin que el operador lo pidiera."""
        return self in {RunState.FAILED, RunState.CANCELED}


_TERMINAL: frozenset[RunState] = frozenset(
    {RunState.SUCCEEDED, RunState.FAILED, RunState.CANCELED}
)

# Dagster `RunStatus` → nuestro vocabulario. Mantener alineado con el enum del runner; el test
# parametrizado cubre los 9 valores de la 1.13.12.
_RUNNER_STATES: dict[str, RunState] = {
    "QUEUED": RunState.QUEUED,
    "NOT_STARTED": RunState.QUEUED,   # aceptada, todavía sin worker
    "STARTING": RunState.RUNNING,     # el worker arrancó: para el operador YA está corriendo
    "STARTED": RunState.RUNNING,
    "SUCCESS": RunState.SUCCEEDED,
    "FAILURE": RunState.FAILED,
    "CANCELING": RunState.CANCELING,
    "CANCELED": RunState.CANCELED,
    # `MANAGED` = corrida gobernada por un sistema externo. Mapearla a `running` sería ADIVINAR:
    # la consola afirmaría que algo está corriendo sin saberlo. Se declara desconocida.
    "MANAGED": RunState.UNKNOWN,
}


def run_state_from_runner(runner_status: str) -> RunState:
    """Traduce el estado crudo del runner. Desconocido → `UNKNOWN`, nunca excepción."""
    return _RUNNER_STATES.get(runner_status.strip().upper(), RunState.UNKNOWN)
