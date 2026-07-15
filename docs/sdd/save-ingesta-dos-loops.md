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

---

## 14. F3.2 — Frescura: refrescar lo ya cubierto (SDD, decidido 2026-07-12)

> **Objetivo.** Loop B (cobertura) hoy solo llena lo que FALTA (`list_uncovered`). Una vez cubierto, un
> producto nunca se re-visita → su precio ENVEJECE. F3.2 mantiene frescos los precios de lo cubierto,
> dentro de un SLA (`last_seen_at`), sin re-scrapear todo cada vez. Confianza = producto (regla SAGRADA).

### 14.1 El flujo por producto viejo (A → B → disponibilidad)

Cada `store_product` se identifica por `(provider_id, external_id)` + su `url`. Para un producto viejo:

```
1. A (primario)  → re-fetch DIRECTO por external_id/url conocido → precio → record_observation (change-only)
2. A falla (404/movido/id muerto)
   └ B (recovery) → búsqueda DIRIGIDA por EAN/nombre → select_best_candidate (para el canónico YA enlazado)
        · match por EAN exacto        → AUTO: repara store_product.external_id+url + record_observation
        · match por nombre/semántica  → COLA DE REVISIÓN (propone la reparación; humano confirma)
        · sin candidato               → is_available=false (desapareció, NO se borra)
```

**Decisiones (confirmadas con el usuario):**
- **B auto-aplica SOLO con EAN exacto**; por nombre/semántica → revisión (anti falso-refresh: un mal
  re-enlace = precio equivocado en un producto = daña confianza).
- **Entrega POR FASES:** F3.2a (A + frescura + schedule) primero; F3.2b (B recovery + gate) después.

**Ventaja Cuadra:** el **EAN + nombre del canónico ES la llave de recuperación** — SRD necesita
`product_shop_recovery_keys` por tienda (no tiene EAN); nosotros re-encontramos por semántica → menos
esquema, más moat. La reparación reusa `select_best_candidate` (ya construido en la cobertura dirigida).

### 14.2 F3.2a — Refresh directo por frescura (A) · FASE 1

**Componentes:**
1. **Selección por frescura** — `StoreProductRepository.list_stale_covered(market_id, now, *, visible_ttl=18h, hidden_ttl=3d, limit)`:
   `is_available=true AND last_seen_at < now-18h` **OR** `is_available=false AND last_seen_at < now-3d`,
   orden `last_seen_at` asc (más viejo primero). Devuelve lo mínimo para re-fetch: `(store_product_id,
   provider_id, external_id, url, platform)`. Índice `(is_available, last_seen_at)` para escala.
2. **Re-fetch por id/url (A)** — capacidad NUEVA del puerto de fuente: `ProductDetailSource.fetch_by_external_id(external_id, url) -> RawCatalogEntry | None`. La implementan VTEX (productId) y Magento
   (SKU). **Browse-only (REST_CATALOG/aggregator/spa) NO la soportan** → se refrescan por su browse
   completo (Loop A) vía el mismo change-only; F3.2a los salta (gate `supports_directed_query`, ya existe).
3. **Actualización** — `record_observation` (YA existe, change-only): precio igual → solo bumpea
   `last_seen_at`; precio distinto → `current_price` + fila `price` (histórico). Detecta bajadas → alertas.
4. **Use-case** `RefreshCoveredPrices` — orquesta list_stale → fetch_by_external_id (A) → record_observation.
   **Reusa F3.3**: round-robin por tienda + abort-on-down + result tipado. En FASE 1, `A` devuelve None
   (no encontrado) → `is_available=false` directo (sin B todavía).
5. **Schedule (Dagster)** — asset nuevo `freshness` con schedule FRECUENTE (ej. cada 1–2 h). NO depende
   de `embed_canonicals` (el enlace ya se conoce, no hay matching) → separado de `coverage`/`discovery`.
   El TTL (18h/3d) + la frecuencia definen el SLA real ("minuto a minuto" = aspiración; real = schedule).

