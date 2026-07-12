"""Reset del schema `save` para el loop de validación de ingesta (DEV ONLY).

SEGURIDAD:
  · Dry-run por defecto: sin `--yes` NO borra nada, solo cuenta lo que borraría.
  · Guard de dev: se niega si la DB no es localhost:5433 (el Postgres de dev de Cuadra).

Modos (elegí UNO):
  --menu            INTERACTIVO (lo usa el atajo save-reset): lista los proveedores con su total de
                    productos y te deja elegir limpiar UNO o el baseline completo («todo»). Confirma
                    antes de borrar.
  --provider NAME   Borra SOLO la huella de ingesta de ese proveedor (tu caso Sirena):
                    store_product + su cascada (price, product_match→review_candidate,
                    category_classification). Deja canónicos/colecciones/referencia intactos.
                    Es el modo de todos los días para re-probar UNA fuente.
  --orphans         (modificador) además borra canónicos que quedaron sin store_products
                    y NO están en ninguna colección curada (+ sus refs: matches, candidatos,
                    clasificaciones, alertas). Útil tras limpiar un proveedor.
  --reset           BASELINE LIMPIO: borra todo lo generado/demo (store_product, price, canonical,
                    matches, candidatos, clasificaciones, colecciones, brands, alertas) pero CONSERVA
                    lo obligatorio para que Save funcione: provider, store_registry, basket_query,
                    taxonomy_node. Empezás de cero SIN traer de vuelta fixtures demo (a diferencia de
                    --all + re-seed). Este es el "empezar de cero de verdad" para validar ingesta.
  --all             NUKE total: TRUNCATE de las tablas de `save` SALVO la canasta curada
                    (`basket_query`, dato gestionado, se preserva). Después re-sembrá con
                    `uv run python -m seeds`.

Uso:
    cd apps/api && uv run python -m seeds.save_clean --provider Sirena            # dry-run
    cd apps/api && uv run python -m seeds.save_clean --provider Sirena --yes      # ejecuta
    cd apps/api && uv run python -m seeds.save_clean --provider Sirena --orphans --yes
    cd apps/api && uv run python -m seeds.save_clean --reset --yes
    cd apps/api && uv run python -m seeds.save_clean --all --yes
"""
from __future__ import annotations

import sys

from sqlalchemy import text

# Las 16 tablas en orden FK-seguro (dependientes → padres) para el TRUNCATE del nuke.
_ALL_TABLES = [
    "review_candidate",
    "product_match",
    "category_classification",
    "alert_notification",
    "price_alert",
    "price",
    "collection_product",
    "store_product",
    "canonical_product",
    "collection",
    "brand",
    "basket_query",
    "store_registry",
    "provider",
    "push_token",
    "taxonomy_node",
]

# Lo OBLIGATORIO para que Save funcione (estructura pura, sin depender de datos generados).
# `--reset` conserva ESTAS y wipea el resto.
_KEEP_TABLES = {"provider", "store_registry", "basket_query", "taxonomy_node"}

# La CANASTA CURADA (`basket_query`) es DATO GESTIONADO (F1): la mantiene un admin desde la consola y
# la puebla la migración de backfill (no un re-seed). NINGÚN reset la borra — ni `--reset` ni el NUKE
# `--all` —, para no dejar la ingesta sin canasta tras un reset.
_CURATED_TABLES = {"basket_query"}


def _arg(flag: str) -> str | None:
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


def _guard_dev() -> None:
    """Aborta si la DB no es el Postgres de dev (localhost:5433). Evita tocar prod/staging."""
    from src.shared.db.base import engine

    url = engine.url
    host = (url.host or "").lower()
    port = url.port or 5432
    if host not in ("localhost", "127.0.0.1", "::1") or port != 5433:
        print(
            f"✖ ABORTADO: la DB apunta a {host}:{port}, NO al Postgres de dev (localhost:5433).\n"
            f"  Este script es destructivo y SOLO corre contra dev."
        )
        sys.exit(2)


