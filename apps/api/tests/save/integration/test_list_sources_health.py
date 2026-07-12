"""Integration — ListSourcesHealth (F2·B1/B3, Batch 3E, tareas 3.18-3.19). Requiere DB.

Salud EFECTIVA: pausa manual (persistida, Batch 3B) + frescura REAL de
`store_product.last_seen_at` (refrescado en cada `record_observation`, doc 10). Sin
auto-detección de rotura de esquema ni tasa de error (checkpoint 3.17, fuera de alcance).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from src.contexts.save.application.providers import CreateProvider
from src.contexts.save.application.store_registry import (
    CreateSource,
    ListSourcesHealth,
    PauseSource,
)
from src.contexts.save.domain.entities import PriceType, ProviderType, SourcePlatform
from src.contexts.save.domain.source_health import SourceHealth
from src.contexts.save.infrastructure.repositories import (
    SqlProviderRepository,
    SqlStoreProductRepository,
    SqlStoreRegistryRepository,
)
from src.shared.money import Currency, Money

DOP = Currency("DOP")


def _row_for(rows, source_id):  # type: ignore[no-untyped-def]
    """La fila de salud de ESTA fuente. `execute` lista TODAS las fuentes del mercado (incl. las
    sembradas, p.ej. Bravo), así que no se puede asumir `rows[0]`."""
    return next(r for r in rows if r.source.id == source_id)


def _make_provider(db_session, name: str) -> str:  # type: ignore[no-untyped-def]
    repo = SqlProviderRepository(db_session)
    provider = CreateProvider(repo).execute(
        name=name, type=ProviderType.SUPERMARKET, platform=SourcePlatform.VTEX, market_id="DO",
    )
    return provider.id


def _observe(db_session, provider_id: str, captured_at: datetime) -> None:  # type: ignore[no-untyped-def]
    SqlStoreProductRepository(db_session).record_observation(
        provider_id=provider_id, external_id="1", canonical_product_id=None,
        price=Money(100, DOP), captured_at=captured_at, price_type=PriceType.ONLINE, source="vtex",
    )


def test_paused_source_is_paused_regardless_of_freshness(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session, "Jumbo")
    registry_repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(registry_repo).execute(
        provider_id=provider_id, platform=SourcePlatform.VTEX, base_url="https://jumbo.com.do",
    )
    PauseSource(registry_repo).execute(source.id)
    _observe(db_session, provider_id, datetime.now(UTC))

    rows = ListSourcesHealth(registry_repo, SqlStoreProductRepository(db_session), SqlProviderRepository(db_session)).execute("DO")

    assert _row_for(rows, source.id).health is SourceHealth.PAUSED


def test_stale_source_when_last_observation_is_old(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session, "Sirena")
    registry_repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(registry_repo).execute(
        provider_id=provider_id, platform=SourcePlatform.VTEX, base_url="https://sirena.com.do",
    )
    _observe(db_session, provider_id, datetime.now(UTC) - timedelta(hours=48))

    rows = ListSourcesHealth(registry_repo, SqlStoreProductRepository(db_session), SqlProviderRepository(db_session)).execute("DO")

    assert _row_for(rows, source.id).health is SourceHealth.STALE


def test_ok_source_when_recently_observed(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session, "Nacional")
    registry_repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(registry_repo).execute(
        provider_id=provider_id, platform=SourcePlatform.VTEX, base_url="https://nacional.com.do",
    )
    _observe(db_session, provider_id, datetime.now(UTC) - timedelta(hours=1))

    rows = ListSourcesHealth(registry_repo, SqlStoreProductRepository(db_session), SqlProviderRepository(db_session)).execute("DO")

    assert _row_for(rows, source.id).health is SourceHealth.OK


def test_never_ingested_source_is_stale_without_crashing(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session, "PlazaLama")
    registry_repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(registry_repo).execute(
        provider_id=provider_id, platform=SourcePlatform.VTEX, base_url="https://plazalama.com.do",
    )

    rows = ListSourcesHealth(registry_repo, SqlStoreProductRepository(db_session), SqlProviderRepository(db_session)).execute("DO")

    assert _row_for(rows, source.id).health is SourceHealth.STALE


def test_only_lists_sources_of_the_requested_market(db_session) -> None:  # type: ignore[no-untyped-def]
    do_provider = _make_provider(db_session, "Jumbo DO")
    registry_repo = SqlStoreRegistryRepository(db_session)
    CreateSource(registry_repo).execute(
        provider_id=do_provider, platform=SourcePlatform.VTEX, base_url="https://jumbo.do",
    )

    rows = ListSourcesHealth(registry_repo, SqlStoreProductRepository(db_session), SqlProviderRepository(db_session)).execute("US")

    assert rows == []
