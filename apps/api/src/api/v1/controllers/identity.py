"""Identity controller — HTTP boundary del contexto identity (prefijo `/identity`).

Thin (SRP): parsea el request, delega en el use case, devuelve el DTO. La autorización
y el user_id salen de las dependencias de `extensions/security`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.api.composition_root import get_get_me, get_session
from src.api.extensions.security import get_current_user_id
from src.api.problem_detail import ProblemDetailDto
from src.config import settings
from src.contexts.identity.application.dtos import MeResponse
from src.contexts.identity.application.queries import GetMe
from src.contexts.identity.infrastructure.auth import encode_token
from src.contexts.identity.infrastructure.models import RoleModel, UserModel, UserRoleModel
from src.contexts.identity.infrastructure.repositories import SqlUserRepository

router = APIRouter(prefix="/identity", tags=["identity"])


@router.get(
    "/me",
    response_model=MeResponse,
    summary="Usuario actual + capabilities efectivas",
    description="Devuelve el usuario del JWT y sus capabilities efectivas (rol × current_market).",
    responses={
        401: {"model": ProblemDetailDto, "description": "Token ausente o inválido"},
        404: {"model": ProblemDetailDto, "description": "Usuario no encontrado"},
    },
)
def get_me(
    user_id: str = Depends(get_current_user_id),
    use_case: GetMe = Depends(get_get_me),
) -> MeResponse:
    result = use_case.execute(user_id)
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    return result


class DevLoginRequest(BaseModel):
    email: str
    # Solo-dev: pedir un rol para el usuario (p.ej. "super_admin" para VER el admin localmente sin
    # sembrar uno a mano). None = solo el normal_user base. Un rol inexistente → 422 (nunca 500).
    role: str | None = None


class DevLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str


def _get_or_create_dev_user(session: Session, email: str) -> str:
    """get-or-create de un usuario dev por email (DO/normal_user). SOLO dev."""
    existing = SqlUserRepository(session).get_by_email(email)
    if existing is not None:
        return existing.id
    user = UserModel(
        email=email.strip().lower(), name=email.split("@")[0],
        home_market_id="DO", current_market_id="DO",
    )
    session.add(user)
    session.flush()  # asigna user.id
    session.add(UserRoleModel(user_id=user.id, role_key="normal_user"))
    session.flush()
    return str(user.id)


def _grant_role(session: Session, user_id: str, role_key: str) -> None:
    """Asigna un rol al usuario dev (idempotente). Valida contra los roles existentes → 422 si el
    rol no existe (nunca un 500 por FK). SOLO dev."""
    if session.get(RoleModel, role_key) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Rol desconocido: {role_key!r}"
        )
    exists = (
        session.query(UserRoleModel)
        .filter_by(user_id=user_id, role_key=role_key)
        .first()
    )
    if exists is None:
        session.add(UserRoleModel(user_id=user_id, role_key=role_key))
        session.flush()


@router.post(
    "/dev-login",
    response_model=DevLoginResponse,
    summary="[DEV] Emite un JWT de un usuario sembrado (solo en dev)",
    description="Desbloquea el cliente sin IdP externo. En producción → 404 (el token lo emite el IdP, §E.2).",
    responses={404: {"model": ProblemDetailDto, "description": "No disponible fuera de dev"}},
)
def dev_login(
    body: DevLoginRequest,
    session: Session = Depends(get_session),
) -> DevLoginResponse:
    if settings.app_env != "dev":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    # 10.C: sembrar la data de referencia (roles/capabilities) es IDEMPOTENTE y barato. Garantiza
    # que asignar role_key='normal_user' no viole el FK en un entorno FRESCO — la causa del 500
    # histórico. dev-login "desbloquea el cliente sin IdP", así que debe funcionar sin un paso manual.
    from seeds.identity_seed import seed_identity

    seed_identity(session)
    user_id = _get_or_create_dev_user(session, body.email)
    if body.role is not None:
        _grant_role(session, user_id, body.role)  # 10.B: acceso admin local (p.ej. super_admin)
    return DevLoginResponse(access_token=encode_token({"sub": user_id}), user_id=user_id)
