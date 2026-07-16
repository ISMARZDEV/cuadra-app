"""save: siembra store_registry de las cadenas por-query (Sirena/Nacional/Jumbo)

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-07-16 00:00:00.000000

R1 (Fase 1) — prerequisito del cutover del "bridge F1".

## Por qué

Hasta ahora el set de tiendas del descubrimiento era `SOURCE_KEYS = ("sirena","nacional","jumbo")`:
un tuple hardcodeado en `ingestion/save/assets.py`, con las base_url en `ingestion/save/sources.py`.
El propio seed lo admitía: *"El resto de cadenas (VTEX/Magento) aún no tienen StoreRegistry sembrado
— su wiring vive en ingestion/save/sources.py (bridge F1)"*.

R1 corta ese bridge: el descubrimiento deriva sus tiendas de `store_registry` activo × capacidad
by_text. Eso convierte una omisión en un fallo TOTAL y SILENCIOSO — sin fila, la tienda simplemente
no se ingiere, y no hay error que lo diga.

Estado real medido en dev antes de escribir esto (2026-07-16): `store_registry` tenía 3 filas —Bravo
(sembrada, uuid5 determinista) + **Nacional y Sirena creadas A MANO desde la consola admin**, con una
hora de diferencia entre ellas— y **Jumbo no existía**. O sea: el estado era accidental. En un DB
fresco (CI/prod) solo habría estado Bravo, y el descubrimiento habría corrido con UNA tienda.

## Qué hace

Inserta la fila de extracción de las cadenas por-query que falten. `ON CONFLICT (provider_id) DO
NOTHING`: NO pisa lo que un admin haya editado desde la consola, y reejecutar no duplica.

`Jumbo` lleva `headers={"Store":"jumbo"}`: comparte instancia Magento (CCN) con Nacional y el header
elige el store view. Sin él, jumbo.com.do sirve el catálogo de NACIONAL — no falla, guarda precios de
Nacional etiquetados como Jumbo (hallazgo doc 09). El factory lo traduce a `store_code`.

NO siembra credenciales: el token de Bravo se carga desde el admin y vive en `store_registry.auth`
(§15). Una migración con un secreto adentro es un secreto en el repo.

Los `id` replican el uuid5 determinista del seed (`uuid5(NS_URL, "store_registry:DO:{name}")`) para
que sembrar y migrar converjan a la MISMA fila en vez de pelearse.
"""
from __future__ import annotations

import json
import uuid

import sqlalchemy as sa
from alembic import op

revision = "a5b6c7d8e9f0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None

# Mismo namespace que `seeds/save_seed.py::_NS` — la migración y el seed deben converger a la misma
# fila. Auto-contenida a propósito (no se importa del seed): una migración es un snapshot histórico.
_NS = uuid.NAMESPACE_URL

_MARKET = "DO"

# (provider_name, platform, base_url, headers). Bravo NO está: ya lo siembra el seed desde F3 y su
# fila existe en todos los entornos.
_SOURCES: tuple[tuple[str, str, str, dict | None], ...] = (
    ("Sirena", "vtex", "https://www.sirena.do", None),
    ("Nacional", "magento", "https://supermercadosnacional.com", None),
    ("Jumbo", "magento", "https://jumbo.com.do", {"Store": "jumbo"}),
)


def upgrade() -> None:
    conn = op.get_bind()
    inserted = skipped = missing = 0

    for name, platform, base_url, headers in _SOURCES:
        provider_id = conn.execute(
            sa.text(
                "SELECT id FROM save.provider WHERE name = :name AND market_id = :market"
            ),
            {"name": name, "market": _MARKET},
        ).scalar()
        if provider_id is None:
            # El provider no existe en este entorno (DB sin seed) → no hay a qué colgar la fuente.
            # No es un error: `seed_save` la creará junto con el provider.
            missing += 1
            continue

        result = conn.execute(
            sa.text(
                """
                INSERT INTO save.store_registry
                    (id, provider_id, platform, base_url, headers, enabled)
                VALUES (:id, :provider_id, :platform, :base_url, CAST(:headers AS jsonb), true)
                ON CONFLICT (provider_id) DO NOTHING
                """
            ),
            {
                "id": str(uuid.uuid5(_NS, f"store_registry:{_MARKET}:{name}")),
                "provider_id": provider_id,
                "platform": platform,
                "base_url": base_url,
                # None → CAST(NULL AS jsonb) = NULL, que es lo que corresponde a "sin headers".
                "headers": None if headers is None else json.dumps(headers),
            },
        )
        if result.rowcount:
            inserted += 1
        else:
            skipped += 1  # ya existía (creada a mano desde el admin) → se respeta

    print(
        f"save store_registry por-query: {inserted} sembradas, {skipped} ya existían (respetadas), "
        f"{missing} sin provider en este entorno"
    )



def downgrade() -> None:
    """Borra ÚNICAMENTE las filas con el id determinista de esta migración.

    Así no se lleva por delante una fuente que un admin haya creado a mano desde la consola (que es
    exactamente como aparecieron Nacional y Sirena en dev): esas tienen otro id.
    """
    conn = op.get_bind()
    ids = [str(uuid.uuid5(_NS, f"store_registry:{_MARKET}:{name}")) for name, *_ in _SOURCES]
    conn.execute(
        sa.text("DELETE FROM save.store_registry WHERE id = ANY(CAST(:ids AS uuid[]))"),
        {"ids": ids},
    )
