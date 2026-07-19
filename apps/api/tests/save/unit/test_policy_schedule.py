"""Unit — decisión de QUÉ disparar según las policies (F4 #4.2b), PURA y sin Dagster.

La lógica de scheduling vive acá y no en el sensor por dos razones: se puede testear sin levantar
Dagster, y el sensor queda como piel fina (mismo criterio que los assets).

**Por qué un sensor DB-driven y no `ScheduleDefinition`**: el cron de un `ScheduleDefinition` es
ESTÁTICO —se evalúa al cargar el code location—, así que un cron editado desde el admin NO surtiría
efecto hasta un redeploy. La consola diría "guardado" y el pipeline seguiría con el valor viejo:
una UI que miente. Con el sensor, el cron del admin manda de verdad.

**Exactly-once**: cada disparo lleva `run_key = "{policy_id}:{tick}"`. Dagster skipea un RunRequest
cuyo run_key ya usó, así que un sensor que tickea cada 30s sobre un cron horario NO produce 120
corridas — produce una. No se usa cursor a propósito: mezclarlo con run_key rompe el reset del
cursor, y además el estado ya vive en nuestra DB.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from src.contexts.save.application.policy_schedule import due_policy_runs
from src.contexts.save.domain.entities.orchestration import (
    ExecutionMode,
    FlowKey,
    OrchestrationPolicy,
    PolicyScope,
)

TZ = ZoneInfo("America/Santo_Domingo")


def _policy(**over) -> OrchestrationPolicy:  # type: ignore[no-untyped-def]
    base = dict(
        id="pol-1",
        scope=PolicyScope.PROVIDER_FLOW,
        market_id="DO",
        provider_id="prov-1",
        flow_key=FlowKey.PROVIDER_PRICES_REFRESH,
        timezone="America/Santo_Domingo",
        execution_mode=ExecutionMode.CRON,
        cron_expression="0 */2 * * *",
    )
    base.update(over)
    return OrchestrationPolicy(**base)  # type: ignore[arg-type]


class TestWhatFires:
    def test_a_cron_policy_fires_with_the_tick_that_is_due(self) -> None:
        now = datetime(2026, 7, 19, 13, 37, tzinfo=TZ)

        due = due_policy_runs([_policy()], now=now)

        assert len(due) == 1
        assert due[0].policy_id == "pol-1"
        # El provider viaja para que el sensor lance con partición (mismo fix que "Ejecutar ahora":
        # el job está particionado por provider_id, o revienta con "non-partitioned run").
        assert due[0].provider_id == "prov-1"
        # El run_key lleva el TICK, no el instante del sensor: dos evaluaciones dentro del mismo
        # tick producen el MISMO key y Dagster dispara una sola vez.
        assert due[0].run_key == "pol-1:2026-07-19T12:00:00-04:00"

    def test_two_evaluations_within_the_same_tick_produce_the_same_key(self) -> None:
        a = due_policy_runs([_policy()], now=datetime(2026, 7, 19, 12, 5, tzinfo=TZ))
        b = due_policy_runs([_policy()], now=datetime(2026, 7, 19, 13, 59, tzinfo=TZ))

        assert a[0].run_key == b[0].run_key  # ← esto es lo que da exactly-once

    def test_the_next_tick_produces_a_different_key(self) -> None:
        a = due_policy_runs([_policy()], now=datetime(2026, 7, 19, 13, 59, tzinfo=TZ))
        b = due_policy_runs([_policy()], now=datetime(2026, 7, 19, 14, 1, tzinfo=TZ))

        assert a[0].run_key != b[0].run_key

    def test_a_tick_landing_exactly_on_the_boundary_counts_as_due(self) -> None:
        """`cronsim` en reverse devuelve el tick ESTRICTAMENTE anterior. Sin corregir el borde, un
        sensor que evalúa a las 14:00:00 clavadas re-emitiría el key de las 12:00 (ya usado) y el
        disparo de las 14:00 se perdería hasta la evaluación siguiente."""
        due = due_policy_runs([_policy()], now=datetime(2026, 7, 19, 14, 0, tzinfo=TZ))

        assert due[0].run_key == "pol-1:2026-07-19T14:00:00-04:00"

    def test_the_tick_is_computed_in_the_policy_timezone(self) -> None:
        # La zona es de la POLICY, no del servidor: un servidor en UTC no debe correr el cron de
        # una tienda dominicana cuatro horas antes.
        now = datetime(2026, 7, 19, 13, 37, tzinfo=ZoneInfo("UTC"))

        due = due_policy_runs([_policy(cron_expression="0 6 * * *")], now=now)

        assert due[0].run_key.endswith("T06:00:00-04:00")


class TestWhatDoesNotFire:
    def test_a_manual_policy_never_fires(self) -> None:
        assert due_policy_runs([_policy(execution_mode=ExecutionMode.MANUAL, cron_expression=None)],
                               now=datetime(2026, 7, 19, 13, 37, tzinfo=TZ)) == []

    def test_an_automatic_chain_policy_never_fires_from_here(self) -> None:
        """Esas las arrastra la `AutomationCondition` de Dagster. Si el sensor TAMBIÉN las
        disparara, cada corrida saldría por duplicado."""
        assert due_policy_runs(
            [_policy(execution_mode=ExecutionMode.AUTOMATIC_CHAIN, cron_expression=None)],
            now=datetime(2026, 7, 19, 13, 37, tzinfo=TZ),
        ) == []

    def test_a_paused_policy_does_not_fire(self) -> None:
        # Pausar es la acción operativa primaria del admin. Si el sensor la ignorara, el botón
        # "Pausar" sería decorativo — y eso es peor que no tenerlo.
        assert due_policy_runs([_policy(enabled=False)],
                               now=datetime(2026, 7, 19, 13, 37, tzinfo=TZ)) == []

    def test_a_soft_deleted_policy_does_not_fire(self) -> None:
        assert due_policy_runs([_policy(deleted_at=datetime(2026, 7, 1, tzinfo=TZ))],
                               now=datetime(2026, 7, 19, 13, 37, tzinfo=TZ)) == []


class TestMultiplePolicies:
    def test_each_active_cron_policy_gets_its_own_request(self) -> None:
        policies = [_policy(id="pol-1"), _policy(id="pol-2", provider_id="prov-2")]

        due = due_policy_runs(policies, now=datetime(2026, 7, 19, 13, 37, tzinfo=TZ))

        assert {d.policy_id for d in due} == {"pol-1", "pol-2"}
        assert len({d.run_key for d in due}) == 2  # keys distintos: no se pisan entre sí

    def test_a_broken_cron_does_not_take_down_the_whole_evaluation(self) -> None:
        """Un cron inválido en UNA policy no puede impedir que las demás corran. La entidad ya lo
        valida al crearla, pero una fila vieja o editada a mano no debe tumbar el sensor entero."""
        good = _policy(id="pol-ok")

        # No se puede CONSTRUIR una policy con cron inválido (la entidad lo impide), así que el caso
        # —una fila vieja o editada a mano en el DB— se simula con un objeto que imita la forma.
        class _Broken:
            id = "pol-roto"
            is_active = True
            execution_mode = ExecutionMode.CRON
            cron_expression = "no soy un cron"
            timezone = "America/Santo_Domingo"
            flow_key = FlowKey.PROVIDER_PRICES_REFRESH

        due = due_policy_runs([_Broken(), good], now=datetime(2026, 7, 19, 13, 37, tzinfo=TZ))  # type: ignore[list-item]

        assert [d.policy_id for d in due] == ["pol-ok"]


def test_every_supported_flow_has_exactly_one_job_mapping() -> None:
    """El mapa flow→job estuvo DUPLICADO entre el use-case de "Ejecutar ahora" y el sensor
    programado, con el sensor usando además el string hardcodeado en vez del enum.

    Por qué era una trampa: al sumar un flow nuevo (p.ej. `provider_coverage`, v1.1) alguien
    actualizaría uno y olvidaría el otro — y el botón manual funcionaría mientras la programación
    NO dispara, sin un solo error. Esta aserción exige que TODO flow declarado tenga job, así que
    agregar uno al enum sin mapearlo pone el test en rojo antes de llegar a producción.
    """
    from src.contexts.save.domain.entities.orchestration import JOB_BY_FLOW

    sin_job = [f.value for f in FlowKey if f.value not in JOB_BY_FLOW]
    assert not sin_job, f"flows declarados sin job asignado: {sin_job}"

    # Y a la inversa: un job mapeado para un flow que ya no existe es código muerto.
    huerfanos = [k for k in JOB_BY_FLOW if k not in {f.value for f in FlowKey}]
    assert not huerfanos, f"jobs mapeados a flows inexistentes: {huerfanos}"
