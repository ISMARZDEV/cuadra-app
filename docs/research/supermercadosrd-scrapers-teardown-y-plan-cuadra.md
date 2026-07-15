# SupermercadosRD (scrapers) → Cuadra Save: teardown del código + plan de paridad

> **Estado 2026-07-11.** Teardown del **código fuente real** del scraper de producción de
> SupermercadosRD (antes solo teníamos análisis de caja negra; ahora tenemos el repo). Cada técnica,
> regla y job lleva su **referencia de path (archivo:líneas)** para saber exactamente dónde mirar al
> planear/implementar.
>
> **Filosofía**: *SupermercadosRD es el padre de Cuadra.* Heredamos su método de scrapeo probado en
> producción y lo llevamos al siguiente nivel con la arquitectura hexagonal, el matching semántico y
> el orquestador (Dagster) que ellos no tienen. La meta de este doc: **que a Cuadra no le falte nada
> de lo que SupermercadosRD hace bien.**
>
> **Repos** (rutas absolutas de referencia):
> - Competidor (solo lectura, NO editable desde esta sesión): `~/Desktop/DEV/supermercadosrd-scrapers-main/` → citado como `SRD/…`
> - Cuadra: raíz del repo actual → citado como rutas repo-relativas.
>
> **Docs relacionados** (previos, complementarios): [`docs/pending/save-ingesta-cobertura-cadenas.md`](../pending/save-ingesta-cobertura-cadenas.md) ·
> [`docs/research/supermercadosrd-analisis.md`](./supermercadosrd-analisis.md) ·
> [`docs/research/save-fable/03-referencia-supermercadosrd-teardown.md`](./save-fable/03-referencia-supermercadosrd-teardown.md) ·
> skills `cuadra-save`, `cuadra-save-matching`, `cuadra-save-admin`.

---

## 0. TL;DR — el veredicto

| | SupermercadosRD | Cuadra Save |
|---|---|---|
| **Cadenas vivas** | **9** (Sirena, Nacional, Jumbo, Plaza Lama, PriceSmart, Bravo, Merca Jumbo, Garrido, Carrefour) | **1 activa** (Bravo) + VTEX/Magento probados en vivo (Sirena/Nacional/Jumbo/Merca) sin registrar |
| **Extracción** | 1 técnica por tienda, madura, con anti-bot + Puppeteer | Adapters genéricos por PLATAFORMA (VTEX/Magento/REST_CATALOG) — más limpio, menos cobertura |
| **Matching** | Referencia exacta + barcode (`products_global_ids`) | **Cascada EAN→pg_trgm→pgvector(BGE-M3)→RRF→Claude-juez** — MUY superior |
| **Orquestación** | GitHub Actions cron (`workflow_dispatch` + 1 cron) | **Dagster** (`ingestion.definitions`, `make ingestion-dev`) + CLI `make save-refresh` |
| **Historial precio** | `products_prices_history`, insert change-only | `Price` append-only, `price_type` (online/delivery/shelf/receipt), SCD-4 change-only |
| **Cola de revisión** | `product_shop_recovery_reviews` (propuestas, sin auto-aplicar) | `product_match` `pending_review` + admin OFV (UI construida) |
| **Seguridad ingesta** | — | SSRF-guard + `TestSource` dry-run |
| **Deals / imágenes rotas / SFTP** | ✅ los 3 | ❌ ninguno |

**Dónde Cuadra ya gana**: matching, arquitectura, multi-país, orquestador, seguridad.
**El gap #1**: amplitud de fuentes + los jobs periféricos (deals, recovery, catalog-sync, imágenes, SFTP).

---

## 1. Arquitectura del competidor (cómo está armado)

Script pile pragmático en TypeScript/Node (pnpm), ~11.6k líneas, Drizzle + Postgres. Escribe **directo**
a la DB que consume su Next.js → por eso cada write dispara `revalidateProduct` (ISR revalidation).

- **Entry points** = 8 jobs como npm scripts (`SRD/package.json:27-38`), cada uno un `tsx src/jobs/*.ts`.
- **Dispatcher de scrapeo**: `scrapePrice(input)` hace `switch(shopId)` → extractor de la tienda (`SRD/src/scrape-price.ts:18-42`).
- **Contrato de resultado tipado** (clave para persistencia limpia): `ok | not_found | error`, cada uno con
  flags `retryable` y `hide` (`SRD/src/result.ts:9-69`, tipos en `SRD/src/types.ts:29-64`). El job decide
  ocultar/reintentar SOLO leyendo esos flags — nunca inspecciona el error crudo.
- **Sin UI de negocio** (excluida a propósito) y **sin las URLs privadas** de varias APIs (leídas de env
  para no exponerlas): `SRD/src/api-endpoints.ts:41-58` (throw si falta la env).

### 1.1 Modelo de datos — `SRD/src/db/schema.ts`

| Tabla | Path | Rol |
|---|---|---|
| `products` | `:12-21` | Canónico (id, name, image, unit, brandId, baseUnit, baseUnitAmount, deleted) |
| `products_shops_prices` | `:67-86` | **Precio por tienda**. PK `(productId, shopId)`. `url` + `api` + `locationId`, `currentPrice`/`regularPrice`, `updateAt`, `hidden` |
| `products_prices_history` | `:88-94` | Append **solo cuando cambia el precio** |
| `products_global_ids` | `:23-33` | EAN/barcodes por producto (con `sourceShopId`, `type`, `value`) — insumo del matching |
| `product_images` / `product_broken_images` / `product_image_update_reports` | `:35-65` | Ciclo de vida de imágenes |
| `todays_deals` | `:96-98` | Deals materializados (refrescados por función SQL) |
| `product_shop_recovery_keys` | `:100-120` | Llave externa estable por (product, shop) para re-descubrir URLs |
| `product_shop_recovery_reviews` | `:122-164` | **Cola de revisión humana** de propuestas (URL/precio) con evidencia `jsonb` |
| `nacional_catalog_sync_state` / `sirena_catalog_sync_state` | `:166-202` | Estado del descubrimiento de catálogo (sitemap/categoría) |

