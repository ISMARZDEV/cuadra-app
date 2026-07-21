"""Unit — vocabulario de EVENTOS de corrida (US-OR-D7). Dominio puro, sin runner.

Lo que se afirma acá salió de INTROSPECTAR el schema instalado y de leer eventos REALES de un
Dagster corriendo (2026-07-20), no de la documentación. Los dos hechos que gobiernan el diseño:

1. La causa útil de un fallo NO es `error.message` — ese es un wrapper genérico de Dagster
   ("Error occurred while executing op X"). La causa real está al FONDO de `errorChain`.
2. Un `message` real midió 21.386 caracteres (el vector de embeddings entero embutido en el SQL de
   la excepción de SQLAlchemy). Sin recorte, un solo evento revienta el panel.
"""
from __future__ import annotations

from datetime import UTC, datetime

from src.contexts.save.domain.ports.orchestrator import (
    MAX_EVENT_MESSAGE_CHARS,
    RunEvent,
    RunEventKind,
    RunEventLevel,
    RunEventPage,
    RunFailure,
)


def _event(**over: object) -> RunEvent:
    base: dict[str, object] = {
        "timestamp": datetime(2026, 7, 20, 23, 1, tzinfo=UTC),
        "level": RunEventLevel.INFO,
        "kind": RunEventKind.STARTED,
        "message": "",
        "step_key": None,
        "failure": None,
    }
    return RunEvent(**{**base, **over})  # type: ignore[arg-type]


class TestRunFailureSummary:
    """La causa que el operador lee tiene que ser la RAÍZ, y tiene que caber en una línea."""

    def test_summary_uses_the_root_cause_not_the_dagster_wrapper(self) -> None:
        failure = RunFailure(
            class_name="DagsterExecutionStepExecutionError",
            message='dagster._core.errors.DagsterExecutionStepExecutionError: Error occurred '
            'while executing op "query_catalog_prices":\n',
            root_class_name="OperationalError",
            root_message="psycopg.OperationalError: consuming input failed: server closed the "
            "connection unexpectedly\n\tThis probably means the server terminated abnormally\n",
        )

        # El wrapper de Dagster no dice NADA operativo: nombra el op que ya sabemos y nada más.
        assert "server closed the connection unexpectedly" in failure.summary
        assert "Error occurred while executing op" not in failure.summary

    def test_summary_is_the_first_line_so_a_21k_char_message_cannot_flood_the_panel(self) -> None:
        # Reproduce el caso REAL: el vector de embeddings dentro del SQL de SQLAlchemy.
        huge = (
            "sqlalchemy.exc.OperationalError: (psycopg.OperationalError) consuming input failed\n"
            "[SQL: SELECT save.canonical_product.embedding <=> %(embedding_1)s]\n"
            "[parameters: {'embedding_1': '[" + "0.00771," * 4000 + "]'}]"
        )
        assert len(huge) > 20_000

        failure = RunFailure(
            class_name="OperationalError",
            message=huge,
            root_class_name="OperationalError",
            root_message=huge,
        )

        assert len(failure.summary) <= MAX_EVENT_MESSAGE_CHARS
        assert "consuming input failed" in failure.summary
        assert "embedding_1" not in failure.summary

    def test_summary_falls_back_to_the_wrapper_when_there_is_no_root(self) -> None:
        """Sin cadena de causas el wrapper es todo lo que hay — y decirlo es mejor que callar."""
        failure = RunFailure(
            class_name="DagsterError",
            message="dagster.DagsterError: el job no existe\n",
            root_class_name=None,
            root_message=None,
        )

        assert "el job no existe" in failure.summary


class TestOperatorRelevance:
    """24 de los 30 eventos de una corrida exitosa real son DEBUG: la maquinaria de Dagster.

    Volcarlos es duplicar la UI de Dagster peor de lo que Dagster ya la hace. Lo NUESTRO es
    destilar. Pero un fallo se muestra SIEMPRE, venga con el nivel que venga.
    """

    def test_machinery_debug_events_are_noise(self) -> None:
        assert _event(level=RunEventLevel.DEBUG, kind=RunEventKind.MACHINERY).is_noise is True

    def test_run_phase_events_are_never_noise_even_at_debug_level(self) -> None:
        # `RunStartEvent` llega en DEBUG y es justo lo que ancla la línea de tiempo.
        assert _event(level=RunEventLevel.DEBUG, kind=RunEventKind.STARTED).is_noise is False

    def test_a_failure_is_never_noise(self) -> None:
        assert _event(level=RunEventLevel.DEBUG, kind=RunEventKind.FAILURE).is_noise is False

    def test_user_logs_are_never_noise(self) -> None:
        """Los `context.log` de NUESTRO código de ingesta: los escribimos para ser leídos."""
        assert _event(level=RunEventLevel.INFO, kind=RunEventKind.LOG).is_noise is False

    def test_a_warning_from_the_machinery_is_still_worth_showing(self) -> None:
        assert _event(level=RunEventLevel.WARNING, kind=RunEventKind.MACHINERY).is_noise is False


class TestRunPhaseNaming:
    """El runner manda los hitos de la corrida con `message: ""` (verificado contra un Dagster
    real): el hecho ES el evento. Si el `kind` no los distingue, la línea de tiempo pinta cuatro
    filas mudas e idénticas — que fue exactamente el defecto que el dato real destapó."""

    def test_each_run_phase_has_its_own_kind_so_the_ui_can_name_it(self) -> None:
        phases = {
            RunEventKind.QUEUED,
            RunEventKind.STARTED,
            RunEventKind.SUCCEEDED,
            RunEventKind.CANCELED,
            RunEventKind.FAILURE,
        }

        assert len(phases) == 5
        assert all(k.is_run_phase for k in phases)

    def test_step_and_log_events_are_not_run_phases(self) -> None:
        assert RunEventKind.STEP.is_run_phase is False
        assert RunEventKind.LOG.is_run_phase is False
        assert RunEventKind.MACHINERY.is_run_phase is False

    def test_an_empty_message_is_declared_so_the_ui_supplies_the_word(self) -> None:
        assert _event(kind=RunEventKind.STARTED, message="").has_text is False
        assert _event(kind=RunEventKind.LOG, message="Sirena: 5/5").has_text is True


class TestRunEventPage:
    def test_failure_surfaces_the_run_level_failure_for_the_detail_card(self) -> None:
        """US-OR-D2 pide la causa en la card de "Última corrida", no enterrada en la línea de tiempo."""
        root = RunFailure(
            class_name="OperationalError",
            message="boom",
            root_class_name="OperationalError",
            root_message="psycopg.OperationalError: server closed the connection\n",
        )
        page = RunEventPage(
            events=(
                _event(kind=RunEventKind.STARTED),
                _event(kind=RunEventKind.FAILURE, level=RunEventLevel.ERROR, failure=root),
            ),
            next_cursor=None,
        )

        assert page.failure is not None
        assert "server closed the connection" in page.failure.summary

    def test_failure_is_none_when_the_run_did_not_fail(self) -> None:
        page = RunEventPage(events=(_event(),), next_cursor=None)

        assert page.failure is None
