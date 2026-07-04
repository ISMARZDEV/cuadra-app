"""Puertos de repositorio de Save (ADR 31, DIP). `typing.Protocol` = interface estructural.

Las implementaciones SQLAlchemy viven en `infrastructure`. El dominio depende de estas
abstracciones, nunca de la infra. Inyectados por el composition_root.
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol

from src.shared.money import Money

from ..entities import CanonicalProduct, PriceType, Provider, StoreProduct


class ProviderRepository(Protocol):
    def add(self, provider: Provider) -> None: ...
    def get_by_id(self, provider_id: str) -> Provider | None: ...


class CanonicalProductRepository(Protocol):
    def add(self, product: CanonicalProduct) -> None: ...


class StoreProductRepository(Protocol):
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