Las tablas de revisión se auto-crean en runtime si no existen (DDL + índices): `SRD/src/db/ensure-recovery-schema.ts:3-70`.

**Nota**: las migraciones en `SRD/migrations/` son solo `ALTER` (agregan columnas) — NO crean las tablas base.
Para levantarlo hay que bootstrapear el schema desde `schema.ts` (ver §5).

---

## 2. Las 9 cadenas — técnica de extracción, reglas y gotchas

> Cada tienda es una técnica distinta. Esto es el **know-how más valioso** del repo. `shopId` fijos en
> `SRD/src/types.ts:1` y nombres en `SRD/src/result.ts:9-19`. Headers por tienda (UAs rotativos + firmas
> realistas) en `SRD/src/http-client.ts:319-470` (`getHeadersByShopId` en `:447-470`).

### 2.1 Sirena — `shopId=1` — VTEX (motor completo)
- **Extractor de precio**: `SRD/src/shops/sirena.ts:37-96`. El motor VTEX vive en `SRD/src/sirena-vtex.ts` (522 líneas):
  - **`salesChannel sc=1`** inyectado a toda búsqueda VTEX (`withSirenaVtexSalesChannel:156-180`, const `:11`).
  - Precio del **seller default** → `commertialOffer.Price` (current) / `ListPrice` (regular): `getDefaultSeller:190-202`, `normalizeSirenaVtexProduct:393-423`.
  - **⚠️ Sirena SÍ expone `ean`** por item VTEX (`sirenaVtexItemSchema.ean:45`, `extractSirenaVtexImages`/schema) → a diferencia de Bravo/Magento, entra al matching por EAN directo. **Dato clave para la cascada** (ver §6.5 nota EAN).
  - Búsqueda (`buildSirenaVtexSearchApi:274-282`) + **árbol de categorías** crawl/flatten (`fetchSirenaVtexCategoryTree:425-456`, `flattenSirenaVtexCategoryTree:490-522`) → motor del Sirena catalog sync (§3.5).
  - Prefijos CDN de imagen VTEX: `SIRENA_VTEX_IMAGE_PREFIXES:15-18` (`gruporamos.vtexassets.com`).
- **Headers**: tokens `client`/`source` en **base64** hardcodeados → `SRD/src/http-client.ts:354-369`.
- **Cuadra ya lo ingiere** en vivo con `VtexAdapter` (`sirena.do`), sin registrar. Ver cobertura doc L17.

### 2.2 Nacional — `shopId=2` — Magento REST + fallback HTML
- **Extractor**: `SRD/src/shops/nacional.ts`. Dos caminos:
  - **REST** (`searchCriteria` por SKU): `:218-286`, URL builder `:147-157`.
  - **HTML** (cheerio, `data-price-type` attrs): `inspectNacionalProductPage` `:54-145`.
- **Reglas críticas**:
  - Gating por `website_id` (solo productos de la web Nacional): `:189-198`.
  - **Ventana de `special_price`** activa por fechas (`special_from_date`/`special_to_date`): `:200-216`.
  - `503 backend read error` → error retryable (el batch lo trata especial, ver §3.1): `:123-130`.
  - Redirect a host ajeno → `not_found` + hide: `:74-90`.
- **Cuadra ya lo ingiere** con `MagentoAdapter` (Magento CCN). Cobertura doc L18.

### 2.3 Jumbo — `shopId=3` — Magento GraphQL + **Puppeteer/Cloudflare**
- **Extractor de precio**: GraphQL `products(filter:{sku})` → `SRD/src/shops/jumbo.ts:26-218`. Endpoint + store code:
  `SRD/src/shops/jumbo-shared.ts:7,43-46` (header `store`, default `jumbo`).
- **SKU candidates** desde la URL (incluye el truco del prefijo `998`): `SRD/src/recovery/shared.ts:41-71`.
- **Puppeteer + stealth** (para el buscador HTML detrás de **Cloudflare**): `SRD/src/http-client.ts:152-286`
  (`applyStealthSettings` `:152-176`, `fetchWithBrowserDetailed` con espera de "just a moment" `:209-286`,
  `launchBrowser` prod-chromium vs dev `:178-203`). Parser de resultados: `SRD/src/recovery/shared.ts:229-262`.
- **Regla**: `finalPrice=0` sin imágenes → `not_found` (`:195`). Filtra imágenes placeholder (`jumbo-shared.ts:48-76`).
- **Cuadra ya lo ingiere** con `MagentoAdapter` + header `Store: jumbo`. Cobertura doc L19.

### 2.4 Plaza Lama — `shopId=4` — GraphQL "Moira Engine"
- **Extractor**: `SRD/src/shops/plaza-lama.ts:65-128`. Query `getProductsBySKU` con `clientId:"PLAZA_LAMA"`,
  `storeReference:"PL08-D"`. SKU desde la URL (patrón 8-14 dígitos): `:12,52-59`.
- **Headers** Apollo Moira + `dpl-api-key`: `SRD/src/http-client.ts:371-391`.
- **Regla**: promo activa (`promotion.conditions[0].price`) gana sobre `price`: `:122-127`.
- **Cuadra: NO lo ingiere.** Es Next.js custom con API REST propia → adapter viable. Cobertura doc L21.

### 2.5 PriceSmart — `shopId=5` — API JSON + selección por sucursal + unidad
El extractor más complejo: `SRD/src/shops/pricesmart.ts:447-566`.
- **Precio por CLUB/sucursal** (`country:"DO"`, ranking de `PREFERRED_DO_PRICESMART_LOCATION_IDS`):
  selección `:300-370`, `locationId` = `club`.
