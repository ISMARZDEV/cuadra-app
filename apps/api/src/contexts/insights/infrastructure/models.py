"""SQLAlchemy models de Insights — schema 'insights' (ADR 33). Solo infra (ADR 31).

NORMALIZACIÓN (3NF salvo value-objects monetarios):
- `merchant` en su propia tabla (no inline en transaction) → evita anomalías de update.
- `posting` NO guarda currency (se deriva de `account`; era dependencia transitiva).
- umbrales de budget en `budget_alert_threshold` (1NF, no array).
- Space↔Account como M:N pura (`space_account`).
- `transaction.amount`/`*.amount` guardan (amount_minor, currency) = value-object `Money` atómico.

`user_id` es cross-context (identity) → referencia por ID, SIN FK (ADR 33). FKs SOLO
intra-contexto. Dinero en BIGINT (§12·B). El saldo se DERIVA de `posting`, no se almacena.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.shared.db.base import Base

_SCHEMA = "insights"


class MerchantModel(Base):
    """Comercio normalizado (§5.6). Único por (user_id, name) → sin repetir logo/nombre."""

    __tablename__ = "merchant"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_merchant_user_name"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(Text)


class AccountModel(Base):
    """Cuenta del ledger: wallet (asset/liability), categoría (income/expense) o equity."""

    __tablename__ = "account"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)  # cross-context, sin FK
    type: Mapped[str] = mapped_column(Text, nullable=False)   # asset|liability|income|expense|equity
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)  # ISO 4217
    name: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str | None] = mapped_column(Text)            # emoji/ícono (categorías en la rueda)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TransactionModel(Base):
    """Movimiento del usuario (§5.2). Genera un `journal_entry` balanceado."""

    __tablename__ = "transaction"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_transaction_idempotency_key"),
        Index("ix_transaction_user_occurred", "user_id", "occurred_at"),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)   # income|expense|transfer
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)  # magnitud (>0)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)         # parte del Money del monto
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.account.id"), nullable=False
    )
    counter_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.account.id"), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="manual")
    idempotency_key: Mapped[str | None] = mapped_column(Text)   # anti-duplicado (§12·C)
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.merchant.id")
    )  # normalizado (§5.6)
    note: Mapped[str | None] = mapped_column(Text)
    essential: Mapped[bool | None] = mapped_column(Boolean)     # enrichment §5.6
    recurring: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class JournalEntryModel(Base):
    """Asiento de doble entrada. Agrupa postings balanceados (§12·B)."""

    __tablename__ = "journal_entry"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.transaction.id", ondelete="CASCADE")
    )  # nullable: el saldo de apertura (equity) no tiene transacción
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PostingModel(Base):
    """Una pata del asiento: cuenta + monto con signo (DR +, CR −). §12·B.

    NO guarda currency: se deriva de `account` (era dependencia transitiva · 3NF).
    """

    __tablename__ = "posting"
    __table_args__ = (
        Index("ix_posting_account", "account_id"),  # hot-path del saldo (§12·B)
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    journal_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("insights.journal_entry.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.account.id"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BudgetModel(Base):
    """Presupuesto por categoría/comercio + umbrales (en tabla aparte · 1NF)."""

    __tablename__ = "budget"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    category_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.account.id"), nullable=False
    )
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.merchant.id")
    )
    limit_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    period: Mapped[str] = mapped_column(Text, nullable=False)   # daily|weekly|monthly|quarterly
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BudgetAlertThresholdModel(Base):
    """Umbral de alerta de un budget (70/85/100). Normaliza el multivaluado (1NF)."""

    __tablename__ = "budget_alert_threshold"
    __table_args__ = {"schema": _SCHEMA}

    budget_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("insights.budget.id", ondelete="CASCADE"),
        primary_key=True,
    )
    percent: Mapped[int] = mapped_column(SmallInteger, primary_key=True)


class SpaceModel(Base):
    """Sobre/proyecto que agrupa cuentas (wallets + categorías)."""

    __tablename__ = "space"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SpaceAccountModel(Base):
    """Membresía Space↔Account (M:N normalizada)."""

    __tablename__ = "space_account"
    __table_args__ = {"schema": _SCHEMA}

    space_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("insights.space.id", ondelete="CASCADE"),
        primary_key=True,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("insights.account.id", ondelete="CASCADE"),
        primary_key=True,
    )


class SavingsGoalModel(Base):
    """Meta de ahorro (alcancía). `account_id` opcional liga una wallet de ahorro."""

    __tablename__ = "savings_goal"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    target_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.account.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RecurringRuleModel(Base):
    """Plantilla recurrente/suscripción (gap aprobado). Genera transacciones."""

    __tablename__ = "recurring_rule"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.account.id"), nullable=False
    )
    counter_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.account.id"), nullable=False
    )
    cadence: Mapped[str] = mapped_column(Text, nullable=False)   # daily|weekly|monthly|yearly
    next_run: Mapped[date] = mapped_column(Date, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insights.merchant.id")
    )
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
