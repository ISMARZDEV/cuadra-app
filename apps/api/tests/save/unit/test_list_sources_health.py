"""Unit — ListSourcesHealth (F2·B1/B3, Batch 3E, tareas 3.18-3.19). Fakes, sin DB.

Salud EFECTIVA = pausa manual (ya persistida, Batch 3B) + frescura derivada de
`store_product.last_seen_at` a lectura (no hay job de background). Sin auto-detección
de rotura de esquema ni tasa de error (checkpoint 3.17, fuera de alcance).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.contexts.save.application.store_registry import ListSourcesHealth
from src.contexts.save.domain.entities import (
    Provider,
    ProviderType,
    SourcePlatform,
    StoreRegistry,
)
from src.contexts.save.domain.source_health import SourceHealth


class FakeProviderRepo:
    """Devuelve un Provider con nombre + logo por provider_id (para las cards/lista)."""

    def get_by_id(self, provider_id: str) -> Provider:
        return Provider(
            provider_id, f"Súper {provider_id}", ProviderType.SUPERMARKET,
            SourcePlatform.VTEX, "DO", logo_url=f"https://logo/{provider_id}.png",
        )


class FakeStoreRegistryRepo:
    def __init__(self, sources: list[StoreRegistry]) -> None:
        self._sources = sources

    def list_by_market(self, market_id: str) -> list[StoreRegistry]:
        return list(self._sources)


class FakeStoreProductRepo:
    def __init__(
        self,
        max_last_seen_at: dict[str, datetime | None],
        counts: dict[str, int] | None = None,
    ) -> None:
        self._by_provider = max_last_seen_at
        self._counts = counts or {}

    def max_last_seen_at(self, provider_id: str) -> datetime | None:
        return self._by_provider.get(provider_id)

    def count_by_provider(self, provider_id: str) -> int:
        return self._counts.get(provider_id, 0)


def _source(
    provider_id: str, *, enabled: bool = True, paused_at: datetime | None = None,
    health_status: str | None = None,
) -> StoreRegistry:
    return StoreRegistry(
        f"src-{provider_id}", provider_id, SourcePlatform.VTEX, "https://x.do",
        enabled=enabled, health_status=health_status, paused_at=paused_at,
    )


def test_paused_source_is_paused_regardless_of_freshness() -> None:
    now = datetime(2026, 7, 6, tzinfo=UTC)
    source = _source("p1", enabled=False, paused_at=now, health_status="paused")
    use_case = ListSourcesHealth(FakeStoreRegistryRepo([source]), FakeStoreProductRepo({"p1": now}), FakeProviderRepo())

    rows = use_case.execute("DO")

    assert rows[0].health is SourceHealth.PAUSED


def test_stale_source_when_last_seen_older_than_threshold() -> None:
    source = _source("p1")
    stale_seen = datetime.now(UTC) - timedelta(hours=48)
    use_case = ListSourcesHealth(
        FakeStoreRegistryRepo([source]), FakeStoreProductRepo({"p1": stale_seen}), FakeProviderRepo()
    )

    rows = use_case.execute("DO")

    assert rows[0].health is SourceHealth.STALE


def test_ok_source_when_recently_seen() -> None:
    source = _source("p1")
    fresh_seen = datetime.now(UTC) - timedelta(hours=1)
    use_case = ListSourcesHealth(
        FakeStoreRegistryRepo([source]), FakeStoreProductRepo({"p1": fresh_seen}), FakeProviderRepo()
    )

    rows = use_case.execute("DO")

    assert rows[0].health is SourceHealth.OK


def test_never_ingested_source_is_stale() -> None:
    source = _source("p1")
    use_case = ListSourcesHealth(FakeStoreRegistryRepo([source]), FakeStoreProductRepo({}), FakeProviderRepo())

    rows = use_case.execute("DO")

    assert rows[0].health is SourceHealth.STALE
    assert rows[0].source.id == source.id


def test_row_carries_last_seen_at_and_product_count_for_the_table() -> None:
    """La fila expone la señal cruda de frescura (`last_seen_at`) y el conteo de productos, para que
    la tabla del admin dé contexto al badge (la Antigüedad la deriva el cliente desde last_seen_at)."""
    source = _source("p1")
    seen = datetime.now(UTC) - timedelta(hours=2)
    use_case = ListSourcesHealth(
        FakeStoreRegistryRepo([source]),
        FakeStoreProductRepo({"p1": seen}, counts={"p1": 55}),
        FakeProviderRepo(),
    )

    rows = use_case.execute("DO")

    assert rows[0].last_seen_at == seen
    assert rows[0].product_count == 55


def test_never_ingested_source_has_zero_count_and_null_last_seen() -> None:
    source = _source("p1")
    use_case = ListSourcesHealth(FakeStoreRegistryRepo([source]), FakeStoreProductRepo({}), FakeProviderRepo())

    rows = use_case.execute("DO")

    assert rows[0].last_seen_at is None
    assert rows[0].product_count == 0
