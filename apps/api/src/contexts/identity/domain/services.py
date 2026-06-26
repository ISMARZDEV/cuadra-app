"""Servicio de dominio: resolución de capabilities efectivas (ADR 4). Lógica PURA.

efectivas = (unión ADITIVA de las capabilities de los roles) filtrada por el
gating de jurisdicción del current_market (capability_market).

Sin I/O ni SQLAlchemy → se prueba en aislamiento (unit). El acceso a datos
(roles del usuario, gating del mercado) lo resuelve la capa de aplicación vía
puertos y le pasa los valores ya cargados.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping

from .entities import Role
from .enums import CapabilityKey


class CapabilityResolver:
    @staticmethod
    def resolve(
        roles: Iterable[Role],
        market_gating: Mapping[CapabilityKey, bool] | None = None,
    ) -> frozenset[CapabilityKey]:
        """Capabilities efectivas del usuario.

        `market_gating`: mapa capability → habilitada para el current_market.
        - Si es None → sin gating (todas las concedidas por rol).
        - Si está → una capability se conserva salvo que esté EXPLÍCITAMENTE
          deshabilitada (las no listadas se permiten por defecto).
        """
        granted: set[CapabilityKey] = set()
        for role in roles:
            granted |= set(role.capabilities)

        if market_gating is None:
            return frozenset(granted)

        return frozenset(cap for cap in granted if market_gating.get(cap, True))