- **Actualización de unidad** para productos vendidos por peso (carnes/pescados): patrones de categoría
  `:24-38`, umbral de match de unidad `0.97` `:23`, `getProductUnitUpdate` `:393-430`.
- **Regla**: `source_unit_mismatch` bloquea si la unidad del catálogo no cuadra con la del producto (`:546-556`).
- **Sucursales DO** (el `locationId`=`club`): `SRD/src/pricesmart-locations.ts:1-17` — preferencia `6801` Los Prados,
  `6804` Arroyo Hondo, `6805` San Isidro, `6806` Bolívar, `6802` Santiago; default `68` (RD nacional).
- **Cuadra: NO lo ingiere.** El `locationId` por sucursal es algo que Cuadra hoy NO modela (ver §4, §6.6).

### 2.6 Bravo — `shopId=6` — API propia "bravova"
- **Extractor de precio (artículo individual)**: `SRD/src/shops/bravo.ts:38-86`. Espera
  `data.associatedTienda[].pvpArticuloTienda` (prefiere `idTiendaArticuloTienda===1000`).
- **Headers**: `X-Auth-Token` **hardcodeado** + Host `bravova-api.superbravo.com.do`: `SRD/src/http-client.ts:427-438`.
- **⚠️ Endpoint descubierto en vivo (2026-07-11, no estaba documentado):**
  `GET https://bravova-api.superbravo.com.do/public/articulo/get?idArticulo=<id>` → shape single-article.
  (El endpoint de **browse** que usa Cuadra es `/public/articulo/list`.)
- **Imágenes**: CDN `bravova-resources.superbravo.com.do/images/catalogo/big/{idexternoArticulo}_{n}.png?v={ver}`:
  `SRD/src/shops/bravo-images.ts:12-39`.
- **Cuadra YA lo ingiere** (browse-full) vía `RestCatalogAdapter` + `bravova_profile.py`. Ver §4.

### 2.7 Merca Jumbo — `shopId=7` — store-view privado de Nacional (Magento CCN)
- **Extractor**: `SRD/src/shops/merca-jumbo.ts:14-51` → `SRD/src/shops/merca-jumbo-shared.ts:147-257`
  (query Magento GraphQL `products(filter:{sku})`, idéntica a Jumbo). SKU desde la URL `:124-139`.
- **Cómo accede el competidor**: usa un **endpoint PRIVADO** vía env `MERCA_JUMBO_API_URL` +
  header `store: <MERCA_JUMBO_STORE_CODE>` (`:116-122,180-197`) — NO el `graphql` público. Por eso el
  repo público no expone los identificadores (README `SRD/README.md:52-55,283-284`).
- **Cómo lo resolvió Cuadra (más simple)**: el header `Store: mercajumbo` sobre el `graphql` **público**
  de `supermercadosnacional.com` → 303 productos con **precios propios** (a veces +40%). Cobertura doc
  L20,176-190. **Cero adapter nuevo** (reusa `MagentoAdapter`). Es el mismo Magento por otra puerta.

### 2.8 Garrido — `shopId=8` — GraphQL "Moira Engine" (¡mismo endpoint que Plaza Lama!)
- **Extractor**: `SRD/src/shops/garrido.ts:164-213`. Query `getProductsBySKU` con `clientId:"TIENDAS_GARRIDO"`,
  itera `GARRIDO_STORE_REFERENCES`. **Reusa `PLAZA_LAMA_GRAPHQL_URL`** (`:96`) → misma plataforma white-label.
- **Regla peculiar**: `clickMultiplier` — multiplica el precio para productos a granel (`:143-162`).
- SKU desde URL patrón `/p/{sku}`: `:16,66-73`. Headers Apollo Moira: `SRD/src/http-client.ts:409-425`.
- **Sucursales** (itera ambas por SKU): `GAD` Autopista Duarte (default) + `GLA` Las Américas
  (`SRD/src/garrido-locations.ts:1-12`).
- **Cuadra: NO lo ingiere.** Un solo adapter Moira cubre Plaza Lama **y** Garrido. Cobertura doc L22,36-39.

### 2.9 Carrefour — `shopId=10` — Typesense (search engine)
- **Extractor**: `SRD/src/shops/carrefour.ts:169-220`. Busca en **Typesense** (`typesense.quickkart.app`)
  por `internalCode`: `fetchCarrefourProductBySku` `:97-138`.
- **Config necesaria**: `CARREFOUR_TYPESENSE_API_KEY` (header) + `CARREFOUR_PLAZA_DUARTE_COLLECTION_ID`
  (colección = sucursal) → `:11-14,87-95`, header `:440-445`. **No hay defaults reales en el código.**
- **Regla de disponibilidad**: `salePrice>0 && maxPurchase>0` (`:157-167`).
- **Cuadra: NO lo ingiere.** Requiere un adapter Typesense nuevo.

### 2.10 Resumen de plataformas (para el diseño de adapters)

| Plataforma | Cadenas | Adapter Cuadra | Estado |
|---|---|---|---|
| VTEX | Sirena | `vtex_adapter.py` | ✅ existe, probado en vivo |
| Magento CCN | Nacional, Jumbo, Merca | `magento_adapter.py` (+ `store_code` por header) | ✅ existe, probado en vivo |
| REST propia (browse) | Bravo | `rest_catalog_adapter.py` + `bravova_profile.py` | ✅ existe y **activo** |
| **GraphQL Moira** | Plaza Lama, Garrido | — | ❌ **falta** (1 adapter cubre 2 cadenas) |
| **Typesense** | Carrefour | — | ❌ **falta** |
| Agregador (PedidosYa/UberEats) | multi-cadena | — | ❌ falta (roadmap Apify, cobertura doc L31-34) |

