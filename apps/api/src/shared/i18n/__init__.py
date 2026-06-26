"""Catálogo i18n de strings DETERMINISTAS (no generados por el LLM).

Best practice de chat multilenguaje (investigado): el texto fijo de UI vive en un catálogo
por locale — un prompt NO puede localizar un string hardcodeado en código. Cubre las
confirmaciones, cancelaciones y respuestas canned del orquestador. El texto que SÍ genera el
LLM se localiza por el prompt (idioma inyectado), no aquí.
"""
from __future__ import annotations

DEFAULT = "es"

_CATALOG: dict[str, dict[str, str]] = {
    "es": {
        "registered": "Listo, registré {display} en {category} desde {wallet}.",
        "no_wallet": "No tienes una wallet todavía. Crea una (p. ej. 'Banco') antes de registrar gastos.",
        "no_currency_wallet": "No tienes una wallet en {currency}. Crea una primero o usa otra moneda.",
        "cancelled": "Cancelado, no registré nada.",
        "other": "(AISpace) Por ahora manejo tus finanzas. Pronto más.",
        "confirm_prompt": "¿Confirmas {summary}? (sí/no)",
    },
    "en": {
        "registered": "Done — I registered {display} in {category} from {wallet}.",
        "no_wallet": "You don't have a wallet yet. Create one (e.g. 'Bank') before logging expenses.",
        "no_currency_wallet": "You don't have a {currency} wallet. Create one first or use another currency.",
        "cancelled": "Cancelled, I didn't register anything.",
        "other": "(AISpace) For now I handle your finances. More soon.",
        "confirm_prompt": "Confirm {summary}? (yes/no)",
    },
    "pt": {
        "registered": "Pronto, registrei {display} em {category} de {wallet}.",
        "no_wallet": "Você ainda não tem uma carteira. Crie uma (ex. 'Banco') antes de registrar gastos.",
        "no_currency_wallet": "Você não tem uma carteira em {currency}. Crie uma primeiro ou use outra moeda.",
        "cancelled": "Cancelado, não registrei nada.",
        "other": "(AISpace) Por enquanto cuido das suas finanças. Em breve mais.",
        "confirm_prompt": "Confirma {summary}? (sim/não)",
    },
}


def t(key: str, lang: str | None, **params: object) -> str:
    """Texto localizado para `key` en `lang` (fallback al default), interpolando `params`."""
    code = (lang or DEFAULT)[:2].lower()
    table = _CATALOG.get(code, _CATALOG[DEFAULT])
    template = table.get(key) or _CATALOG[DEFAULT][key]
    return template.format(**params) if params else template
