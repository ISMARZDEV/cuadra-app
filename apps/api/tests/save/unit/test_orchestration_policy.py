"""Unit — dominio de Orquestación (F4 #4.2): política operativa por provider-flow.

PURO (ADR 31): sin ORM, sin I/O. Las reglas que se prueban acá son las que impiden que la consola
prometa algo que el pipeline no cumple — la lección cara de la Fase 0 ("no rompen: MIENTEN en verde").
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from src.contexts.save.domain.entities.orchestration import (
    ExecutionMode,
    FlowKey,
    OrchestrationGlobalConfig,
    OrchestrationPolicy,
    PolicyScope,
)

SANTO_DOMINGO = ZoneInfo("America/Santo_Domingo")


def _policy(**overrides) -> OrchestrationPolicy:  # type: ignore[no-untyped-def]
    base = dict(
        id="pol-1",
        scope=PolicyScope.PROVIDER_FLOW,
        market_id="DO",
        provider_id="prov-sirena",
        flow_key=FlowKey.PROVIDER_PRICES_REFRESH,
        execution_mode=ExecutionMode.MANUAL,
        timezone="America/Santo_Domingo",
    )
    base.update(overrides)
    return OrchestrationPolicy(**base)  # type: ignore[arg-type]


class TestExecutionMode:
    """El modo declara QUIÉN manda la ejecución. Los tres valores existen porque el pipeline real
    tiene tres mecanismos distintos (verificado en `ingestion/definitions.py`), y ofrecer un cron
    donde manda una AutomationCondition sería una UI que miente."""

    def test_cron_mode_requires_a_cron_expression(self) -> None:
        with pytest.raises(ValueError, match="cron_expression"):
            _policy(execution_mode=ExecutionMode.CRON, cron_expression=None)

    def test_manual_mode_rejects_a_cron_expression(self) -> None:
        # Guardar un cron que nadie va a evaluar es exactamente la mentira en verde que evitamos.
        with pytest.raises(ValueError, match="manual"):
            _policy(execution_mode=ExecutionMode.MANUAL, cron_expression="0 6 * * *")

    def test_automatic_chain_rejects_a_cron_expression(self) -> None:
        # `automatic_chain` = lo arrastra la AutomationCondition (embed_canonicals → ...). El cron
        # no participa: aceptarlo sugeriría al operador que puede cambiar el ritmo, y no puede.
        with pytest.raises(ValueError, match="automatic_chain"):
            _policy(execution_mode=ExecutionMode.AUTOMATIC_CHAIN, cron_expression="0 6 * * *")

    def test_manual_and_automatic_chain_have_no_next_run(self) -> None:
        now = datetime(2026, 7, 19, 10, 0, tzinfo=SANTO_DOMINGO)
        assert _policy(execution_mode=ExecutionMode.MANUAL).next_run_at(now) is None
        assert _policy(execution_mode=ExecutionMode.AUTOMATIC_CHAIN).next_run_at(now) is None


class TestCronValidation:
    def test_rejects_an_invalid_cron_expression(self) -> None:
        with pytest.raises(ValueError, match="cron"):
            _policy(execution_mode=ExecutionMode.CRON, cron_expression="no soy un cron")

    def test_rejects_a_six_field_cron_with_seconds(self) -> None:
        """`cronsim` ACEPTA 6 campos (precisión de segundos), pero nuestro sensor tickea cada ~30s:
        aceptarlo prometería una precisión que no podemos cumplir. 5 campos, como los
        `ScheduleDefinition` que este módulo reemplaza."""
        with pytest.raises(ValueError, match="5 campos"):
            _policy(execution_mode=ExecutionMode.CRON, cron_expression="0 0 */2 * * *")

    def test_rejects_an_unknown_timezone(self) -> None:
        with pytest.raises(ValueError, match="timezone"):
            _policy(timezone="Marte/Olympus_Mons")

    def test_next_run_at_is_computed_in_the_policy_timezone(self) -> None:
        # 02:00 en Santo Domingo (UTC-4), no en UTC: la zona es de la policy, no del servidor.
        now = datetime(2026, 7, 19, 10, 0, tzinfo=SANTO_DOMINGO)
        policy = _policy(execution_mode=ExecutionMode.CRON, cron_expression="0 2 * * *")

        nxt = policy.next_run_at(now)

        assert nxt is not None
        assert (nxt.hour, nxt.minute) == (2, 0)
        assert nxt.utcoffset().total_seconds() == -4 * 3600  # type: ignore[union-attr]
        assert nxt > now


class TestQueryLimitPrecedence:
    """SDD §8: `query_limit_effective = coalesce(policy.query_limit_override, global.default)`."""

    def test_override_wins_over_the_global_default(self) -> None:
        config = OrchestrationGlobalConfig(id="cfg-1", market_id="DO", default_query_limit=30)
        assert _policy(query_limit_override=10).query_limit_effective(config) == 10

    def test_falls_back_to_the_global_default_when_there_is_no_override(self) -> None:
        config = OrchestrationGlobalConfig(id="cfg-1", market_id="DO", default_query_limit=30)
        assert _policy(query_limit_override=None).query_limit_effective(config) == 30

    def test_a_zero_override_is_honoured_not_treated_as_absent(self) -> None:
        # `or` en vez de "is None" convertiría 0 en 30 y correría la ingesta que el operador
        # quiso frenar. Es el bug clásico de falsy-vs-None.
        config = OrchestrationGlobalConfig(id="cfg-1", market_id="DO", default_query_limit=30)
        assert _policy(query_limit_override=0).query_limit_effective(config) == 0


class TestSoftDelete:
    def test_a_policy_is_active_by_default(self) -> None:
        assert _policy().is_active is True

    def test_soft_deleting_deactivates_without_losing_the_row(self) -> None:
        # §5.3: nada de hard-delete en entidades operativas — el histórico de runs es sagrado.
        deleted = _policy(deleted_at=datetime(2026, 7, 19, 10, 0, tzinfo=SANTO_DOMINGO))
        assert deleted.is_active is False

    def test_a_disabled_policy_is_not_active(self) -> None:
        assert _policy(enabled=False).is_active is False


class TestProviderFlowInvariants:
    def test_a_provider_flow_policy_requires_a_provider(self) -> None:
        with pytest.raises(ValueError, match="provider_id"):
            _policy(provider_id=None)

    def test_a_provider_flow_policy_requires_a_flow_key(self) -> None:
        with pytest.raises(ValueError, match="flow_key"):
            _policy(flow_key=None)


class TestQueryLimitWithoutGlobalConfig:
    """`orchestration_global_config` existe desde F4 y NADIE la sembró: no hay fila en ningún
    entorno. Así que "sin config global" no es un caso raro — es el estado REAL de hoy, y el dominio
    tiene que poder expresarlo sin inventar un número."""

    def test_no_override_and_no_config_means_NO_CAP_not_zero(self) -> None:
        """`None` = sin tope. Devolver 0 sería un tope de CERO queries, o sea, detener la ingesta —
        la diferencia entre 'no hay límite configurado' y 'el límite es no ingerir nada'."""
        assert _policy(query_limit_override=None).query_limit_effective(None) is None

    def test_the_override_still_wins_when_there_is_no_global_config(self) -> None:
        assert _policy(query_limit_override=5).query_limit_effective(None) == 5

    def test_an_override_of_zero_is_still_a_cap_of_zero(self) -> None:
        """No se colapsa con `None`: 0 es una decisión explícita del operador."""
        assert _policy(query_limit_override=0).query_limit_effective(None) == 0
