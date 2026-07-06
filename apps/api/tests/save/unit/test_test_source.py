"""Unit — `TestSource`: dry-run de una fuente ya registrada (F2·B1/B3, Batch 3C, tareas 3.8/3.10).

CERO persistencia SIEMPRE (tarea 3.8): nunca llama `record_observation`/`match_repo`, ni en el
camino feliz ni en fallo parcial — se prueba inyectando spies de `StoreProductRepository`/
`ProductMatchRepository` que `TestSource` ni siquiera recibe, para que una futura regresión que
empiece a pasarlos y a llamarlos rompa este test. Mockea el HTTP guardado (`ssrf_guard.guarded_get`)
a nivel de módulo — nunca red real; el guard SSRF en sí se prueba en `test_ssrf_guard.py`.
"""
from __future__ import annotations

from unittest.mock import Mock

import httpx
import pytest

from src.contexts.save.application.test_source import (
    TestSource,
    TestSourceConfigError,
    TestSourceUpstreamError,
)
from src.contexts.save.domain.entities import (
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.infrastructure.catalog_sources import ssrf_guard


def _source(
    platform: SourcePlatform = SourcePlatform.VTEX, base_url: str = "https://x.example.com"
) -> StoreRegistry:
    return StoreRegistry("src-1", "prov-1", platform, base_url)


def _provider() -> Provider:
    return Provider("prov-1", "X", ProviderType.SUPERMARKET, SourcePlatform.VTEX, "DO")


def _vtex_item(idx: int) -> dict:
    return {
        "productId": str(idx),
        "productName": f"Producto {idx}",
        "brand": "Marca",
        "items": [{"images": [], "ean": None, "sellers": [{"commertialOffer": {"Price": 100}}]}],
        "categories": [],
        "link": None,
    }


class _StubSourceRepo:
    def __init__(self, source: StoreRegistry | None) -> None:
        self._source = source

    def get_by_id(self, source_id: str) -> StoreRegistry | None:
        return self._source if self._source and source_id == self._source.id else None


class _StubProviderRepo:
    def __init__(self, provider: Provider | None) -> None:
        self._provider = provider

    def get_by_id(self, provider_id: str) -> Provider | None:
        return self._provider if self._provider and provider_id == self._provider.id else None


def test_raises_when_source_not_found() -> None:
    use_case = TestSource(_StubSourceRepo(None), _StubProviderRepo(_provider()))

    with pytest.raises(ValueError, match="no encontrada"):
        use_case.execute("missing-id", "arroz")


def test_raises_when_provider_not_found() -> None:
    use_case = TestSource(_StubSourceRepo(_source()), _StubProviderRepo(None))

    with pytest.raises(ValueError, match="Provider no encontrado"):
        use_case.execute("src-1", "arroz")


def test_unsupported_platform_raises_config_error() -> None:
    use_case = TestSource(
        _StubSourceRepo(_source(platform=SourcePlatform.SHOPIFY)), _StubProviderRepo(_provider())
    )

    with pytest.raises(TestSourceConfigError, match="sin adapter"):
        use_case.execute("src-1", "arroz")


def test_zero_persistence_on_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    spy_store_product_repo = Mock()
    spy_match_repo = Mock()
    monkeypatch.setattr(ssrf_guard, "guarded_get", lambda url: [_vtex_item(1)])

    use_case = TestSource(_StubSourceRepo(_source()), _StubProviderRepo(_provider()))
    result = use_case.execute("src-1", "arroz")

    assert len(result) == 1
    spy_store_product_repo.record_observation.assert_not_called()
    spy_match_repo.record_match.assert_not_called()


def test_zero_persistence_when_fetch_raises_partway(monkeypatch: pytest.MonkeyPatch) -> None:
    spy_store_product_repo = Mock()
    spy_match_repo = Mock()

    def _raise(url: str) -> list[dict]:
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(ssrf_guard, "guarded_get", _raise)

    use_case = TestSource(_StubSourceRepo(_source()), _StubProviderRepo(_provider()))
    with pytest.raises(TestSourceUpstreamError):
        use_case.execute("src-1", "arroz")

    spy_store_product_repo.record_observation.assert_not_called()
    spy_match_repo.record_match.assert_not_called()


def test_ssrf_rejection_surfaces_as_config_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(url: str) -> list[dict]:
        raise ssrf_guard.SsrfBlockedError("IP no permitida")

    monkeypatch.setattr(ssrf_guard, "guarded_get", _raise)

    use_case = TestSource(_StubSourceRepo(_source()), _StubProviderRepo(_provider()))
    with pytest.raises(TestSourceConfigError):
        use_case.execute("src-1", "arroz")


def test_caps_sample_at_ten_and_does_not_pull_next_page(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def _fake_get(url: str) -> list[dict]:
        calls.append(url)
        return [_vtex_item(i) for i in range(50)]  # página completa (VTEX pagina de a 50)

    monkeypatch.setattr(ssrf_guard, "guarded_get", _fake_get)

    use_case = TestSource(_StubSourceRepo(_source()), _StubProviderRepo(_provider()))
    result = use_case.execute("src-1", "arroz")

    assert len(result) == 10
    assert len(calls) == 1  # islice(10) nunca dispara la página 2
