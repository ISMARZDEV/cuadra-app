# Save — Cómo funciona el Descubrimiento y el Matcheo (validación de entendimiento)

> **Propósito.** Este documento reescribe, con mis palabras, el modelo que me explicaste el 2026-07-16,
> contrastado contra el código real. Es un **check de comprensión**: si algo no coincide con tu visión,
> corrígeme aquí. No es una decisión ni un plan de implementación — es "¿entendí bien cómo funciona?".
>
> Marco cada afirmación con: ✅ **verificado en código** · ⚠️ **matiz / difiere de como lo describiste** ·
> 🔲 **hueco (no construido todavía)**.

---

## 0. Las piezas

- **Canasta Curada** = una tabla `basket_query` con varias queries (texto de búsqueda), cada una con un
  flag `active`. Al correr los jobs, **solo las queries `active`** entran. ✅
- **Producto canónico** = el producto "maestro" del catálogo (el que el usuario ve). ✅
- **store_product** = el producto tal como lo vende UNA tienda (con su precio, su nombre crudo, y —si la
  tienda lo expone— su **EAN**). ✅
- **product_match** = la fila que une un `store_product` con un canónico (o lo deja en cola). Es la
  ÚNICA fuente de verdad del enlace. ✅

### ⚠️ Corrección clave: el canónico NO guarda el EAN

Me dijiste *"su EAN se auto registra y también pasa al producto Canónico ese EAN"*. En el código:

- **`canonical_product` no tiene columna `ean`.** ✅ (verificado en el schema)
- La etapa EAN matchea **store ↔ store**, no store ↔ canónico. `find_candidates_by_ean` busca *otros
  `store_product` que tengan el mismo EAN Y que ya estén enlazados a un canónico* → y enlaza a ESE canónico.

**El resultado que buscás SÍ ocurre, pero por un mecanismo más limpio (sin dato duplicado que sincronizar):**

```
Descubrimiento Sirena:  store_product(Sirena, ean=X) ──match──► canónico C
Job EAN en Bravo:       store_product(Bravo,  ean=X) ──find_by_ean(X)──► "hay un store con X ligado a C" ──► enlaza a C (1.0)
```

El EAN vive **siempre** en el `store_product`; el canónico es el hub. Por eso "un canónico sin EAN" en
realidad significa *"ningún `store_product` ligado a él tiene EAN todavía"*. En cuanto Sirena aporta uno,
el canónico queda "alcanzable por EAN" para las demás tiendas.

---

## 0.5 La cascada de matcheo (el orden REAL, barato → caro)

> Esto reemplaza la taquigrafía "EAN → nombre/embeddings → etc." que uso más abajo. El orden exacto
> (verificado en `infrastructure/matching/`, skill `cuadra-save-matching`) es:

```
1. EAN EXACTO (score 1.0)
      ├─ 1 canónico            → AUTO-LINK  (method=ean)      ← termina aquí
      ├─ 0 canónicos           → sigue al paso 2
      └─ >1 canónico distinto  → COLISIÓN → COLA humana       ← NO auto-linkea (falso-merge = peor caso)

2. LÉXICO + SEMÁNTICO (corren en PARALELO, no en secuencia)
      ├─ pg_trgm  (nombre, similitud de trigramas)   ─┐
      └─ pgvector (embedding BGE-M3, coseno)          ─┴─► RRF (elige el candidato GANADOR por consenso de rank)
                                                           └─► boosts marca/tamaño ─► BANDING sobre la
                                                               similitud CRUDA [0,1] del ganador:
             score ≥ 0.85 (HIGH)            → AUTO-LINK  (method=hybrid|trgm|vector)
             score ∈ [0.55, 0.85) (MID)     → paso 3 (banda gris)
             score < 0.55  ó sin candidatos → COLA humana (method=human)

3. JUEZ LLM (solo la banda gris) → {decision, confidence}
      ├─ match  Y confidence ≥ 0.70   → AUTO-LINK  (method=llm)
      ├─ match  pero confidence < 0.70 → COLA humana
      └─ no_match / uncertain / error / timeout → COLA humana
```