def _clean_provider(s, name: str, *, execute: bool, orphans: bool) -> None:
    prov = s.execute(
        text("SELECT id, name FROM save.provider WHERE name ILIKE :n"),
        {"n": name},
    ).all()
    if not prov:
        print(f"✖ No hay proveedor que matchee «{name}». Proveedores disponibles:")
        for r in s.execute(text("SELECT name FROM save.provider ORDER BY name")).all():
            print(f"    · {r.name}")
        sys.exit(1)
    if len(prov) > 1:
        print(f"✖ «{name}» matchea {len(prov)} proveedores: {', '.join(p.name for p in prov)}. Sé más específico.")
        sys.exit(1)

    pid, pname = prov[0].id, prov[0].name
    counts = s.execute(
        text(
            """
            SELECT
              (SELECT count(*) FROM save.store_product WHERE provider_id=:p) AS store_products,
              (SELECT count(*) FROM save.price pr JOIN save.store_product sp ON sp.id=pr.store_product_id
                 WHERE sp.provider_id=:p) AS prices,
              (SELECT count(*) FROM save.product_match pm JOIN save.store_product sp ON sp.id=pm.store_product_id
                 WHERE sp.provider_id=:p) AS matches,
              (SELECT count(*) FROM save.review_candidate rc JOIN save.product_match pm ON pm.id=rc.product_match_id
                 JOIN save.store_product sp ON sp.id=pm.store_product_id WHERE sp.provider_id=:p) AS candidates,
              (SELECT count(*) FROM save.category_classification cc JOIN save.store_product sp ON sp.id=cc.store_product_id
                 WHERE sp.provider_id=:p) AS classifications
            """
        ),
        {"p": pid},
    ).one()

    print(f"\nProveedor «{pname}» — se borrarían:")
    print(f"  store_product          {counts.store_products}")
    print(f"  price                  {counts.prices}")
    print(f"  product_match          {counts.matches}")
    print(f"  review_candidate       {counts.candidates}")
    print(f"  category_classification {counts.classifications}")

    if not execute:
        print("\n(dry-run — nada borrado. Agregá --yes para ejecutar.)")
        return

    # Orden FK-seguro: product_match NO cascadea desde store_product → va primero (cascadea review_candidate).
    s.execute(
        text(
            """DELETE FROM save.product_match
               WHERE store_product_id IN (SELECT id FROM save.store_product WHERE provider_id=:p)"""
        ),
        {"p": pid},
    )
    # store_product cascadea price + category_classification(store).
    s.execute(text("DELETE FROM save.store_product WHERE provider_id=:p"), {"p": pid})
    print(f"\n✓ Huella de ingesta de «{pname}» borrada.")

    if orphans:
        _clean_orphans(s, execute=True)


def _clean_orphans(s, *, execute: bool) -> None:
    n = s.execute(
        text(
            """
            SELECT count(*) FROM save.canonical_product c
             WHERE NOT EXISTS (SELECT 1 FROM save.store_product sp WHERE sp.canonical_product_id=c.id)
               AND NOT EXISTS (SELECT 1 FROM save.collection_product cp WHERE cp.canonical_product_id=c.id)
            """
        )
    ).scalar_one()
    print(f"\nCanónicos huérfanos a borrar (sin store_products y fuera de colecciones): {n}")
    if not execute:
        print("(dry-run)")
        return
    if n == 0:
        return
    orphan_cte = """
        WITH orphans AS (
          SELECT c.id FROM save.canonical_product c
           WHERE NOT EXISTS (SELECT 1 FROM save.store_product sp WHERE sp.canonical_product_id=c.id)
             AND NOT EXISTS (SELECT 1 FROM save.collection_product cp WHERE cp.canonical_product_id=c.id)
        )
    """
    # Refs sin ondelete-cascade → limpiarlas antes de borrar el canónico.
    s.execute(text(orphan_cte + "DELETE FROM save.review_candidate WHERE canonical_product_id IN (SELECT id FROM orphans)"))
    s.execute(text(orphan_cte + "DELETE FROM save.category_classification WHERE canonical_product_id IN (SELECT id FROM orphans)"))
    s.execute(text(orphan_cte + "DELETE FROM save.product_match WHERE canonical_product_id IN (SELECT id FROM orphans)"))
    s.execute(text(orphan_cte + "DELETE FROM save.price_alert WHERE canonical_product_id IN (SELECT id FROM orphans)"))  # cascadea alert_notification
    s.execute(text(orphan_cte + "DELETE FROM save.canonical_product WHERE id IN (SELECT id FROM orphans)"))
    print(f"✓ {n} canónicos huérfanos borrados.")


