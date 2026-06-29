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
        "confirm.cancel": "No, cancelar 🙌",
        "confirm.approve": "Sí, confirmar 😉",
        "expense.confirm": "¿Te gustaría registrar en tu Wallet este gasto 💵🤔 de **{amount}**?",
        "expense.category_q": "¿Deseas colocarlo en alguna categoría?",
        "expense.no_category": "No, sin categoría",
        "expense.yes_please": "Sí, porfavor",
        "expense.suggestions": "Estas son mis sugerencias según tu tipo de gasto, selecciona una:",
        "expense.forget_category": "Olvídalo, sin categoría",
        "see_in_insight": "Ver en Insight",
    },
    "en": {
        "registered": "Done — I registered {display} in {category} from {wallet}.",
        "no_wallet": "You don't have a wallet yet. Create one (e.g. 'Bank') before logging expenses.",
        "no_currency_wallet": "You don't have a {currency} wallet. Create one first or use another currency.",
        "cancelled": "Cancelled, I didn't register anything.",
        "other": "(AISpace) For now I handle your finances. More soon.",
        "confirm_prompt": "Confirm {summary}? (yes/no)",
        "confirm.cancel": "No, cancel 🙌",
        "confirm.approve": "Yes, confirm 😉",
        "expense.confirm": "Want me to log this 💵🤔 **{amount}** expense in your Wallet?",
        "expense.category_q": "Want to put it in a category?",
        "expense.no_category": "No, no category",
        "expense.yes_please": "Yes, please",
        "expense.suggestions": "These are my suggestions for this kind of expense, pick one:",
        "expense.forget_category": "Forget it, no category",
        "see_in_insight": "See in Insight",
    },
    "pt": {
        "registered": "Pronto, registrei {display} em {category} de {wallet}.",
        "no_wallet": "Você ainda não tem uma carteira. Crie uma (ex. 'Banco') antes de registrar gastos.",
        "no_currency_wallet": "Você não tem uma carteira em {currency}. Crie uma primeiro ou use outra moeda.",
        "cancelled": "Cancelado, não registrei nada.",
        "other": "(AISpace) Por enquanto cuido das suas finanças. Em breve mais.",
        "confirm_prompt": "Confirma {summary}? (sim/não)",
        "confirm.cancel": "Não, cancelar 🙌",
        "confirm.approve": "Sim, confirmar 😉",
        "expense.confirm": "Quer que eu registre este gasto 💵🤔 de **{amount}** na sua Wallet?",
        "expense.category_q": "Deseja colocá-lo em alguma categoria?",
        "expense.no_category": "Não, sem categoria",
        "expense.yes_please": "Sim, por favor",
        "expense.suggestions": "Estas são minhas sugestões para este tipo de gasto, escolha uma:",
        "expense.forget_category": "Esqueça, sem categoria",
        "see_in_insight": "Ver no Insight",
    },
}


def t(key: str, lang: str | None, **params: object) -> str:
    """Texto localizado para `key` en `lang` (fallback al default), interpolando `params`."""
    code = (lang or DEFAULT)[:2].lower()
    table = _CATALOG.get(code, _CATALOG[DEFAULT])
    template = table.get(key) or _CATALOG[DEFAULT][key]
    return template.format(**params) if params else template
