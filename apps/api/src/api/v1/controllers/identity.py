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
from src.contexts.identity.infrastructure.models import UserModel, UserRoleModel
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
    user_id = _get_or_create_dev_user(session, body.email)
    return DevLoginResponse(access_token=encode_token({"sub": user_id}), user_id=user_id)
