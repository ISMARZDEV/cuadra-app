"""Tablero read-only del schema `save` — verifica los 3 pilares de la validación de ingesta.

Uso:
    cd apps/api && uv run python -m seeds.save_inspect                 # todo el mercado
    cd apps/api && uv run python -m seeds.save_inspect --provider Sirena  # foco en una fuente
    cd apps/api && uv run python -m seeds.save_inspect --menu             # elegir la fuente en un menú

NO escribe nada. Es el complemento de `seeds.save_clean`: mirás el estado, limpiás, re-ingerís,
volvés a mirar. Los 3 pilares que reporta:
  1. EXTRACCIÓN  — store_products por proveedor, cuántos con precio/EAN, profundidad del histórico.
  2. MATCHING    — desglose de product_match (status/método), pendientes de revisión, sin matchear.
  3. FRESCURA    — buckets de last_seen_at (fresco 18h / stale 3d / nunca visto) + canónicos huérfanos.
"""
from __future__ import annotations

import sys

from sqlalchemy import text


def _arg(flag: str) -> str | None:
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


def _h(title: str) -> None:
    print(f"\n{'─' * 68}\n  {title}\n{'─' * 68}")


def _desc(lines: list[str]) -> None:
    """Descripción del bloque (qué pregunta responde + qué significa cada columna)."""
    for ln in lines:
        print(f"  » {ln}")
    print()


def _pick_provider(s) -> str | None:
    """Menú interactivo (lo usa el atajo save-inspect): elegir una tienda para el FOCO, o «todos»."""
    provs = s.execute(
        text(
            """
            SELECT p.name, count(sp.id) AS n
            FROM save.provider p
            LEFT JOIN save.store_product sp ON sp.provider_id = p.id
            GROUP BY p.id, p.name
            ORDER BY n DESC, p.name
            """
        )
    ).all()
    print("\n¿Qué proveedor querés inspeccionar?\n")
    for i, r in enumerate(provs, 1):
        print(f"    {i}) {r.name:<18} {r.n} productos")
    print("\n    todos → panorama general (todas las tiendas), sin foco por proveedor")
    choice = input("\n> ").strip().lower()
    if choice in ("todos", "todo", "t", ""):
        return None
    if choice.isdigit() and 1 <= int(choice) <= len(provs):
        return provs[int(choice) - 1].name
    print(f"⚠ Opción «{choice}» inválida → muestro el panorama general.")
    return None


