"""Dominio de Orquestación (F4) — la política operativa de Save, PURA (ADR 31).

El admin es la fuente de verdad de la POLÍTICA; Dagster sigue siendo el runner. Esta entidad es la
frontera entre las dos cosas.

Por qué `ExecutionMode` tiene TRES valores y no el `manual|automatic` del SDD original: el pipeline
real tiene tres mecanismos distintos de disparo (verificado en `ingestion/definitions.py`, 2026-07-19)
y modelarlos como dos obligaría a mentir sobre uno de ellos:

  - `manual`           → solo "Ejecutar ahora". Hoy: el browse REST particionado (`rest_catalog_prices`).
  - `automatic_chain`  → lo arrastra una `AutomationCondition` evaluada por el sensor `save_automation`;
                         el ORDEN lo da la dependencia, no el reloj (decisión de F1). Hoy:
                         `embed_canonicals` (único cron del grafo) y `query_catalog_prices`.
  - `cron`             → corre por reloj. Hoy: `coverage`, `freshness`, `price_refresh`.

Ofrecerle al operador un campo cron sobre un flow que corre por dependencia sería una UI que
promete algo que el pipeline ignora — la forma exacta de los bugs que la Fase 0 destapó: no rompen,
MIENTEN en verde. Por eso el cron es un invariante del modo, validado acá y no en la UI.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from cronsim import CronSim, CronSimError

# El sensor que evalúa estas políticas tickea en el orden de los ~30s, así que una expresión con
# campo de SEGUNDOS (cronsim acepta 6 campos) prometería una precisión que no podemos cumplir.
# Los `ScheduleDefinition` que este módulo reemplaza también son de 5 campos.
_CRON_FIELDS = 5


class ExecutionMode(StrEnum):
    MANUAL = "manual"
    AUTOMATIC_CHAIN = "automatic_chain"
    CRON = "cron"


class PolicyScope(StrEnum):
    PROVIDER_FLOW = "provider_flow"
    ASSET = "asset"


class FlowKey(StrEnum):
    """Handlers que el CÓDIGO sabe ejecutar. La UI solo puede ofrecer estos: v1 no crea assets
    Python arbitrarios desde el admin (SDD §4 "fuera de alcance").

    `PROVIDER_COVERAGE` (el job por EAN, Proceso 2) llega en v1.1 — hasta que exista su handler,
    no se ofrece."""

    PROVIDER_PRICES_REFRESH = "provider_prices_refresh"


# Job del runner que ejecuta cada flow. FUENTE ÚNICA: la consumen tanto "Ejecutar ahora"
# (`RunPolicyNow`) como el sensor programado (`ingestion/save/policy_sensor.py`).
#
# Estuvo duplicada en los dos lugares durante un rato y era una trampa: al sumar un flow nuevo
# (p.ej. `provider_coverage`, v1.1) alguien actualizaría uno y olvidaría el otro, y el resultado
# sería que el botón manual funciona mientras la programación NO dispara — sin un solo error.
# Mapa explícito y cerrado: v1 no materializa assets Python arbitrarios desde la UI (SDD §4).
JOB_BY_FLOW: dict[str, str] = {
    FlowKey.PROVIDER_PRICES_REFRESH.value: "save_query_catalog",
}


@dataclass(frozen=True, slots=True)
class OrchestrationGlobalConfig:
    """Defaults por mercado. El override por policy gana sobre esto (SDD §8)."""

    id: str
    market_id: str
    default_query_limit: int
    default_timezone: str = "America/Santo_Domingo"
    default_sla_minutes: int | None = None
    auto_runs_enabled: bool = True

    def __post_init__(self) -> None:
        if self.default_query_limit < 0:
            raise ValueError("OrchestrationGlobalConfig.default_query_limit no puede ser negativo")


@dataclass(frozen=True, slots=True)
class OrchestrationPolicy:
    id: str
    scope: PolicyScope
    market_id: str
    timezone: str
    execution_mode: ExecutionMode = ExecutionMode.MANUAL
    provider_id: str | None = None
    flow_key: FlowKey | None = None
    asset_key: str | None = None
    cron_expression: str | None = None
    sla_minutes: int | None = None
    query_limit_override: int | None = None
    priority: int | None = None
    enabled: bool = True
    deleted_at: datetime | None = None

    def __post_init__(self) -> None:
        self._validate_timezone()
        self._validate_cron_against_mode()
        self._validate_scope()

    def _validate_timezone(self) -> None:
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(
                f"OrchestrationPolicy.timezone inválida: {self.timezone!r}"
            ) from exc

    def _validate_cron_against_mode(self) -> None:
        if self.execution_mode is ExecutionMode.CRON:
            if not self.cron_expression:
                raise ValueError("execution_mode=cron exige una cron_expression")
            self._validate_cron_expression(self.cron_expression)
            return

        # Los otros dos modos NO se disparan por reloj. Guardar un cron que nadie evalúa le haría
        # creer al operador que cambió el ritmo de la corrida.
        if self.cron_expression:
            raise ValueError(
                f"execution_mode={self.execution_mode.value} no admite cron_expression: "
                "ese flow no se dispara por reloj"
            )

    @staticmethod
    def _validate_cron_expression(expression: str) -> None:
        if len(expression.split()) != _CRON_FIELDS:
            raise ValueError(
                f"cron_expression debe tener {_CRON_FIELDS} campos (minuto hora día mes día-semana): "
                f"{expression!r}. El campo de segundos no se admite — el sensor no puede honrarlo."
            )
        try:
            CronSim(expression, datetime.now(tz=ZoneInfo("UTC")))
        except CronSimError as exc:
            raise ValueError(f"cron_expression inválida: {expression!r} ({exc})") from exc

    def _validate_scope(self) -> None:
        if self.scope is PolicyScope.PROVIDER_FLOW:
            if not self.provider_id:
                raise ValueError("una policy provider_flow exige provider_id")
            if self.flow_key is None:
                raise ValueError("una policy provider_flow exige flow_key")
        elif self.scope is PolicyScope.ASSET and not self.asset_key:
            raise ValueError("una policy asset exige asset_key")

    @property
    def is_active(self) -> bool:
        """Soft-delete + pausa. Nunca hay hard-delete (§5.3): el histórico de runs es sagrado y una
        policy retirada no debe romperlo."""
        return self.enabled and self.deleted_at is None

    def next_run_at(self, now: datetime) -> datetime | None:
        """Próxima corrida SEGÚN LA POLÍTICA, en la timezone de la policy (no la del servidor).

        `None` no significa "nunca": significa que el reloj no es quien dispara este flow. Para
        `automatic_chain` la respuesta real la tiene Dagster (la evaluación de la
        `AutomationCondition`), y la consola la muestra desde el bridge — no la inventa acá.
        """
        if self.execution_mode is not ExecutionMode.CRON or not self.cron_expression:
            return None
        return next(CronSim(self.cron_expression, now.astimezone(ZoneInfo(self.timezone))))

    def query_limit_effective(self, config: OrchestrationGlobalConfig) -> int:
        """Precedencia del SDD §8: override del provider-flow → default global del mercado.

        `is None` y NO `or`: un override de 0 es una decisión deliberada del operador (frenar esa
        fuente), y `or` lo convertiría silenciosamente en el default.
        """
        if self.query_limit_override is None:
            return config.default_query_limit
        return self.query_limit_override
