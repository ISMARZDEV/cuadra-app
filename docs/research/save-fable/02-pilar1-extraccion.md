# 02 · Pilar 1 — Extracción de fuentes oficiales (supermercados)

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** 1 (extracción)
> **Enmarca:** el usuario eligió arrancar por las **fuentes oficiales online** (no recibo, que es
> fase posterior). Precio online se etiqueta `price_type = online` (viene del doc 01: online ≠
> góndola; se guardan separados). Append-only, sin resúmenes.

---

## 1. Pregunta que resuelve este doc
¿Cómo extraemos el catálogo + precio de las cadenas RD de forma robusta, legal-consciente y
ESCALABLE a otros países, eligiendo la mejor técnica 2025-2026 por plataforma?

## 2. Detalle técnico por plataforma (lo verificado)

### VTEX — Sirena (✅ confirmado), Carrefour (inferencia fuerte)
Dos APIs públicas, ambas sin auth para endpoints `/pub`:
- **Legacy Catalog Search:** `GET /api/catalog_system/pub/products/search?fq=C:/{categoryId}/&_from=0&_to=49`
  - Devuelve productos CON precio: `items[].sellers[].commertialOffer` → `Price`, `ListPrice`,
    `PriceWithoutDiscount`, `AvailableQuantity`. **[firme]** El precio viene en el mismo payload.
  - **Paginación:** `_from`/`_to`, **máx 50 por página**, **cap duro 2500** (`_from` > 2500 =
    error). **Workaround:** segmentar por **categoría** (`fq=C:/id/`) o por `ft=` para que cada
    slice tenga < 2500 → así cubrís todo el catálogo. **[firme]**
  - **Rate limit:** ~**45,000 req/min por cuenta**, 15,000/min por endpoint (generoso). **[firme]**
- **Intelligent Search (nuevo):** `/api/io/_v/api/intelligent-search/product_search/...` — endpoints
  públicos sin auth; facetado, mejor relevancia. **[firme que es público; qué campos de precio
  expone = a verificar por tienda]**
- **⚠️ Caveat:** algunas tiendas cierran `/pub` o ponen WAF; verificar por cadena que responda.

### Shopify — Plaza Lama (inferencia fuerte por rutas `/collections/`)
- **`GET /products.json?limit=250&page=N`** o cursor `page_info` — público, sin auth. Precio en
  `variants[].price`. **250 por página**, **cap ~25,000 objetos** por paginación. **[firme]**
- **Por categoría:** `GET /collections/{handle}/products.json` + `/collections.json` (mapa
  categoría→productos) → scraping dirigido, encaja con la taxonomía. **[firme]**
- Legal: dato público, generalmente OK, pero respetar ToS y ser educado (rate-limit propio).

### Magento — Nacional + Jumbo (✅ mismo backend CCN, confirmado)
- **GraphQL** `POST /graphql` — query `products` (layered nav) o `productSearch` (Live Search).
  `pageSize` (default 20), precio en `price_range.minimum_price.final_price`. Magento 2.4.8 (2025)
  = cobertura completa de catálogo por GraphQL. **[firme la capacidad; que esté ABIERTO sin
  headers/token en Nacional = a verificar]**
- **⚠️ Caveat:** varios Magento exigen `Store` header o bloquean introspección; probar el endpoint
  real de Nacional. Fallback: REST `/rest/V1/products` (suele requerir token) o agente-IA.

### SPA / app móvil — Bravo (BravoVa), Garrido
- Sin API pública documentada → **reverse-eng del backend de la app móvil** (capturar el tráfico
  de BravoVa) es más estable que scrapear el SPA. Fallback: **agente-IA** (Firecrawl/ScrapeGraphAI)
  sobre el HTML renderizado. (Detalle fino en pilar 3.)

### Mapa de acceso por cadena
| Cadena | Plataforma | Endpoint/ruta | Precio en | Dificultad |
|--------|-----------|---------------|-----------|-----------|
| Sirena | VTEX | `/api/catalog_system/pub/products/search` | `commertialOffer.Price` | 🟢 |
| Carrefour | VTEX (inf.) | idem | idem | 🟢-🟡 |
| Nacional+Jumbo | Magento | `/graphql` productSearch | `price_range` | 🟡 |
| Plaza Lama | Shopify (inf.) | `/collections/{h}/products.json` | `variants[].price` | 🟢 |
| Bravo | app móvil | API de BravoVa (reverse-eng) | — | 🟠 |
| Garrido | SPA | agente-IA / API SPA | — | 🟠 |
| Ole | PedidosYa | agregador (pilar 3) | — | 🟠 |

## 3. 🏆/🔀/📎/⚠️/✅ — PROPUESTA de extracción

