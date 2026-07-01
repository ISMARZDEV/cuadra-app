"""Unit — activación de LangSmith tracing por entorno (ADR 28).

LangChain/LangGraph se auto-instrumentan SOLO si encuentran las vars en `os.environ`.
pydantic-settings lee `.env` hacia el objeto Settings, NO hacia el entorno del proceso,
así que `configure_langsmith` las exporta explícitamente cuando el tracing está activado.
"""
from __future__ import annotations

import os

from src.config import Settings
from src.observability import configure_langsmith


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "langsmith_tracing": False,
        "langsmith_api_key": "",
        "langsmith_project": "cuadra-api",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_enables_tracing_when_flag_and_key(monkeypatch) -> None:
    for var in ("LANGSMITH_TRACING", "LANGSMITH_API_KEY", "LANGSMITH_PROJECT"):
        monkeypatch.delenv(var, raising=False)

    enabled = configure_langsmith(_settings(langsmith_tracing=True, langsmith_api_key="lsv2_test"))

    assert enabled is True
    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_API_KEY"] == "lsv2_test"
    assert os.environ["LANGSMITH_PROJECT"] == "cuadra-api"


def test_disabled_when_flag_off(monkeypatch) -> None:
    for var in ("LANGSMITH_TRACING", "LANGSMITH_API_KEY"):
        monkeypatch.delenv(var, raising=False)

    enabled = configure_langsmith(_settings(langsmith_tracing=False, langsmith_api_key="lsv2_test"))

    assert enabled is False
    assert "LANGSMITH_TRACING" not in os.environ


def test_disabled_when_no_key(monkeypatch) -> None:
    for var in ("LANGSMITH_TRACING", "LANGSMITH_API_KEY"):
        monkeypatch.delenv(var, raising=False)

    enabled = configure_langsmith(_settings(langsmith_tracing=True, langsmith_api_key=""))

    assert enabled is False
    assert "LANGSMITH_TRACING" not in os.environ
