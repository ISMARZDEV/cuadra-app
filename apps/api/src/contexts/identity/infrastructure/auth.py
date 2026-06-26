"""Adapter de autenticación — verifica el JWT (firma) y devuelve sus claims.

El JWT lo emite el proveedor (Supabase/Clerk tras el OAuth Google/Apple/password).
Aquí solo se valida la firma y se leen los claims. NUNCA se guardan password ni token.
El mapeo (provider, subject) → user vía `auth_identity` es el flujo de login (otra tarea).
Para el MVP el claim `sub` lleva nuestro `user_id`.
"""
from __future__ import annotations

import jwt

from src.config import settings


class InvalidToken(Exception):
    pass


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:  # firma inválida, expirado, etc.
        raise InvalidToken(str(exc)) from exc


def encode_token(claims: dict) -> str:
    """Firma un JWT con los claims dados (HS256). SOLO para dev (el dev-login lo usa); en
    producción lo emite el proveedor externo (§E.2)."""
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)
