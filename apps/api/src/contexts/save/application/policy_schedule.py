"""Qué policies están VENCIDAS y deben disparar (F4 #4.2b).

Vive en `application/` y no en el sensor de Dagster a propósito: así se testea sin levantar el
orquestador, y el sensor queda como piel fina — el mismo criterio con el que están escritos los
assets.

**Por qué existe este módulo (y por qué mueren los `ScheduleDefinition`).** El cron de un
`ScheduleDefinition` es ESTÁTICO: se evalúa cuando carga el code location. Un cron editado desde el
admin no surtiría efecto hasta un redeploy, así que la consola diría "guardado" mientras el pipeline
sigue con el valor viejo — una UI que miente, que es la clase de bug que esta fase viene cazando.
Con un sensor que lee la DB, el cron del admin manda de verdad, y agregar un flujo programado pasa a
ser una FILA y no un deploy (la misma doctrina que R1 aplicó a las fuentes).

**Exactly-once sin cursor.** Cada disparo lleva `run_key = "{policy_id}:{tick}"`. Dagster garantiza
que no lanza dos runs con el mismo run_key desde un sensor, así que un sensor que evalúa cada ~30s
sobre un cron horario produce UNA corrida, no 120. Deliberadamente NO se usa cursor: mezclarlo con
run_key rompe el reset del cursor, y el estado que importa ya vive en nuestra DB.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from cronsim import CronSim, CronSimError

from ..domain.entities.orchestration import ExecutionMode


@dataclass(frozen=True, slots=True)
class DuePolicyRun:
    policy_id: str
    flow_key: str
    # Identidad del DISPARO, no del instante en que lo miramos: dos evaluaciones dentro del mismo
    # tick producen el mismo key y Dagster lanza una sola corrida.
    run_key: str


def _due_tick(cron_expression: str, timezone: str, now: datetime) -> datetime:
    """Último tick vencido (<= ahora), en la zona de la POLICY.

    El `+1s` corrige el borde: `cronsim` en reverse devuelve el tick ESTRICTAMENTE anterior, así que
    una evaluación que cae en el segundo exacto del cron (14:00:00) obtendría el tick de las 12:00 —
    ya disparado — y el de las 14:00 se perdería hasta la evaluación siguiente.
    """
    local = now.astimezone(ZoneInfo(timezone)) + timedelta(seconds=1)
    return next(CronSim(cron_expression, local, reverse=True))


def due_policy_runs(policies: Iterable[object], *, now: datetime) -> list[DuePolicyRun]:
    """Las policies que deben disparar AHORA.

    Solo dispara `execution_mode=cron`. `manual` espera al operador, y `automatic_chain` la arrastra
    la `AutomationCondition` de Dagster — si el sensor también la disparara, cada corrida saldría
    por duplicado.
    """
    due: list[DuePolicyRun] = []
    for policy in policies:
        if getattr(policy, "execution_mode", None) is not ExecutionMode.CRON:
            continue
        if not getattr(policy, "is_active", False):
            continue  # pausada o retirada: si el sensor la ignorara, "Pausar" sería decorativo
        expression = getattr(policy, "cron_expression", None)
        if not expression:
            continue
        try:
            tick = _due_tick(expression, policy.timezone, now)  # type: ignore[attr-defined]
        except (CronSimError, ValueError, KeyError):
            # Una policy con cron inválido (fila vieja, o editada a mano fuera de la entidad) NO
            # puede impedir que las demás corran. Se salta; la validación real vive en la entidad.
            continue
        flow_key = getattr(policy, "flow_key", None)
        due.append(
            DuePolicyRun(
                policy_id=policy.id,  # type: ignore[attr-defined]
                flow_key=flow_key.value if flow_key is not None else "",
                run_key=f"{policy.id}:{tick.isoformat()}",  # type: ignore[attr-defined]
            )
        )
    return due