**Nota de matching — EAN por cadena** (define qué etapa de la cascada de Cuadra atrapa cada tienda):
- **Sirena (VTEX) SÍ trae EAN** (`sirena-vtex.ts:45`) → entra directo por la etapa EAN (match barato y exacto).
- **Nacional/Jumbo/Merca (Magento)**: el path de PRECIO no expone EAN; el catalog-sync de ellos lo resuelve por
  referencia+barcode via `products_global_ids`. En Cuadra caerá a trgm/pgvector.
- **Bravo**: `associatedEan` viene **vacío** (cobertura doc L133) → siempre cae a trgm/pgvector/Claude-juez.
- **Implicación**: priorizar fuentes con EAN (Sirena) para bootstrapear el índice canónico con matches de alta
  confianza, y reservar el Claude-juez para las que no traen EAN (Bravo, Magento). Es exactamente donde Cuadra
  supera a SupermercadosRD (ellos sin EAN no matchean; Cuadra sí, por semántica).

---

## 3. Los 8 jobs — qué hacen, cadencia y reglas

> Cadencias **recomendadas** en `SRD/README.md:23-30`, pero ojo: los workflows de CI son
> `workflow_dispatch` (disparo MANUAL) — **solo Ritmo tiene cron real** (`14:30 UTC` diario,
> README `:273-274`). O sea: las cadencias "cada 15 min / 3h / …" son la intención, no están agendadas
> hoy. Cada workflow instala Chrome para Puppeteer y pasa TODOS los secrets de env
> (`SRD/.github/workflows/scrape-prices-batch.yml`, 7 workflows en total). En Cuadra el equivalente es un
> **asset/schedule de Dagster** (`apps/api/ingestion/save/assets.py`, `definitions`) — que SÍ agenda de verdad.

### 3.1 Prices Batch — cada 15 min — `SRD/src/jobs/scrape-prices-batch.ts`
El corazón. Refresca precios de lo ya conocido.
- **Filtro de staleness** (`:100-118`): visibles con `updateAt < now()-18h` **O** ocultos con `updateAt < now()-3d`.
- **Round-robin por tienda** para repartir carga y no martillar un host: `:121-185` (N URLs/tienda, rondas
  paralelas 1-por-tienda). Helper reusable: `SRD/src/scrape-many.ts:11-77`.
- **Backoff exponencial + jitter** en 429/503: `SRD/src/http-client.ts:497-524`.
- **Nacional `backend_503` aborta la iteración** (protege de martillar un backend caído): `:79-86`.
- **Persistencia change-only** (lo mejor del repo): `SRD/src/db/apply-scrape-result.ts:194-318`.
  - hide/show por `hidden` flag: `:39-74`; no oculta si otra tienda aún lo vende: `:76-94`.
  - history SOLO si `currentPrice` cambió (guards `IS DISTINCT FROM`): `:264-312`.
  - actualiza `url` canónica si el producto se movió: `:242-262`.
  - `revalidateProduct` (ISR) tras cada write: `SRD/src/db/revalidate-product.ts:1-34` (no-op sin env).

### 3.2 Deals — cada 3h — `SRD/src/jobs/scrape-deals.ts`
- Lee `todays_deals` ⨝ `products_shops_prices`, re-scrapea round-robin (`:98-147`).
- Al final ejecuta `SELECT public.refresh_todays_deals()` (función SQL materializadora): `:151`.

### 3.3 Recover Hidden Products — cada 6-12h — `SRD/src/jobs/recover-hidden-products.ts`
Re-descubre URLs muertas de productos ocultos. **Productor de la cola de revisión.**
- Deriva una **llave externa estable** por tienda: `SRD/src/recovery/shared.ts:122-170`
  (Nacional=`sku`, Jumbo=`url_tail`, Plaza Lama=`sku`).
- Re-descubre la URL/API actual: `SRD/src/recovery/lookup.ts:432-461` (dispatcher), Nacional `:175-267`,
  Jumbo (búsqueda por NOMBRE + match por url-tail, con Puppeteer) `:269-337`, Plaza Lama `:339-430`.
- **Verifica re-scrapeando** el candidato antes de proponerlo: `verifyProposal` `:123-173`.
- **Job**: consulta ocultos que NO estén ya `pending_review`/`verified` (`SRD/src/jobs/recover-hidden-products.ts:95-152`),
  round-robin por tienda `:217-237`, filtro opcional `--shop-id`. Solo cadenas con llave estable hoy: 2/3/4
  (`RECOVERABLE_SHOP_IDS`). Persiste vía `SRD/src/recovery/store.ts` (`upsertRecoveryKey`/`upsertRecoveryReview`,
  guard `hasVerifiedProposal:15-21`). DDL auto: `SRD/src/db/ensure-recovery-schema.ts`.
- Escribe **propuesta** a `product_shop_recovery_reviews` — **NUNCA auto-aplica**. Tipos: `SRD/src/recovery/types.ts:1-63`.

### 3.4 Nacional Catalog Sync — cada 6-12h — `SRD/src/jobs/sync-nacional-catalog.ts`
Descubre catálogo NUEVO desde el sitemap. **Productor de la cola de revisión.**
- Lee sitemap vivo, diff por SKU + `lastmod`: `shouldProcessEntry` `:84-123`.
- Enriquece vía Magento REST, y **matchea a producto existente** por: referencia previa en
  `products_shops_prices` **+** barcode en `products_global_ids`.
- **Detección de conflicto** (señal de oro para Cuadra): si la referencia y el barcode apuntan a
  productos DISTINTOS → `conflicting_match_signals` a revisión: `resolveMatch` `:153-267` (conflicto `:164-172`).
