"""Unit — el grabador de progreso EN VIVO (§14 #14, segunda mitad).

El contador ya viajaba, pero el snapshot se escribía UNA sola vez al terminar la corrida: durante la
ejecución no existía fila para ese `run_id`, así que la barra aparecía recién al final y siempre al
100%. Una barra de progreso que solo se ve cuando ya no hay progreso que mirar.
"""
from __future__ import annotations

from ingestion.save.composition import build_progress_recorder
from src.contexts.save.application.refresh_prices import RefreshResult


class FakeSession:
    """Sesión de mentira que registra si se commiteó y qué se escribió."""

    def __init__(self, sink: list) -> None:
        self._sink = sink
        self.committed = False

    def __enter__(self):  # type: ignore[no-untyped-def]
        return self

    def __exit__(self, *_):  # type: ignore[no-untyped-def]
        return False

    def commit(self) -> None:
        self.committed = True

    # Lo que usa `SqlRunSnapshotRepository`
    def scalars(self, *_):  # type: ignore[no-untyped-def]
        class _R:
            def first(self):  # type: ignore[no-untyped-def]
                return None
        return _R()

    def add(self, row):  # type: ignore[no-untyped-def]
        self._sink.append(row)

    def flush(self) -> None:
        pass


def _factory(sessions: list):  # type: ignore[no-untyped-def]
    def make():  # type: ignore[no-untyped-def]
        s = FakeSession(sessions and sessions[-1]._sink or [])
        sessions.append(s)
        return s
    return make


class TestLiveProgress:
    def test_writes_a_snapshot_on_EVERY_query_not_only_at_the_end(self) -> None:
        rows: list = []
        sessions: list[FakeSession] = []

        def make():  # type: ignore[no-untyped-def]
            s = FakeSession(rows)
            sessions.append(s)
            return s

        on_progress = build_progress_recorder(
            run_id="run-1", market="DO", provider_id=None, flow_key="provider_prices_refresh",
            session_factory=make,
        )

        on_progress(1, 4, RefreshResult(seen=10, refreshed=0, unmatched=0, queries_total=4, queries_processed=1))
        on_progress(2, 4, RefreshResult(seen=25, refreshed=0, unmatched=0, queries_total=4, queries_processed=2))

        assert len(rows) == 2, "el progreso tiene que escribirse en CADA query"
        assert rows[-1].queries_processed == 2
        assert rows[-1].queries_total == 4

    def test_commits_on_its_OWN_session_so_the_console_can_see_it(self) -> None:
        """Sin sesión propia el progreso viaja en la transacción de la ingesta, que commitea al
        final — o sea, no se vería en vivo, que es justo el bug que esto arregla."""
        rows: list = []
        sessions: list[FakeSession] = []

        def make():  # type: ignore[no-untyped-def]
            s = FakeSession(rows)
            sessions.append(s)
            return s

        build_progress_recorder(
            run_id="run-1", market="DO", session_factory=make,
        )(1, 2, RefreshResult(seen=1, refreshed=0, unmatched=0, queries_total=2, queries_processed=1))

        assert sessions[0].committed is True

    def test_a_failed_progress_write_does_NOT_kill_the_run(self) -> None:
        """Perder el progreso es molesto; perder la corrida es caro. Una escritura de observabilidad
        jamás puede tumbar la ingesta que está observando."""
        def boom():  # type: ignore[no-untyped-def]
            raise RuntimeError("db caída")

        on_progress = build_progress_recorder(run_id="run-1", market="DO", session_factory=boom)

        on_progress(1, 2, RefreshResult(seen=1, refreshed=0, unmatched=0))  # no debe levantar
