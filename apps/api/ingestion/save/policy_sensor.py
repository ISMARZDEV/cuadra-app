"""Sensor que dispara las policies programadas desde el ADMIN (F4 #4.2b).

Piel fina: la decisión de qué está vencido vive en `application/policy_schedule.py` (pura,
testeable sin Dagster). Acá solo se lee la DB, se traduce a `RunRequest` y se emite.

**Por qué un sensor y no `ScheduleDefinition`**: el cron de un `ScheduleDefinition` se evalúa al
CARGAR el code location, así que un cron editado en el admin no surtiría efecto hasta un redeploy —
la consola diría "guardado" y el pipeline seguiría con el valor viejo. Con esto, el cron del admin
manda de verdad y programar un flujo nuevo es una FILA, no un deploy (misma doctrina que R1 aplicó
a las fuentes).

**Exactly-once**: cada `RunRequest` lleva `run_key = "{policy_id}:{tick}"`. Dagster no lanza dos
runs con el mismo run_key desde un sensor, así que evaluar cada 30s sobre un cron horario produce
UNA corrida, no 120. Sin cursor a propósito: mezclarlo con run_key rompe su reset, y el estado que
importa ya vive en nuestra DB.

**Los tags** son los mismos que usa "Ejecutar ahora" (`cuadra/policy_id`, `cuadra/trigger`) para que
la correlación policy↔corrida funcione igual venga de donde venga el disparo.
"""
from __future__ import annotations

from datetime import UTC, datetime

import dagster as dg

from src.contexts.save.application.policy_schedule import due_policy_runs
from src.contexts.save.domain.entities.orchestration import JOB_BY_FLOW
from src.contexts.save.domain.ports.orchestrator import TAG_POLICY_ID, TAG_TRIGGER
from src.contexts.save.infrastructure.orchestrator.policy_repository import (
    SqlOrchestrationPolicyRepository,
)
from src.shared.db.base import SessionLocal

from .sources import SAVE_MARKET

@dg.sensor(
    name="save_orchestration_policies",
    minimum_interval_seconds=60,
    default_status=dg.DefaultSensorStatus.RUNNING,
)
def save_orchestration_policies(context) -> dg.SensorResult:  # type: ignore[no-untyped-def]
    """Dispara las policies `execution_mode=cron` que estén vencidas."""
    with SessionLocal() as session:
        policies = SqlOrchestrationPolicyRepository(session).list_by_market(SAVE_MARKET)

    due = due_policy_runs(policies, now=datetime.now(UTC))
    requests: list[dg.RunRequest] = []
    for item in due:
        job_name = JOB_BY_FLOW.get(item.flow_key)
        if job_name is None:
            # Una policy cuyo flow todavía no tiene job soportado NO se dispara ni rompe el sensor:
            # se declara en el log para que no desaparezca en silencio.
            context.log.warning(
                f"policy {item.policy_id}: flow '{item.flow_key}' sin job soportado — no se dispara"
            )
            continue
        requests.append(
            dg.RunRequest(
                run_key=item.run_key,  # ← exactly-once por tick
                job_name=job_name,
                tags={TAG_POLICY_ID: item.policy_id, TAG_TRIGGER: "automatic"},
            )
        )

    if not requests:
        return dg.SensorResult(skip_reason=dg.SkipReason("ninguna policy vencida"))
    context.log.info(f"disparando {len(requests)} policy/policies programadas")
    return dg.SensorResult(run_requests=requests)
