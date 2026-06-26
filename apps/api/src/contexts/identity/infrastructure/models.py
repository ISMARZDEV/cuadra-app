"""SQLAlchemy models de identity — schema 'identity' (ADR 33). Solo infraestructura (ADR 31).

El dominio NO importa de aquí; los mappers (mappers.py) traducen model ↔ entity.
Reference data (role/capability) usa la `key` como PK natural. Cross-context (market_id)
por ID, sin FK. La política de account-linking (auto vs manual) vive en application, no aquí.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CHAR, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.db.base import Base

_SCHEMA = "identity"


class UserModel(Base):
    __tablename__ = "user"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    email: Mapped[str | None] = mapped_column(Text)          # contacto (nullable; OAuth puede no darlo)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    locale: Mapped[str] = mapped_column(Text, nullable=False, server_default="es-DO")
    plan: Mapped[str] = mapped_column(Text, nullable=False, server_default="free")
    home_market_id: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    current_market_id: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AuthIdentityModel(Base):
    """Cómo inicia sesión un usuario (1 user → N). Clave de login = (provider, subject)."""

    __tablename__ = "auth_identity"
    __table_args__ = (
        UniqueConstraint("provider", "subject", name="uq_auth_identity_provider_subject"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.user.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(Text, nullable=False)   # 'google' | 'apple' | 'password'
    subject: Mapped[str] = mapped_column(Text, nullable=False)    # 'sub' estable (NUNCA password)
    email: Mapped[str | None] = mapped_column(Text)              # email de ESE provider (puede diferir)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RoleModel(Base):
    __tablename__ = "role"
    __table_args__ = {"schema": _SCHEMA}

    key: Mapped[str] = mapped_column(Text, primary_key=True)      # 'normal_user' | 'super_admin'
    name: Mapped[str] = mapped_column(Text, nullable=False)       # display: 'Usuario Normal'


class CapabilityModel(Base):
    __tablename__ = "capability"
    __table_args__ = {"schema": _SCHEMA}

    key: Mapped[str] = mapped_column(Text, primary_key=True)      # 'wallet' | 'card' | ...
    description: Mapped[str | None] = mapped_column(Text)


class UserRoleModel(Base):
    __tablename__ = "user_role"
    __table_args__ = {"schema": _SCHEMA}

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.user.id", ondelete="CASCADE"), primary_key=True
    )
    role_key: Mapped[str] = mapped_column(
        Text, ForeignKey("identity.role.key"), primary_key=True
    )


class RoleCapabilityModel(Base):
    __tablename__ = "role_capability"
    __table_args__ = {"schema": _SCHEMA}

    role_key: Mapped[str] = mapped_column(
        Text, ForeignKey("identity.role.key", ondelete="CASCADE"), primary_key=True
    )
    capability_key: Mapped[str] = mapped_column(
        Text, ForeignKey("identity.capability.key"), primary_key=True
    )


class CapabilityMarketModel(Base):
    """Gating por jurisdicción (el market_gating del CapabilityResolver)."""

    __tablename__ = "capability_market"
    __table_args__ = {"schema": _SCHEMA}

    capability_key: Mapped[str] = mapped_column(
        Text, ForeignKey("identity.capability.key", ondelete="CASCADE"), primary_key=True
    )
    market_id: Mapped[str] = mapped_column(CHAR(2), primary_key=True)   # ref. por ID (no FK)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