**Datos:** sin tablas nuevas (usa `last_seen_at` + `is_available`). Solo un índice para la staleness query.

### 14.3 F3.2b — Recovery fallback (B) · FASE 2

Cuando A devuelve None, en vez de rendirse:
1. **B busca** — `build_directed_query` (EAN-first, ya existe) → adapter dirigido → candidatos.
2. **Selección** — `select_best_candidate` (ya existe) para el canónico YA enlazado del store_product.
3. **Gate (decidido):**
   - **EAN exacto** entre candidato y el EAN conocido del canónico → **AUTO-REPARA**:
     `StoreProductRepository.repair_locator(store_product_id, new_external_id, new_url)` + record_observation.
     Así **A vuelve a funcionar** la próxima corrida.
   - **Solo nombre/semántica** → **propuesta a cola de revisión** (humano confirma antes de reparar).
   - **Sin candidato** → `is_available=false`.
4. **Cola de reparación** — a decidir en el diseño de F3.2b: reusar `product_match pending_review` con un
   `method`/tipo nuevo, o una tabla ligera de propuestas (equivalente acotado a SRD
   `product_shop_recovery_reviews`). NUNCA auto-aplica lo no-EAN.

**Datos F3.2b:** el mecanismo de propuesta de reparación (reuso vs tabla nueva) — se cierra en su design.

### 14.4 Tareas (Strict TDD, RED→GREEN)

**FASE 1 — F3.2a (frescura + A):**
- [ ] `list_stale_covered` en el puerto + SQL (TTL visible/oculto, orden por antigüedad, límite) + índice.
- [ ] Puerto `ProductDetailSource.fetch_by_external_id` + impl VTEX + impl Magento (fetch de UN producto).
- [ ] Factory: construir el `ProductDetailSource` por plataforma (gate browse-only).
- [ ] Use-case `RefreshCoveredPrices` (round-robin + abort-on-down reusados; A→record_observation; A None→is_available=false).
- [ ] Wiring de producción (composition) + asset Dagster `freshness` + schedule frecuente.
- [ ] Tests: staleness query (integración), fetch_by_external_id por plataforma, use-case (unit con stubs), change-only ya cubierto.

**FASE 2 — F3.2b (recovery B + gate):**
- [ ] En `RefreshCoveredPrices`: A None → invocar B (build_directed_query + select_best_candidate).
- [ ] `repair_locator` en el puerto + impl (actualiza external_id + url).
- [ ] Gate: EAN-exacto → auto-repair; nombre → propuesta a revisión; sin candidato → is_available=false.
- [ ] Mecanismo de cola de reparación (diseño: reuso product_match vs tabla nueva).
- [ ] Tests: A-falla→B-EAN→repara; A-falla→B-nombre→revisión; A-falla→sin-candidato→unavailable.

### 14.5 Reuso (lo que NO se reinventa) y riesgos

- **Reusa:** `record_observation` (change-only), F3.3 (round-robin/abort/result tipado), `select_best_candidate`,
  `build_directed_query`, `supports_directed_query` (gate), `is_available` (F3.0), SSRF-guard, Dagster.
- **Riesgos:** (1) falso-refresh en B → mitigado por auto-solo-EAN. (2) fetch-by-id por plataforma:
  cada una tiene su endpoint de detalle (VTEX productId / Magento SKU) — verificar en vivo. (3) escala de
  la staleness query → índice `(is_available, last_seen_at)`; vista materializada solo si hace falta. (4)
  no martillar tiendas → el round-robin + TTL reparten; tope de batch por corrida.

---

## 15. Fuentes autenticadas (SDD, decidido 2026-07-12)

> **Objetivo.** Integrar fuentes que exigen credenciales (Bravo `/get` con `X-Auth-Token`; a futuro súper
> de US/CO con Bearer). La credencial vive en la BD (`store_registry`), editable en la UI del admin,
> aplicada por TODOS los adapters. Cero hardcode, cero redeploy para rotar un token — como SRD
> (`getBravoHeaders()`) pero con los valores en config, no en el código.

