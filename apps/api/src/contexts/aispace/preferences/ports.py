"""Puerto de persistencia de las preferencias de AISpace (hexagonal · ADR 24/31).

El dominio define el contrato; la infraestructura (SqlPreferenceRepository) lo implementa.
`get_personality` SIEMPRE devuelve un valor (default COACH si el usuario no eligió) — quien
llama no maneja "ausente". El user se referencia por ID (sin FK cross-context con identity).
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from .enums import Personality


@runtime_checkable
class PreferenceRepository(Protocol):
    def get_personality(self, user_id: str) -> Personality: ...
    def set_personality(self, user_id: str, personality: Personality) -> None: ...
