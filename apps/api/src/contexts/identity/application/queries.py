"""Use cases de LECTURA de identity (CQRS-read). Sin efectos secundarios."""
from __future__ import annotations

from src.contexts.identity.domain.ports import CapabilityGatingRepository, UserRepository
from src.contexts.identity.domain.services import CapabilityResolver

from .dtos import MeResponse
from .mappers import me_response


class GetMe:
    """Devuelve el usuario actual + sus capabilities EFECTIVAS (rol × mercado)."""

    def __init__(self, users: UserRepository, gating: CapabilityGatingRepository) -> None:
        self._users = users
        self._gating = gating

    def execute(self, user_id: str) -> MeResponse | None:
        user = self._users.get_by_id(user_id)
        if user is None:
            return None
        market_gating = self._gating.gating_for_market(str(user.current_market))
        effective = CapabilityResolver.resolve(user.roles, market_gating)
        return me_response(user, effective)
