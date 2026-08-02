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
from src.contexts.save.domain.entities.orchestration import ExecutionMode, FlowKey, PolicyScope
from src.contexts.save.domain.directed_query import DirectedCapability


class FakePolicyRepo:
    def __init__(self, existing_provider_ids: set[str] | None = None) -> None:
        self.added: list = []
        self._existing = existing_provider_ids or set()

    def find_active(self, *, provider_id, market_id, flow_key):  # type: ignore[no-untyped-def]
        if provider_id is None:  # scope ASSET: la clave es el asset, no la tienda
            return next((p for p in self.added if p.asset_key == flow_key), None)
        return object() if provider_id in self._existing else None

    def add(self, policy) -> None:  # type: ignore[no-untyped-def]
        self.added.append(policy)


class FakeRegistryRepo:
    """Devuelve la config de fuente de un provider, o None si no tiene fuente habilitada."""

    def __init__(self, sources: dict | None = None) -> None:
        self._sources = sources or {}

    def get_by_provider_id(self, provider_id: str):  # type: ignore[no-untyped-def]
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


class TestPriceRefreshEligibility:
    """El refresco re-fetchea por DETALLE (camino A) con fallback a browse, así que no necesita
    saber buscar por texto — a diferencia del descubrimiento, que son búsquedas de canasta."""

    def test_a_browse_only_source_can_still_refresh_prices(self) -> None:
        use_case, repo = _use_case(
            sources={"prov-bravo": _Source("rest_catalog")},
            capabilities={"rest_catalog": DirectedCapability(by_ean=True, by_text=False)},
        )

        use_case.execute(
            provider_id="prov-bravo",
            market_id="DO",
            flow_key=FlowKey.PROVIDER_PRICE_REFRESH,
        )

        assert len(repo.added) == 1
        assert repo.added[0].flow_key is FlowKey.PROVIDER_PRICE_REFRESH

    def test_discovery_still_demands_text_search(self) -> None:
        use_case, _ = _use_case(
            sources={"prov-bravo": _Source("rest_catalog")},
            capabilities={"rest_catalog": DirectedCapability(by_ean=True, by_text=False)},
        )

        with pytest.raises(ProviderFlowNotSupported):
            use_case.execute(
                provider_id="prov-bravo",
                market_id="DO",
                flow_key=FlowKey.PROVIDER_PRICES_REFRESH,
            )


class TestCreateAssetPolicy:
    """Los jobs GLOBALES (`freshness`, `coverage`) tenían su cron en código, invisible para el
    operador. `PolicyScope.ASSET` ya existía en el modelo y nunca se había usado."""

    def test_creates_a_policy_for_an_offerable_asset(self) -> None:
        from src.contexts.save.application.orchestration_policies import CreateAssetPolicy

        repo = FakePolicyRepo()
        CreateAssetPolicy(policy_repo=repo).execute(asset_key="freshness", market_id="DO")

        assert len(repo.added) == 1
        policy = repo.added[0]
        assert policy.scope is PolicyScope.ASSET
        assert policy.asset_key == "freshness"
        assert policy.provider_id is None
        assert policy.execution_mode is ExecutionMode.MANUAL  # nace parada, como los provider-flows

    def test_refuses_an_asset_the_console_cannot_run(self) -> None:
        from src.contexts.save.application.orchestration_policies import CreateAssetPolicy

        with pytest.raises(ProviderFlowNotSupported):
            CreateAssetPolicy(policy_repo=FakePolicyRepo()).execute(
                asset_key="cualquier_cosa", market_id="DO"
            )

    def test_refuses_a_duplicate(self) -> None:
        from src.contexts.save.application.orchestration_policies import CreateAssetPolicy

        repo = FakePolicyRepo()
        uc = CreateAssetPolicy(policy_repo=repo)
        uc.execute(asset_key="coverage", market_id="DO")

        with pytest.raises(ProviderFlowNotSupported):
            uc.execute(asset_key="coverage", market_id="DO")


class TestBrowseEligibility:
    def test_a_source_without_sections_cannot_browse(self) -> None:
        """El browse recorre las secciones una por una: sin secciones no navega nada, y crear el
        flow igual produciría un backfill vacío que Dagster rechaza."""
        use_case, _ = _use_case(
            sources={"prov-x": _Source("rest_catalog")},
            capabilities={"rest_catalog": DirectedCapability(by_ean=True, by_text=True)},
        )

        with pytest.raises(ProviderFlowNotSupported):
            use_case.execute(
                provider_id="prov-x", market_id="DO", flow_key=FlowKey.PROVIDER_BROWSE
            )
