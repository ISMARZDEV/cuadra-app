# Save — análisis del schema `save` (16 tablas)

> **Estado 2026-07-11.** Radiografía del schema de la base de datos de Save tal como está declarado en
> `apps/api/src/contexts/save/infrastructure/models.py` (fuente de verdad de los modelos SQLAlchemy;
> las migraciones Alembic viven en `apps/api/migrations/versions/`). Objetivo: mapa relacional completo,
> decisiones de diseño destacadas y **gaps del schema frente al plan de paridad** de
> [`supermercadosrd-scrapers-teardown-y-plan-cuadra.md`](./supermercadosrd-scrapers-teardown-y-plan-cuadra.md).
>
> **Reglas de arquitectura que gobiernan este schema:**
> - **ADR 33** — schema-per-context aislado (`save.*`). FKs **solo intra-contexto**; identidades cross-context
>   (`market_id`, `user_id`) se referencian **por ID, SIN FK**.
> - **ADR 31** — los modelos SQLAlchemy son SOLO infraestructura (el dominio es puro).
> - Normalización 3NF salvo value-objects atómicos inline (`Money` → `(amount_minor, currency)`;
>   `Quantity` → `(size_amount, size_measure)`).
> - Dinero en **BIGINT** (minor units).
>
> **Docs relacionados:** skills `cuadra-save`, `cuadra-save-matching`, `cuadra-save-admin`.

---

## 0. TL;DR

- **16 tablas** en el schema `save`, organizadas en 5 áreas: catálogo canónico, ingesta, matching,
  merchandising y usuario/alertas.
- **El core ya es superior a SupermercadosRD**: histórico SCD-4 partido, `product_match` como fuente de
  verdad única, taxonomía-árbol con embeddings, clasificación de categoría con historial.
- **El gap del schema es exactamente el P1/P2 del teardown**: no modela `regular_price` (descuento),
  `location_id` (sucursal), deals materializados ni imágenes rotas. Ninguno es refactor grande.

---

## 1. Las 16 tablas por área

### 🟢 Catálogo canónico (el core)

| Tabla | Rol | Claves de diseño |
|---|---|---|
| `taxonomy_node` | Árbol de categorías canónicas (self-FK `parent_id` CASCADE) | único `(market_id, parent_id, name)` · `embedding` BGE-M3 (1024) **solo en hojas** (save-category-classification) |
| `brand` | Marca normalizada (3NF, como `merchant` en insights) | único `(market_id, name)` |
| `canonical_product` | Producto canónico **por mercado** (resultado del matching) | `slug` público URL-safe (SEO) · `embedding` 1024 · Quantity VO inline `(size_amount Numeric(18,8), size_measure)` · único `(market_id, slug)` |
| `store_product` | Presentación del canónico en una tienda + **precio ACTUAL** (SCD-4 current) | único `(provider_id, external_id)` · `canonical_product_id` **NULLABLE** (sin matchear → cola) · `current_price_minor` BIGINT · guarda atributos crudos (`name`/`brand`/`size_text`/`image_url`) para el revisor |
| `price` | Histórico de precio **APPEND-ONLY** (SCD-4, "el foso temporal") | `price_type` (online\|delivery\|shelf\|receipt) · auto-contenido (lleva su `currency`) · índice `(store_product_id, captured_at)` |

### 🟠 Fuentes / ingesta

| Tabla | Rol | Claves de diseño |
|---|---|---|
| `provider` | Tienda/proveedor | `type` (supermarket\|bank\|insurer) · `platform` (vtex\|magento\|shopify\|aggregator\|spa) · `base_url` · `logo_url` |
| `store_registry` | Config de extracción por provider **(1:1)** — reemplaza el wiring hardcodeado de `ingestion/save/sources.py::build_sources` | `endpoints`/`headers`/`auth` JSONB · `enabled` · `health_status` (derivado, lo escribe Batch 3E) · `paused_at` |
| `basket_query` | Canasta curada **como dato** — reemplaza `BASKET_QUERIES` hardcodeado | único `(market_id, query_text)` · `position` · `active` |

### 🔵 Matching

