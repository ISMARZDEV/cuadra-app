"""Matching de alertas de precio (G4) — dominio PURO (ADR 31).

Reusa la detección de bajadas (`PriceDrop`, doc drops.py): dada una lista de bajadas y las
suscripciones activas de los usuarios, produce los MATCHES (a quién avisar de qué bajada). Una
suscripción con `threshold_minor` solo matchea si el precio nuevo cae A o POR DEBAJO del umbral;
sin umbral, matchea cualquier bajada del producto. La entrega (canal) NO es del dominio.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .drops import PriceDrop


@dataclass(frozen=True, slots=True)
class Alert:
    """Suscripción como la ve el usuario (read model del listado 'Mis alertas')."""

    id: str
    canonical_product_id: str
    product_name: str
    threshold_minor: int | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class AlertNotification:
    """Un evento disparado (feed in-app)."""

    id: str
    canonical_product_id: str
    product_name: str
    provider_name: str
    previous_minor: int
    current_minor: int
    currency: str
    drop_bps: int
    triggered_at: datetime
    read: bool


@dataclass(frozen=True, slots=True)
class AlertSubscription:
    """Suscripción de un usuario a un producto (con umbral opcional en minor units)."""

    alert_id: str
    user_id: str
    canonical_product_id: str
    threshold_minor: int | None


@dataclass(frozen=True, slots=True)
class AlertMatch:
    subscription: AlertSubscription
    drop: PriceDrop


def match_alerts(
    drops: list[PriceDrop], subscriptions: list[AlertSubscription]
) -> list[AlertMatch]:
    """Cruza bajadas × suscripciones. Umbral: avisa si el precio nuevo ≤ umbral (o sin umbral)."""
    by_product: dict[str, list[AlertSubscription]] = {}
    for sub in subscriptions:
        by_product.setdefault(sub.canonical_product_id, []).append(sub)

    matches: list[AlertMatch] = []
    for drop in drops:
        current_minor = drop.change.current.amount_minor
        for sub in by_product.get(drop.change.canonical_product_id, []):
            if sub.threshold_minor is None or current_minor <= sub.threshold_minor:
                matches.append(AlertMatch(subscription=sub, drop=drop))
    return matches
