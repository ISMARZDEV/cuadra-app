# SDD — Ingesta de dos loops (Descubrir / Cubrir) + gestión de canasta + link a tienda

> **Estado 2026-07-12 · borrador de diseño.** Change SDD para rediseñar la ingesta de Save en dos
> loops separados (descubrimiento amplio vs cobertura dirigida), conectar la **canasta** (`basket_query`)
> a la ingesta con un admin para gestionarla, y exponer el **URL del producto en la tienda** con un
> botón en el detalle y la tabla de la cola de revisión.
>
> **Docs relacionados:** [`supermercadosrd-scrapers-teardown-y-plan-cuadra.md`](../research/supermercadosrd-scrapers-teardown-y-plan-cuadra.md)
> (§3.1 Prices Batch = Loop B · §3.4/§3.5 Catalog Sync = Loop A) · [`save-schema-analisis.md`](../research/save-schema-analisis.md) ·
> skills `cuadra-save`, `cuadra-save-matching`, `cuadra-save-admin`.

---

## 0. Motivación

Hoy la ingesta usa **una** lista de términos amplios (`BASKET_QUERIES`) para hacer DOS trabajos a la
vez: descubrir productos nuevos Y refrescar precios. Eso trae dos problemas medidos en vivo (2026-07-12):

1. **Imprecisión + ruido**: la búsqueda amplia `"arroz la garza"` en Magento (Nacional) devuelve ~231
   productos vagamente relacionados por query (vs ~5 en VTEX). Una corrida de 12 queries trajo **2.834
   productos**, la mayoría ruido que inundó la cola de revisión (`2.010 pending_review/human @ 0.496`).
2. **Costo en cada refresh**: se paga el costo (red + embedding + matching + juez LLM) del descubrimiento
   en CADA refresh de precios, aunque el precio de un producto conocido no necesita re-descubrirse.

**Insight**: descubrir y cubrir son trabajos distintos. Separarlos (como SupermercadosRD: *Prices Batch*
frecuente + *Catalog Sync* periódico) da ingesta precisa y barata sin perder descubrimiento.

---

## 1. Estado actual (con referencias) y gaps

| Pieza | Dónde | Estado |
|---|---|---|
| Canasta como TÉRMINOS hardcodeados | `ingestion/save/sources.py:298` (`BASKET_QUERIES`, 213 términos) | ✅ existe, pero fija |
| Tabla `basket_query` (market, category_label, query_text, position, **active**) | `infrastructure/models.py:183` | ✅ existe, **vacía (0 filas)** |
| Admin de canasta (crear/quitar/editar/active) | web `resources/save-basket` (`BasketEditorScreen`, `api.ts`) | ✅ existe (CRUD básico) |
| **Ingesta lee la TABLA** | `sources.py:322 build_sources`, `assets.py:37 _refresh_queries` | ❌ **NO — usa el tuple hardcodeado** |
| Refresh (change-only + ruteo al matching) | `application/refresh_prices.py` | ✅ un solo camino (amplio) |
| Matching dirigido por canónico | — | ❌ no existe (no hay "buscá este canónico en la tienda X") |
| `store_product.url` (página del producto en la tienda) | `models.py:259`, poblado por los adapters | ✅ **100% cobertura** (2834/2834) |
| `url` en los DTOs del admin (detalle/tabla) | `application/dtos.py` | ❌ no expuesto |
| Scheduling Dagster (assets `*_prices` deps de `embed_canonicals`) | `ingestion/save/assets.py:65`, `definitions.py` | ✅ existe, un solo tipo de refresh |

**Gap #1 (bloqueante para el resto)**: la ingesta **ignora** la tabla `basket_query`. Sin conectarla,
gestionar la canasta desde el admin no tiene efecto real.

---

## 2. El diseño — dos loops

### 2.1 Loop A — DESCUBRIMIENTO (amplio, periódico)

**Pregunta:** ¿qué productos NUEVOS hay que aún no son canónicos?

- **Fuente de términos:** la **tabla `basket_query`** (los términos amplios que el admin gestiona) —
  o, a futuro, un crawl de catálogo por categoría (parity con SRD §3.4/§3.5).
