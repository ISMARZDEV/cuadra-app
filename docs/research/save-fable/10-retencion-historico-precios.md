# 10 · Retención del histórico de precios (costo vs foso)

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** 2/datos
> Nace de una duda del usuario: guardar el histórico de precios de miles de productos "por siempre"
> en la DB es caro; ¿exportar mensual/trimestral y archivar? Ideas ordenadas por impacto. Append-only.

---

## 0. Reality check (antes de optimizar)
El histórico ES el foso (inflación real, ofertas falsas, el chart "Todos"). Pero el volumen NO es
tan grande como parece **si escribimos bien**:
- 10k productos × 8 tiendas = 80k `store_products`.
- Si escribiéramos **1 fila por día** → ~29M filas/año. Postgres aguanta cientos de millones, pero
  crece feo con multi-país.
- **PERO los precios de supermercado casi NO cambian día a día.** Con escritura *change-only* (abajo),
  80k productos con ~12-24 cambios/año = **~1-2M filas/año**. Eso es CHICO. → no vas a sentir dolor
  de costo por años. **No sobre-optimices ahora**; diseñá para escalar, pero sin catedral.

## 1. 🥇 Escritura CHANGE-ONLY (el mayor ahorro, y se decide AHORA)
No insertes una fila de `price` cada día. Insertá una **solo cuando el precio CAMBIA**.
- `price` (append-only) = **puntos de cambio**, no un punto por día. Un precio estable 3 meses = **1
  fila**, no 90 → recorta storage **10-50×**.
- `store_product.current_price` = el último precio conocido + `last_seen_at` (cuándo lo confirmamos).
- Lógica de ingesta: si el precio nuevo == actual → solo actualizo `last_seen_at` (0 filas nuevas);
  si difiere → inserto 1 `price` + actualizo `current_price`.
- **Impacto en lo que estamos construyendo:** afecta el REPO/ingesta (Tarea 6), no la entidad `Price`
  pura. Sumo `last_seen_at` a `StoreProduct` en infra.

## 2. Partición por mes (Postgres nativo)
Particioná `price` por `captured_at` mensual (declarative partitioning o TimescaleDB hypertable).
- Consultas de "últimos 3 meses" escanean solo 3 particiones (rápido).
- Archivar/borrar viejo = **detach/drop de una partición** (instantáneo, sin `DELETE` costoso).

## 3. 🥇 Downsampling / rollups (para que el chart largo NO cueste)
No necesitás granularidad diaria para siempre. Agregá lo viejo:
- **HOT:** últimos ~3-6 meses → diario (chart 1M/3M, comparación).
- **WARM:** 6-12 meses → **semanal** (min/max/avg/último).
- **COLD:** > 1 año → **mensual**.
→ Preserva el chart "Todos" y el análisis de inflación (el foso) con **una fracción de las filas**.
Es lo que hacen Prometheus/RRDtool. En Postgres: continuous aggregates (TimescaleDB) o un job propio.

## 4. Export a almacenamiento frío (tu instinto, refinado)
Lo viejo (raw, pre-downsample) se **exporta a object storage como Parquet** (S3/Supabase Storage) y
se **dropea la partición** de Postgres. Sigue consultable con DuckDB/Athena para auditoría o
reprocesamiento del matching. → tu "exportar cada mes/trimestre" **automatizado con Dagster** (que ya
elegimos). ⚠️ Matiz: NO exportes-y-borres TODO lo viejo o perdés el chart largo → guardá el
**rollup downsampled en la DB** (barato) y mandá el **raw a frío**. Así el foso queda vivo Y barato.

## 5. Opción integral: TimescaleDB (extensión de Postgres)
Hace 2+3+4 casi de fábrica sobre tu MISMO Postgres:
- **Compresión columnar** de time-series (10-20×).
- **Continuous aggregates** (rollups automáticos: diario→semanal→mensual).
- **Retention policies** (drop automático de datos > X) + **tiered storage** (mover a S3).
🔀 Contra: es una extensión (hay que tenerla en el Postgres gestionado; Supabase/Neon la soportan o
hay que verificar). Si no querés atarte, los rollups + export se hacen con Dagster a mano.

## 🏆 Recomendación (combinada)
1. **Change-only writes** desde ya (§1) — el 80% del ahorro, decisión de diseño del repo.
2. **Partición mensual** de `price` en la migración (§2).
3. **Rollup diario→semanal→mensual** + **export raw a Parquet** vía Dagster, con **retención** (ej.
   diario 6m, semanal 18m, mensual para siempre en DB; raw a frío mensual) (§3-4). **Diferido a F1/F2**
   — no bloquea el MVP.
4. Evaluar **TimescaleDB** si el Postgres gestionado la soporta (automatiza 2-4).

**Qué sobrevive para el foso:** el chart "Todos" y el análisis de inflación viven del **rollup
mensual en DB** (barato, para siempre); el **raw en Parquet frío** queda para auditoría/reproceso.

---

**Decisión que deberías tomar ahora:**
- ¿Adoptamos **change-only + last_seen_at** en el modelo/repo (Tarea 6)? (recomiendo SÍ — es gratis y es el mayor ahorro).
- El resto (partición, rollups, export, TimescaleDB) → **diferido a F1/F2**, documentado acá para retomar.

**Qué investigar después:** si el Postgres gestionado del proyecto (¿Supabase/Neon?) soporta
TimescaleDB + particiones; definir los umbrales exactos de retención por tier.

---

## ✅ RESOLUCIÓN (2026-07-03) — decisión del usuario
- **Change-only + `last_seen_at` ADOPTADO** para el modelo/repo (Tarea 6): se inserta una fila `price`
  SOLO cuando el precio cambia; si es igual, se actualiza `last_seen_at` del `store_product`.
- Partición mensual, rollups (diario→semanal→mensual), export a Parquet frío vía Dagster, y
  evaluación de TimescaleDB → **diferidos a F1/F2**, documentados aquí para retomar.
