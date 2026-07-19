"""Unit — alta de provider-flows (F4 #4.5).

LA regla del bloque, y la corrección explícita del SDD: **la compatibilidad se DERIVA de
`directed_capability`, nunca de una allowlist de plataformas.** La versión original del spec asumía
implícitamente Sirena/Nacional/Jumbo como los únicos proveedores query-based. Bravo aprendió a
buscar por texto (2026-07-16) y es REST_CATALOG: una allowlist lo dejaría afuera, y la consola
nacería con el mismo hardcode que R1 acababa de matar en la ingesta.
"""
from __future__ import annotations

import pytest

from src.contexts.save.application.orchestration_policies import (
    CreateProviderFlow,
    ProviderFlowNotSupported,
)
from src.contexts.save.domain.entities.orchestration import ExecutionMode, FlowKey
from src.contexts.save.domain.directed_query import DirectedCapability


class FakePolicyRepo:
    def __init__(self, existing_provider_ids: set[str] | None = None) -> None:
        self.added: list = []
        self._existing = existing_provider_ids or set()

    def find_active(self, *, provider_id, market_id, flow_key):  # type: ignore[no-untyped-def]
        return object() if provider_id in self._existing else None

    def add(self, policy) -> None:  # type: ignore[no-untyped-def]
        self.added.append(policy)


class FakeRegistryRepo:
    """Devuelve la config de fuente de un provider, o None si no tiene fuente habilitada."""

    def __init__(self, sources: dict | None = None) -> None:
        self._sources = sources or {}

    def get_by_provider(self, provider_id: str):  # type: ignore[no-untyped-def]
        return self._sources.get(provider_id)


class _Source:
    def __init__(self, platform: str, endpoints: dict | None = None, enabled: bool = True) -> None:
        self.platform = platform
        self.endpoints = endpoints or {}
        self.enabled = enabled


def _use_case(*, sources=None, capabilities=None, existing=None):  # type: ignore[no-untyped-def]
    caps = capabilities or {}
    policy_repo = FakePolicyRepo(existing)
    use_case = CreateProviderFlow(
        policy_repo=policy_repo,
        registry_repo=FakeRegistryRepo(sources),
        capability_of=lambda source: caps.get(source.platform, DirectedCapability(by_ean=False, by_text=False)),
    )
    return use_case, policy_repo


class TestCapabilityDrivenEligibility:
    def test_a_source_that_searches_by_text_can_run_discovery(self) -> None:
        use_case, repo = _use_case(
            sources={"prov-sirena": _Source("vtex")},
            capabilities={"vtex": DirectedCapability(by_ean=True, by_text=True)},
        )

        use_case.execute(
            provider_id="prov-sirena",
            market_id="DO",
            flow_key=FlowKey.PROVIDER_PRICES_REFRESH,
        )

        assert len(repo.added) == 1
        assert repo.added[0].provider_id == "prov-sirena"
        assert repo.added[0].execution_mode is ExecutionMode.MANUAL  # nace en manual, no corriendo

    def test_a_rest_catalog_source_with_text_search_is_eligible(self) -> None:
        """Bravo: REST_CATALOG **y** by_text. Es el caso exacto que una allowlist de plataformas
        habría rechazado, y el motivo de la corrección del SDD."""
        use_case, repo = _use_case(
            sources={"prov-bravo": _Source("rest_catalog", {"profile": "bravova"})},
            capabilities={"rest_catalog": DirectedCapability(by_ean=True, by_text=True)},
        )

        use_case.execute(
            provider_id="prov-bravo", market_id="DO", flow_key=FlowKey.PROVIDER_PRICES_REFRESH
        )

        assert len(repo.added) == 1

    def test_a_browse_only_source_cannot_run_discovery_by_query(self) -> None:
        """Un REST sin `text_param` opera por su flow de browse, no por este. Dejarlo crear el flow
        produciría corridas que no pueden buscar nada — y el operador no sabría por qué."""
        use_case, _ = _use_case(
            sources={"prov-x": _Source("rest_catalog", {"profile": "browse_only"})},
            capabilities={"rest_catalog": DirectedCapability(by_ean=True, by_text=False)},
        )

        with pytest.raises(ProviderFlowNotSupported, match="texto"):
            use_case.execute(
                provider_id="prov-x", market_id="DO", flow_key=FlowKey.PROVIDER_PRICES_REFRESH
            )


class TestGuards:
    def test_a_provider_without_a_source_cannot_have_a_flow(self) -> None:
        use_case, _ = _use_case(sources={})

        with pytest.raises(ProviderFlowNotSupported, match="fuente"):
            use_case.execute(
                provider_id="prov-fantasma", market_id="DO",
                flow_key=FlowKey.PROVIDER_PRICES_REFRESH,
            )

    def test_a_disabled_source_cannot_have_a_flow(self) -> None:
        use_case, _ = _use_case(
            sources={"prov-x": _Source("vtex", enabled=False)},
            capabilities={"vtex": DirectedCapability(by_ean=False, by_text=True)},
        )

        with pytest.raises(ProviderFlowNotSupported, match="deshabilitada"):
            use_case.execute(
                provider_id="prov-x", market_id="DO", flow_key=FlowKey.PROVIDER_PRICES_REFRESH
            )

    def test_a_duplicate_active_flow_is_rejected(self) -> None:
        """Unicidad del SDD §8: una policy activa por (scope, provider, market, flow). Dos vivas
        significarían dos programaciones compitiendo por la misma tienda."""
        use_case, _ = _use_case(
            sources={"prov-x": _Source("vtex")},
            capabilities={"vtex": DirectedCapability(by_ean=False, by_text=True)},
            existing={"prov-x"},
        )

        with pytest.raises(ProviderFlowNotSupported, match="[Yy]a existe"):
            use_case.execute(
                provider_id="prov-x", market_id="DO", flow_key=FlowKey.PROVIDER_PRICES_REFRESH
            )
