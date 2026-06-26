"""Value objects de identity — inmutables y autovalidados (encapsulan invariantes).

Encapsulación al estilo Python: `frozen=True` (inmutable) + validación en
`__post_init__`. No hay `private` real; la garantía es que un VO mal formado
no puede existir (lanza en construcción).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True, slots=True)
class Email:
    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().lower()
        if not _EMAIL_RE.match(normalized):
            raise ValueError(f"Email inválido: {self.value!r}")
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True, slots=True)
class MarketId:
    """Jurisdicción ISO 3166-1 alpha-2 ('DO', 'US', 'CO'). §3·B."""

    value: str

    def __post_init__(self) -> None:
        normalized = self.value.strip().upper()
        if len(normalized) != 2 or not normalized.isalpha():
            raise ValueError(f"MarketId inválido (ISO alpha-2): {self.value!r}")
        object.__setattr__(self, "value", normalized)

    def __str__(self) -> str:
        return self.value