**Dos matices que NO se ven en la taquigrafía:**

1. **"nombre/embeddings" es UN solo paso, no dos.** trgm (léxico) y pgvector (semántico) corren
   **juntos** y se fusionan con **RRF**. RRF NO produce el score final: solo **elige qué candidato gana**
   por consenso de ranking. El score que decide la banda es la **similitud cruda [0,1] del ganador**, no
   el número de RRF (ese nunca pasa de ~0.033).
2. **El juez (paso 3) hoy está APAGADO** (`save_llm_judge_enabled=false`, cuota). Con el juez off, la
   banda gris va **directo a la cola con `method="human"`**. El EAN exacto y la banda alta siguen
   auto-enlazando gratis → por eso medimos **85% auto-link sin LLM**.

---

## 1. Proceso 1 — DESCUBRIMIENTO (dirigido por la Canasta)

**Qué hace (tu explicación):** corro Descubrimiento con las queries `active` de la Canasta, contra las
tiendas que yo tenga activas. Cada tienda me devuelve los productos **relacionados a esa query**. Esos
productos pasan por la **cascada de matcheo (§0.5: EAN exacto → léxico+semántico fusionados por RRF →
banding → juez si banda gris)** intentando matchear con los canónicos que existen **en ese momento**.

- Los que matchean → se enlazan (auto). ✅
- Los que **no** matchean → caen en **cola de revisión**, donde YO decido: 🔲/✅
  1. **convertirlo en canónico nuevo**, o
  2. **descartarlo**, o
  3. **enlazarlo** a uno de los **top-5 canónicos** que me ofrece el embedding.

**En el código:**

| Pieza | Dónde | Estado |
|---|---|---|
| Correr las queries `active` × fuente | `ingestion/save/assets.py::_build_source_asset` (lee `basket_query WHERE active`) | ✅ |
| Enrutar el desconocido a la cascada | `application/refresh_prices.py` (con `matcher` → materializa y llama `MatchStoreProduct`) | ✅ |
| Cascada de matcheo (§0.5: EAN → trgm+vector por RRF → banding → juez) | `infrastructure/matching/` | ✅ (ship-dark) |
| Cola de revisión | `list_review_queue` · `get_review_detail` (los top-N candidatos) | ✅ |
| Decisión humana (nuevo / descarto / enlazo) | `create_canonical_and_link` · `resolve_review` · `bulk_resolve_review` | ✅ |

### ⚠️ El hueco que conecta con el trabajo de hoy

**Bravo hoy NO participa del Descubrimiento por-query.** ✅ (verificado)

- Las fuentes por-query (`_build_source_asset`) son **solo Sirena / Nacional / Jumbo** (VTEX y Magento —
  buscan por texto).
- Bravo solo tiene `rest_catalog_prices` = **browse COMPLETO por sección** (Loop A), porque hasta hoy
  **no sabía buscar por texto**.

→ **El `by_text` que se construyó hoy es exactamente lo que le faltaba a Bravo para entrar al
Descubrimiento por-query.** El factory ya rutea el texto a `/public/articulo/search`. Meter Bravo al
Descubrimiento es, básicamente, agregarlo al set de fuentes por-query. 🔲 (falta cablearlo)

---

## 2. Proceso 2 — BÚSQUEDA Y MATCHEO POR CÓDIGO DE BARRAS

**Qué hace (tu explicación):** otra vía. Tomo los EAN que mis canónicos **ya tienen vinculados** (vía sus
store_products), y busco en las tiendas que saben buscar por EAN (Bravo) los productos con ese mismo EAN.

