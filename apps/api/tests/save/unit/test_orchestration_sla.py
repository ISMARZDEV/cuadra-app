"""SLA de un provider-flow — la regla que cerró el usuario el 2026-07-19.

    dentro_de_sla(flow) ⟺ (ahora − última corrida EXITOSA) ≤ policy.sla_minutes

Vive en el DOMINIO y no en el front porque es una regla de negocio, no de presentación: el KPI de la
consola y el detalle por proveedor tienen que responder lo MISMO, y una regla duplicada en dos
pantallas se desincroniza en silencio.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from src.contexts.save.domain.entities.orchestration import (
    ExecutionMode,
    FlowKey,
    OrchestrationPolicy,
    PolicyScope,
    SlaStatus,
)

NOW = datetime(2026, 7, 20, 12, 0, tzinfo=UTC)


def _policy(**over: object) -> OrchestrationPolicy:
    base: dict[str, object] = {
        "id": "pol-1",
        "scope": PolicyScope.PROVIDER_FLOW,
        "market_id": "DO",
        "timezone": "America/Santo_Domingo",
        "provider_id": "prov-1",
        "flow_key": FlowKey.PROVIDER_PRICES_REFRESH,
        "execution_mode": ExecutionMode.CRON,
        "cron_expression": "0 6 * * *",
        "sla_minutes": 120,
    }
    base.update(over)
    return OrchestrationPolicy(**base)  # type: ignore[arg-type]


class TestSlaStatus:
    def test_within_when_the_last_success_is_recent_enough(self) -> None:
        policy = _policy()
        assert policy.sla_status(NOW - timedelta(minutes=30), NOW) is SlaStatus.WITHIN

    def test_breached_once_the_window_is_exceeded(self) -> None:
        policy = _policy()
        assert policy.sla_status(NOW - timedelta(minutes=121), NOW) is SlaStatus.BREACHED

    def test_the_boundary_counts_as_within(self) -> None:
        # Exactamente en el borde el SLA se CUMPLE: "≤", no "<". Un flujo que corrió justo a tiempo
        # no puede reportarse como incumplido.
        policy = _policy()
        assert policy.sla_status(NOW - timedelta(minutes=120), NOW) is SlaStatus.WITHIN

    def test_manual_is_never_late(self) -> None:
        # Un flujo manual NO tiene programación que incumplir. Contarlo como incumplido haría que la
        # consola dijera "0/3 dentro de SLA" con todo perfectamente sano — el tipo exacto de número
        # que MIENTE EN VERDE que esta fase ya cobró cinco veces.
        policy = _policy(execution_mode=ExecutionMode.MANUAL, cron_expression=None)
        assert policy.sla_status(None, NOW) is SlaStatus.NOT_APPLICABLE
        assert policy.sla_status(NOW - timedelta(days=30), NOW) is SlaStatus.NOT_APPLICABLE

    def test_a_policy_without_sla_configured_is_not_applicable(self) -> None:
        # Sin `sla_minutes` no hay promesa que medir. Inventar un default sería fijar una política
        # que nadie decidió.
        policy = _policy(sla_minutes=None)
        assert policy.sla_status(NOW - timedelta(days=1), NOW) is SlaStatus.NOT_APPLICABLE

    def test_a_scheduled_flow_that_never_succeeded_is_breached(self) -> None:
        # No es "desconocido": es un flujo programado que todavía no cumplió su promesa. El operador
        # necesita verlo — esconderlo sería el hueco silencioso de siempre.
        policy = _policy()
        assert policy.sla_status(None, NOW) is SlaStatus.BREACHED

    def test_automatic_chain_also_has_an_sla(self) -> None:
        # `automatic_chain` no corre por reloj, pero SÍ tiene una expectativa de frescura: lo arrastra
        # una dependencia y si esa cadena se rompe, el flujo deja de correr. Solo `manual` queda fuera.
        policy = _policy(execution_mode=ExecutionMode.AUTOMATIC_CHAIN, cron_expression=None)
        assert policy.sla_status(NOW - timedelta(minutes=200), NOW) is SlaStatus.BREACHED

    @pytest.mark.parametrize("minutes", [0, -5])
    def test_a_non_positive_sla_is_treated_as_unset(self, minutes: int) -> None:
        # Un SLA de 0 minutos sería incumplible por construcción; se lee como "sin configurar" en vez
        # de pintar todo en rojo para siempre.
        policy = _policy(sla_minutes=minutes)
        assert policy.sla_status(NOW, NOW) is SlaStatus.NOT_APPLICABLE
