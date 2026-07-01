"""Unit — GeneralAgent (conversación) con un modelo FALSO (sin LLM, sin DB).

Prueba lo determinista: que el prompt inyecta el IDIOMA y la PERSONALIDAD correctos
(Neutro/Coach/Roast, estilo Cleo §6), que `run` devuelve la respuesta del LLM sin
`pending_action` (no escribe, no HITL), que el default es COACH y que `commit` es no-op.
El comportamiento real del LLM se prueba en integración.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.contexts.aispace.agents.general.agent import GeneralAgent
from src.contexts.aispace.preferences.enums import Personality


class FakeModel:
    """Captura los mensajes con los que se le invoca; devuelve una respuesta fija."""

    def __init__(self, reply: str = "¡Hola! ¿Cómo va tu dinero hoy?") -> None:
        self.reply = reply
        self.seen: list | None = None

    def invoke(self, messages, *args, **kwargs):  # type: ignore[no-untyped-def]
        self.seen = messages
        return AIMessage(self.reply)


def _state(text: str = "hola", *, personality=None, language: str = "es") -> dict:
    s: dict = {
        "messages": [HumanMessage(text)],
        "user_id": "u1",
        "capabilities": [],
        "language": language,
    }
    if personality is not None:
        s["personality"] = personality
    return s


def _system_for(personality) -> str:  # type: ignore[no-untyped-def]
    model = FakeModel()
    GeneralAgent(model=model).run(_state(personality=personality))
    assert model.seen is not None
    assert isinstance(model.seen[0], SystemMessage)
    return model.seen[0].content.lower()


def test_run_returns_llm_reply_without_pending_action() -> None:
    model = FakeModel()
    out = GeneralAgent(model=model).run(_state(personality=Personality.COACH))
    assert out["pending_action"] is None                       # no escribe → sin HITL
    assert isinstance(out["messages"][-1], AIMessage)
    assert out["messages"][-1].content == model.reply


def test_run_injects_language_into_prompt() -> None:
    model = FakeModel()
    GeneralAgent(model=model).run(_state(personality=Personality.COACH, language="en"))
    assert model.seen is not None
    assert isinstance(model.seen[0], SystemMessage)
    assert "English" in model.seen[0].content


def test_coach_personality_in_prompt() -> None:
    system = _system_for(Personality.COACH)
    assert "coach" in system or "motivat" in system


def test_roast_personality_in_prompt() -> None:
    system = _system_for(Personality.ROAST)
    assert "roast" in system or "sarcas" in system


def test_neutral_personality_in_prompt() -> None:
    system = _system_for(Personality.NEUTRAL)
    assert "no jokes" in system or "no sarcasm" in system


def test_defaults_to_coach_when_personality_missing() -> None:
    model = FakeModel()
    GeneralAgent(model=model).run(_state())  # sin personality en el estado
    assert model.seen is not None
    content = model.seen[0].content.lower()
    assert "coach" in content or "motivat" in content


def test_run_passes_conversation_history_after_system_prompt() -> None:
    model = FakeModel()
    GeneralAgent(model=model).run(_state("buenas", personality=Personality.NEUTRAL))
    assert model.seen is not None
    assert isinstance(model.seen[0], SystemMessage)
    assert any(isinstance(m, HumanMessage) and m.content == "buenas" for m in model.seen)


def test_commit_is_noop() -> None:
    assert GeneralAgent(model=FakeModel()).commit(_state()) == ""


def test_intents_declares_general() -> None:
    assert GeneralAgent(model=FakeModel()).intents == ("general",)
