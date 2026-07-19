"""Use cases de Provider: lectura (A9) + CRUD de administración de ingesta (F2·B1/B3, Batch 3A).

ListProviders/GetProvider son de solo lectura, para el rail "Ofertas por supermercado" y la
página propia de cada tienda. CreateProvider/UpdateProvider/SetProviderLogo son operaciones de
la consola admin (`ADMIN_SAVE_INGESTION_OPS`) — gate real vive en el controller, no aquí.
"""
from __future__ import annotations

import uuid

from ..domain.entities import Provider, ProviderType, SourcePlatform
from ..domain.ports import ProviderRepository
from .dtos import ProviderRefDto


class ListProviders:
    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(self, market_id: str) -> list[ProviderRefDto]:
        return [
            ProviderRefDto(id=p.id, name=p.name, logo_url=p.logo_url)
            for p in self._repo.list_by_market(market_id)
        ]


class ListAdminProviders:
    """Listado ADMIN de providers (T1/#11): devuelve la ENTIDAD completa (type/platform/market),
    no el `ProviderRefDto` público — la consola necesita esos campos para edición segura. El admin
    dejó de depender de `listProviders` (público, parcial). Ordena por nombre para la tabla."""

    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(self, market_id: str) -> list[Provider]:
        return sorted(self._repo.list_by_market(market_id), key=lambda p: p.name.lower())


class GetProvider:
    """Resuelve el nombre de la tienda para la cabecera de su página propia (A9)."""

    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(self, provider_id: str) -> ProviderRefDto | None:
        provider = self._repo.get_by_id(provider_id)
        if provider is None:
            return None
        return ProviderRefDto(id=provider.id, name=provider.name, logo_url=provider.logo_url)


class CreateProvider:
    """Alta de un Provider nuevo (admin ingesta) — id lo asigna el use case (UUID), no la infra."""

    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(
        self,
        *,
        name: str,
        type: ProviderType,
        platform: SourcePlatform,
        market_id: str,
        logo_url: str | None = None,
    ) -> Provider:
        provider = Provider(str(uuid.uuid4()), name, type, platform, market_id, logo_url)
        self._repo.add(provider)
        return provider


class UpdateProvider:
    """Actualiza identidad/config de un Provider existente (name/type/platform/market_id).

    Semántica PATCH: un argumento en `None` deja el campo sin tocar. NO toca `logo_url` —
    esa es responsabilidad enfocada de `SetProviderLogo` (tarea 3.2, operación nombrada aparte)."""

    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(
        self,
        provider_id: str,
        *,
        name: str | None = None,
        type: ProviderType | None = None,
        platform: SourcePlatform | None = None,
        market_id: str | None = None,
    ) -> Provider:
        existing = self._repo.get_by_id(provider_id)
        if existing is None:
            raise ValueError(f"Provider no encontrado: {provider_id!r}")
        updated = Provider(
            existing.id,
            name if name is not None else existing.name,
            type if type is not None else existing.type,
            platform if platform is not None else existing.platform,
            market_id if market_id is not None else existing.market_id,
            logo_url=existing.logo_url,
        )
        self._repo.update(updated)
        return updated


class SetProviderLogo:
    """Fija (o limpia, con `logo_url=None`) el logo de un Provider — operación enfocada: no
    reenvía el resto de los campos como haría un PATCH genérico (tarea 3.2)."""

    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(self, provider_id: str, logo_url: str | None) -> Provider:
        existing = self._repo.get_by_id(provider_id)
        if existing is None:
            raise ValueError(f"Provider no encontrado: {provider_id!r}")
        updated = Provider(
            existing.id, existing.name, existing.type, existing.platform, existing.market_id,
            logo_url=logo_url,
        )
        self._repo.update(updated)
        return updated
