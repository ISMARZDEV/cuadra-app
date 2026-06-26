"""Use case de ESCRITURA: registrar una transacción (§5.2, §12·B/§12·C).

Orquesta la única vía válida de mover dinero: valida las cuentas (existen, son del
usuario, comparten moneda), persiste la transacción y postea su asiento balanceado.
Idempotente por `idempotency_key` (§12·C): un reenvío del sync NO duplica el movimiento.
La `Session` (UoW) hace commit/rollback fuera de aquí (composition_root).
"""
from __future__ import annotations

from src.contexts.insights.domain.entities import Transaction
from src.contexts.insights.domain.ports import (
    AccountRepository,
    LedgerRepository,
    TransactionRepository,
)

from .errors import (
    AccountNotFoundError,
    CrossUserAccountError,
    TransactionCurrencyError,
)


class RecordTransaction:
    def __init__(
        self,
        accounts: AccountRepository,
        transactions: TransactionRepository,
        ledger: LedgerRepository,
    ) -> None:
        self._accounts = accounts
        self._transactions = transactions
        self._ledger = ledger

    def execute(self, tx: Transaction) -> Transaction:
        # 1) Idempotencia (§12·C): si ya se registró con esa llave, devolver la existente.
        if tx.idempotency_key:
            existing = self._transactions.get_by_idempotency_key(
                tx.user_id, tx.idempotency_key
            )
            if existing is not None:
                return existing

        # 2) Las cuentas deben existir.
        account = self._accounts.get_by_id(tx.account_id)
        counter = self._accounts.get_by_id(tx.counter_account_id)
        if account is None or counter is None:
            raise AccountNotFoundError(
                f"Cuenta inexistente: {tx.account_id} / {tx.counter_account_id}"
            )

        # 3) RBAC mínimo privilegio (§12.1): ambas cuentas son del MISMO usuario.
        if account.user_id != tx.user_id or counter.user_id != tx.user_id:
            raise CrossUserAccountError(
                "Una cuenta de la transacción pertenece a otro usuario"
            )

        # 4) MVP single-currency: monto y cuentas comparten moneda (FX diferido).
        if account.currency != tx.amount.currency or counter.currency != tx.amount.currency:
            raise TransactionCurrencyError(
                f"Moneda del monto ({tx.amount.currency.code}) no calza con las cuentas"
            )

        # 5) Persistir la transacción y postear su asiento balanceado.
        self._transactions.add(tx)
        self._ledger.post(tx.to_journal_entry(), tx.user_id, tx.id)
        return tx