- Los canónicos **sin EAN se obvian** (este job no es para ellos). 🔲 (a ajustar — ver abajo)
- Los que sí → se buscan en Bravo → **auto-matchean** (EAN exacto, score 1.0). ✅ (mecanismo by_ean existe)
- **No caen en cola:** son específicos. Si no se encuentran, **se descartan** (no pasa nada). 🔲 (hoy SÍ puede encolar)
- Los que no tengan EAN, "ya en Descubrimiento por by_text se ubican si existen". ✅ (esa es la división correcta)

**El ejemplo que diste, traducido al mecanismo real:**

1. Tengo 50 canónicos, ninguno con `store_product` con EAN todavía. No tener EAN **no los limita**.
2. Corro **Descubrimiento con Sirena** (primer proveedor, expone EAN 100%): la query de la Canasta
   descubre esos productos, pasan por la cascada (§0.5); los que matchean se enlazan, y **el EAN de Sirena
   queda en su `store_product` ligado al canónico**.
3. Ahora el canónico es "alcanzable por EAN". Si corro el **job por EAN en Bravo**, los productos de Bravo
   con ese mismo EAN matchean **rápido y exacto** (vía el store de Sirena que comparte el barcode).

**En el código:** este job = `coverage` (Loop B, `application/cover_canonicals.py` + `directed_capability`
by_ean, asset `coverage` en Dagster). ✅

---

## 3. Las 2 decisiones abiertas que introduce el `by_text` de hoy

> No las resuelvo aquí — son tuyas. Las dejo planteadas para cuando validemos el encuadre.

### Decisión A — ¿`by_text` en Cobertura, o solo en Descubrimiento?

Al habilitar `by_text=True` en Bravo, el job de **Cobertura (Loop B)** empieza a hacer **búsquedas por
texto** para los canónicos sin EAN — lo que mete "descubrimiento" dentro de "cobertura".

Tu modelo los separa: **Cobertura = EAN puro; Descubrimiento = by_text**. Mi recomendación:

- **Cobertura (Loop B) → EAN-only** (tu Proceso 2 puro: específico, barato, sin cola).
- **`by_text` → vive en Descubrimiento** (tu Proceso 1: con cola y canonización manual).

### Decisión B — Cobertura-por-EAN sin cola

Dijiste que el job por barcode "no caería en cola... si no se encuentra, se descarta". Hoy **sí puede
encolar** (medido: 2 productos de Bravo cayeron a la cola en la última corrida). Ajuste: en el camino
by_ean, 0-match ⇒ **descartar**, no encolar.

---

## 4. Medición real (corrida E2E previa, cascada encendida)

| Fuente | Auto-enlazados | A la cola | % cola |
|---|---|---|---|
| Global | 80 | 14 | 15% |
| Bravo | 8 | 2 | 20% |

Los **2 de Bravo en cola** son `GOYA GANDULES C/COCO` y `GOYA ARROZ INTEGRAL`: **tienen EAN válido pero NO
existen en Sirena/Nacional** → productos nuevos legítimos que hay que canonizar a mano. El EAN **no** los
habría rescatado (no hay canónico con ese barcode). Es tu visión de descubrimiento, funcionando.

> ⚠️ Sobre "los exclusivos de Bravo suelen tener el texto BRAVO delante": cierto, pero estos 2 son GOYA
> (importados), no marca propia. O sea: "cae a la cola" no implica "exclusivo de Bravo" — implica
> "todavía no hay canónico". La marca propia es un SUBCONJUNTO de lo que descubre el Proceso 1.

---

## 5. ¿Entendí bien? — lo que necesito que confirmes

1. ¿El mecanismo **store↔store por EAN compartido** (en vez de "el canónico hereda el EAN") coincide con
   lo que querés que pase? *(el outcome es el mismo; el dato vive en el store, no en el canónico)*
2. ¿La división **Cobertura = EAN-only / Descubrimiento = by_text** es tu modelo? (Decisión A)
3. ¿La Cobertura-por-EAN debe ser **sin cola** (descartar si no está)? (Decisión B)
4. ¿El siguiente build es **meter Bravo al Descubrimiento por-query** usando el `by_text` de hoy?

