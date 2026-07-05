"""Use case de autenticación — resuelve nuestro `user_id` desde un token ya verificado.

El IdP (Clerk) emite el token y `TokenVerifier` (infra) valida la firma vía JWKS y produce
`VerifiedClaims`. Aquí NO se verifica firma: se mapea (provider, subject) → usuario. Si la
identidad es conocida devuelve su usuario; si no, aprovisiona JIT (crea un `normal_user` del
mercado DO + vincula la identidad). Idempotente: el segundo login del mismo subject reusa el
usuario. RBAC/capabilities son NUESTROS (roles), no del IdP.
"""
from __future__ import annotations

from ..domain.enums import RoleKey
from ..domain.ports import AuthIdentityRepository, UserRepository
from ..domain.value_objects import VerifiedClaims

_DEFAULT_MARKET = "DO"  # F1 monopaís (§3·B); multi-país = F3
_FALLBACK_NAME = "Usuario"


class ResolveUserFromClaims:
    def __init__(
        self, users: UserRepository, identities: AuthIdentityRepository
    ) -> None:
        self._users = users
        self._identities = identities

    def execute(self, claims: VerifiedClaims) -> str:
        provider = claims.provider.value
        existing = self._identities.get_by_provider_subject(provider, claims.subject)
        if existing is not None:
            return existing.user_id
        user_id = self._users.create(
            email=claims.email,
            name=claims.name or _derive_name(claims.email),
            home_market=_DEFAULT_MARKET,
            current_market=_DEFAULT_MARKET,
            role=RoleKey.NORMAL_USER,
        )
        self._identities.link(
            user_id=user_id, provider=provider, subject=claims.subject, email=claims.email
        )
        return user_id


def _derive_name(email: str | None) -> str:
    """Nombre por defecto para el alta JIT: local-part del email, o un fallback genérico."""
    if email and "@" in email:
        return email.split("@", 1)[0]
    return _FALLBACK_NAME
