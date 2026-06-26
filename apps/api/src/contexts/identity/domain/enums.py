"""Claves de dominio de identity (códigos estables). ADR 4.

Las claves son IDENTIFICADORES de código (inglés, ADR 32); el nombre legible
("Usuario Normal") es un dato aparte (role.display_name / seed), no la clave.
"""
from __future__ import annotations

from enum import StrEnum


class RoleKey(StrEnum):
    """Roles del catálogo (§3.2). MVP activa NORMAL_USER y SUPER_ADMIN."""

    NORMAL_USER = "normal_user"
    ACCOUNTANT = "accountant"      # fase 2
    COMMERCIAL = "commercial"      # fase 3
    INFLUENCER = "influencer"      # fase 4
    SUPER_ADMIN = "super_admin"


class CapabilityKey(StrEnum):
    """Capabilities (funcionalidades). Aditivas por rol (ADR 4)."""

    # Usuario Normal — MVP
    WALLET = "wallet"
    SAVINGS = "savings"
    BUDGET = "budget"
    SHOPPING_LIST = "shopping_list"
    CHAT = "chat"
    NEWS_READ = "news_read"
    # Usuario Normal — extras de fase (gateables por mercado)
    CARD = "card"                  # fase 5
    REMITTANCE = "remittance"      # fase 5
    # Super Admin
    ADMIN_NEWS_PUBLISH = "admin_news_publish"
    ADMIN_DB = "admin_db"
