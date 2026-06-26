"""Generación de identificadores (UUID v4 como string). Kernel transversal.

Inyectable en los use cases (`id_factory`) para tests deterministas.
"""
from __future__ import annotations

import uuid


def new_id() -> str:
    return str(uuid.uuid4())