- **Flujo:** término amplio → búsqueda en cada tienda → productos → matching (EAN→trgm→vector→juez) →
  los que no matchean un canónico existente → **cola de revisión** → se crean canónicos (botón "Crear
  canónico", ya construido en Etapa A).
- **Frecuencia:** BAJA (ej. semanal). El ruido es ACEPTABLE aquí: su trabajo ES encontrar cosas nuevas.
- **Corre sobre TODAS las tiendas** → un producto que solo vende Nacional entra por acá.

> Es, en esencia, el comportamiento de HOY — pero **aislado** en su propio loop de baja frecuencia,
> donde el ruido no contamina el refresh de precios.

### 2.2 Loop B — COBERTURA (dirigido, frecuente)

**Pregunta:** ¿cuánto cuesta —en cada tienda— cada producto que YA conozco (canónico)?

- **Fuente de términos:** los **canónicos existentes**. Para cada canónico se arma una consulta
  DIRIGIDA (ej. `"Arroz La Garza Premium 20 Lb"` a partir de name+brand+display_size, o su **EAN** si
  la tienda soporta búsqueda por barcode).
- **Flujo:** por cada (canónico × tienda que aún no lo cubre):
  1. Buscar la consulta dirigida en la tienda.
  2. Tomar el **mejor candidato** (top por relevancia / EAN exacto).
  3. Validar con la MISMA cascada (EAN→trgm→vector→size_gate→category_gate). Si supera el umbral →
     `store_product` nuevo enlazado al canónico + precio. Si no → a revisión (no se fuerza un mal match).
- **Frecuencia:** ALTA (ej. diario). **Cero ruido**: buscás lo exacto, no lo amplio.
- Para lo YA enlazado, es un **refresh** de precio (change-only, como hoy `refresh_prices`).

### 2.3 El ciclo completo (cómo se relacionan)

```
Producto NUEVO (en cualquier tienda)
  └─ Loop A (descubre, amplio, semanal) ─→ cola de revisión ─→ CANÓNICO nuevo
                                                                     │
CANÓNICO existente                                                   ▼
  └─ Loop B (dirigido, diario) ─→ busca "X exacto" en cada tienda ─→ enlaza precio (matriz producto×tienda)
```

- **Loop A** puebla el catálogo (descubrimiento).
- **Loop B** llena la matriz de precios de lo conocido (cobertura precisa) + refresca.
- **Nada se escapa**: lo nuevo entra por A (desde cualquier tienda), lo conocido se cubre por B.

**Regla de oro:** Loop B nunca CREA canónicos (solo enlaza/refresca); Loop A es el único que alimenta
la creación (vía revisión). Así el catálogo crece controlado y la cobertura es barata.

---

## 3. Gestión de la canasta (admin) — "ver y consultar productos"

El usuario quiere **manejar el listado** de la canasta y **consultar/buscar cualquier producto**.

### 3.1 Conectar la ingesta a la tabla (Gap #1)
- `build_sources` / `_refresh_queries` dejan de leer `BASKET_QUERIES` hardcodeado y leen
  `basket_query` **WHERE active = true** para el market. Backfill inicial: sembrar la tabla con los 213
  términos actuales (una migración de datos / seed).
- El tuple hardcodeado queda como fallback/seed, no como fuente de verdad.

### 3.2 Admin de canasta (extender `save-basket`)
Capacidades (algunas ya existen: create/remove/update/active):

| Acción | Estado |
|---|---|
| Listar términos (con category_label, position, active) | ✅ existe |
| Agregar / quitar término | ✅ existe |
| **Activar / desactivar** (toggle `active`) — sin borrar | ✅ campo existe, exponer toggle en la UI |
| Reordenar (position) | parcial |
| **Preview: "¿qué productos trae esta consulta?"** | ❌ **nuevo** |
| **Buscar/consultar cualquier producto ad-hoc** (sin agregarlo aún) | ❌ **nuevo** |

### 3.3 Preview / consulta ad-hoc (lo nuevo)
- Un endpoint `POST /admin/basket/preview` que, dado `{query_text, provider_id?}`, corre la búsqueda
  **en vivo** contra la(s) fuente(s) (dry-run, SIN persistir — reusar el patrón `TestSource`
  SSRF-guarded de `save-sources`) y devuelve los primeros N resultados (nombre, precio, imagen, url).
- UI: un buscador en el admin de canasta donde el usuario tipea un término, ve **qué devolvería** cada
  tienda, y desde ahí decide **"Agregar a la canasta"** o descartar. Así "maneja mejor el listado":
  ve el impacto antes de comprometerlo.

> Esto también sirve para **calibrar Loop A**: ver qué tan ruidosa es una query en Magento antes de
> activarla.

---

## 4. Link a la tienda (URL + botón) — el cierre chico

- **Backend:** `store_product.url` ya está poblado (100%). Exponerlo en:
  - `AdminReviewDetailDto` → `store_product_url` (como se hizo con `market_id` en Etapa A).
  - `AdminReviewQueueRowDto` (la tabla) → `store_product_url`.
  - Regenerar `@cuadra/api-client` (contract-first).
- **UI:**
  - **Detalle** (`StoreProductPanel`): botón **"↗ Ver en la tienda"** → abre `url` en pestaña nueva.
  - **Tabla** (columna Acciones o fila): ícono/link **↗** a la página del producto.
  - Seguridad: `target="_blank" rel="noopener noreferrer"` (link externo).
- **Bonus (app pública):** el mismo `url` habilita "Comprar en Sirena / Nacional / …" por tienda en el
  detalle de producto del usuario. Misma data, doble uso (fuera de este change).

---

## 5. Modelo de datos (cambios)

| Cambio | Tabla | Motivo |
|---|---|---|
| Backfill de `basket_query` con los 213 términos | `save.basket_query` | Conectar la ingesta a la tabla (Gap #1) |
| (Evaluar) `basket_query.kind` = `discovery` | `save.basket_query` | Si Loop A/B usan términos distintos, distinguirlos |
| Ninguno para el URL | — | `store_product.url` ya existe |
| (Evaluar) marca de "cubierto por Loop B" | `store_product` o derivado | Saber qué (canónico×tienda) falta cubrir sin recomputar |

> **A confirmar en `design`:** si Loop B necesita una tabla/vista de "cobertura pendiente"
> (canónico×tienda sin `store_product`), o se deriva por LEFT JOIN en runtime.

---

## 6. Backend (cambios por capa)

- **Dominio/aplicación:**
  - Nuevo use-case `DiscoverCatalog` (Loop A) — hoy es `refresh_prices` con matcher; se re-encuadra.
  - Nuevo use-case `CoverCanonicals` (Loop B) — itera canónicos, arma consulta dirigida, busca por
    tienda, valida con la cascada, enlaza/refresca. **Nunca crea canónicos.**
  - `BasketQueryRepository.list_active(market)` para que la ingesta lea la tabla.
  - `PreviewBasketQuery` (dry-run, SSRF-guarded) para el admin.
- **Puerto de fuente:** `CatalogSource` ya sabe buscar por término; agregar (o reusar) una búsqueda
  **dirigida** que devuelva el mejor candidato (top relevancia / EAN) sin paginar todo.
- **Contrato/API:** endpoints admin `basket/preview`, `basket` (toggle active ya expuesto),
  `review-queue` DTOs + `store_product_url`. Regenerar api-client.

## 7. UI (cambios)

- **Canasta (`save-basket`):** toggle activar/desactivar, buscador ad-hoc + preview de resultados por
  tienda, botón "Agregar a la canasta" desde el preview.
- **Cola de revisión:** botón "↗ Ver en la tienda" en el detalle (`StoreProductPanel`) y en la tabla.
- **Ajustes de ingesta** (sección elegida aparte): switch del juez LLM + (futuro) qué loop corre.
- Todo con Strict TDD + verificación visual (cuadra-ui-verify, claro y oscuro).

## 8. Scheduling (Dagster)

- Separar los assets: `discovery_*` (Loop A, schedule semanal) y `coverage_*` (Loop B, schedule
  diario), ambos deps de `embed_canonicals`. Hoy hay un solo `*_prices` (`assets.py:65`).
- El límite de prueba (`SAVE_REFRESH_QUERY_LIMIT`) se mantiene para dev.

---

## 9. Fases / tareas (propuesta de orden)

- **F0 — Cierre chico (URL):** exponer `store_product_url` + botón detalle/tabla. Independiente,
  cierra rápido. *(el "por último" del pedido)*
- **F1 — Conectar la canasta (Gap #1):** ingesta lee `basket_query` activa + backfill de los 213 +
  toggle activar/desactivar en el admin. Desbloquea todo lo demás.
- **F2 — Canasta consultable:** endpoint `basket/preview` (dry-run) + buscador ad-hoc + "Agregar desde
  preview" en el admin.
- **F3 — Loop B (Cobertura dirigida):** use-case `CoverCanonicals` + búsqueda dirigida por tienda +
  asset/schedule diario. *(el corazón de la precisión)*
- **F4 — Loop A (Descubrimiento aislado):** re-encuadrar el refresh amplio como discovery de baja
  frecuencia + asset/schedule semanal. Opcional: tope/relevancia para Magento.

## 10. Decisiones abiertas (para `propose`/`design`)

1. **Consulta dirigida (Loop B):** ¿por nombre compuesto (name+brand+size) o por EAN cuando la tienda
   lo soporta? ¿Qué tienda soporta búsqueda por EAN? (Sirena/VTEX sí trae EAN; Magento por SKU).
2. **Cobertura pendiente:** ¿tabla/vista materializada de (canónico×tienda) sin cubrir, o LEFT JOIN
   en runtime? Impacta performance con muchos canónicos.
3. **Loop A: search vs crawl.** ¿Seguir con búsqueda amplia por términos, o portar el catalog-sync por
   sitemap/categoría de SRD (§3.4/§3.5) para descubrimiento más completo?
4. **Tope de Magento:** ¿limitar páginas/relevancia en Loop A, o dejar el ruido (va a revisión igual)?
5. **`basket_query.kind`:** ¿los términos de Loop A y B viven en la misma tabla con un `kind`, o Loop B
   no usa la tabla (deriva de canónicos)? (Propuesta: Loop B deriva de canónicos, no de la tabla).

## 11. Riesgos

- **Performance de Loop B**: N canónicos × M tiendas búsquedas dirigidas por corrida. Mitigar con
  cobertura incremental (solo lo no cubierto / stale) y batching.
- **Doble descubrimiento**: evitar que Loop A re-cree canónicos ya existentes (la cascada + el
  `product_match` único por store_product ya protege; validar).
- **Regresión de la canasta actual**: al conectar la tabla, si queda vacía la ingesta no corre — el
  backfill de los 213 debe correr ANTES de apagar el tuple hardcodeado.

---

## 12. Decisiones RESUELTAS (2026-07-12)

Las 5 abiertas del §10 quedaron cerradas con el usuario:

1. **Consulta dirigida (Loop B):** **EAN primero, nombre como fallback.** Donde la tienda trae EAN
   (Sirena/VTEX) → match exacto y barato; donde no (Magento/Bravo) → `name + brand + display_size`.
   Es la ventaja de Cuadra sobre SRD (sin EAN ellos no matchean; nosotros sí, por semántica).
2. **Cobertura pendiente:** **Híbrido** — refresh de lo cubierto por **frescura** (`last_seen_at`,
   patrón SRD §3.1: 18h visibles / 3d ocultos) + **vista materializada** indexada para lo pendiente
   (canónico×tienda sin `store_product`). Escala a miles de canónicos × N tiendas.
3. **Loop A descubre por:** **la Canasta Curada** (basket_query, F1/F2) on-demand. El **crawl**
   sitemap/categoría (SRD §3.4/§3.5) queda como **mejora FUTURA** de completitud, NO bloquea F3.
4/5. **`basket_query.kind`: NO.** La canasta = solo descubrimiento (Loop A). La cobertura (Loop B)
   **deriva de los canónicos**, no de la tabla. Separación limpia; F1/F2 siguen siendo el motor de A.

**Modelo mental del usuario (validado):** Loop B corre sobre los canónicos, busca cada uno en cada
tienda; si ya está vinculado (existe `store_product` de ese canónico×tienda) → siguiente; si no →
lo busca (EAN-first), valida con la cascada y lo enlaza. Loop A = habilitar la Canasta Curada para
descubrir canónicos nuevos.

## 13. Plan F3 — Loop B (Cobertura dirigida) + patrones SRD

> Referencia: teardown `docs/research/supermercadosrd-scrapers-teardown-y-plan-cuadra.md` (su *Prices
> Batch* §3.1 = Loop B en prod sobre 9 cadenas). Consultar sus paths al implementar.

**F3.0 — Disponibilidad en `store_product` (EL fix, primero).** Hoy NO se modela (solo `last_seen_at`).
Loop B necesita expresar "buscado en tienda X → no encontrado / dejó de venderse" SIN borrar. Portar
la semántica `hidden` de SRD (`apply-scrape-result.ts:39-94`: hide/show, **no ocultar si otra tienda
aún lo vende**). Cierra además la deuda de F0 (no linkear "Comprar en X" a algo sin stock). Migración
+ campo `availability`/`is_available` + `last_seen_at` ya existe.

**F3.1 — `CoverCanonicals` (use-case).** Itera (canónico × tienda) NO cubierto o stale; arma consulta
dirigida (EAN-first); busca el mejor candidato; valida con la **misma cascada** (EAN→trgm→vector→
size_gate→category_gate→juez); enlaza `store_product` + precio o va a revisión. **Nunca crea canónicos.**

**F3.2 — Cobertura pendiente (híbrido).** Vista materializada `(canónico×tienda)` sin `store_product`
+ selección por frescura (`last_seen_at`) para el refresh. Change-only (ya lo tenemos).

**F3.3 — Resiliencia (patrones SRD a portar; nuestros adapters `httpx` no los tienen): ✅ COMPLETO (2026-07-12)**
- ✅ **Backoff exponencial + jitter** en 429/503 (`http-client.ts:497-524`) → `catalog_sources/http_retry.py`.
- ✅ **Round-robin por tienda** (`scrape-many.ts:11-77`) → `domain/coverage.py::round_robin_by_store`
  (PURO): reparte la carga intercalando una ronda por tienda (`A,A,B`→`A,B,A`).
- ✅ **Result tipado con flags `retryable`/`hide`** (`result.ts:9-69`) → value object PURO
  `domain/fetch_outcome.py::FetchOutcome` + clasificador infra `catalog_sources/fetch_classifier.py`
  (ÚNICA capa que conoce httpx). El use-case decide solo por flags, nunca por el error crudo.
- ✅ **Abortar iteración si un backend cae** (Nacional `backend_503`, §3.1) → `CoverCanonicals` marca
  la tienda caída (503/timeout retryable) y salta sus pares restantes; `CoverageResult.stores_aborted`.
  Wireado en prod (`composition.py` inyecta `classify_httpx_error`). 15 tests unit RED→GREEN.

### Activación en vivo (2026-07-12) — hallazgos + fix de cobertura dirigida ✅

Se activó Loop B en vivo contra Nacional (Magento). La corrida destapó 3 cosas que los tests con
fakes no veían, y se corrigieron (Strict TDD):
- **Gate browse-only**: `REST_CATALOG` (Bravo) ignora la consulta dirigida (browse-full). Loop B ahora
  SALTA plataformas browse-only (`supports_directed_query`); son territorio de Loop A.
- **Fix size-dup**: `build_directed_query` ya no duplica el tamaño si el `name` ya lo contiene.
- **🎯 Fix cobertura dirigida (el grande)**: Loop B ingestaba los ~65 resultados y matcheaba cada uno
  contra CUALQUIER canónico → cubría el objetivo por casualidad (**1/23**). Ahora
  `candidate_selection.select_best_candidate` elige el ÚNICO mejor candidato PARA el canónico objetivo
  (EAN-exacto → o mayor trigram del nombre) y solo ESE pasa a la cascada. Resultado re-validado en
  vivo (ingesta limpiada de cero, canónicos conservados): **21/50 cubiertos**, 21 `auto_linked` hybrid
  conf ~0.93 **SIN LLM** (juez OpenAI caído), grey-band → revisión (seguro). Confirma que el
  alto-confianza determinista auto-enlaza sin depender del LLM.
- Herramienta nueva: `seeds/save_clean.py --ingestion` (borra la huella de ingesta de TODAS las
  tiendas, CONSERVA canónicos/registries/canasta/taxonomía) — el "reset de ingesta" para re-probar.

### Pendientes tras la activación

1. **Juez OpenAI sin cuota (dev)**: grey-band no auto-enlaza hasta restaurar cuota o cambiar proveedor
   (tema billing). El circuit-breaker degrada con gracia (no crashea).
2. **F3.2 frescura (refresh minuto-a-minuto)** — la MITAD de F3.2 que quedó sin hacer: hoy
   `list_uncovered` solo trae lo NO cubierto (LEFT JOIN runtime); falta la **selección por frescura**
   (`last_seen_at`, patrón SRD 18h visibles / 3d ocultos) para RE-refrescar lo ya cubierto, + la
   vista materializada indexada para escala. Va DESPUÉS de confirmar la cobertura inicial en vivo.

**F3.4 — Corridas (Dagster) para mantener precios frescos** (equivalente al *Prices Batch* de SRD,
staleness-driven): asset `coverage_*` con **schedule** (frecuente, ej. diario/cada N h) deps de
`embed_canonicals`; separado del `discovery_*` (Loop A, baja frecuencia). SRD recomienda 15 min pero
solo agenda de verdad Ritmo (§3, `README:273-274`); en Cuadra el schedule de Dagster SÍ agenda.

**Ventaja Cuadra a mantener:** la cascada semántica valida el candidato de Loop B (SRD solo compara
referencia+barcode). NO reinventar: Dagster, SSRF-guard, change-only history ya están.

**(Opcional/enriquece) `regular_price`** (descuento, SRD `schema.ts:75`, teardown §6.6) — `Price` no
separa regular vs oferta; fuera del núcleo de F3.

