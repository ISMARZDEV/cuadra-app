# shared/llm — LLMPort (proveedor intercambiable)

Los agentes hablan con un **puerto** (`LLMPort`), no con un SDK concreto (§7.8). El proveedor se
elige por config (`LLM_PROVIDER`) → cambiar de proveedor **no toca los agentes**.

- **Default de prod:** Claude (Haiku/Sonnet/Opus por tarea · ADR 8 · validado en §12·D).
- **Dev / alterno:** OpenAI u otro (`LLM_PROVIDER=openai` + `OPENAI_API_KEY`).
- **Implementación:** adapter sobre `init_chat_model("anthropic:claude-..." | "openai:gpt-...")`
  (LangChain) → misma interfaz para ambos.

> **Provider-específico vive en el adapter, no en el agente:** prompt caching (Anthropic) y la visión
> OCR (§9) son optimizaciones del adaptador. En dev con GPT no aplican igual; prod-on-Claude las
> restaura. La lógica agéntica se mantiene **provider-agnostic** detrás del puerto.
