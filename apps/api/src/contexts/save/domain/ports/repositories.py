"""Puertos de repositorio de Save (ADR 31, DIP). `typing.Protocol` = interface estructural.

Las implementaciones SQLAlchemy viven en `infrastructure`. El dominio depende de estas
abstracciones, nunca de la infra. Inyectados por el composition_root.
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol

from src.shared.money import Money

from ..alerts import Alert, AlertNotification, AlertSubscription
from ..comparison import StoreQuote
from ..drops import PriceChange
from ..entities import CanonicalProduct, PriceType, Provider, StoreProduct
from ..history import PricePoint
from ..listing import OfferingRow
from ..taxonomy import CategoryNode


class ProviderRepository(Protocol):
    def add(self, provider: Provider) -> None: ...
    def get_by_id(self, provider_id: str) -> Provider | None: ...


class TaxonomyRepository(Protocol):
    def list_tree(self, market_id: str) -> list[CategoryNode]:
        """Árbol de categorías del mercado (raíces con hijos anidados)."""
        ...

    def ancestors(self, node_id: str) -> list[CategoryNode]:
        """Camino raíz→nodo (inclusive) para el breadcrumb del producto."""
        ...

    def descendant_ids(self, node_id: str) -> list[str]:
        """IDs de `node_id` + todos sus descendientes (subárbol) — para el listado."""
        ...

    def list_products_under(self, node_id: str) -> list[CanonicalProduct]:
        """Productos canónicos cuyo nodo es `node_id` o un descendiente."""
        ...


class CanonicalProductRepository(Protocol):
    def add(self, product: CanonicalProduct) -> None: ...
    def get_by_id(self, product_id: str) -> CanonicalProduct | None: ...
    def search(self, query: str, market_id: str) -> list[CanonicalProduct]: ...
    def list_by_market(
        self, market_id: str, limit: int = 1000, offset: int = 0
    ) -> list[CanonicalProduct]:
        """Todos los productos del mercado (para el sitemap y el browse del portal)."""
        ...


class StoreProductRepository(Protocol):
    def exists(self, provider_id: str, external_id: str) -> bool:
        """¿Hay store_product para (provider, external_id)? — llave natural del refresh."""
        ...

    def list_quotes_by_canonical(self, canonical_product_id: str) -> list[StoreQuote]:
        """Cotizaciones (con nombre de tienda) para comparar — join a provider."""
        ...

    def list_category_offerings(self, node_ids: list[str]) -> list[OfferingRow]:
        """Filas producto×tienda para los productos bajo `node_ids` (listado por categoría)."""
        ...

    def list_market_offerings(self, market_id: str) -> list[OfferingRow]:
        """Filas producto×tienda de TODO el mercado (rails de la home)."""
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


class AlertRepository(Protocol):
    """Alertas de precio (G4): suscripciones + feed de notificaciones disparadas."""

    def subscribe(
        self, user_id: str, canonical_product_id: str, market_id: str, threshold_minor: int | None
    ) -> str:
        """Suscribe (upsert por user×producto: re-suscribir actualiza el umbral). Devuelve el id."""
        ...

    def list_by_user(self, user_id: str) -> list[Alert]:
        """Suscripciones del usuario (con nombre de producto), más recientes primero."""
        ...

    def unsubscribe(self, user_id: str, alert_id: str) -> bool:
        """Elimina la suscripción si es del usuario. False si no existe/ajena."""
        ...

    def list_active_subscriptions(self, market_id: str) -> list[AlertSubscription]:
        """Todas las suscripciones activas del mercado (para el matching)."""
        ...

    def record_notification(
        self,
        *,
        alert_id: str,
        user_id: str,
        canonical_product_id: str,
        product_name: str,
        provider_name: str,
        previous_minor: int,
        current_minor: int,
        currency: str,
        drop_bps: int,
        captured_at: datetime,
    ) -> bool:
        """Inserta la notificación IDEMPOTENTE (alerta×tienda×captured_at). True si fue nueva."""
        ...

    def list_notifications(self, user_id: str) -> list[AlertNotification]:
        """Feed de alertas disparadas del usuario, más recientes primero."""
        ...

    def register_push_token(self, user_id: str, token: str, platform: str) -> None:
        """Registra/actualiza el Expo push token de un dispositivo del usuario (upsert por token)."""
        ...

    def list_push_tokens(self, user_id: str) -> list[str]:
        """Tokens de push de todos los dispositivos del usuario (para el envío)."""
        ...
