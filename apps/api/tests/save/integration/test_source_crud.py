"""Integration — CRUD de StoreRegistry (Fuentes) + Pause/Resume (F2·B1/B3, Batch 3B, tareas 3.6-3.7).

`store_registry` es 1:1 con Provider (`uq_store_registry_provider`) — Create falla si el Provider
ya tiene una fuente. Pause/Resume son el gate MANUAL de un admin (enabled + paused_at); el
auto-pause por rotura de esquema es Fase 3E, fuera de alcance aquí.
"""
from __future__ import annotations

import uuid

import pytest

from src.contexts.save.application.providers import CreateProvider
from src.contexts.save.application.store_registry import (
    CreateSource,
    PauseSource,
    ResumeSource,
    UpdateSource,
)
from src.contexts.save.domain.entities import ProviderType, SourcePlatform
from src.contexts.save.infrastructure.repositories import (
    SqlProviderRepository,
    SqlStoreRegistryRepository,
)


def _make_provider(db_session) -> str:  # type: ignore[no-untyped-def]
    repo = SqlProviderRepository(db_session)
    provider = CreateProvider(repo).execute(
        name="Jumbo", type=ProviderType.SUPERMARKET, platform=SourcePlatform.MAGENTO, market_id="DO",
    )
    return provider.id


def test_create_source_persists(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session)
    repo = SqlStoreRegistryRepository(db_session)

    source = CreateSource(repo).execute(
        provider_id=provider_id,
        platform=SourcePlatform.MAGENTO,
        base_url="https://jumbo.com.do",
        headers={"Store": "jumbo"},
    )

    persisted = repo.get_by_id(source.id)
    assert persisted is not None
    assert persisted.provider_id == provider_id
    assert persisted.platform == SourcePlatform.MAGENTO
    assert persisted.base_url == "https://jumbo.com.do"
    assert persisted.headers == {"Store": "jumbo"}
    assert persisted.enabled is True
    assert persisted.paused_at is None


def test_create_source_rejects_second_source_for_same_provider(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session)
    repo = SqlStoreRegistryRepository(db_session)
    CreateSource(repo).execute(
        provider_id=provider_id, platform=SourcePlatform.MAGENTO, base_url="https://jumbo.com.do",
    )

    with pytest.raises(ValueError, match="ya tiene"):
        CreateSource(repo).execute(
            provider_id=provider_id, platform=SourcePlatform.MAGENTO, base_url="https://otro.do",
        )


def test_get_by_provider_id_resolves_the_1to1_source(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session)
    repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(repo).execute(
        provider_id=provider_id, platform=SourcePlatform.MAGENTO, base_url="https://jumbo.com.do",
    )

    found = repo.get_by_provider_id(provider_id)
    assert found is not None
    assert found.id == source.id


def test_update_source_changes_mutable_fields(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session)
    repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(repo).execute(
        provider_id=provider_id, platform=SourcePlatform.MAGENTO, base_url="https://jumbo.com.do",
    )

    updated = UpdateSource(repo).execute(source.id, base_url="https://jumbo2.com.do")

    assert updated.base_url == "https://jumbo2.com.do"
    persisted = repo.get_by_id(source.id)
    assert persisted is not None
    assert persisted.base_url == "https://jumbo2.com.do"
    assert persisted.platform == SourcePlatform.MAGENTO  # no tocado -> se mantiene


def test_update_source_raises_when_not_found(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlStoreRegistryRepository(db_session)
    with pytest.raises(ValueError, match="no encontrada"):
        UpdateSource(repo).execute(str(uuid.uuid4()), base_url="https://x.do")


def test_pause_source_sets_disabled_and_paused_at(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session)
    repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(repo).execute(
        provider_id=provider_id, platform=SourcePlatform.MAGENTO, base_url="https://jumbo.com.do",
    )

    updated = PauseSource(repo).execute(source.id)

    assert updated.enabled is False
    assert updated.paused_at is not None
    persisted = repo.get_by_id(source.id)
    assert persisted is not None
    assert persisted.enabled is False
    assert persisted.paused_at is not None


def test_resume_source_clears_pause(db_session) -> None:  # type: ignore[no-untyped-def]
    provider_id = _make_provider(db_session)
    repo = SqlStoreRegistryRepository(db_session)
    source = CreateSource(repo).execute(
        provider_id=provider_id, platform=SourcePlatform.MAGENTO, base_url="https://jumbo.com.do",
    )
    PauseSource(repo).execute(source.id)

    updated = ResumeSource(repo).execute(source.id)

    assert updated.enabled is True
    assert updated.paused_at is None
    persisted = repo.get_by_id(source.id)
    assert persisted is not None
    assert persisted.enabled is True
    assert persisted.paused_at is None


def test_pause_source_raises_when_not_found(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = SqlStoreRegistryRepository(db_session)
    with pytest.raises(ValueError, match="no encontrada"):
        PauseSource(repo).execute(str(uuid.uuid4()))
