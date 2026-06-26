"""`Posting` y `JournalEntry` — el asiento de doble entrada (§12·B, ADR 14).

INVARIANTE DE HIERRO: cada `JournalEntry` tiene ≥2 `Posting` y **`Σ amount = 0` POR
MONEDA**. Se valida en construcción → un asiento desbalanceado no puede existir.
Un asiento que toca dos monedas y no cuadra en cada una (conversión FX) es rechazado:
el FX requiere cuenta de cambio + tasa fechada (ver docs/sdd/insights-ledger.md §5).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from src.shared.money import Money


class LedgerError(ValueError):
    """Error de invariante del ledger."""


class UnbalancedEntryError(LedgerError):
    """`Σ postings ≠ 0` en alguna moneda del asiento."""


@dataclass(frozen=True, slots=True)
class Posting:
    """Una pata del asiento: una cuenta recibe un `Money` con signo (DR +, CR −)."""

    account_id: str
    amount: Money


@dataclass(frozen=True, slots=True)
class JournalEntry:
    id: str
    date: date
    description: str
    postings: tuple[Posting, ...]

    def __post_init__(self) -> None:
        postings = tuple(self.postings)
        object.__setattr__(self, "postings", postings)

        if len(postings) < 2:
            raise LedgerError(
                f"JournalEntry requiere ≥2 postings, tiene {len(postings)}"
            )

        sums: dict[str, int] = {}
        for posting in postings:
            code = posting.amount.currency.code
            sums[code] = sums.get(code, 0) + posting.amount.amount_minor

        unbalanced = {code: total for code, total in sums.items() if total != 0}
        if unbalanced:
            raise UnbalancedEntryError(
                f"Σ postings ≠ 0 por moneda: {unbalanced}"
            )
