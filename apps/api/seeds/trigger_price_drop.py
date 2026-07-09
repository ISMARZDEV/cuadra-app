"""DEV trigger: dispara una alerta de bajada de precio para verla en la app (feed in-app).

Qué hace (contra el DB de DEV):
  1. Toma la primera SUSCRIPCIÓN activa de alertas en el market DO (un producto que un user sigue).
  2. Inserta una fila de precio ~15% MÁS BAJA para un store_product de ese canónico (tabla
     `save.price`, SCD-4 append-only → una "bajada" = fila nueva con value_minor < el anterior).
  3. Corre `RunAlertMatching` → detecta la bajada, la cruza con la suscripción y crea la
     notificación (idempotente). El feed in-app (`Alertas de precio → Notificaciones`) ya la muestra.

Requisito: el user debe SEGUIR algún producto (en la app: Ahorra → Alertas de precio). El push
remoto NO se dispara acá (bloqueado por Apple pago) — esto es SOLO el feed in-app.

Uso:  cd apps/api && uv run python -m seeds.trigger_price_drop  [--pct 0.15]
"""
from __future__ import annotations

import sys

from sqlalchemy import text

from src.contexts.save.application.alerts import (
    ListAlertNotifications,
    RunAlertMatching,
)
from src.contexts.save.infrastructure.repositories import (
    SqlAlertRepository,
    SqlStoreProductRepository,
)

MARKET = "DO"


def main() -> None:
    pct = 0.15
    if "--pct" in sys.argv:
        pct = float(sys.argv[sys.argv.index("--pct") + 1])

    from src.shared.db.base import SessionLocal

    with SessionLocal() as s:
        alert_repo = SqlAlertRepository(s)

        subs = alert_repo.list_active_subscriptions(MARKET)
        if not subs:
            print(
                "⚠️  No hay suscripciones activas en DO. Seguí un producto primero "
                "(app: Ahorra → Alertas de precio), y reintentá."
            )
            return

        target = subs[0].canonical_product_id
        pr = s.execute(
            text(
                """
                SELECT sp.id::text AS sp_id, p.value_minor, p.currency, p.price_type
                FROM save.store_product sp
                JOIN save.price p ON p.store_product_id = sp.id
                WHERE sp.canonical_product_id = :c
                ORDER BY p.captured_at DESC
                LIMIT 1
                """
            ),
            {"c": target},
        ).first()
        if pr is None:
            print(f"⚠️  El producto suscrito ({target}) no tiene store_product con precio.")
            return

        new_value = max(1, int(pr.value_minor * (1 - pct)))
        s.execute(
            text(
                """
                INSERT INTO save.price
                    (store_product_id, value_minor, currency, captured_at, price_type, source)
                VALUES (:sp, :v, :cur, now(), :pt, 'dev-trigger')
                """
            ),
            {"sp": pr.sp_id, "v": new_value, "cur": pr.currency, "pt": pr.price_type},
        )
        s.commit()

        created = RunAlertMatching(SqlStoreProductRepository(s), alert_repo).execute(MARKET, days=7)
        s.commit()

        print(
            f"✅ Bajada insertada: {pr.value_minor} → {new_value} {pr.currency} (-{int(pct*100)}%) · "
            f"matching → {created} notificación(es) nueva(s)."
        )

        seen: set[str] = set()
        for sub in subs:
            if sub.user_id in seen:
                continue
            seen.add(sub.user_id)
            for n in ListAlertNotifications(alert_repo).execute(sub.user_id)[:2]:
                print(
                    f"   🔔 {n.product_name} @ {n.provider_name}: "
                    f"{n.previous_minor} → {n.current_minor} {n.currency}  (user {sub.user_id[:8]}…)"
                )


if __name__ == "__main__":
    main()
