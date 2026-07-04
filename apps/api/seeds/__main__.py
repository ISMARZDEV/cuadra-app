"""Entry point del seed: `python -m seeds` (§11).

Orquesta los seeds idempotentes por contexto. Se amplía contexto a contexto.
"""
from __future__ import annotations


def main() -> None:
    from seeds.identity_seed import seed_identity
    from seeds.save_seed import seed_save
    from src.shared.db.base import SessionLocal

    with SessionLocal() as session:
        seed_identity(session)
        seed_save(session)
        session.commit()
    print("seed: identity + save OK (idempotente).")


if __name__ == "__main__":
    main()
