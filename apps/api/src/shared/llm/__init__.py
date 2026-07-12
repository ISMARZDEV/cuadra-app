"""LLMPort — el modelo de chat detrás de un puerto (proveedor intercambiable, §7.8).

Los agentes piden `get_chat_model(tier)` y hablan con un `BaseChatModel` de LangChain;
NO conocen el SDK concreto. El proveedor (Claude prod / OpenAI dev) y el modelo se eligen
por config (`LLM_PROVIDER`). `tier`:
  - "fast"  → router + extracción (barato): Haiku / gpt-4o-mini.
  - "smart" → razonamiento del agente: Sonnet / gpt-4o.
`temperature=0` por defecto (routing/extracción determinista).
"""
from __future__ import annotations

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from src.config import settings

# provider → tier → model id (ADR 8; ids al 2026-06).
_MODELS: dict[str, dict[str, str]] = {
    "openai": {"fast": "gpt-4o-mini", "smart": "gpt-4o"},
    "anthropic": {"fast": "claude-haiku-4-5-20251001", "smart": "claude-sonnet-4-6"},
}


def get_chat_model(
    tier: str = "fast", *, temperature: float = 0.0, max_retries: int | None = None
) -> BaseChatModel:
    """`max_retries` opcional: cuántas veces el SDK reintenta ante error (429/5xx) ANTES de rendirse.
    `None` = default de la librería (agentes). Los jueces de ingesta lo pasan en 0 para que un LLM
    caído/sin cuota falle al INSTANTE (sin backoff de minutos) y el circuit-breaker corte rápido."""
    provider = settings.llm_provider
    if provider not in _MODELS:
        raise ValueError(f"LLM_PROVIDER no soportado: {provider!r}")
    model = _MODELS[provider][tier]
    api_key = settings.openai_api_key if provider == "openai" else settings.anthropic_api_key
    kwargs: dict[str, object] = {"temperature": temperature, "api_key": api_key}
    if max_retries is not None:
        kwargs["max_retries"] = max_retries
    return init_chat_model(f"{provider}:{model}", **kwargs)