---

## 6. Recomendaciones (mejoras a los dos procesos)

> Prioridad: **ALTA** = camino crítico / desbloquea · **MEDIA** = mejora la calidad de la cola o evita
> huecos silenciosos. **R1 y R4 son el camino crítico** — con esas dos, los dos procesos quedan
> alineados a tu modelo.

| # | Proceso | Recomendación | Prioridad |
|---|---|---|---|
| **R1** | Descubrimiento | Hacerlo **registry-driven** (no hardcoded) → Bravo entra solo + respeta tiendas activas | **ALTA · crítico** |
| R2 | Descubrimiento | **Piso de relevancia** antes de la cola (baja el ruido humano) | MEDIA |
| R3 | Descubrimiento | **Enriquecer la cola** con la señal "¿nuevo/exclusivo?" | MEDIA |
| **R4** | Matcheo EAN | **EAN-only + sin cola** (Decisiones A y B); colisión = canal aparte | **ALTA · crítico** |
| R5 | Matcheo EAN | Correr **solo para canónicos EAN-alcanzables** | MEDIA |
| R6 | Matcheo EAN | **Normalizar EAN en ambos lados + backfill** (cierra falso-negativo invisible) | MEDIA |
| **R7** | Transversal | **Descubrir es flexible; sembrar-EAN es jerárquico** (orden real) | ALTA |

### DESCUBRIMIENTO (Proceso 1)

**R1 — Descubrimiento registry-driven (ALTA · crítico).**
Hoy `SOURCE_KEYS = ("sirena","nacional","jumbo")` está **hardcoded** en `ingestion/save/assets.py`,
mientras que el browse (`rest_catalog_prices`) SÍ es registry-driven. Esa inconsistencia es la raíz del
problema. Derivar el set de fuentes por-query de `store_registry WHERE enabled=true AND (la plataforma
sabe by_text)` → VTEX/Magento siempre + REST cuyo profile declare `text_param` ⇒ **Bravo entra solo**.
Además cumple *"solo los supermercados que yo tenga activos"* usando el flag `enabled`/`paused_at` que
ya existe. **Es el desbloqueo real del Proceso 1 sobre Bravo.**

> **Convergencia con el módulo de Orquestación (vault, 2026-07-13):** el refinamiento
> `Sub-modulo List - Orquestacion Save` introduce `OrchestrationPolicy` por provider-flow
> (`enabled`/`execution_mode`/`cron`/`query_limit_override`). ESA policy es el hogar natural de
> "tiendas activas para descubrimiento" — más rico que `store_registry.enabled` solo. Y su US-OR-L6
> (crear provider-flows para el handler `provider_prices_refresh`) debe derivar la COMPATIBILIDAD de
> `directed_capability` (by_text), no de una allowlist implícita Sirena/Nacional/Jumbo — si no, la
> consola nace con el hardcode adentro y R1 obliga a rehacerla. **Secuencia: R1 se implementa CON (o
> justo antes de) el módulo de Orquestación.**

**R2 — Piso de relevancia ANTES de la cola (MEDIA).**
El descubrimiento es donde se llena la cola. Magento hace OR de tokens ("habichuelas rojas la famosa" →
704, desde el puesto ~3 ambientadores "rojos"). El cap top-20 acota el *fetch*; un **piso de similitud
de nombre** que descarte lo obviamente irrelevante *antes* de la cascada acota la **cola** (el trabajo
humano).

**R3 — Enriquecer la cola con la señal "¿nuevo o exclusivo?" (MEDIA).**
Por cada producto en cola, mostrar: (a) los top-5 canónicos —ya existe—, (b) **¿su EAN cruza con alguna
otra tienda?** (no → producto nuevo legítimo), (c) **hint de marca** (prefijo `BRAVO` → probable
exclusivo). Codifica tu heurística del "BRAVO delante" y acelera la decisión de canonizar.

