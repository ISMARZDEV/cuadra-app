"""Smoke test — el backend levanta y /v1/health responde (ADR 23)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_health_ok() -> None:
    res = client.get("/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
