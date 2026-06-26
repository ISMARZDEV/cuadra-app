"""Vuelca el OpenAPI del backend a stdout → alimenta packages/api-client (ADR 24, §4).

Uso:  python -m src.openapi_dump > openapi.json
"""
from __future__ import annotations

import json

from src.main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), ensure_ascii=False, indent=2))