### BÚSQUEDA Y MATCHEO POR EAN (Proceso 2)

**R4 — EAN-only + sin cola (ALTA · crítico — Decisiones A y B).**
- Sacar `by_text` de la Cobertura (Loop B): que quede **barcode puro**. El `by_text` vive en Descubrimiento.
- `0-match` → **descartar**, no encolar (tu *"si no se encuentra, se descarta"*).
- **Excepción — colisión (>1 canónico con el mismo EAN):** ese es el único caso a vigilar, porque
  significa *dos canónicos duplicados compartiendo un barcode* = bug de datos. **Canal aparte, con
  hogar concreto:** el refinamiento `Sub-modulo List - Productos Canonicos` (vault) ya trae la señal
  "Duplicado posible" (hoy derivada solo de nombre+marca+tamaño) — **la colisión de EAN debe sumarse
  ahí como la señal MÁS fuerte de duplicado** (dos canónicos cuyos store_products comparten barcode),
  no inventar una alerta suelta.

**R5 — Correr solo para canónicos EAN-alcanzables (MEDIA).**
Obviar los canónicos que no tienen ningún `store_product` con EAN (tu *"los que no tienen se obvian"*).
Evita requests inútiles a Bravo. `list_uncovered` ya filtra por no-cubierto; sumar "tiene EAN".

**R6 — Normalizar el EAN en AMBOS lados + backfill (MEDIA).**
El fix UPC-A→EAN-13 es **reciente**. Filas viejas de `store_product.ean` pueden estar sin normalizar →
Bravo escribe `760593…` y Sirena `0760593…` y **nunca cruzan** (falso negativo INVISIBLE, se ve como
"no matchea"). Un backfill que normalice lo existente cierra ese hueco silencioso.

### TRANSVERSAL

**R7 v2 — Descubrir es flexible; sembrar-EAN es jerárquico (ALTA).**

Son DOS capacidades distintas, no la misma:

- **Descubrir por texto** (traer productos por query y matchear por NOMBRE, aunque no traigan EAN):
  **cualquier tienda con `by_text` lo hace** → el orden es tu elección (Sirena preferida, pero
  Nacional/Jumbo/Bravo también).
- **Sembrar EAN** (que el `store_product` matcheado quede con barcode, para que el Proceso 2 sea
  efectivo): **depende de si la tienda EXPONE el EAN** — jerarquía dura:

| Tienda | Descubre por texto | ¿Siembra EAN? |
|---|---|---|
| **Sirena** (VTEX) | ✅ | ✅ **100%, inmediato** (viene en el listado) |
| **Bravo** (REST) | ✅ | ⚠️ **~30%, DIFERIDO** (`/search` trae `associatedEan` vacío → se cosecha del detalle `/get` en el refresh) |
| **Jumbo** (Magento) | ✅ | ❌ **NUNCA** (Magento no expone EAN en ningún endpoint) |
| **Nacional** (Magento) | ✅ | ❌ **NUNCA** |

**La regla:** podés arrancar el descubrimiento por quien quieras, pero el **Proceso 2 se vuelve efectivo
para un canónico SOLO después de que una tienda que EXPONE EAN (Sirena full / Bravo parcial) lo haya
descubierto y matcheado.** Jumbo/Nacional nunca aportan a eso. Corolario: los canónicos **nacidos de
Magento** solo consiguen EAN si un producto de Sirena/Bravo los matchea por nombre — para eso sirve el
`by_text` de hoy. Recomendación: forzar la dependencia **Sirena (semillero) → job EAN de Bravo** en los
deps de Dagster.

### El camino crítico (con qué empezar)

1. **R1** — Bravo al descubrimiento por-query (registry-driven) → tu Proceso 1 sobre Bravo, vivo.
2. **R4** — Cobertura EAN-only + sin cola → tu Proceso 2 puro.
3. Después: R7 (orden de deps), luego R2/R3/R5/R6 como pulido de calidad.

