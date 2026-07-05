"""Unit — ResolveUserFromClaims (JIT provisioning · §12·E E.2).

Dado un token YA verificado (VerifiedClaims), resuelve nuestro `user_id`:
- identidad (provider, subject) conocida → devuelve su user (sin crear nada).
- desconocida → aprovisiona JIT: crea un `normal_user` (mercado DO) + vincula la identidad.
Idempotente: el segundo login del mismo subject NO crea un segundo usuario.

Fakes puros que implementan los puertos — sin DB. La verificación de firma (JWKS/RS256)
es de infraestructura y se prueba aparte; aquí el token ya viene verificado.
"""
from __future__ import annotations

from src.contexts.identity.application.authentication import ResolveUserFromClaims
from src.contexts.identity.domain.entities import AuthIdentity
from src.contexts.identity.domain.enums import AuthProvider, RoleKey
from src.contexts.identity.domain.value_objects import VerifiedClaims


class FakeUserRepo:
    def __init__(self) -> None:
        self.created: list[dict] = []

    def create(
        self, *, email, name, home_market, current_market, role
    ) -> str:  # type: ignore[no-untyped-def]
        user_id = f"user-{len(self.created) + 1}"
        self.created.append(
            {
                "id": user_id,
                "email": email,
                "name": name,
                "home_market": home_market,
                "current_market": current_market,
                "role": role,
            }
        )
        return user_id


class FakeAuthIdentityRepo:
    def __init__(self) -> None:
        self._by_key: dict[tuple[str, str], AuthIdentity] = {}
        self.linked: list[dict] = []

    def get_by_provider_subject(self, provider: str, subject: str) -> AuthIdentity | None:
        return self._by_key.get((provider, subject))

    def link(self, *, user_id, provider, subject, email) -> None:  # type: ignore[no-untyped-def]
        self._by_key[(provider, subject)] = AuthIdentity(
            user_id=user_id, provider=AuthProvider(provider), subject=subject, email=email
        )
        self.linked.append(
            {"user_id": user_id, "provider": provider, "subject": subject, "email": email}
        )


def _claims(**overrides) -> VerifiedClaims:  # type: ignore[no-untyped-def]
    base = dict(
        provider=AuthProvider.CLERK,
        subject="user_2clerk",
        email="ada@example.com",
        name="Ada",
    )
    base.update(overrides)
    return VerifiedClaims(**base)


def test_returns_existing_user_when_identity_known() -> None:
    users, identities = FakeUserRepo(), FakeAuthIdentityRepo()
    identities.link(
        user_id="user-existing", provider="clerk", subject="user_2clerk", email="ada@example.com"
    )

    user_id = ResolveUserFromClaims(users, identities).execute(_claims())

    assert user_id == "user-existing"
    assert users.created == []  # no aprovisiona


def test_provisions_new_user_when_identity_unknown() -> None:
    users, identities = FakeUserRepo(), FakeAuthIdentityRepo()

    user_id = ResolveUserFromClaims(users, identities).execute(_claims())

    assert user_id == "user-1"
    assert len(users.created) == 1
    created = users.created[0]
    assert created["email"] == "ada@example.com"
    assert created["name"] == "Ada"
    assert created["home_market"] == "DO"
    assert created["current_market"] == "DO"
    assert created["role"] == RoleKey.NORMAL_USER
    # y vincula la identidad (provider, subject) → user nuevo
    assert identities.linked == [
        {
            "user_id": "user-1",
            "provider": "clerk",
            "subject": "user_2clerk",
            "email": "ada@example.com",
        }
    ]


def test_provisioning_is_idempotent() -> None:
    users, identities = FakeUserRepo(), FakeAuthIdentityRepo()
    use_case = ResolveUserFromClaims(users, identities)

    first = use_case.execute(_claims())
    second = use_case.execute(_claims())

    assert first == second
    assert len(users.created) == 1  # un solo usuario


def test_handles_missing_email_apple_hide_my_email() -> None:
    users, identities = FakeUserRepo(), FakeAuthIdentityRepo()

    user_id = ResolveUserFromClaims(users, identities).execute(
        _claims(email=None, name=None, subject="user_apple")
    )

    assert user_id == "user-1"
    assert users.created[0]["email"] is None
    assert users.created[0]["name"] == "Usuario"  # fallback cuando no hay email ni nombre


def test_derives_name_from_email_when_name_missing() -> None:
    users, identities = FakeUserRepo(), FakeAuthIdentityRepo()

    ResolveUserFromClaims(users, identities).execute(_claims(name=None))

    assert users.created[0]["name"] == "ada"  # local-part del email
