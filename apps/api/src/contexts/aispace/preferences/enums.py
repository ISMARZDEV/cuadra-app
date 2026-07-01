"""Preferencias de AISpace — la PERSONALIDAD del copiloto (configurable, estilo Cleo §6).

`Personality` es un set CERRADO de tonos que el usuario elige (como los modos Roast/Hype de
Cleo). Es una preferencia de AISpace (cómo te habla el agente), NO de identity (quién eres) →
vive en el contexto `aispace`. El default es COACH: cálido y con carácter, pero sin el sarcasmo
del Roast (más seguro para un público financieramente estresado · cleo-analisis §9/§10).
"""
from __future__ import annotations

from enum import StrEnum


class Personality(StrEnum):
    """Tonos seleccionables del GeneralAgent. La `key` es el identificador estable (ADR 32)."""

    NEUTRAL = "neutral"   # 😐 claro, cálido, profesional; sin chistes ni emoji
    COACH = "coach"       # 🎉 motivador, celebra logros, te empuja a tus metas (DEFAULT)
    ROAST = "roast"       # 🔥 sarcasmo amigable; "roastea" gastos absurdos, sin ser cruel


DEFAULT_PERSONALITY = Personality.COACH
