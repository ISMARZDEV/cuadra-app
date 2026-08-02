"""Use-cases de la política de orquestación (F4 #4.5).

El admin es la fuente de verdad de la POLÍTICA; Dagster sigue siendo el runner. Estos use-cases son
la frontera entre las dos cosas: escriben en nuestra DB y, cuando corresponde, delegan la EJECUCIÓN
al `PipelineOrchestrator`.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from ..domain.directed_query import DirectedCapability
from ..domain.entities.orchestration import (
    BACKFILL_FLOWS,
    JOB_BY_ASSET,
    browse_partition_keys,
    job_for,
    ExecutionMode,
    FlowKey,
    OrchestrationPolicy,
    partition_key_for,
    PolicyScope,
)
from ..domain.ports.orchestrator import PipelineOrchestrator, RunTrigger


class ProviderFlowNotSupported(ValueError):
    """El provider-flow pedido no se puede crear, y el mensaje explica POR QUÉ.

    Es un error de NEGOCIO, no de validación de formulario: el operador necesita saber si el
    problema es que la tienda no tiene fuente, está apagada, o su plataforma no sabe hacer lo que
    ese flow requiere. Un 422 genérico lo dejaría adivinando.
    """


class PolicyRepository(Protocol):
    def find_active(
        self, *, provider_id: str, market_id: str, flow_key: str
    ) -> OrchestrationPolicy | None: ...

    def add(self, policy: OrchestrationPolicy) -> None: ...


class SectionsReader(Protocol):
    """Secciones configuradas de una fuente (`store_registry.endpoints.sections`)."""

    def sections_for(self, provider_id: str) -> list[str]: ...


class SourceRegistryReader(Protocol):
    def get_by_provider_id(self, provider_id: str) -> Any: ...


class CreateProviderFlow:
    """Alta de un provider-flow.

    **La compatibilidad se DERIVA de la capacidad real de la fuente, nunca de una allowlist de
    plataformas.** Es la corrección explícita del SDD: su versión original asumía Sirena/Nacional/
    Jumbo como los únicos proveedores query-based, y Bravo —REST_CATALOG que aprendió a buscar por
    texto— habría quedado afuera. Una allowlist acá haría nacer la consola con el mismo hardcode que
    R1 acababa de matar en la ingesta (`SOURCE_KEYS`).

    `capability_of` se INYECTA (mismo patrón que `composition.py`) porque solo la capa que conoce
    los profiles REST puede responder por una fuente concreta.
    """

    def __init__(
        self,
        *,
        policy_repo: PolicyRepository,
        registry_repo: SourceRegistryReader,
        capability_of: Callable[[Any], DirectedCapability],
    ) -> None:
        self._policies = policy_repo
        self._registry = registry_repo
        self._capability_of = capability_of

    def execute(
        self,
        *,
        provider_id: str,
        market_id: str,
        flow_key: FlowKey,
        timezone: str = "America/Santo_Domingo",
    ) -> OrchestrationPolicy:
        source = self._registry.get_by_provider_id(provider_id)
        if source is None:
            raise ProviderFlowNotSupported(
                "El proveedor no tiene una fuente de extracción configurada; sin fuente no hay nada "
                "que orquestar."
            )
        if not getattr(source, "enabled", True):
            raise ProviderFlowNotSupported(
                "La fuente del proveedor está deshabilitada. Actívala antes de crear un flow: si no, "
                "la ingesta la saltaría igual (R1) y las corridas no traerían nada."
            )

        self._browse_sections = [str(x) for x in (getattr(source, "endpoints", None) or {}).get("sections") or []]
        self._assert_capability(flow_key, self._capability_of(source))

        if self._policies.find_active(
            provider_id=provider_id, market_id=market_id, flow_key=flow_key.value
        ) is not None:
            raise ProviderFlowNotSupported(
                "Ya existe un flow activo para este proveedor y mercado. Dos policies vivas serían "
                "dos programaciones compitiendo por la misma tienda."
            )

        policy = OrchestrationPolicy(
            id=str(uuid.uuid4()),
            scope=PolicyScope.PROVIDER_FLOW,
            market_id=market_id,
            provider_id=provider_id,
            flow_key=flow_key,
            timezone=timezone,
            # Nace en MANUAL a propósito: crear la configuración no debe empezar a correr ingesta
            # contra una tienda sin que el operador lo pida explícitamente.
            execution_mode=ExecutionMode.MANUAL,
        )
        self._policies.add(policy)
        return policy

    def _assert_capability(self, flow_key: FlowKey, capability: DirectedCapability) -> None:
        if flow_key is FlowKey.PROVIDER_BROWSE and not self._browse_sections:
            raise ProviderFlowNotSupported(
                "La fuente de este proveedor no declara secciones, y el browse las recorre una por "
                "una. Sin secciones no hay nada que navegar."
            )
        if flow_key is FlowKey.PROVIDER_PRICES_REFRESH and not capability.by_text:
            raise ProviderFlowNotSupported(
                "La fuente de este proveedor no sabe buscar por texto, y el descubrimiento por "
                "canasta son búsquedas por texto. Si es un catálogo REST de solo-browse, opera por "
                "su flow de browse. Crear el flow igual produciría corridas que no pueden buscar "
                "nada, sin que el operador entienda por qué."
            )


class CreateAssetPolicy:
    """Alta de una policy de scope ASSET: los jobs GLOBALES (`freshness`, `coverage`), que no
    cuelgan de una tienda.

    Su cadencia vivía en `ScheduleDefinition` de código, invisible para el operador. El set de
    assets ofrecibles es cerrado (`JOB_BY_ASSET`): la consola configura POLÍTICA, no materializa
    assets arbitrarios (SDD §4).
    """

    def __init__(self, *, policy_repo: PolicyRepository) -> None:
        self._policies = policy_repo

    def execute(
        self,
        *,
        asset_key: str,
        market_id: str,
        timezone: str = "America/Santo_Domingo",
    ) -> OrchestrationPolicy:
        if asset_key not in JOB_BY_ASSET:
            ofrecibles = ", ".join(sorted(JOB_BY_ASSET))
            raise ProviderFlowNotSupported(
                f"La consola no sabe ejecutar el asset {asset_key!r}. Ofrecibles: {ofrecibles}."
            )
        if self._policies.find_active(
            provider_id=None, market_id=market_id, flow_key=asset_key
        ) is not None:
            raise ProviderFlowNotSupported(
                "Ya existe una policy activa para este asset y mercado: dos programaciones vivas "
                "competirían por el mismo job."
            )
        policy = OrchestrationPolicy(
            id=str(uuid.uuid4()),
            scope=PolicyScope.ASSET,
            market_id=market_id,
            asset_key=asset_key,
            timezone=timezone,
            # Igual que los provider-flows: nace parada, el operador decide cuándo arranca.
            execution_mode=ExecutionMode.MANUAL,
        )
        self._policies.add(policy)
        return policy


class RunPolicyNow:
    """"Ejecutar ahora": lanza una corrida manual para la policy y devuelve el id de la corrida.

    El job que se lanza sale del `flow_key`, no de texto libre: v1 no puede materializar assets
    Python arbitrarios desde la UI (SDD §4).
    """

    def __init__(
        self,
        *,
        orchestrator: PipelineOrchestrator,
        sections_reader: SectionsReader | None = None,
    ) -> None:
        self._orchestrator = orchestrator
        # Sólo el browse lo necesita: sus particiones son `{provider}:{sección}` y las secciones
        # viven en el registry.
        self._sections = sections_reader

    def execute(
        self, *, policy: OrchestrationPolicy, actor_user_id: str | None = None
    ) -> str:
        if not policy.is_active:
            raise ProviderFlowNotSupported(
                "La policy está pausada o retirada. Reactivala antes de lanzar una corrida — "
                "ejecutar algo que el operador pausó a propósito es peor que no hacer nada."
            )
        flow_key = (policy.flow_key or "").value if policy.flow_key else ""
        job_name = job_for(flow_key=flow_key, asset_key=policy.asset_key)
        if job_name is None:
            raise ProviderFlowNotSupported(
                f"No hay un job soportado para {policy.flow_key or policy.asset_key!r}."
            )
        if flow_key in BACKFILL_FLOWS:
            return self._launch_backfill(policy, job_name, actor_user_id)
        return self._orchestrator.launch(
            job_name=job_name,
            policy_id=policy.id,
            trigger=RunTrigger.MANUAL,
            actor_user_id=actor_user_id,
            # `save_query_catalog` particiona por provider_id: sin la partición la corrida muere al
            # leer `context.partition_key`. La decisión de si el flow la necesita vive en el dominio.
            partition_key=partition_key_for(flow_key, policy.provider_id),
        )


    def _launch_backfill(
        self, policy: OrchestrationPolicy, job_name: str, actor_user_id: str | None
    ) -> str:
        """El browse corre TODAS las secciones del proveedor. Con `launchRun` correría una sola y
        las demás quedarían sin ejecutar, sin que nada avisara."""
        sections = (
            self._sections.sections_for(policy.provider_id or "") if self._sections else []
        )
        keys = browse_partition_keys(policy.provider_id or "", sections)
        if not keys:
            raise ProviderFlowNotSupported(
                "El proveedor no tiene secciones configuradas en su fuente, así que el browse no "
                "tiene nada que recorrer."
            )
        return self._orchestrator.launch_backfill(
            job_name=job_name,
            partition_keys=keys,
            policy_id=policy.id,
            trigger=RunTrigger.MANUAL,
            actor_user_id=actor_user_id,
        )


def soft_delete(policy: OrchestrationPolicy, *, now: datetime | None = None) -> OrchestrationPolicy:
    """Retira una policy SIN borrarla (§5.3): el histórico de runs la referencia y es sagrado.

    Devuelve una copia — la entidad es inmutable (frozen).
    """
    from dataclasses import replace

    return replace(policy, deleted_at=now or datetime.now(UTC))
