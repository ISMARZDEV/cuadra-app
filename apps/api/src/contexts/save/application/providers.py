"""Use case ListProviders (A9): supermercados del mercado, para el rail "Ofertas por supermercado".

Solo lectura. Sin logo (el modelo `Provider` no tiene ese campo todavía) — el frontend renderiza
el nombre como badge hasta que haya un asset real por tienda.
"""
from __future__ import annotations

from ..domain.ports import ProviderRepository
from .dtos import ProviderRefDto


class ListProviders:
    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(self, market_id: str) -> list[ProviderRefDto]:
        return [ProviderRefDto(id=p.id, name=p.name) for p in self._repo.list_by_market(market_id)]


class GetProvider:
    """Resuelve el nombre de la tienda para la cabecera de su página propia (A9)."""

    def __init__(self, provider_repo: ProviderRepository) -> None:
        self._repo = provider_repo

    def execute(self, provider_id: str) -> ProviderRefDto | None:
        provider = self._repo.get_by_id(provider_id)
        return ProviderRefDto(id=provider.id, name=provider.name) if provider else None
