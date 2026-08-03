"""Unit — controller de AISpace propaga `ui_actions` al cliente.

El bug real: `chat_result` devolvía la tarjeta de producto en `ui_actions`, pero `_respond`
construía un `ChatResponse` sin ese campo, así que el POST /chat/resume la descartaba en
silencio y el cliente recibía un array vacío.
"""
from __future__ import annotations

from langchain_core.messages import AIMessage

from src.api.v1.controllers.aispace import ChatResponse, _respond


class _FakeSnapshot:
    tasks: tuple = ()
    values = {
        "messages": [AIMessage("Acá está Arroz Pimco Premium 10 Lbs:")],
        "ui_actions": [
            {
                "type": "product",
                "name": "Arroz Pimco Premium 10 Lbs",
                "stores": [{"provider": "Nacional", "price": "DOP 464.95"}],
            }
        ],
    }


class _FakeGraph:
    @staticmethod
    def get_state(_cfg: dict) -> _FakeSnapshot:
        return _FakeSnapshot()


def test_respond_propagates_ui_actions() -> None:
    response = _respond("t1", _FakeGraph(), {"configurable": {"thread_id": "t1"}})

    assert isinstance(response, ChatResponse)
    assert response.ui_actions == [
        {
            "type": "product",
            "name": "Arroz Pimco Premium 10 Lbs",
            "stores": [{"provider": "Nacional", "price": "DOP 464.95"}],
        }
    ]
