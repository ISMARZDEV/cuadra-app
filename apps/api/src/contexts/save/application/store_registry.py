"""Use cases de StoreRegistry (Fuentes): CRUD + Pause/Resume (F2·B1/B3, Batch 3B, tareas 3.6-3.7)
+ ListSourcesHealth (Batch 3E, tareas 3.18-3.19).

CreateSource/UpdateSource/PauseSource/ResumeSource son operaciones de la consola admin
(`ADMIN_SAVE_INGESTION_OPS`) — gate real vive en el controller, no aquí. Pause/Resume aquí es el
gate MANUAL de un admin (enabled=False + paused_at + health_status="paused"); la detección
automática de rotura de esquema (auto-pause) sigue fuera de alcance (checkpoint 3.17).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from ..domain.entities import SourcePlatform, StoreRegistry
from ..domain.ports import StoreProductRepository, StoreRegistryRepository
from ..domain.source_health import SourceHealthRow, derive_source_health


class CreateSource:
    """Alta de la fuente de un Provider (1:1, `uq_store_registry_provider`) — id lo asigna el
    use case (UUID), no la infra. Falla si el Provider ya tiene una fuente registrada."""

    def __init__(self, source_repo: StoreRegistryRepository) -> None:
        self._repo = source_repo

    def execute(
        self,
        *,
        provider_id: str,
        platform: SourcePlatform,
        base_url: str,
        endpoints: dict | None = None,
        headers: dict | None = None,
        auth: dict | None = None,
    ) -> StoreRegistry:
        if self._repo.get_by_provider_id(provider_id) is not None:
            raise ValueError(f"Provider ya tiene una fuente registrada: {provider_id!r}")
        source = StoreRegistry(
            str(uuid.uuid4()), provider_id, platform, base_url,
            endpoints=endpoints, headers=headers, auth=auth,
        )
        self._repo.add(source)
        return source


class UpdateSource:
    """Actualiza config de una fuente existente (platform/base_url/endpoints/headers/auth).

    Semántica PATCH: un argumento en `None` deja el campo sin tocar. NO toca enabled/paused_at —
    esa es responsabilidad enfocada de PauseSource/ResumeSource (misma razón que SetProviderLogo
    en 3A: evitar la ambigüedad de "None = borrar" vs "None = no tocar")."""

    def __init__(self, source_repo: StoreRegistryRepository) -> None:
        self._repo = source_repo

    def execute(
        self,
        source_id: str,
        *,
        platform: SourcePlatform | None = None,
        base_url: str | None = None,
        endpoints: dict | None = None,
        headers: dict | None = None,
        auth: dict | None = None,
    ) -> StoreRegistry:
        existing = self._repo.get_by_id(source_id)
        if existing is None:
            raise ValueError(f"Fuente no encontrada: {source_id!r}")
        updated = StoreRegistry(
            existing.id,
            existing.provider_id,
            platform if platform is not None else existing.platform,
            base_url if base_url is not None else existing.base_url,
            endpoints=endpoints if endpoints is not None else existing.endpoints,
            headers=headers if headers is not None else existing.headers,
            auth=auth if auth is not None else existing.auth,
            enabled=existing.enabled,
            health_status=existing.health_status,
            paused_at=existing.paused_at,
        )
        self._repo.update(updated)
        return updated


class PauseSource:
    """Pausa MANUAL de una fuente (admin): enabled=False + paused_at=now + health_status="paused".
    NO es el auto-pause por rotura de esquema (fuera de alcance, checkpoint 3.17)."""

    def __init__(self, source_repo: StoreRegistryRepository) -> None:
        self._repo = source_repo

    def execute(self, source_id: str) -> StoreRegistry:
        existing = self._repo.get_by_id(source_id)
        if existing is None:
            raise ValueError(f"Fuente no encontrada: {source_id!r}")
        updated = StoreRegistry(
            existing.id, existing.provider_id, existing.platform, existing.base_url,
            endpoints=existing.endpoints, headers=existing.headers, auth=existing.auth,
            enabled=False, health_status="paused", paused_at=datetime.now(UTC),
        )
        self._repo.update(updated)
        return updated


class ResumeSource:
    """Reanuda una fuente pausada: enabled=True + paused_at=None + health_status=None.

    Solo la parte MANUAL de la salud se persiste en la columna; la frescura se deriva a lectura
    (`ListSourcesHealth`) — nunca se escribe acá."""

    def __init__(self, source_repo: StoreRegistryRepository) -> None:
        self._repo = source_repo

    def execute(self, source_id: str) -> StoreRegistry:
        existing = self._repo.get_by_id(source_id)
        if existing is None:
            raise ValueError(f"Fuente no encontrada: {source_id!r}")
        updated = StoreRegistry(
            existing.id, existing.provider_id, existing.platform, existing.base_url,
            endpoints=existing.endpoints, headers=existing.headers, auth=existing.auth,
            enabled=True, health_status=None, paused_at=None,
        )
        self._repo.update(updated)
        return updated


class ListSourcesHealth:
    """Lectura: fuentes del mercado + salud EFECTIVA (F2·B1/B3, Batch 3E, tareas 3.18-3.19).

    Derivada a LECTURA (no hay job de background, checkpoint 3.17): pausa manual (persistida por
    Pause/Resume) + frescura real de `store_product.last_seen_at`. Sin auto-detección de rotura
    de esquema ni tasa de error — no existe esa señal en el pipeline hoy."""

    def __init__(
        self, source_repo: StoreRegistryRepository, store_product_repo: StoreProductRepository
    ) -> None:
        self._sources = source_repo
        self._store_products = store_product_repo

    def execute(self, market_id: str) -> list[SourceHealthRow]:
        now = datetime.now(UTC)
        rows = []
        for source in self._sources.list_by_market(market_id):
            paused = source.enabled is False or source.paused_at is not None
            max_last_seen_at = self._store_products.max_last_seen_at(source.provider_id)
            health = derive_source_health(paused=paused, max_last_seen_at=max_last_seen_at, now=now)
            rows.append(SourceHealthRow(source=source, health=health))
        return rows
