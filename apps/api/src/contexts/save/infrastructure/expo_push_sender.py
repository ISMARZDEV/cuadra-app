"""Envío de push notifications vía Expo Push API (G4). Impl del puerto `PushSender`.

Best-effort: si Expo no responde, se traga el error (el feed in-app ya quedó registrado; el push
es el 'buzz' extra). Un mensaje por token. No maneja receipts/reintentos aún (F2+).
"""
from __future__ import annotations

import logging

import httpx

_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_logger = logging.getLogger(__name__)


class ExpoPushSender:
    def send(self, tokens: list[str], *, title: str, body: str, data: dict) -> None:
        if not tokens:
            return
        messages = [
            {"to": token, "title": title, "body": body, "sound": "default", "data": data}
            for token in tokens
        ]
        try:
            httpx.post(_EXPO_PUSH_URL, json=messages, timeout=10.0)
        except httpx.HTTPError as exc:  # best-effort: no romper el matching
            _logger.warning("Expo push falló: %s", exc)
