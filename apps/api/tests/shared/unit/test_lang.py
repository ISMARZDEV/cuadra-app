"""Unit — resolución de idioma (locale cliente primario + override por-mensaje confiado).

Patrón de producción (investigado): el locale del cliente es la señal PRIMARIA (fiable);
la detección por-mensaje solo hace OVERRIDE cuando el usuario claramente escribe en otro
idioma. Acotado a es/en/pt (lingua es preciso en texto corto dentro de un set chico).
"""
from __future__ import annotations

from src.shared.lang import language_name, resolve_language


def test_matches_client_locale_when_user_writes_same_language() -> None:
    assert resolve_language("gasté quinientos pesos en gasolina hoy", "es") == "es"
    assert resolve_language("I spent fifty dollars on gasoline today", "en") == "en"


def test_confident_switch_overrides_client_locale() -> None:
    # app en español pero el usuario escribe claramente en inglés → sigue al usuario
    assert resolve_language("I spent fifty dollars on gasoline today", "es") == "en"
    # app en inglés pero el usuario escribe en español
    assert resolve_language("gasté quinientos pesos en gasolina hoy", "en") == "es"


def test_ambiguous_short_message_keeps_client_locale() -> None:
    # "registra 200" es ambiguo es/pt → NO override, gana el locale del cliente
    assert resolve_language("registra 200", "es") == "es"


def test_no_client_locale_uses_detection() -> None:
    assert resolve_language("hola amigo, cómo estás", None) in ("es",)
    assert resolve_language("hello friend how are you", None) in ("en",)


def test_empty_or_unknown_falls_back() -> None:
    assert resolve_language("", "en") == "en"          # sin texto → locale cliente
    assert resolve_language("123 456", None) == "es"   # sin señal → default es


def test_language_name_for_prompt() -> None:
    assert language_name("en") == "English"
    assert language_name("es") == "español"
    assert language_name("pt") == "português"
    assert language_name("xx") == "español"            # desconocido → default
