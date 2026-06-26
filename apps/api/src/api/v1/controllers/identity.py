"""Identity controller — HTTP boundary del contexto identity (prefijo `/identity`).

Thin (SRP): parsea el request, delega en el use case, devuelve el DTO. La autorización
y el user_id salen de las dependencias de `extensions/security`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.api.composition_root import get_get_me
from src.api.extensions.security import get_current_user_id
from src.api.problem_detail import ProblemDetailDto
from src.contexts.identity.application.dtos import MeResponse
from src.contexts.identity.application.queries import GetMe

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
