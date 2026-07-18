"""Pone la canasta curada en MODO PILOTO: activa SOLO las 5 queries de arroz+legumbre del piloto de
Fase 2 (scope = Opción A) y desactiva el resto. Idempotente y REVERSIBLE.

Uso:
    cd apps/api && uv run python -m seeds.save_basket_pilot            # entra en modo piloto (5 activas)
    cd apps/api && uv run python -m seeds.save_basket_pilot --restore  # reactiva TODA la canasta (213)

Por qué existe: el acotado del piloto vivía SOLO en los flags `active` del DB de dev — un re-seed de
la canasta (todas `active`) lo perdía en silencio. Esto lo vuelve reproducible y committeado: se
corre después de sembrar para dejar la canasta en el scope del piloto. No es destructivo (soft
toggle del flag `active`; las 213 queries siguen en la tabla).

Las 5 cubren ~43/50 canónicos del catálogo (todos arroz+legumbre). Si el piloto se ensancha o se
cierra (Opción B: supermercado completo), `--restore` deja la canasta full de vuelta.
"""
from __future__ import annotations

import sys

from sqlalchemy import text

# Las 5 del piloto (medidas 2026-07-16/18). Constante para que un typo se vea en el diff/import.
PILOT_QUERIES: tuple[str, ...] = (
    "arroz selecto",
    "arroz la garza",
    "guandules verdes",
    "habichuelas pintas",
    "habichuelas rojas la famosa",
)


def main() -> None:
    from ingestion.save.sources import SAVE_MARKET
    from src.shared.db.base import SessionLocal

    restore = "--restore" in sys.argv
    with SessionLocal() as s:
        if restore:
            s.execute(
                text("UPDATE save.basket_query SET active = true WHERE market_id = :m"),
                {"m": SAVE_MARKET},
            )
            s.commit()
            n = s.execute(
                text("SELECT count(*) FROM save.basket_query WHERE market_id = :m AND active"),
                {"m": SAVE_MARKET},
            ).scalar()
            print(f"canasta RESTAURADA: {n} queries activas (piloto desactivado).")
            return

        # Sanity: las 5 existen exactamente — un rename en la canasta dejaría el piloto vacío en silencio.
        found = {
            r.query_text
            for r in s.execute(
                text(
                    "SELECT query_text FROM save.basket_query "
                    "WHERE market_id = :m AND query_text = ANY(:q)"
                ),
                {"m": SAVE_MARKET, "q": list(PILOT_QUERIES)},
            )
        }
        missing = set(PILOT_QUERIES) - found
        if missing:
            print(f"ABORTAR: estas queries del piloto no están en la canasta: {sorted(missing)}")
            print("(¿se re-sembró la canasta con otros textos? revisá antes de forzar el piloto)")
            return

        s.execute(
            text(
                "UPDATE save.basket_query SET active = (query_text = ANY(:q)) WHERE market_id = :m"
            ),
            {"m": SAVE_MARKET, "q": list(PILOT_QUERIES)},
        )
        s.commit()
        active = [
            r.query_text
            for r in s.execute(
                text(
                    "SELECT query_text FROM save.basket_query "
                    "WHERE market_id = :m AND active ORDER BY query_text"
                ),
                {"m": SAVE_MARKET},
            )
        ]
        print(f"canasta en MODO PILOTO: {len(active)} activas (arroz+legumbre):")
        for q in active:
            print(f"  ✓ {q}")


if __name__ == "__main__":
    main()