- **Soporte**: sitemap index→sitemaps→entries + guard de host ajeno + lookup REST en lotes de 25
  (`SRD/src/nacional-catalog/http.ts:8-11,60-70+`). Las **2 señales de match** (`SRD/src/nacional-catalog/store.ts`):
  `findExistingNacionalReferences` = por URL canónica **o SKU embebido en la URL** (regex sobre `products_shops_prices.url`) `:35-71`;
  `findGlobalIdMatches` = por **EAN** en `products_global_ids.value` `:73-102`. Estado upsert `:104-151`, tipos `types.ts`,
  DDL auto `SRD/src/db/ensure-nacional-catalog-schema.ts`.

### 3.5 Sirena Catalog Sync — cada 6-12h — `SRD/src/jobs/sync-sirena-catalog.ts`
- Recorre árbol de categorías (vía `SRD/src/sirena-vtex.ts` + `SRD/src/sirena-catalog/http.ts:42-55+`),
  dedup por `productid`, con concurrencia (`mapWithConcurrency`, `SRD/src/utils.ts:12-43`).
- **Reglas de exclusión** de categorías no-comida (con excepciones de pilas/baterías):
  `SRD/src/sirena-catalog/rules.ts:1-55`.
- **Match** (`SRD/src/sirena-catalog/store.ts`): por URL/api/**friendlyUrl** (regex sobre la URL) `findExistingSirenaReferences:26-64`,
  **más** llave de recovery aprendida (`externalIdType="productid"`) `findSirenaRecoveryKeyMatches:66-93`. Estado upsert `:95-145`.
- **Escribe al MISMO intake que recovery**: usa `upsertRecoveryReview` (`sync-sirena-catalog.ts:26`) → los ítems sin resolver
  van a la cola de revisión compartida. DDL auto `SRD/src/db/ensure-sirena-catalog-schema.ts` + `ensure-recovery-schema.ts`.

### 3.6 Broken Images Batch — cada 30-60 min — `SRD/src/jobs/fix-broken-images-batch.ts`
- Toma 1 reporte por producto (window function `:117-149`), **verifica con `remoteImageExists` que la imagen SIGUE
  rota** antes de tocar nada (si carga → borra el reporte stale, `:394-410`), re-fetchea de la tienda, reemplaza
  `products.image` + `product_images.primary`. Persistencia: `SRD/src/db/apply-product-image-fix.ts`.
- **Registro de hosts CDN → shopId** (`getShopIdFromImageUrl:243-340`): sirena s3/vtexassets → 1, `supermercadosnacional.com/media/catalog` → 2,
  `jumbo.com.do/pub/media/catalog` → 3, `img.plazalama.com.do` → 4, cloudfront/pricesmart → 5, `bravova-resources` → 6.
  Útil como mapa de CDNs por cadena.
- **Dedup de imágenes cross-CDN** (`SRD/src/image-utils.ts:59-123`): `getComparableImageKey` normaliza por cadena
  (ids VTEX, filename sirena/bravo, query-strip nacional) para no duplicar la misma imagen con URLs distintas.
- **Subsistema de imágenes** (un extractor por tienda, paralelo a los de precio):
  - Dispatcher: `SRD/src/scrape-product-images.ts:14-48` (⚠️ Garrido y Carrefour **NO** soportan imágenes `:33-46`).
  - Extractores: `SRD/src/shops/{sirena,nacional,jumbo,merca-jumbo,plaza-lama,pricesmart,bravo}-images.ts`.
    Nacional = scrape de `og:image`/fotorama/`product-image-photo` (`nacional-images.ts:13-34`); Bravo = patrón
    CDN por sufijo (`bravo-images.ts:34-68`).
  - Helpers: `SRD/src/image-utils.ts` (`dedupeComparableUrls`/`normalizeNacionalImageUrl`/`toAbsoluteUrl`),
    `SRD/src/image-exists.ts` (`remoteImageExists`, HEAD check).
  - Tipos: `SRD/src/types.ts:78-109` (`ScrapeProductImages*`).

### 3.6b Revert Bravo Second Images (one-off) — `SRD/src/jobs/revert-bravo-second-image-fixes.ts`
- **8º job**, reparación puntual: restaura imágenes `_2` de Bravo que se reemplazaron por `_1` por error,
  solo si la `_2` original aún carga. Soporta `--dry-run`. README `SRD/README.md:222-230`. Usa
  `mapWithConcurrency` + `remoteImageExists`. No periódico — se corre a mano cuando hace falta.

### 3.7 Ritmo SFTP Price Sync — diario (único con cron real) — `SRD/src/jobs/sync-ritmo-sftp-prices.ts`
Ingesta **por archivo**, no web. La fuente más barata y confiable.
- Descarga el CSV más reciente (por `modifyTime`) por SFTP con reintentos: `SRD/src/ritmo/sftp.ts` (config host/port/user
  con defaults en README `:44-48`).
- **Parser CSV robusto** (`SRD/src/ritmo/price-csv.ts`): infiere columnas por header fuzzy (sku/codigo, descripcion,
  ean/gtin/upc, precio/pvp, marca) `:78-123`; normaliza **decimales LatAm vs US** (`,` vs `.`) `:45-76`; limpia
  artefactos de spreadsheet `="..."` `:39-43`; dedup por SKU.
- Matchea por `api = ritmo://sku/<SKU>`, update + history change-only, **oculta SKUs faltantes del CSV**:
  `SRD/src/ritmo/price-sync.ts:118-271` (hide de faltantes `:230-259`).

### 3.8 Normalización de unidades (transversal) — `SRD/src/unit-utils.ts`
Peso/volumen/conteo/longitud → unidad base para comparar precio-por-unidad: tabla `:3-18`, conversión
`:35-81`, `parseUnit` `:141-172`. Cuadra tiene su equivalente en `domain/value_objects/{units,size_parser}.py`
+ `matching/cascade/size_gate.py`.

---

## 4. Qué YA tiene Cuadra (con paths) — para no reinventar

- **Puerto de ingesta** `CatalogSource` + `RawCatalogEntry`: `apps/api/src/contexts/save/domain/ports/catalog_source.py:19-39`.
- **Factory por plataforma**: `apps/api/src/contexts/save/infrastructure/catalog_sources/factory.py:105-121`
  (`_SUPPORTED_PLATFORMS` L26-30, profiles REST_CATALOG L34-36).
- **Adapters**: `vtex_adapter.py` · `magento_adapter.py` (store_code por header) · `rest_catalog_adapter.py`
  (+ `bravova_profile.py`) · `ssrf_guard.py` (todos en `…/catalog_sources/`).
- **Refresh (change-only + ruteo al matching)**: `apps/api/src/contexts/save/application/refresh_prices.py`.
- **Matching cascade** (lo que ellos NO tienen): `…/infrastructure/matching/cascade/*` (banding, fusion=RRF,
  scoring, size_gate, embedding_text), `llm_judge.py`, `embeddings.py` (BGE-M3), `match_store_product.py`.
- **Cola de revisión**: `domain/review_queue.py`, `application/{list_review_queue,get_review_detail,resolve_review,bulk_resolve_review}.py` + admin OFV (web).
- **Precio**: `domain/entities/price.py:16-33` — append-only, `price_type` (online/delivery/shelf/receipt),
  `source`, Money minor units. **⚠️ NO tiene `regular_price`/descuento ni `location_id`/sucursal.**
- **Orquestación**: Dagster en `apps/api/ingestion/save/{assets,definitions,composition,runner}.py`;
  CLI manual `apps/api/seeds/save_refresh.py` (`make save-refresh`).
- **Estrategia de ingesta = canasta curada** (queries de búsqueda), NO full-catalog:
  `apps/api/ingestion/save/sources.py`. Bravo es la excepción (browse-full vía RestCatalog).
- **Seed de fuentes** (secciones Bravo, store_id): `apps/api/seeds/save_seed.py:65-86`.

**Diferencia estratégica clave**: ellos hacen **full-catalog** (sitemap/categoría → todo el catálogo);
Cuadra hace **canasta curada** (cold-start, comparabilidad cross-cadena). Ambos son válidos — el plan (§6)
define cuándo usar cada uno.

---

## 5. Correr el scraper del competidor localmente (reproducible)

Verificado 2026-07-11: levanta y scrapea precios reales de Bravo escribiéndolos en Postgres.

```bash
# 1. Deps (sin descargar Chromium; solo Bravo/HTTP-shops no lo necesitan)
cd ~/Desktop/DEV/supermercadosrd-scrapers-main
PUPPETEER_SKIP_DOWNLOAD=true pnpm install

# 2. Postgres throwaway (puerto 5455 — NO el 5433 de Cuadra)
docker run -d --name srd-scraper-pg -e POSTGRES_PASSWORD=srd -e POSTGRES_USER=srd -e POSTGRES_DB=srd -p 5455:5432 postgres:16

# 3. Bootstrap schema + seed (las migrations son solo ALTER → hay que crear las tablas base desde schema.ts)
#    SQL de ejemplo en el scratchpad de la sesión: bootstrap.sql (products + products_shops_prices + history)
#    Seed: 2 productos Bravo reales, api=https://bravova-api.superbravo.com.do/public/articulo/get?idArticulo=<id>

# 4. Correr el job (DATABASE_URL inline: db/client.ts la lee ANTES de que api-endpoints cargue .env;
#    los 8 endpoints privados van como placeholders SOLO para que el import no truene — Bravo no los usa)
DATABASE_URL='postgres://srd:srd@localhost:5455/srd' NODE_ENV=development \
  SIRENA_PRODUCT_API_URL_TEMPLATE=https://example.invalid/x SIRENA_PRODUCTS_SEARCH_API_URL=https://example.invalid/x \
  SIRENA_CATEGORY_TREE_API_URL_TEMPLATE=https://example.invalid/x NACIONAL_REST_API_URL=https://example.invalid/x \
  PLAZA_LAMA_GRAPHQL_URL=https://example.invalid/x PLAZA_LAMA_DPL_API_KEY=x \
  PRICESMART_PRODUCT_API_URL=https://example.invalid/x PRICESMART_DISCOVERY_API_URL=https://example.invalid/x \
  pnpm scrape:prices-batch --iterations 1 --urls-per-shop 5

# Teardown: docker rm -f srd-scraper-pg
```

**Bloqueos para un run COMPLETO (9 cadenas)** — pedirle al dueño del repo:
1. Las **URLs privadas** (`SIRENA_*`, `NACIONAL_REST_API_URL`, `PLAZA_LAMA_*`, `PRICESMART_*`) — omitidas a
   propósito (`SRD/src/api-endpoints.ts:41-58`). Carrefour además: `CARREFOUR_TYPESENSE_API_KEY` + `_COLLECTION_ID`.
2. El **catálogo semilla** (sus filas `products_shops_prices` con URLs/SKUs reales). Sin filas, el batch no scrapea nada.
Solo **Bravo** corre 100% con lo que trae el repo público (token hardcodeado).

---

## 6. Plan de implementación en Cuadra (priorizado)

> Regla SAGRADA de Cuadra: **se integran PLATAFORMAS, no cadenas.** Cada ítem: qué / por qué / refs /
> qué se necesita / a tener en cuenta. Todo bajo Strict TDD (RED→GREEN) y el flujo git de Cuadra.

### P0 — Cerrar cobertura de plataformas (el gap #1)

**6.1 Adapter GraphQL "Moira" (Plaza Lama + Garrido) — 2 cadenas de un adapter**
- **Ref competidor**: `SRD/src/shops/plaza-lama.ts:65-128` + `SRD/src/shops/garrido.ts:164-213` (mismo endpoint `:96`).
- **Dónde en Cuadra**: nuevo `SourcePlatform.GRAPHQL_MOIRA` en `domain/entities/…` + `moira_adapter.py` en
  `…/catalog_sources/` + wiring en `factory.py:105-121`. Perfil por cadena (`clientId`, `storeReference`).
- **A tener en cuenta**: `clickMultiplier` para granel (Garrido `:143-162`); promo gana sobre precio base;
  `isActive/isAvailable` → hide. Ingesta: query-based (canasta) o browse por categoría.

**6.2 Adapter Typesense (Carrefour)**
- **Ref**: `SRD/src/shops/carrefour.ts:97-138`. Necesita API key + collection-id (sucursal) — **conseguirlos**.
- **Dónde**: `SourcePlatform.TYPESENSE` + `typesense_adapter.py` + factory. Colección = `locationId` (ver 6.6).

**6.3 Registrar lo que YA ingiere pero no está dado de alta** (trivial, alto ROI)
- Merca Jumbo: `platform=MAGENTO`, `headers={"Store":"mercajumbo"}` (cobertura doc L187-190). Sirena/Nacional/
  Jumbo: registrar Provider + StoreRegistry (`seeds/save_seed.py`). **Cero código nuevo.**

**6.4 Agregadores (PedidosYa/UberEats) — máximo leverage** (ya en roadmap, cobertura doc L31-34)
- Desbloquea muchas cadenas de una. `SourcePlatform.AGGREGATOR` + Apify. Change SDD propio.

### P1 — Jobs periféricos que alimentan la cola y suben calidad

**6.5 Job "recover / catalog-sync" → productor de la cola de revisión**
- **Ref**: `SRD/src/jobs/recover-hidden-products.ts` + `sync-nacional-catalog.ts` (`resolveMatch:153-267`).
- **Por qué**: la cola de Cuadra (`review_queue.py`) hoy solo se llena desde el matching de refresh. Estos
  jobs la llenan con **catálogo nuevo descubierto** y **URLs muertas re-descubiertas**.
- **La joya a portar**: la **detección de conflicto referencia-vs-barcode** (`SRD/.../sync-nacional-catalog.ts:164-172`)
  como una **señal extra que alimenta al Claude-juez** de Cuadra (`matching/llm_judge.py`). Cuadra puede ir MÁS
  lejos: donde ellos solo comparan barcode+referencia, la cascada semántica desempata.
- **Dónde**: nuevo asset Dagster en `ingestion/save/assets.py` + use-case en `application/`.

**6.6 Modelar `regular_price` (descuento) y `location_id` (sucursal) en `Price`**
- **Ref**: ellos guardan `regularPrice` (`schema.ts:75`) y `locationId` (PriceSmart club `:530`, Carrefour colección).
- **Dónde**: extender `domain/entities/price.py:23-33` + migración. Habilita "precio regular vs oferta" en la UI
  y precio por sucursal. **A tener en cuenta**: el `price_type` de Cuadra ya separa online/shelf/receipt — el
  descuento es ortogonal (regular vs current dentro de `online`).

**6.7 Deals materializados ("ofertas de hoy")**
- **Ref**: `SRD/src/jobs/scrape-deals.ts` + `refresh_todays_deals()`. Cuadra tiene `domain/drops.py` +
  `application/drops.py` — evaluar si un materializado (vista/tabla refrescada) mejora la superficie de ofertas.

### P2 — Robustez y features de largo plazo

**6.8 Fallback anti-bot con navegador (Puppeteer/Playwright)**
- **Ref**: `SRD/src/http-client.ts:152-286` (stealth + espera Cloudflare). Los adapters de Cuadra son `httpx`
  puro → Jumbo/otras detrás de Cloudflare necesitarán un fetch con navegador. Portar como capa opcional.

**6.9 Auto-sanación de imágenes rotas** — `SRD/src/jobs/fix-broken-images-batch.ts`. Cuadra no lo tiene y en
un marketplace las imágenes importan. Requiere modelar `product_images` + reportes.

**6.10 Ingesta SFTP/CSV** — `SRD/src/ritmo/price-sync.ts`. Un `CatalogSource` file-based para cadenas que
entregan por archivo. Barato y confiable; no depende de scraping web.

### Patrones a adoptar transversalmente (baratos, alto impacto)
- **Result tipado con flags `retryable`/`hide`** (`SRD/src/result.ts:9-69`) → decisiones de persistencia sin
  inspeccionar errores crudos. Cuadra puede formalizarlo en el puerto de ingesta.
- **Backoff exponencial + jitter** en 429/503 (`SRD/src/http-client.ts:497-524`).
- **Round-robin por host** para repartir carga (`SRD/src/scrape-many.ts:11-77`).
- **Staleness scheduling** (visibles 18h / ocultos 3d) en vez de refrescar todo por igual (`SRD/.../scrape-prices-batch.ts:100-118`).
- **Nunca auto-aplicar cambios de catálogo/URL** → siempre propuesta a revisión con evidencia `jsonb`.

---

## 7. Checklist de "que no falte nada de SupermercadosRD"

- [ ] Plataforma GraphQL Moira (Plaza Lama + Garrido) — §6.1
- [ ] Plataforma Typesense (Carrefour) — §6.2
- [ ] Registrar Sirena/Nacional/Jumbo/Merca ya ingeribles — §6.3
- [ ] Agregadores (PedidosYa/UberEats) vía Apify — §6.4
- [ ] Job recover-hidden + catalog-sync → cola de revisión (+ señal de conflicto al juez) — §6.5
- [ ] `regular_price` + `location_id` en `Price` — §6.6
- [ ] Deals materializados — §6.7
- [ ] Fallback Puppeteer/Playwright anti-Cloudflare — §6.8
- [ ] Auto-sanación de imágenes rotas — §6.9
- [ ] Ingesta SFTP/CSV — §6.10
- [ ] Patrones: Result tipado, backoff+jitter, round-robin, staleness, propuestas-no-auto-aplicar — §6
- [ ] (Ventaja Cuadra, mantener) matching semántico > referencia+barcode; Dagster; SSRF-guard; multi-país

---

## Apéndice A — Índice completo del repo (cobertura archivo-por-archivo)

> Auditoría 2026-07-11: TODOS los `.ts` de `SRD/src/` + workflows, mapeados a su sección. "§" = dónde se
> documenta. Nada queda sin cubrir.

### Entry points / orquestación
| Archivo | Rol | § |
|---|---|---|
| `src/index.ts` | Barrel de exports públicos (el repo también es librería) | §1 |
| `src/scrape-price.ts` | Dispatcher precio `switch(shopId)` | §1 |
| `src/scrape-many.ts` | Round-robin por host reusable | §3.1 |
| `src/scrape-product-images.ts` | Dispatcher de imágenes `switch(shopId)` | §3.6 |
| `src/result.ts` · `src/types.ts` | Contrato tipado ok/not_found/error + tipos | §1 |
| `src/utils.ts` | `randomDelay`, `mapWithConcurrency`, `isLessThan12HoursAgo` | §3.1, §3.5 |
| `src/api-endpoints.ts` | Carga `.env` + endpoints privados requeridos | §1, §5 |
| `src/http-client.ts` | Anti-bot: headers/UAs, Puppeteer/Cloudflare, backoff | §2, §3.1 |
| `src/unit-utils.ts` | Normalización de unidades a base | §3.8 |

### Jobs (8) — `src/jobs/`
| Archivo | § |
|---|---|
| `scrape-prices-batch.ts` | §3.1 |
| `scrape-deals.ts` | §3.2 |
| `recover-hidden-products.ts` | §3.3 |
| `sync-nacional-catalog.ts` | §3.4 |
| `sync-sirena-catalog.ts` | §3.5 |
| `fix-broken-images-batch.ts` | §3.6 |
| `revert-bravo-second-image-fixes.ts` | §3.6b |
| `sync-ritmo-sftp-prices.ts` | §3.7 |

### Extractores de precio — `src/shops/`
| Archivo | Cadena | § |
|---|---|---|
| `index.ts` | barrel | §2 |
| `sirena.ts` + `src/sirena-vtex.ts` | Sirena (VTEX) | §2.1 |
| `nacional.ts` | Nacional (Magento REST+HTML) | §2.2 |
| `jumbo.ts` + `jumbo-shared.ts` | Jumbo (Magento GQL + Puppeteer) | §2.3 |
| `plaza-lama.ts` | Plaza Lama (GQL Moira) | §2.4 |
| `pricesmart.ts` + `src/pricesmart-locations.ts` | PriceSmart (JSON + sucursal/unidad) | §2.5 |
| `bravo.ts` | Bravo (REST bravova) | §2.6 |
| `merca-jumbo.ts` + `merca-jumbo-shared.ts` | Merca (Magento store-view privado) | §2.7 |
| `garrido.ts` + `src/garrido-locations.ts` | Garrido (GQL Moira) | §2.8 |
| `carrefour.ts` | Carrefour (Typesense) | §2.9 |

### Extractores de imagen — `src/shops/*-images.ts`
`sirena-images` · `nacional-images` · `jumbo-images` · `merca-jumbo-images` · `plaza-lama-images` ·
`pricesmart-images` · `bravo-images` + helpers `src/image-utils.ts`, `src/image-exists.ts` → todos en §3.6.
(Garrido y Carrefour no tienen extractor de imagen — devuelven `image_scraper_not_supported`.)

### Persistencia / DB — `src/db/`
| Archivo | Rol | § |
|---|---|---|
| `schema.ts` | Drizzle: 12 tablas | §1.1 |
| `client.ts` | Pool postgres-js + `DATABASE_URL` | §5 |
| `apply-scrape-result.ts` | Persistencia change-only + hide/show + history | §3.1 |
| `apply-product-image-fix.ts` | Persistencia del fix de imagen | §3.6 |
| `revalidate-product.ts` | Hook ISR (no-op sin env) | §3.1 |
| `ensure-recovery-schema.ts` | DDL runtime tablas de revisión | §1.1, §3.3 |
| `ensure-nacional-catalog-schema.ts` | DDL `nacional_catalog_sync_state` | §3.4 |
| `ensure-sirena-catalog-schema.ts` | DDL `sirena_catalog_sync_state` | §3.5 |

### Intake / catalog-sync / recovery
| Módulo | Rol | § |
|---|---|---|
| `src/recovery/{lookup,shared,store,types}.ts` | Re-descubrimiento de URLs muertas + propuestas | §3.3 |
| `src/nacional-catalog/{http,store,types}.ts` | Sitemap diff + match a existente + estado | §3.4 |
| `src/sirena-catalog/{http,rules,store,types}.ts` | Crawl categorías + exclusiones + estado | §3.5 |
| `src/ritmo/{sftp,price-csv,price-sync}.ts` | Descarga SFTP + parseo CSV + sync change-only | §3.7 |
| `src/types/ssh2-sftp-client.d.ts` | Type shim del cliente SFTP | (trivial) |

### CI — `.github/workflows/` (7)
`scrape-prices-batch` · `scrape-deals` · `scrape-recover-hidden-products` · `scrape-sync-nacional-catalog` ·
`scrape-sync-sirena-catalog` · `scrape-broken-images-batch` · `scrape-sync-ritmo-sftp-prices`. Todos
`workflow_dispatch` (manual) **salvo Ritmo** (cron `14:30 UTC`). Instalan Chrome para Puppeteer, `environment: Production`. → §3.
(Nota: **no hay workflow para el one-off `revert-bravo-second-images`** — se corre a mano.)

### Migraciones — `SRD/migrations/`
3 archivos, **solo `ALTER`** (locationId + tablas de imagen) — NO crean las tablas base → bootstrap desde `schema.ts`. → §1.1, §5.
```