| Tabla | Rol | Claves de diseño |
|---|---|---|
| `product_match` | **Fuente de verdad** del enlace `store_product`↔`canonical_product` | único por `store_product_id` (la cascada UPSERTEA, nunca duplica) · `confidence` Numeric(5,4) · `method` (ean\|trgm\|vector\|hybrid\|llm\|human) · `status` (auto_linked\|pending_review\|rejected) · `reason_code`/`reason_note` (active-learning) · `judge_input_tokens`/`judge_output_tokens`/`judge_model` (observabilidad de costo, nunca entra a la decisión) |
| `review_candidate` | Snapshot de los top-5 candidatos ofrecidos al revisor de un match `pending_review` | `score` = CRUDO por-etapa (**no** el fusionado por RRF) · capturado en la cascada, nunca recalculado · CASCADE al borrar el match · nunca se persiste para `auto_linked` |
| `category_classification` | Decisión de clasificación de categoría (save-category-classification, A2) | **CHECK XOR**: exactamente uno de `(store_product_id, canonical_product_id)` no nulo · **índice único parcial** `WHERE status='active'` por FK → a lo sumo UNA activa por producto · re-clasificar = superseded + nueva (historial preservado) |

### 🟣 Merchandising

| Tabla | Rol | Claves de diseño |
|---|---|---|
| `collection` | Colección curada (A6): grupo hand-pick para un carrusel | `slug` público · único `(market_id, slug)` · `position` |
| `collection_product` | Pertenencia producto↔colección **(M:N)** con orden | único `(collection_id, canonical_product_id)` · ambas FK CASCADE |

### ⚫ Usuario / alertas (G4)

| Tabla | Rol | Claves de diseño |
|---|---|---|
| `price_alert` | Suscripción de un usuario a bajadas de un producto | único `(user_id, canonical_product_id)` · `threshold_minor` NULL = cualquier bajada · `user_id` sin FK (ADR 33) |
| `alert_notification` | Evento de alerta disparado (feed in-app) | único `(price_alert_id, provider_name, captured_at)` = idempotente · `drop_bps` · `read_at` |
| `push_token` | Expo push token de un dispositivo | único por `token` · `platform` (ios\|android) |

---

## 2. Grafo relacional (FKs — todo intra-schema `save.*`)

```
taxonomy_node ──self(parent_id)──┐
      ▲                          │
      │                   canonical_product ◄──── collection_product ──► collection
      │                     ▲   ▲   ▲
   brand ───────────────────┘   │   │
                                │   └──── price_alert ──► alert_notification
   provider ─┐                  │
     ▲       │           store_product ──► price (append-only)
     │       └──────────────► ▲  ▲
 store_registry               │  └──── category_classification (XOR store/canonical)
                       product_match ──► review_candidate

   push_token   (standalone; user_id por ID, sin FK)
```

**Cross-context por ID (sin FK, ADR 33):** `market_id` (taxonomy, collection, brand, provider,
basket_query, canonical_product, price_alert), `user_id` (price_alert, alert_notification, push_token),
`decided_by` en `product_match` (TEXT: 'system' | admin user_id).

---

## 3. Decisiones de diseño que están bien

1. **SCD Type 4 partido** — precio actual en `store_product.current_price_minor` (change-only, con
   `last_seen_at`) + historia en `price` append-only (nunca UPDATE). Equivale a
   `products_shops_prices` + `products_prices_history` de SupermercadosRD, pero **mejor**: cada fila de
   `price` es auto-contenida (lleva su `currency`) → exportable a frío sin joins.
2. **`product_match` como single source of truth** con unique por `store_product_id` → la cascada
   upsertea, nunca duplica el intento de enlace.
3. **`category_classification` con índice único parcial** `WHERE status='active'` → a lo sumo UNA
   clasificación activa por producto, con historial preservado (re-clasificar sin anomalía de update).
4. **Dinero en BIGINT minor units** consistente en las 4 tablas que lo tocan (`store_product`, `price`,
   `price_alert`, `alert_notification`).
