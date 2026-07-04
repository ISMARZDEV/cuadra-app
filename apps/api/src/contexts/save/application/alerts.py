"""Use cases de alertas de precio (G4). Suscripción por usuario + matching de bajadas → feed.

RunAlertMatching reusa la detección de bajadas (`list_price_changes` + `detect_drops`) y el
matching puro (`match_alerts`), y persiste las notificaciones de forma idempotente. El canal de
entrega (email/push) NO vive acá: el MVP es un feed in-app consultable.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..domain.alerts import match_alerts
from ..domain.drops import detect_drops
from ..domain.ports import AlertRepository, CanonicalProductRepository, StoreProductRepository
from .dtos import AlertDto, AlertNotificationDto
from .errors import CanonicalProductNotFoundError


class SubscribeAlert:
    def __init__(
        self, alert_repo: AlertRepository, canonical_repo: CanonicalProductRepository
    ) -> None:
        self._alerts = alert_repo
        self._canonical = canonical_repo

    def execute(
        self, user_id: str, product_id: str, threshold_minor: int | None = None
    ) -> AlertDto:
        product = self._canonical.get_by_id(product_id)
        if product is None:
            raise CanonicalProductNotFoundError(product_id)
        alert_id = self._alerts.subscribe(
            user_id, product_id, product.market_id, threshold_minor
        )
        return AlertDto(
            id=alert_id,
            canonical_product_id=product_id,
            product_name=product.name,
            threshold_minor=threshold_minor,
            created_at=datetime.now(timezone.utc),
        )


class ListAlerts:
    def __init__(self, alert_repo: AlertRepository) -> None:
        self._alerts = alert_repo

    def execute(self, user_id: str) -> list[AlertDto]:
        return [
            AlertDto(
                id=a.id,
                canonical_product_id=a.canonical_product_id,
                product_name=a.product_name,
                threshold_minor=a.threshold_minor,
                created_at=a.created_at,
            )
            for a in self._alerts.list_by_user(user_id)
        ]


class UnsubscribeAlert:
    def __init__(self, alert_repo: AlertRepository) -> None:
        self._alerts = alert_repo

    def execute(self, user_id: str, alert_id: str) -> bool:
        return self._alerts.unsubscribe(user_id, alert_id)


class ListAlertNotifications:
    def __init__(self, alert_repo: AlertRepository) -> None:
        self._alerts = alert_repo

    def execute(self, user_id: str) -> list[AlertNotificationDto]:
        return [
            AlertNotificationDto(
                id=n.id,
                canonical_product_id=n.canonical_product_id,
                product_name=n.product_name,
                provider_name=n.provider_name,
                previous_minor=n.previous_minor,
                current_minor=n.current_minor,
                currency=n.currency,
                drop_bps=n.drop_bps,
                triggered_at=n.triggered_at,
                read=n.read,
            )
            for n in self._alerts.list_notifications(user_id)
        ]


class RunAlertMatching:
    """Cruza las bajadas recientes con las suscripciones y crea las notificaciones (idempotente)."""

    def __init__(
        self, store_repo: StoreProductRepository, alert_repo: AlertRepository
    ) -> None:
        self._store = store_repo
        self._alerts = alert_repo

    def execute(self, market_id: str, days: int = 7) -> int:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        drops = detect_drops(self._store.list_price_changes(market_id, since))
        subscriptions = self._alerts.list_active_subscriptions(market_id)
        created = 0
        for match in match_alerts(drops, subscriptions):
            change = match.drop.change
            if self._alerts.record_notification(
                alert_id=match.subscription.alert_id,
                user_id=match.subscription.user_id,
                canonical_product_id=change.canonical_product_id,
                product_name=change.product_name,
                provider_name=change.provider_name,
                previous_minor=change.previous.amount_minor,
                current_minor=change.current.amount_minor,
                currency=change.current.currency.code,
                drop_bps=match.drop.drop_bps,
                captured_at=change.captured_at,
            ):
                created += 1
        return created