def _reset_baseline(s, *, execute: bool) -> None:
    wipe = [t for t in _ALL_TABLES if t not in _KEEP_TABLES]
    print("\nRESET a baseline limpio.")
    print(f"  CONSERVA (obligatorio): {', '.join(sorted(_KEEP_TABLES))}")
    print("  BORRA (generado/demo):")
    for t in wipe:
        n = s.execute(text(f"SELECT count(*) FROM save.{t}")).scalar_one()
        print(f"    {t:<24} {n}")
    if not execute:
        print("\n(dry-run — nada borrado. Agregá --yes para ejecutar.)")
        return
    s.execute(text(f"TRUNCATE {', '.join(f'save.{t}' for t in wipe)} RESTART IDENTITY CASCADE"))
    print("\n✓ Baseline listo: solo provider/store_registry/basket_query/taxonomy_node. Ya podés re-ingerir.")


def _confirm() -> bool:
    return input("\n¿Ejecutar? escribí 'si' para confirmar: ").strip().lower() == "si"


def _interactive(s) -> None:
    """Menú: elegir limpiar UN proveedor (con su total de productos) o el baseline completo."""
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

    print("\n¿Qué querés limpiar del schema Save?\n")
    print("  Proveedores en la BD (con su total de store_products):")
    for i, r in enumerate(provs, 1):
        print(f"    {i}) {r.name:<18} {r.n} productos")
    print("\n  Otras opciones:")
    print("    todo      → BASELINE limpio: borra TODO lo generado/demo, conserva lo obligatorio")
    print("                (provider, store_registry, basket_query, taxonomy_node)")
    print("    cancelar  → salir sin borrar nada")

    choice = input("\n> ").strip().lower()

    if choice in ("cancelar", "cancel", "c", "q", ""):
        print("✋ Cancelado — no se borró nada.")
        return

    if choice == "todo":
        _reset_baseline(s, execute=False)  # preview
        if _confirm():
            _reset_baseline(s, execute=True)
            s.commit()
        else:
            print("✋ Cancelado — no se borró nada.")
        return

    if choice.isdigit() and 1 <= int(choice) <= len(provs):
        name = provs[int(choice) - 1].name
        _clean_provider(s, name, execute=False, orphans=False)  # preview
        if _confirm():
            _clean_provider(s, name, execute=True, orphans=False)
            s.commit()
        else:
            print("✋ Cancelado — no se borró nada.")
        return

    print(f"✖ Opción inválida: «{choice}». Corré de nuevo y elegí un número, «todo» o «cancelar».")


def _nuke_all(s, *, execute: bool) -> None:
    # La canasta curada se PRESERVA incluso en el nuke (dato gestionado, no fixture demo).
    wipe = [t for t in _ALL_TABLES if t not in _CURATED_TABLES]
    print("\nNUKE total del schema `save` — se vaciarían todas las tablas SALVO la canasta curada:")
    print(f"  CONSERVA (canasta curada): {', '.join(sorted(_CURATED_TABLES))}")
    for t in wipe:
        n = s.execute(text(f"SELECT count(*) FROM save.{t}")).scalar_one()
        print(f"  {t:<24} {n}")
    if not execute:
        print("\n(dry-run — nada borrado. Agregá --yes para ejecutar.)")
        return
    s.execute(text(f"TRUNCATE {', '.join(f'save.{t}' for t in wipe)} RESTART IDENTITY CASCADE"))
    print("\n✓ Schema `save` vaciado (canasta curada conservada). Re-sembrá con:  uv run python -m seeds")


def main() -> None:
    _guard_dev()

    execute = "--yes" in sys.argv
    orphans = "--orphans" in sys.argv
    provider = _arg("--provider")
    nuke = "--all" in sys.argv
    reset = "--reset" in sys.argv
    menu = "--menu" in sys.argv or "--interactive" in sys.argv

    from src.shared.db.base import SessionLocal

    # Modo interactivo (usado por el atajo save-reset): menú que pregunta qué limpiar.
    if menu:
        with SessionLocal() as s:
            _interactive(s)
        return

    if sum(bool(x) for x in (nuke, reset, provider)) > 1:
        print("✖ Elegí UN modo: --provider, --reset O --all.")
        sys.exit(1)
    if not nuke and not reset and not provider and not orphans:
        print(__doc__)
        sys.exit(1)

    with SessionLocal() as s:
        if nuke:
            _nuke_all(s, execute=execute)
        elif reset:
            _reset_baseline(s, execute=execute)
        elif provider:
            _clean_provider(s, provider, execute=execute, orphans=orphans)
        elif orphans:
            _clean_orphans(s, execute=execute)
        if execute:
            s.commit()


if __name__ == "__main__":
    main()