### 🏆 LA MEJOR SOLUCIÓN ACTUAL (2025-2026)
**Puerto `CatalogSource` hexagonal + adaptadores API-first por plataforma, alimentando un
`RawCatalogEntry` canónico, con scoping por CANASTA y detección de ruptura.**

```
CatalogSource (Port)              →  RawCatalogEntry {sku, name, brand, size_str, price_minor,
  ├─ VtexAdapter      (Sirena, Carrefour…)    currency, category_path, image, url, ean?,
  ├─ ShopifyAdapter   (Plaza Lama…)           price_type=online, source, captured_at, store_branch?}
  ├─ MagentoAdapter   (Nacional, Jumbo)
  ├─ MobileApiAdapter (Bravo)                 →  BRONZE (raw, inmutable, hash) → pipeline (pilar 2/3)
  └─ AgentAdapter     (Garrido, fallback)
```
- **API-first** (nivel más alto de la doctrina): un adaptador por plataforma, no por cadena → un
  `VtexAdapter` sirve Sirena + Carrefour + cualquier VTEX de cualquier país = **la escalabilidad**.
- **Scoping por canasta** (responde tu "extraer TODO"): NO 40k×8 diario. Definir una **canasta
  canónica** (categorías/SKU de alta rotación) y extraer con **frecuencia alta** eso; el resto,
  full-catalog con frecuencia baja (semanal). Máxima señal, mínimo costo/superficie legal.
- **Scheduling en dos ritmos:** incremental frecuente (canasta) + full periódico (descubrir
  altas/bajas y categorías nuevas). Idempotente por `hash(raw_row)`.
- **Politeness:** rate-limit propio conservador (muy por debajo del techo VTEX), backoff,
  `User-Agent` honesto, respetar `robots.txt` donde aplique.
- **Detección de ruptura:** si un adaptador devuelve 0 productos, cae el schema, o aparece WAF →
  **alerta**, no falla silencioso. (Se opera desde el panel, pilar 2.)
- **`price_type = online`** en todo lo de este pilar; el precio de góndola llega por recibo/e-CF
  (fase posterior). Nunca se mezclan.

**Por qué es la mejor HOY:** las APIs públicas de plataforma (VTEX `/pub`, Shopify `products.json`,
Magento GraphQL) dan precio estructurado **sin scrapear HTML frágil**, con rate-limits generosos, y
un adaptador por plataforma **se reusa país por país**. Es lo más barato, estable y escalable.

### 🔀 ALTERNATIVAS
- **(A) APIs comerciales de scraping (Bright Data / Apify / Scrapfly):** rápido, manejan anti-bot y
  proxies. ❌ Costo recurrente por request, menos control del dato, dependencia externa, y para las
  cadenas con API pública es pagar por lo que ya es gratis. Útil SOLO para los agregadores/SPAs con
  anti-bot fuerte (pilar 3), no para VTEX/Shopify/Magento.
- **(B) Full-catalog brute-force diario (todas las cadenas, 40k c/u):** máxima cobertura. ❌ Costo
  de ops alto, fragilidad, superficie legal máxima y valor marginal decreciente. Descartado como
  default; solo el barrido periódico de baja frecuencia.

