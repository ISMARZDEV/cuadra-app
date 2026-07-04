"""Puertos de repositorio de Save (ADR 31, DIP). `typing.Protocol` = interface estructural.

Las implementaciones SQLAlchemy viven en `infrastructure`. El dominio depende de estas
abstracciones, nunca de la infra. Inyectados por el composition_root.
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol

from src.shared.money import Money

from ..comparison import StoreQuote
from ..drops import PriceChange
from ..entities import CanonicalProduct, PriceType, Provider, StoreProduct
from ..history import PricePoint


class ProviderRepository(Protocol):
    def add(self, provider: Provider) -> None: ...
    def get_by_id(self, provider_id: str) -> Provider | None: ...


class CanonicalProductRepository(Protocol):
    def add(self, product: CanonicalProduct) -> None: ...
    def get_by_id(self, product_id: str) -> CanonicalProduct | None: ...
    def search(self, query: str, market_id: str) -> list[CanonicalProduct]: ...


class StoreProductRepository(Protocol):
    def exists(self, provider_id: str, external_id: str) -> bool:
        """¿Hay store_product para (provider, external_id)? — llave natural del refresh."""
        ...

    def list_quotes_by_canonical(self, canonical_product_id: str) -> list[StoreQuote]:
        """Cotizaciones (con nombre de tienda) para comparar — join a provider."""
        ...

    def record_observation(
        self,
        *,
        provider_id: str,
        external_id: str,
        canonical_product_id: str | None,
        price: Money,
        captured_at: datetime,
        price_type: PriceType,
        source: str,
        url: str | None = None,
        ean: str | None = None,
    ) -> str:
        """Change-only (SCD-4): inserta `price` solo si cambió; si no, actualiza last_seen_at."""
        ...

    def list_by_canonical(self, canonical_product_id: str) -> list[StoreProduct]: ...

    def list_price_history(self, canonical_product_id: str) -> list[PricePoint]:
        """Puntos de cambio (change-only) de todas las tiendas, ordenados por captured_at."""
        ...

    def list_price_changes(self, market_id: str, since: datetime) -> list[PriceChange]:
        """Pares consecutivos previous→current cuyo cambio cae en la ventana (solo matcheados)."""
        ...