### 15.1 Investigación — métodos de auth más usados (2025-2026)
Populares para APIs REST/JSON: **Bearer/JWT** (el más común hoy), **API key** (header o query),
**Basic**, **OAuth2** (Bearer con refresh). HMAC/OpenID = nicho. Diseño: cubrir los **estáticos
populares** ahora (bearer/api_key/basic/none); OAuth2-refresh como extensión no-bloqueante.

### 15.2 Modelo de auth (typed) — DECISIÓN
`store_registry.auth` (JSONB) con `type` GUIADO (patrón Postman/Insomnia/Airbyte), NO headers crudos
(los crudos empujan la semántica + base64 + validación al que configura y la UI no puede renderizar
campos ni enmascarar el secreto):
```
{ "type": "none" }
{ "type": "bearer",  "token": "<secret>" }                          -> Authorization: Bearer <secret>
{ "type": "api_key", "in": "header", "name": "X-Auth-Token", "value": "<secret>" }
{ "type": "api_key", "in": "query",  "name": "api_key", "value": "<secret>" }
{ "type": "basic",   "username": "u", "password": "<secret>" }      -> Authorization: Basic base64(u:p)
(futuro) { "type": "oauth2_client_credentials", ... } -> fetch+cachea Bearer
```
`store_registry.headers` (JSONB) = headers estáticos NO-secretos (Host, User-Agent). El adapter manda
`{defaults, **headers, + auth}`. Aplica a los 4 adapters (VTEX/Magento/RestCatalog + detail).

### 15.3 Localizador de detalle — DECISIÓN
El re-fetch por-producto (camino A, F3.2a) necesita un localizador que varía por plataforma. Hoy
`external_id` alcanza (VTEX productId / Magento SKU); Bravo NO (external_id=idexterno, `/get` usa
idArticulo). Decisión: **JSONB `source_ref` (nullable) en `store_product`** — NO una columna
Bravo-shaped. Bravo mapea `{"id_articulo": "29866"}`; el resto NULL. Forward-compatible.

### 15.4 Bravo: camino A + fallback C automático
- Detail adapter REST `/public/articulo/get?idArticulo=<source_ref.id_articulo>` con los headers del
  registry (auth aplicada por 15.2).
- **A→C automático**: si A NO es usable (sin token / 403 / error transitorio agotado) → NO marcar
  unavailable; enrutar a refresh por browse (C, Loop A change-only). DISTINGUIR "detail no usable"
  (→ C) de "no encontrado con credencial válida" (→ is_available=false). Bravo se refresca solo aunque
  el token expire.

### 15.5 Seguridad (credenciales) — regla
- El secreto vive en `store_registry.auth` (BD). La API de LECTURA del admin lo devuelve
  **ENMASCARADO** (`••••1234`); NUNCA en claro, NUNCA logueado (`mask_auth()` helper). Escritura
  write-only (PATCH acepta el secreto; GET nunca lo revela). HTTPS siempre; SSRF-guard ya aplica.

### 15.6 Capas / tareas (Strict TDD, backend-first, por fases)
**FASE 1 — auth general (backend):**
- [ ] infra `source_auth.py`: `build_request_auth(headers, auth) -> (headers, query)` (bearer/api_key/
  basic/none) + `mask_auth(auth)`. PURO, unit.
- [ ] Plumbing: VTEX/Magento/RestCatalog (+ detail) aplican `build_request_auth` (hoy User-Agent
  hardcodeado) — headers/auth del registry vía la factory.
- [ ] `store_product.source_ref` (JSONB) + migración; `bravova_profile` mapea `id_articulo`.
**FASE 2 — Bravo detail + fallback:**
- [ ] `RestCatalogDetailAdapter` (`/articulo/get`) por profile (detail path + map single) +
  `factory.for_detail` para REST_CATALOG.
- [ ] A→C fallback en el orquestador de frescura (providers sin detail usable → refresh por browse).
**FASE 3 — admin UI:**
- [ ] Campos de auth en la feature de fuentes (tipo + secreto enmascarado + headers) — `cuadra-save-admin`.

