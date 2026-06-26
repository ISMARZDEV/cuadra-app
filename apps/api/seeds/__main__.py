"""Entry point del seed: `python -m seeds` (§11).

Orquesta los seeds idempotentes por contexto. Se amplía contexto a contexto.
"""
from __future__ import annotations


def main() -> None:
    from seeds.identity_seed import seed_identity
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        seed_identity(session)
        session.commit()
    print("seed: identity OK (idempotente).")


if __name__ == "__main__":
    main()