---

## 7. Relación con los refinamientos admin (vault Obsidian, se trabajan PRIMERO)

> Los 7 SDD refinados en `dev-brain/Cuadra/Planificación/Pendientes - Refinamiento/` (2026-07-12/13)
> preceden a este documento en orden de trabajo. Revisión cruzada 2026-07-16 contra el repo:

### Claims desactualizados encontrados en el vault (corregir allá)

1. **Mejoras Transversales §5.4 + P0 #3** — dice *"la ingesta real sigue leyendo BASKET_QUERIES
   hardcodeado"*. **FALSO desde PR #29**: `assets.py:65` lee la tabla
   (`SqlBasketQueryRepository.list_active`). El P0 se encoge a: retirar el fallback legacy de
   `sources.py:298` (runner manual).
2. **Sub-modulo Orquestación, "Estado real"** — le faltan: el asset **`rest_catalog_prices`**
   (particionado `{provider}:{section}`, el Loop A de Bravo) + el sensor `sync_rest_catalog_sections`
   + los jobs `save_rest_catalog_job`/`save_price_refresh_job` + el schedule
   `save_price_refresh_frequent` (0 */4). Sin esto, la tab "Assets Dagster" no mostraría el browse de
   Bravo. Y la lista de "política fuera del admin" debe sumar **`SAVE_LLM_JUDGE_ENABLED`**.
3. **US-OR-L6 (crear provider-flows)** — asume implícitamente Sirena/Nacional/Jumbo. Con `by_text` en
   Bravo (2026-07-16), la compatibilidad debe derivarse de `directed_capability`, no de allowlist.
   (Ver la nota de convergencia en R1.)
4. **Detalle por Provider** — su contrato de métricas calza con `RefreshResult` ✅, pero asume flows
   por-query; para REST el flow es particionado por sección (progreso = secciones, no queries).
5. **Productos Canónicos (list)** — no menciona EAN. Sumar: badge/filtro **"EAN-alcanzable"** (≥1
   store_product ligado con EAN → sirve R5/R7) y **colisión de EAN** como señal de "Duplicado posible"
   (ver R4).
6. **Productos (list + details)** — sin conflictos; la analítica está bien faseada.

### Huecos AGREGADOS al vault (análisis 2026-07-16, aprobados por el usuario)

1. **Orquestación 2-procesos**: handler `provider_coverage` v1.1 (el job EAN por proveedor — sin él
   la consola solo opera Descubrimiento) + métricas de cascada en RunSnapshot
   (`auto_linked/queued_for_review/new_canonicals` — `matched` solo, engaña) + deep-link corrida→cola
   (`?run_id=`) + nota `depends_on_flow` (R7 no se expresa con `priority`).
2. **Módulo Marcas** (Transversales §7.5 nueva + P1): dueño de `save.brand` — rename, merge de
   variantes (goya/Goya/GOYA), logo. Sin dueño, la promesa del logo de marca nunca se cumple.
3. **Canasta** (Transversales §7.4): scoping query×tienda opcional (el "o especifique" del modelo) +
   métricas de yield por query (alimenta R2).
4. **Review Queue** (Transversales §7.1): señal "¿nuevo o exclusivo?" (R3 — EAN sin cruce = candidato
   a canónico nuevo; prefijo BRAVO = exclusivo) + filtro `run_id`.
5. **Categorías**: US-CP-D2c (picker con sugerencias determinísticas lexicon/embeddings, registro
   `method="human"`) + US-CP-L10 (asignación en lote desde el filtro `Sin categoría`).
6. **Badge EAN-alcanzable** también en el header del Details de Canónicos (no solo el list).

### Orden de trabajo combinado

