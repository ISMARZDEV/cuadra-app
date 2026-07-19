"""Unit — los adapters REALES cumplen los Protocols que los use-cases esperan (F4 #4.6).

**Por qué existe este archivo.** Los `Protocol` de Python son ESTRUCTURALES: nada verifica en
tiempo de ejecución que el adapter real los satisfaga. Un use-case declara `get_by_provider(...)`,
el fake del test implementa `get_by_provider(...)`, los tests pasan en verde — y el repo real se
llama `get_by_provider_id`. El endpoint devuelve **500 en producción** y ningún test unitario puede
verlo, porque el fake confirma la firma inventada en vez de la real.

Pasó exactamente así (2026-07-19, detectado con un curl contra el stack vivo, no por los tests).

Estas aserciones son baratas y cierran la clase entera de bug: si alguien renombra un método del
repo, o un use-case nuevo inventa una firma, esto se pone rojo antes del runtime.
"""
from __future__ import annotations

import inspect

from src.contexts.save.application.orchestration_policies import (
    PolicyRepository,
    SourceRegistryReader,
)
from src.contexts.save.domain.ports.orchestrator import PipelineOrchestrator
from src.contexts.save.infrastructure.orchestrator.dagster_graphql import (
    DagsterGraphQLOrchestrator,
)
from src.contexts.save.infrastructure.orchestrator.policy_repository import (
    SqlOrchestrationPolicyRepository,
)
from src.contexts.save.infrastructure.repositories import SqlStoreRegistryRepository


def _protocol_methods(protocol: type) -> list[str]:
    return [
        name
        for name, member in vars(protocol).items()
        if not name.startswith("_") and inspect.isfunction(member)
    ]


def _assert_conforms(adapter: type, protocol: type) -> None:
    missing = [m for m in _protocol_methods(protocol) if not hasattr(adapter, m)]
    assert not missing, (
        f"{adapter.__name__} NO cumple {protocol.__name__}: le faltan {missing}. "
        "Un fake que implemente la firma inventada haría pasar los tests igual y el endpoint "
        "reventaría en runtime."
    )


def test_the_registry_repository_satisfies_what_the_use_case_expects() -> None:
    _assert_conforms(SqlStoreRegistryRepository, SourceRegistryReader)


def test_the_policy_repository_satisfies_what_the_use_case_expects() -> None:
    _assert_conforms(SqlOrchestrationPolicyRepository, PolicyRepository)


def test_the_dagster_adapter_satisfies_the_orchestrator_port() -> None:
    _assert_conforms(DagsterGraphQLOrchestrator, PipelineOrchestrator)


def test_the_guard_actually_fails_when_a_method_is_missing() -> None:
    """Una salvaguarda sin prueba de que falla cuando debe no es una salvaguarda (lección de F0)."""
    import pytest

    class Incompleto:
        pass

    with pytest.raises(AssertionError, match="NO cumple"):
        _assert_conforms(Incompleto, SourceRegistryReader)
