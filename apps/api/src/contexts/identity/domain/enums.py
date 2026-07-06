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


class AuthProvider(StrEnum):
    """Proveedores de login (el JWT trae provider + subject). §12·E E.2.

    `CLERK` = el IdP (emite el token tras el social login Google/Apple, que Clerk unifica
    bajo un único `sub`). GOOGLE/APPLE/PASSWORD quedan para un mapeo por-social si algún día
    se prescinde del IdP; con Clerk la clave de login es (clerk, sub)."""

    CLERK = "clerk"
    GOOGLE = "google"
    APPLE = "apple"
    PASSWORD = "password"


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
    ADMIN_SAVE_MATCHING_REVIEW = "admin_save_matching_review"  # F2·B1: cola de revisión de matching
    ADMIN_SAVE_INGESTION_OPS = "admin_save_ingestion_ops"      # F2·B1/B3: providers/sources/basket/metrics