```
Transversales P0 (menos el cutover, ya hecho; queda el fallback legacy)
   └─► Orquestación (List + Details) CON R1 embebido (registry/capability-driven, no hardcode)
          └─► Canónicos / Productos (list + details) CON badge EAN-alcanzable + duplicado-por-EAN (R4/R5)
                 └─► P1: Marcas · señal nuevo/exclusivo · categorías bulk · canasta scope/yield
                        └─► R7 (deps Sirena→job EAN) · R2/R6 (pulido)
```

---

## 8. El flujo de desarrollo (roadmap acordado 2026-07-16)

> La lógica que ordena todo: **sin la cascada encendida, el Descubrimiento DESCARTA los desconocidos**
> (`refresh_prices.py`: `matcher=None` → drop, verificado) — el Proceso 1 no existe en producción
> hasta la Fase 2. Cada ítem = rama `feat/*` → PR a `developer` → CI verde, Strict TDD; los SDD del
> vault son el spec.

**Fase 0 — Higiene (cerrar lo abierto):**
1. Commit + PR de `by_text` + este doc (la rama va ahead sin pushear; CI no ha visto nada).
2. R6: backfill de normalización EAN (cierra el falso-negativo ANTES de más corridas).
3. Fix del breaker mentiroso (`method='llm'` → `human` degradado) — ahora, aunque el LLM siga off.
4. Retirar el fallback legacy `BASKET_QUERIES` (`sources.py:298`).

**Fase 1 — Backend de los DOS procesos (sin UI):**
5. R1 backend: fuentes por-query derivadas de `store_registry` + `directed_capability` (muere
   `SOURCE_KEYS`). Mecanismo: **dynamic partitions + sensor**, el MISMO patrón de `rest_catalog_prices`.
6. R4: cobertura EAN-only, 0-match descarta (sin cola).
7. R5: `list_uncovered` filtra EAN-alcanzables.

**Fase 2 — Activación medida (EL unlock):**
8. Endpoint BGE-M3 + `SAVE_MATCHING_CASCADE_ENABLED=true` + corrida E2E → medir la cola real con
   `by_text`. **LLM sigue OFF** (85% auto-link sin él, medido 2026-07-15).

**Fase 3 — Fundaciones admin (Transversales P0):**
9. Auditoría reusable (T2) — prerequisito de todo módulo que muta.
10. i18n admin + hardening de acceso (dev-login, super_admin, cookie SSR, guard padre).
11. `GET /admin/save/providers` DTO admin.

**Fase 4 — Orquestación (la consola de los 2 procesos):**
12. v1: policies + `DagsterAdminPort` + snapshot con campos de cascada + provider-flows
    capability-driven + deep-link corrida→cola.
13. v1.1: handler `provider_coverage` + deps R7 (Sirena siembra → job EAN).

**Fase 5 — Catálogo (superficies de curación):**
14. Canónicos List → Details (EAN-alcanzable, duplicado-por-EAN, evidencia, categorías D2c) → bulk L10.
15. Productos List → Details (analítica de visitas/clicks al final, como fasean sus SDD).

**Fase 6 — P1 / pulido:**
16. Marcas · señal "¿nuevo o exclusivo?" + `run_id` · canasta scope/yield · R2 · GetMatchingMetrics ·
    health v2.

**Después (decisión del usuario):** re-encender el LLM (cuota; el breaker ya arreglado en F0) ·
Recovery Fase 2 (cuando se mida volumen) · admin de alertas.

```
F0 higiene ─► F1 backend 2-procesos ─► F2 CASCADA ON ─► F3 fundaciones admin
                                                           └─► F4 Orquestación ─► F5 Catálogo ─► F6 P1
```

**Por qué este orden:** F1 antes que F4 (la consola nace sobre el backend correcto, no el hardcode);
F2 antes que F4/F5 (sin cola ni matches, las pantallas operan sobre el vacío); F3 antes que F4/F5
(todos los módulos mutan — sin auditoría común, cada uno inventaría la suya).