5. **pgvector embeddings** en `canonical_product` Y `taxonomy_node` (1024, BGE-M3) → un solo modelo por
   deployment (constraint documentado en la migración).
6. **Atributos crudos preservados en `store_product`** (`name`/`brand`/`size_text`/`image_url`) además del
   match, para que el revisor humano vea lo que la ingesta descartaría. Redundancia deliberada.

---

## 4. 🔴 Gaps del schema vs el teardown de SupermercadosRD

| Gap (§ del teardown) | Estado en el schema | Qué falta |
|---|---|---|
| **§6.6 `regular_price`** (precio regular vs oferta) | ❌ `store_product` y `price` guardan **un solo precio** (`current_price_minor` / `value_minor`) | No hay forma de mostrar "descuento". SupermercadosRD guarda `regularPrice` (`schema.ts:75`). El `price_type` de Cuadra separa online/shelf/receipt, pero el descuento es **ortogonal** (regular vs current dentro de `online`) |
| **§6.6 `location_id`** (sucursal) | ❌ No existe. `store_product` es único por `(provider_id, external_id)`, sin dimensión de sucursal | PriceSmart (club) y Carrefour (colección) tienen precio POR sucursal → hoy no modelable |
| **§6.7 Deals materializados** | ⚠️ Sin tabla `todays_deals`. Existe `domain/drops.py` + `application/drops.py` a nivel aplicación | Evaluar si un materializado (vista/tabla refrescada, como su `refresh_todays_deals()`) mejora la superficie de ofertas |
| **§6.9 Imágenes rotas** | ❌ Sin `product_images` / `product_broken_images` / reportes | Auto-sanación de imágenes no modelable (en un marketplace las imágenes importan) |
| **§6.5 Recover/catalog-sync → cola** | ⚠️ `product_match` + `review_candidate` existen, pero **solo se llenan desde el matching de refresh** | No hay productor de catálogo-nuevo / URL-muerta que alimente la cola (ellos tienen `recover-hidden` + `catalog-sync`) |
| **§6.10 SFTP/CSV** | N/A a nivel schema (es un `CatalogSource` file-based, no una tabla nueva) | — |

**Conclusión:** los dos gaps más accionables (`regular_price` + `location_id`, §6.6) son **extender
`price`/`store_product` + una migración**, no un refactor. El resto (deals, imágenes, recover) son
features con su propio change SDD.

---

## 5. Observaciones técnicas / riesgos

- **`ondelete` inconsistente en `product_match`**: `store_product_id` y `canonical_product_id` **no**
  declaran `ondelete`, mientras `review_candidate` y `category_classification` sí cascadean. Borrar un
  `canonical_product` con matches vivos → error de FK. Puede ser **intencional** (proteger la fuente de
  verdad del enlace), pero conviene confirmarlo explícitamente.
- **`alert_notification` denormaliza `provider_name`** (TEXT) en el unique de dedup en vez de
  `provider_id` → es un snapshot para el feed (intencional), pero acopla la idempotencia al nombre del
  proveedor, no a su identidad.
- **`taxonomy_node.embedding` solo en hojas (`level=1`)** — NULL hasta que el asset `EmbedCategories` lo
  puebla. La clasificación semántica depende de que ese job haya corrido.
- **`store_product.canonical_product_id` nullable** es correcto (producto sin matchear → cola), pero
  implica que toda query de comparación cross-cadena debe filtrar `IS NOT NULL` o joinear por
  `product_match`.

---

## Apéndice — referencia archivo:línea

Todo el schema: `apps/api/src/contexts/save/infrastructure/models.py`.

| Tabla | Línea (models.py) |
|---|---|
| `taxonomy_node` | :50 |
| `collection` | :73 |
| `collection_product` | :91 |
| `brand` | :117 |
| `provider` | :133 |
| `store_registry` | :151 |
| `basket_query` | :183 |
| `canonical_product` | :208 |
| `store_product` | :240 |
| `price_alert` | :276 |
| `alert_notification` | :300 |
| `push_token` | :333 |
| `price` | :354 |
| `product_match` | :380 |
| `category_classification` | :423 |
| `review_candidate` | :471 |
