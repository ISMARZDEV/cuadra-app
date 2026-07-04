"""Puerto de salida para enviar push notifications (G4). La impl (Expo) vive en infra."""
from __future__ import annotations

from typing import Protocol


class PushSender(Protocol):
    def send(self, tokens: list[str], *, title: str, body: str, data: dict) -> None:
        """Envía una push a los `tokens` (best-effort; no debe romper el matching si falla)."""
        ...
