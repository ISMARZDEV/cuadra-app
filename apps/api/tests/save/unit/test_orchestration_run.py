"""Unit — traducción del estado de una corrida del runner al vocabulario operativo (F4 #4.4).

Dagster expone NUEVE estados (introspectados de `dagster-graphql` 1.13.12, no de la doc:
`QUEUED, NOT_STARTED, STARTING, STARTED, SUCCESS, FAILURE, CANCELING, CANCELED, MANAGED`).
El SDD asumía cinco y se le escapaban `QUEUED`/`STARTING` — sin mapearlos, una corrida encolada o
arrancando se vería como "no pasó nada" en la consola.

El mapeo vive en el DOMINIO (no en el adapter) porque es vocabulario de negocio: qué significa
para el OPERADOR el estado de una corrida, y qué acciones habilita.
"""
from __future__ import annotations

import pytest

from src.contexts.save.domain.entities.orchestration_run import RunState, run_state_from_runner


class TestRunnerStateTranslation:
    @pytest.mark.parametrize(
        ("runner_status", "expected"),
        [
            ("QUEUED", RunState.QUEUED),
            ("NOT_STARTED", RunState.QUEUED),
            ("STARTING", RunState.RUNNING),
            ("STARTED", RunState.RUNNING),
            ("SUCCESS", RunState.SUCCEEDED),
            ("FAILURE", RunState.FAILED),
            ("CANCELING", RunState.CANCELING),
            ("CANCELED", RunState.CANCELED),
        ],
    )
    def test_maps_every_known_runner_status(self, runner_status: str, expected: RunState) -> None:
        assert run_state_from_runner(runner_status) == expected

    def test_managed_is_reported_as_unknown_not_guessed_into_running(self) -> None:
        """`MANAGED` = corrida gobernada por un sistema externo. Mapearla a `running` sería
        adivinar: la consola diría que algo está corriendo sin saberlo. Estado honesto."""
        assert run_state_from_runner("MANAGED") == RunState.UNKNOWN

    def test_an_unrecognised_status_degrades_to_unknown_instead_of_exploding(self) -> None:
        """La API GraphQL de Dagster está declarada INESTABLE por Dagster ("subject to breaking
        changes"). Un estado nuevo en un upgrade no puede tumbar la consola entera."""
        assert run_state_from_runner("SOMETHING_NEW_IN_2027") == RunState.UNKNOWN


class TestOperationalAffordances:
    """Qué acciones habilita cada estado. US-OR-L7: `Cancelar` solo en corridas cancelables,
    `Reintentar` solo si la última es reintentable."""

    @pytest.mark.parametrize(
        "state", [RunState.SUCCEEDED, RunState.FAILED, RunState.CANCELED]
    )
    def test_terminal_states_are_terminal(self, state: RunState) -> None:
        assert state.is_terminal is True

    @pytest.mark.parametrize(
        "state", [RunState.QUEUED, RunState.RUNNING, RunState.CANCELING]
    )
    def test_active_states_are_not_terminal(self, state: RunState) -> None:
        assert state.is_terminal is False

    @pytest.mark.parametrize("state", [RunState.QUEUED, RunState.RUNNING])
    def test_only_queued_and_running_can_be_cancelled(self, state: RunState) -> None:
        assert state.is_cancellable is True

    @pytest.mark.parametrize(
        "state",
        [RunState.CANCELING, RunState.SUCCEEDED, RunState.FAILED, RunState.CANCELED],
    )
    def test_the_rest_cannot_be_cancelled(self, state: RunState) -> None:
        # CANCELING ya está cancelándose: ofrecer "Cancelar" de nuevo es un botón que no hace nada.
        assert state.is_cancellable is False

    @pytest.mark.parametrize("state", [RunState.FAILED, RunState.CANCELED])
    def test_failed_and_cancelled_runs_are_retryable(self, state: RunState) -> None:
        assert state.is_retryable is True

    @pytest.mark.parametrize(
        "state", [RunState.QUEUED, RunState.RUNNING, RunState.CANCELING, RunState.SUCCEEDED]
    )
    def test_running_and_successful_runs_are_not_retryable(self, state: RunState) -> None:
        # Reintentar una corrida exitosa no es un retry, es una corrida nueva — y tiene su propio
        # botón ("Ejecutar ahora"). Confundirlos duplicaría trabajo sin que el operador lo pida.
        assert state.is_retryable is False

    def test_unknown_enables_nothing(self) -> None:
        """Ante un estado que no entendemos, NO ofrecer acciones. Habilitar cancelar/reintentar
        sobre algo que no sabemos qué es, es peor que no ofrecer nada."""
        assert RunState.UNKNOWN.is_cancellable is False
        assert RunState.UNKNOWN.is_retryable is False
        assert RunState.UNKNOWN.is_terminal is False