def _report(s, pid, label: str, scoped: bool) -> None:
    """Los 3 bloques (extracción · matching · frescura). Si `scoped`, todo filtrado a `pid`.

    `:pid` se pasa siempre (None cuando es global); el fragmento `(CAST(:pid AS uuid) IS NULL OR ...)` hace
    que la MISMA query sirva para «todas las tiendas» y para una sola.
    """
    p = {"pid": pid}

    # ── 1. EXTRACCIÓN ──────────────────────────────────────────────────────
    _h(f"1 · EXTRACCIÓN — {label}")
    _desc(
        [
            "Pregunta: ¿estoy sacando precios de este súper? Cada fila = un supermercado.",
            "prods    = productos capturados (store_product).",
            "c/precio = de esos, cuántos tienen precio (idealmente = prods).",
            "c/ean    = cuántos traen código de barras (señal fuerte del matching; VTEX sí, Magento no).",
            "último visto = cuándo la ingesta tocó esa tienda por última vez.",
        ]
    )
    rows = s.execute(
        text(
            """
            SELECT p.name AS provider, p.platform,
                   count(sp.id) AS products,
                   count(sp.id) FILTER (WHERE sp.current_price_minor IS NOT NULL) AS with_price,
                   count(sp.ean) FILTER (WHERE sp.ean IS NOT NULL AND sp.ean <> '') AS with_ean,
                   max(sp.last_seen_at) AS last_seen
            FROM save.provider p
            LEFT JOIN save.store_product sp ON sp.provider_id = p.id
            WHERE (CAST(:pid AS uuid) IS NULL OR p.id = :pid)
            GROUP BY p.id, p.name, p.platform
            ORDER BY products DESC, p.name
            """
        ),
        p,
    ).all()
    print(f"  {'proveedor':<20} {'plat.':<10} {'prods':>6} {'c/precio':>8} {'c/ean':>6}  último visto")
    for r in rows:
        seen = r.last_seen.strftime("%Y-%m-%d %H:%M") if r.last_seen else "—"
        print(
            f"  {(r.provider or '')[:20]:<20} {(r.platform or '')[:10]:<10} "
            f"{r.products:>6} {r.with_price:>8} {r.with_ean:>6}  {seen}"
        )

    hist = s.execute(
        text(
            """
            SELECT count(*) AS price_rows,
                   count(DISTINCT pr.store_product_id) AS products_with_history,
                   min(pr.captured_at) AS first_at, max(pr.captured_at) AS last_at
            FROM save.price pr
            JOIN save.store_product sp ON sp.id = pr.store_product_id
            WHERE (CAST(:pid AS uuid) IS NULL OR sp.provider_id = :pid)
            """
        ),
        p,
    ).one()
    print(
        f"\n  histórico `price` (SCD-4): {hist.price_rows} filas · "
        f"{hist.products_with_history} productos con historia"
    )
    if hist.first_at:
        print(f"    ventana: {hist.first_at:%Y-%m-%d %H:%M} → {hist.last_at:%Y-%m-%d %H:%M}")

    # ── 2. MATCHING ────────────────────────────────────────────────────────
    _h(f"2 · MATCHING — {label}")
    _desc(
        [
            "Pregunta: ¿el sistema sabe que 2 productos de tiendas distintas son EL MISMO?",
            "status = qué pasó: auto_linked (enlazado solo, alta confianza) /",
            "         pending_review (dudó → te lo manda a la cola) / rejected (descartado).",
            "método = cómo lo intentó: ean, trgm, vector, hybrid, llm (juez), human.",
            "n = cuántos productos cayeron en esa combinación.",
            "conf.prom = confianza promedio del match (0 a 1). Qué significa el número:",
            "   ~1.0 = casi seguro que son el mismo → el sistema lo AUTO-ENLAZA solo.",
            "   ~0.5 = no tiene idea (moneda al aire) → banda gris, te lo manda a REVISAR.",
            "   ~0.0 = casi seguro que NO son el mismo → lo descarta.",
            "   Hay un umbral (piso): arriba se auto-enlaza, debajo va a la cola humana.",
        ]
    )
    mrows = s.execute(
        text(
            """
            SELECT pm.status, pm.method, count(*) AS n,
                   round(avg(pm.confidence), 3) AS avg_conf
            FROM save.product_match pm
            JOIN save.store_product sp ON sp.id = pm.store_product_id
            WHERE (CAST(:pid AS uuid) IS NULL OR sp.provider_id = :pid)
            GROUP BY pm.status, pm.method
            ORDER BY pm.status, n DESC
            """
        ),
        p,
    ).all()
    if not mrows:
        print("  (sin matches todavía)")
    else:
        print(f"  {'status':<16} {'método':<10} {'n':>6}  conf.prom")
        for r in mrows:
            print(f"  {r.status:<16} {r.method:<10} {r.n:>6}  {r.avg_conf}")

    t = s.execute(
        text(
            """
            SELECT
              (SELECT count(*) FROM save.store_product sp
                 WHERE (CAST(:pid AS uuid) IS NULL OR sp.provider_id=:pid)) AS total,
              (SELECT count(DISTINCT sp.canonical_product_id) FROM save.store_product sp
                 WHERE sp.canonical_product_id IS NOT NULL
                   AND (CAST(:pid AS uuid) IS NULL OR sp.provider_id=:pid)) AS canonicals,
              (SELECT count(*) FROM save.product_match pm JOIN save.store_product sp ON sp.id=pm.store_product_id
                 WHERE pm.status='pending_review' AND (CAST(:pid AS uuid) IS NULL OR sp.provider_id=:pid)) AS pending,
              (SELECT count(*) FROM save.store_product sp
                 LEFT JOIN save.product_match pm ON pm.store_product_id = sp.id
                 WHERE pm.id IS NULL AND (CAST(:pid AS uuid) IS NULL OR sp.provider_id=:pid)) AS no_match_row,
              (SELECT count(*) FROM save.store_product sp
                 WHERE sp.canonical_product_id IS NULL
                   AND (CAST(:pid AS uuid) IS NULL OR sp.provider_id=:pid)) AS unmatched
            """
        ),
        p,
    ).one()
    print(
        f"\n  productos: {t.total} · enlazados a {t.canonicals} canónicos · "
        f"pendientes de revisión: {t.pending}"
    )
    print(
        f"  store_products SIN fila de match: {t.no_match_row} · "
        f"SIN canónico asignado: {t.unmatched}"
    )
    if not scoped:
        shared = s.execute(
            text(
                """
                SELECT count(*) FROM (
                  SELECT canonical_product_id FROM save.store_product
                  WHERE canonical_product_id IS NOT NULL
                  GROUP BY canonical_product_id
                  HAVING count(DISTINCT provider_id) >= 2
                ) t
                """
            )
        ).scalar_one()
        print(
            f"  canónicos compartidos por 2+ tiendas: {shared}  "
            f"← LA prueba de que el matching sirve (mismo producto en varios súper)"
        )

    # ── 3. FRESCURA + CICLO DE VIDA ────────────────────────────────────────
    _h(f"3 · FRESCURA — {label}")
    _desc(
        [
            "Pregunta: ¿los precios están al día y la BD limpia de productos muertos?",
            "Clasifica cada producto por hace cuánto se vio (last_seen_at):",
            "fresco <18h = al día · stale/viejo = se dejó de actualizar · nunca visto = roto.",
        ]
        + (
            []
            if scoped
            else ["huérfano = producto maestro (canónico) sin NINGUNA tienda vendiéndolo (basura a limpiar)."]
        )
    )
    fresh = s.execute(
        text(
            """
            SELECT
              count(*) FILTER (WHERE last_seen_at > now() - interval '18 hours') AS fresh,
              count(*) FILTER (WHERE last_seen_at <= now() - interval '18 hours'
                                 AND last_seen_at > now() - interval '3 days') AS stale_mid,
              count(*) FILTER (WHERE last_seen_at <= now() - interval '3 days') AS stale_old,
              count(*) FILTER (WHERE last_seen_at IS NULL) AS never
            FROM save.store_product sp
            WHERE (CAST(:pid AS uuid) IS NULL OR sp.provider_id = :pid)
            """
        ),
        p,
    ).one()
    print(f"  fresco (<18h):        {fresh.fresh}")
    print(f"  stale (18h–3d):       {fresh.stale_mid}")
    print(f"  viejo (>3d):          {fresh.stale_old}")
    print(f"  nunca visto (NULL):   {fresh.never}")

    if not scoped:
        orphans = s.execute(
            text(
                """
                SELECT count(*) FROM save.canonical_product c
                 WHERE NOT EXISTS (SELECT 1 FROM save.store_product sp WHERE sp.canonical_product_id = c.id)
                """
            )
        ).scalar_one()
        in_coll = s.execute(
            text(
                """
                SELECT count(*) FROM save.canonical_product c
                 WHERE NOT EXISTS (SELECT 1 FROM save.store_product sp WHERE sp.canonical_product_id = c.id)
                   AND EXISTS (SELECT 1 FROM save.collection_product cp WHERE cp.canonical_product_id = c.id)
                """
            )
        ).scalar_one()
        print(
            f"\n  canónicos HUÉRFANOS (0 store_products): {orphans}  "
            f"(de esos, en alguna colección curada: {in_coll})"
        )

    # ── Muestra de productos (solo con foco en una tienda) ──────────────────
    if scoped:
        _h(f"MUESTRA — 15 productos de {label}")
        _desc(
            [
                "Los 15 más recientes con precio, EAN y estado de match — para ojear datos reales.",
            ]
        )
        sample = s.execute(
            text(
                """
                SELECT sp.external_id, left(coalesce(sp.name, '—'), 34) AS nm,
                       sp.current_price_minor AS price, sp.currency,
                       coalesce(sp.ean, '—') AS ean,
                       coalesce(pm.status, 'no-match') AS mstatus,
                       coalesce(pm.method, '—') AS mmethod
                FROM save.store_product sp
                LEFT JOIN save.product_match pm ON pm.store_product_id = sp.id
                WHERE sp.provider_id = :pid
                ORDER BY sp.last_seen_at DESC NULLS LAST
                LIMIT 15
                """
            ),
            p,
        ).all()
        if not sample:
            print("  (esta tienda aún no tiene store_products)")
        else:
            print(f"  {'sku':<12} {'nombre':<34} {'precio':>8} {'ean':<14} match")
            for r in sample:
                price = f"{r.price/100:.2f}" if r.price is not None else "—"
                print(
                    f"  {r.external_id[:12]:<12} {r.nm:<34} {price:>8} "
                    f"{r.ean[:14]:<14} {r.mstatus}/{r.mmethod}"
                )

    print()


def main() -> None:
    from src.shared.db.base import SessionLocal

    provider_filter = _arg("--provider")
    menu = "--menu" in sys.argv or "--interactive" in sys.argv

    with SessionLocal() as s:
        if menu:
            provider_filter = _pick_provider(s)

        pid, label, scoped = None, "todas las tiendas", False
        if provider_filter:
            row = s.execute(
                text("SELECT id, name FROM save.provider WHERE name ILIKE :n"),
                {"n": provider_filter},
            ).first()
            if row is None:
                print(f"⚠ No hay proveedor «{provider_filter}» → muestro todas las tiendas.")
            else:
                pid, label, scoped = row.id, row.name, True

        _report(s, pid, label, scoped)


if __name__ == "__main__":
    main()