### 📎 EVIDENCIA
- VTEX: [Catalog Search API limitado a 2500](https://help.vtex.com/en/known-issues/catalog-search-api-limited-to-2500-results) · [Catalog API ref](https://developers.vtex.com/docs/api-reference/productsearch) · [Intelligent Search API (endpoints públicos, sin auth)](https://developers.vtex.com/updates/release-notes/new-intelligent-search-api) · [openapi-schemas VTEX (GitHub)](https://github.com/vtex/openapi-schemas/blob/master/VTEX%20-%20Intelligent%20Search%20API.json).
- Shopify: [products.json trick (DEV)](https://dev.to/dentedlogic/the-shopify-productsjson-trick-scrape-any-store-25x-faster-with-python-4p95) · [Shopify product scraping 2025](https://www.shopifymate.app/blog/shopify-product-scraping-complete-guide) · [Shopify API limits](https://shopify.dev/docs/api/usage/limits).
- Magento: [products query (Adobe Commerce)](https://developer.adobe.com/commerce/webapi/graphql/schema/products/queries/products) · [Magento 2.4.8 GraphQL 2025](https://emmo.net.co/articles/post/magento-2-graphql-complete-guide-for-2025-version-248.html) · [productSearch (Live Search)](https://developer.adobe.com/commerce/webapi/graphql/schema/live-search/queries/product-search).

### ⚠️ RIESGOS + mitigación
- **Cap 2500 de VTEX legacy** → segmentar por categoría/ft (workaround estándar). O usar Intelligent Search.
- **Magento/Nacional puede exigir header/token** → verificar el endpoint real; fallback REST o agente-IA.
- **`/pub` cerrado o WAF por tienda** → probar cada cadena; caer a agente-IA si bloquea.
- **Precio = online, no góndola** → etiquetar `price_type=online`; medir el gap por cadena; comunicar honesto.
- **ToS / anti-bot** → API-first (uso legítimo del endpoint que la tienda expone) + politeness. Agregadores = pilar 3, con más cuidado.
- **Volatilidad del catálogo** (altas/bajas, cambios de formato) → detección de ruptura + barrido full periódico.

### ✅ DECISIÓN que deberías tomar ahora
1. ¿Confirmás **API-first por plataforma** (VtexAdapter/ShopifyAdapter/MagentoAdapter) como base, y
   dejamos agregadores/SPAs (Bright Data/agente-IA) para el pilar 3?
2. ¿Arrancamos con una **canasta canónica acotada** (definir categorías/SKU de alta rotación) en vez
   de full-catalog? Si sí, ¿qué categorías priorizás (arroz, aceite, leche, huevos, pollo…)?
3. ¿Cuántas cadenas en el **primer corte**? (Recomiendo 3 con API limpia: Sirena[VTEX] +
   Plaza Lama[Shopify] + Nacional[Magento] → cubre las 3 plataformas de una.)

## 4. Spike de verificación pendiente (antes de codear adaptadores)
- Probar en vivo: `/pub/products/search` de Sirena responde con precio; `products.json` de Plaza
  Lama; `/graphql` de Nacional. Confirmar plataformas inferidas (Carrefour VTEX, Plaza Lama Shopify).
- Medir por cadena el gap **online vs góndola** (contra algún recibo real) → calibra la honestidad
  del claim de transparencia.

---

**Decisiones que deberías tomar ahora:** las 3 de §3·✅.
**Qué investigar después:** el spike de verificación (§4); y el **pilar 3** para agregadores
(PedidosYa/UberEats) + SPAs (Bravo/Garrido) con anti-bot + el matching que une todo.

---

## ✅ RESOLUCIÓN (2026-07-03) — decisiones del usuario
1. **API-first por plataforma CONFIRMADO** ("confío en ti"). Base = `VtexAdapter` (Sirena,
   Carrefour) + `ShopifyAdapter` (Plaza Lama) + `MagentoAdapter` (Nacional, Jumbo).
2. **Scoping por CANASTA CONFIRMADO** + la taxonomía por categoría es real (ver imágenes
   SupermercadosRD → [`03-referencia-supermercadosrd-teardown.md`](03-referencia-supermercadosrd-teardown.md)).
   Categorías semilla a priorizar (alta rotación, vistas en el competidor): **arroz, aceite, leche,
   huevos, café, granos/habichuela, azúcar, pollo/embutidos, limpieza básica**. Se afinará con la
   taxonomía jerárquica del doc 03.
3. **AGREGADORES AL PRIMER CORTE:** además de las 3 con API limpia, **agregar Hero = PedidosYa +
   UberEats** (dan cobertura de más cadenas: Ole, Ritmo, Líder, PriceSmart, etc.). ⚠️ Su precio es
   de **delivery** → `price_type = delivery` (aún más inflado que `online`; nunca se mezcla con
   góndola). El detalle técnico/anti-bot de agregadores va en el **pilar 3**. "Luego seguimos con
   los demás" (Bravo, Garrido, PriceSmart directo…).

**Ajuste de cobertura:** el universo real de cadenas es mayor que las 8 del brief — SupermercadosRD
lista además **PriceSmart, Ritmo, Líder**. Los agregadores Hero/Uber son la vía más barata de
sumarlas sin un adaptador por cadena.

Estado: **decidido**. Sigue el spike de verificación (§4) y el pilar 3 (agregadores + matching).

### ⚠️ CORRECCIÓN post-spike (2026-07-03) — ver [`09-spike-verificacion-endpoints.md`](09-spike-verificacion-endpoints.md)
Probado en vivo: **Sirena (VTEX) ✅** y **Nacional (Magento GraphQL) ✅** devuelven precio real.
**Plaza Lama NO es Shopify** (era inferencia por las rutas `/collections/`, que resultaron ser rutas
de un Next.js custom, no de Shopify) — tampoco VTEX FastStore (404). → **Plaza Lama baja al bucket
agente-IA/reverse-eng**; el "primer corte de 3 cadenas" pasa a **Sirena + Nacional + Jumbo** (o
Carrefour VTEX a verificar). Bonus del spike: la **taxonomía jerárquica de Sirena** (`categoriesIds`)
sirve de semilla del canonical, y su API ya trae **EAN** (nivel 1 del matching).
