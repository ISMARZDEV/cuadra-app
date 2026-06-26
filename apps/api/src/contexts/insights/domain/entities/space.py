"""`Space` — sobre/proyecto que agrupa cuentas (§5.2 + refinamiento UI), PURO.

Un Space agrupa `Account` ids — wallets Y categorías (ambas son cuentas) — para verlas
juntas (Hogar, Negocio). Inmutable: agregar/quitar devuelve un nuevo Space.
Ver insights-ui-navbar.md §3/§5 (card ② del carrusel; se le asignan wallets ya creadas).
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace


@dataclass(frozen=True, slots=True)
class Space:
    id: str
    user_id: str
    name: str
    account_ids: frozenset[str] = field(default_factory=frozenset)

    def with_account(self, account_id: str) -> Space:
        return replace(self, account_ids=self.account_ids | {account_id})

    def without_account(self, account_id: str) -> Space:
        return replace(self, account_ids=self.account_ids - {account_id})

    def contains(self, account_id: str) -> bool:
        return account_id in self.account_ids
