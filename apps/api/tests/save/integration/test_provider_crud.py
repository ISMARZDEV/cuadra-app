"""Integration — CRUD de Provider + SetProviderLogo (F2·B1/B3, Batch 3A, tareas 3.2-3.3).

Provider ahora tiene `logo_url` (columna ya existía en DB desde la migración `09526c5ccaca`,
tarea 1.4 — este batch la cablea end-to-end: entidad → mapper → repo → use cases).

CreateProvider/UpdateProvider/SetProviderLogo son las tres operaciones admin de ingesta;
persisten contra la DB real (no fakes) para probar el mapeo ORM + el repo real.
"""
from __future__ import annotations

import uuid

import pytest

from src.contexts.save.application.providers import CreateProvider, SetProviderLogo, UpdateProvider
from src.contexts.save.domain.entities import ProviderType, SourcePlatform
from src.contexts.save.infrastructure.repositories import SqlProviderRepository


def _make_provider_repo(db_session):  # type: ignore[no-untyped-def]
    return SqlProviderRepository(db_session)


def test_create_provider_persists_with_logo(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    use_case = CreateProvider(repo)

    provider = use_case.execute(
        name="Jumbo",
        type=ProviderType.SUPERMARKET,
        platform=SourcePlatform.VTEX,
        market_id="DO",
        logo_url="https://cdn.example.com/jumbo.png",
    )

    persisted = repo.get_by_id(provider.id)
    assert persisted is not None
    assert persisted.name == "Jumbo"
    assert persisted.type == ProviderType.SUPERMARKET
    assert persisted.platform == SourcePlatform.VTEX
    assert persisted.market_id == "DO"
    assert persisted.logo_url == "https://cdn.example.com/jumbo.png"


def test_create_provider_without_logo_defaults_to_none(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    provider = CreateProvider(repo).execute(
        name="Nacional", type=ProviderType.SUPERMARKET, platform=SourcePlatform.SHOPIFY, market_id="DO",
    )

    persisted = repo.get_by_id(provider.id)
    assert persisted is not None
    assert persisted.logo_url is None


def test_update_provider_changes_mutable_fields(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    provider = CreateProvider(repo).execute(
        name="Bravo", type=ProviderType.SUPERMARKET, platform=SourcePlatform.VTEX, market_id="DO",
    )

    updated = UpdateProvider(repo).execute(
        provider.id, name="Super Bravo", platform=SourcePlatform.MAGENTO, market_id="DO",
    )

    assert updated.name == "Super Bravo"
    assert updated.platform == SourcePlatform.MAGENTO
    persisted = repo.get_by_id(provider.id)
    assert persisted is not None
    assert persisted.name == "Super Bravo"
    assert persisted.platform == SourcePlatform.MAGENTO
    assert persisted.type == ProviderType.SUPERMARKET  # no tocado -> se mantiene


def test_update_provider_partial_leaves_omitted_fields_untouched(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    provider = CreateProvider(repo).execute(
        name="Pola", type=ProviderType.SUPERMARKET, platform=SourcePlatform.VTEX, market_id="DO",
        logo_url="https://cdn.example.com/pola.png",
    )

    updated = UpdateProvider(repo).execute(provider.id, name="Pola Market")

    assert updated.name == "Pola Market"
    persisted = repo.get_by_id(provider.id)
    assert persisted is not None
    assert persisted.logo_url == "https://cdn.example.com/pola.png"  # UpdateProvider no toca logo


def test_update_provider_raises_when_not_found(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    with pytest.raises(ValueError, match="no encontrado"):
        UpdateProvider(repo).execute(str(uuid.uuid4()), name="X")


def test_set_provider_logo_sets_only_the_logo(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    provider = CreateProvider(repo).execute(
        name="Sirena", type=ProviderType.SUPERMARKET, platform=SourcePlatform.VTEX, market_id="DO",
    )

    updated = SetProviderLogo(repo).execute(provider.id, "https://cdn.example.com/sirena.png")

    assert updated.logo_url == "https://cdn.example.com/sirena.png"
    persisted = repo.get_by_id(provider.id)
    assert persisted is not None
    assert persisted.logo_url == "https://cdn.example.com/sirena.png"
    assert persisted.name == "Sirena"  # el resto de campos no cambia


def test_set_provider_logo_can_clear_it_with_none(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    provider = CreateProvider(repo).execute(
        name="Sirena", type=ProviderType.SUPERMARKET, platform=SourcePlatform.VTEX, market_id="DO",
        logo_url="https://cdn.example.com/sirena.png",
    )

    updated = SetProviderLogo(repo).execute(provider.id, None)

    assert updated.logo_url is None
    persisted = repo.get_by_id(provider.id)
    assert persisted is not None
    assert persisted.logo_url is None


def test_set_provider_logo_raises_when_not_found(db_session) -> None:  # type: ignore[no-untyped-def]
    repo = _make_provider_repo(db_session)
    with pytest.raises(ValueError, match="no encontrado"):
        SetProviderLogo(repo).execute(str(uuid.uuid4()), "https://cdn.example.com/x.png")
