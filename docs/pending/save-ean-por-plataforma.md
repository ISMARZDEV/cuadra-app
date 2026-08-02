# Save · EAN por plataforma — Pendiente de investigación

> **Contexto.** La etapa EAN de la cascada auto-enlaza con score **1.0**, sin juez ni revisión
> humana: es el enlace más barato y más confiable que tenemos. Hoy sólo **2 de 8** proveedores
> aportan códigos de barras, y el límite **no es del matching sino del adapter de cada plataforma**.
>
> Este documento existe porque la limitación **se cree temporal**: es probable que en el futuro las
> demás tiendas sí expongan EAN. Cuando eso pase, esto dice exactamente qué hay que tocar (poco) y
> qué ya está resuelto (casi todo).
>
> Medición: 2026-08-02, rama `fix/save-matching-false-positive`.

---

## 1. Estado medido hoy

| Plataforma | ¿Cosecha EAN? | Dónde | Proveedores | Cobertura real |
|---|---|---|---|---|
| `vtex` | ✅ `pick_global_ean` | `vtex_adapter.py:90` | Sirena | 101/120 = **84%** |
| `rest_catalog` | ✅ `pick_global_ean` | `bravova_profile.py:194` | Bravo | 32/52 = **62%** |
| `magento` | ❌ `ean=None` | `magento_adapter.py:128` | Nacional · Jumbo · Merca Jumbo | **0%** |
| sin fuente configurada | — | — | Carrefour · Plaza Lama · Ritmo | — |

El adapter de Magento lo dice literal:

```python
ean=None,  # no expuesto por la API
```

**Consecuencia para el roadmap.** El efecto de red del EAN hoy sólo crece **entre Sirena y Bravo**.
Sumar tiendas Magento aporta catálogo y comparación de precios, pero **CERO** mejora en auto-enlace
por EAN. Si el objetivo es subir la tasa de enlace automático, la palanca es incorporar tiendas
**VTEX o REST_CATALOG**, no más Magento.

---

## 2. Lo que hay que investigar

### 2.1 ¿Magento expone el barcode por OTRO endpoint?

**Hay un precedente fuerte que dice que probablemente sí: pasó exactamente esto con Bravo.**

Se daba por hecho que Bravo no tenía EAN (0%). Resultó que el asset `price_refresh` **ya lo
cosechaba del endpoint de DETALLE** y simplemente nunca se había ejecutado. Pasó de **0 → 32 (62%)**
sin escribir una línea de código nuevo.

La lección: `ean=None` en el mapper del **listado** no prueba que la plataforma no tenga el dato —
prueba que ese endpoint no lo trae. Antes de dar por cerrado que Magento no puede, hay que **probar
su endpoint de detalle**, igual que se hizo con Bravo.

### 2.2 ¿Qué plataforma usan Carrefour, Plaza Lama y Ritmo?

No tienen `store_registry` configurado todavía. Al darlas de alta conviene verificar si su
plataforma publica barcode **antes** de estimar cuánto van a aportar al auto-enlace.

---

## 3. Lo que YA está resuelto (no re-investigar)

Estas tres piezas ya funcionan y están verificadas en datos reales. **El día que una tienda empiece
a traer EAN, no hay que tocar ninguna.**

1. **La normalización no será el problema.** `domain/value_objects/ean.py` convierte toda la familia
   GTIN — GTIN-8, UPC-E, GTIN-12, GTIN-13, GTIN-14 — a **GTIN-14 con ceros a la izquierda**, con
   alcance global declarado (USA/Europa/LatAm), no sólo RD. Verificado en datos: Bravo y Sirena
   guardan ambos 14 dígitos y sus 4 EANs comunes cruzan sin ajuste.
   El propio módulo advierte por qué importa: si `760593023182` y `0760593023182` no convergen,
   *"el producto se duplica y el bug es INVISIBLE"* (falso negativo silencioso).

2. **La etapa EAN es agnóstica del proveedor.** `find_candidates_by_ean` filtra por **market**, no
   por tienda: cualquier proveedor sirve de puente para cualquier otro del mismo mercado.

3. **El re-match no tiene lógica por proveedor.** `POST /review-queue/bulk-rematch` y el botón
   «Re-evaluar seleccionados» operan sobre cualquier `match_ids`.

**Alcance real del trabajo futuro: sólo el adapter de la plataforma.** Matching, normalización y UI
ya están listos y probados.

---

## 4. Cómo se comporta la etapa EAN (para no volver a medirlo)

Dos propiedades que cuestan una sesión entera de medición si se descubren desde cero:

- **La etapa EAN necesita una CONTRAPARTE.** No compara contra el canónico — `canonical_product` ni
  siquiera tiene columna `ean`. Busca **otro `store_product` con el mismo EAN que YA esté enlazado**
  (`product_match_repository.py:160-177`). Sin contraparte no puede disparar, por más EAN que tenga
  el entrante.

- **Crear canónicos desde los productos de una tienda NO genera puentes para los otros productos de
  esa MISMA tienda** (cada uno tiene su EAN único). El puente aparece cuando **otra** tienda ingiere
  el mismo producto. Medido: tras crear 7 canónicos de Bravo, sus 38 pendientes seguían con **0**
  puentes.

Corolario: **cosechar EAN es una inversión, no un arreglo retroactivo.** Los 28 EANs exclusivos de
Bravo no sirven hoy; el día que otra tienda traiga uno de ellos, el enlace es instantáneo y al 100%.

### Banco de prueba

Para validar la etapa end-to-end sin esperar datos nuevos: devolver a la cola (con
`UnlinkStoreProduct`) productos cuyo EAN **sí** tenga contraparte enlazada, y re-evaluarlos.
Resultado obtenido el 2026-08-02: **4/4 por `ean` al 100%**, y 3 de ellos venían enlazados por
`trgm`/`llm` — la señal determinista gana a las probabilísticas, como promete la cascada.

> ⚠️ Usar `UnlinkStoreProduct`, **nunca** `reopen_review` a secas: éste limpia el canónico del
> *match* pero deja `store_product.canonical_product_id` puesto — y la etapa EAN mira **ese** campo,
> así que el producto sería su propio puente y la prueba daría un **falso verde**.
