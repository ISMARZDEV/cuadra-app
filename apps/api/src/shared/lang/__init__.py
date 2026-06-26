"""Resolución de idioma — locale del cliente (primario) + detección por-mensaje (override).

Patrón de producción para chat multilenguaje (investigado): NO se confía solo en detectar
ni solo en el locale de la app. El locale del cliente (del dispositivo) es la señal PRIMARIA;
la detección por-mensaje (lingua, acotado a es/en/pt → preciso en texto corto) solo OVERRIDE
cuando el usuario claramente escribe en otro idioma (confianza alta). Detrás de este módulo
(swappable) si algún día se cambia el detector o se suman idiomas.
"""
from __future__ import annotations

from lingua import Language, LanguageDetectorBuilder

SUPPORTED = ("es", "en", "pt")
DEFAULT = "es"
# Calibrado con lingua (es/en/pt): texto claro da 0.78-0.98; ambiguo corto < 0.5.
_OVERRIDE_CONFIDENCE = 0.70   # creerle al usuario por encima del locale del cliente
_DETECT_CONFIDENCE = 0.60     # cuando NO hay locale del cliente

_LANG_NAMES = {"es": "español", "en": "English", "pt": "português"}

# Detector acotado al set soportado → más preciso en mensajes cortos. Singleton de módulo.
_detector = (
    LanguageDetectorBuilder.from_languages(
        Language.SPANISH, Language.ENGLISH, Language.PORTUGUESE
    ).build()
)


def language_name(code: str) -> str:
    """Nombre del idioma para inyectar en el prompt ('English', 'español', 'português')."""
    return _LANG_NAMES.get((code or "")[:2].lower(), _LANG_NAMES[DEFAULT])


def resolve_language(text: str, client_locale: str | None = None) -> str:
    """Idioma de respuesta. Cliente = primario; detección confiada hace override."""
    client = (client_locale or "")[:2].lower()
    client = client if client in SUPPORTED else None

    values = _detector.compute_language_confidence_values(text or "")
    top = values[0] if values else None
    detected = top.language.iso_code_639_1.name.lower() if top else None
    confidence = top.value if top else 0.0

    if client is not None:
        if detected and detected != client and confidence >= _OVERRIDE_CONFIDENCE:
            return detected         # el usuario claramente escribió en otro idioma
        return client               # por defecto, el locale del cliente
    if detected and confidence >= _DETECT_CONFIDENCE:
        return detected
    return DEFAULT
