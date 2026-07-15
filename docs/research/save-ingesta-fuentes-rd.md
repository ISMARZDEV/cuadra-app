# Save · Ingesta de datos de supermercados — Dossier de fuentes + arquitectura (RD → multi-país)

> **Objetivo:** diseñar el pipeline de ingesta de precios de Save. Mercado #1 = **República
> Dominicana**; el diseño debe **escalar país por país** sin reescribir el núcleo (encaja con la
> abstracción `Market` de `arquitectura-mvp.md` §4 y ADR 33).
> **Fecha:** 2026-07-03 · **Autor:** análisis técnico (Cuadra).
> **Confianza:** **[firme]** verificado en fuente · **[inferencia]** deducido por arquitectura/plataforma.
> Complementa `docs/research/supermercadosrd-analisis.md` (el análisis del competidor) — este doc es
> el **cómo construir la ingesta**, no el qué es el competidor.

---

## 0. TL;DR — corrección de rumbo (me pediste que te corrija)

Tu instinto fue listar 8 cadenas y pensar "8 scrapers". **PARÁ. Ese es el error clásico** y te
condena a mantener 8 piezas frágiles que se rompen cada vez que una tienda cambia el HTML. Tres
correcciones de arquitecto:

1. **No scrapees cadenas — integrá PLATAFORMAS.** El 70% de las cadenas RD corren sobre 3-4
   plataformas regionales (**VTEX, Magento, Shopify**) + 2 agregadores (**PedidosYa, UberEats**).
   Un adaptador por plataforma cubre MUCHAS cadenas Y MUCHOS PAÍSES. VTEX solo tiene ~3,000 tiendas
   en 45 países. Escribís `VtexAdapter` UNA vez → desbloqueás Sirena, Carrefour, y media LatAm.
   **Esto ES tu escalabilidad multi-país.**

2. **La extracción NO es el trabajo difícil. El saneamiento y el matching sí** (el "puente/filtro"
   que intuiste — buen instinto). Bajar JSON es fácil; decidir que *"Leche Rica 1L"* de Sirena ==
   *"LECHE RICA ENTERA 1LT"* de Nacional es el **70% del esfuerzo** (entity resolution). Ahí es
   donde la IA + un humano-en-el-loop pagan.

3. **La IA es una herramienta con un límite sagrado: NUNCA le dejes los números.** Usá LLMs para
   extraer de HTML sucio, normalizar unidades y matchear productos. Pero el **precio final es
   aritmética determinística en minor units** (§12·B) — un LLM que "calcula" un precio es cómo
   Cleo reportó US$28K cuando eran US$3K. El modelo *estructura*; no *calcula*.

**Recomendación de una línea:** puerto `CatalogSource` hexagonal + **adaptadores en cascada por
nivel de acceso** (API oficial → API de app móvil → feed estructurado → agente-IA → browser), un
**pipeline medallion** (raw→limpio→canónico) con matching semántico, y un **panel de control con
cola de revisión humana** orquestado por **Dagster**.

---

## 1. Las fuentes RD — análisis por cadena

| # | Cadena | Grupo | Plataforma detectada | Mejor ruta de acceso | Dificultad | Escala regional |
|---|--------|-------|----------------------|----------------------|-----------|-----------------|
| 1 | **Sirena / Sirena Market** | Grupo Ramos | **VTEX** ✅ `gruporamos.vtexassets.com`, "Powered by Vtex" **[firme]** | **VTEX Catalog API pública** `/api/catalog_system/pub/products/search` (JSON, sin auth) | 🟢 Baja | ⭐⭐⭐ VTEX = LatAm |
| 2 | **Nacional** | CCN (Centro Cuesta Nacional) | **Magento** `Nacional_Theme`, `/media/catalog/`, static versioning **[firme]** | **Magento GraphQL** `/graphql` (catálogo suele ser público) o REST `/rest/V1` | 🟡 Media | ⭐⭐ Magento común |
| 3 | **Jumbo / Merca Jumbo** | CCN | **Magento** — comparte sesión con Nacional (`shared-session`) → **mismo backend** **[firme]** | Igual que Nacional (una integración cubre ambas) | 🟡 Media | ⭐⭐ |
| 4 | **Bravo / BravoVa** | Supermercados Bravo | **SPA custom** + app móvil `com.superbravo.adomicilio` **[firme]** | **API de la app móvil** (reverse-eng del backend de BravoVa) > scrapear el SPA | 🟠 Media-alta | ⭐ Propietario |
| 5 | **Plaza Lama** | Plaza Lama | **Shopify** [inferencia fuerte] — rutas `/collections/{cat}/supermercado`; app `com.nubitch.PlazaLamaApp` | **Shopify `products.json`** `/collections/{c}/products.json` (JSON público, sin auth) | 🟢 Baja | ⭐⭐⭐ Shopify global |
| 6 | **Garrido** | Garrido Group | **SPA custom** — mismo patrón URL `/ca/supermercado/N` que Plaza Lama viejo **[inferencia]** | Verificar `products.json` / API SPA; si no, agente-IA | 🟠 Media-alta | ⭐ |
| 7 | **Hipermercados Ole** | Ole | Solo visto en **PedidosYa** | **Vía agregador PedidosYa** | 🟡 Media | ⭐⭐ (agregador) |
| 8 | **Carrefour Market** | Carrefour (Corebiz/VTEX en LatAm) | **VTEX** [inferencia fuerte] — Carrefour es caso insignia VTEX en Brasil/LatAm | **VTEX Catalog API** (misma que Sirena) o vía agregador | 🟢-🟡 | ⭐⭐⭐ VTEX |
| — | **PedidosYa** (agregador) | Delivery Hero | API interna (GraphQL/REST) **[firme]** | **Un adaptador → N cadenas** (Sirena, Ole, Plaza Lama, Carrefour…) | 🟠 Alta (anti-bot) | ⭐⭐⭐⭐ LatAm entero |
| — | **UberEats** (agregador) | Uber | API interna `getCatalogPresentationV2` / `getStoreV1` **[firme]** | **Un adaptador → N cadenas** | 🟠 Alta (anti-bot) | ⭐⭐⭐⭐ Global |

**Lectura:** de 8 cadenas, **5 son atacables por API limpia** (2 VTEX + 2 Magento + 1 Shopify).
Solo Bravo/Garrido son "propietarias", y aun ahí su **app móvil expone un backend** más limpio
que el HTML. Los agregadores son el comodín: cubren varias de una y **se reusan país por país**.

## 2. El eje de escalabilidad: plataformas > cadenas > países

```
                    ┌─────────────────── UN adaptador ───────────────────┐
   VtexAdapter ───► Sirena · Carrefour · (+ cientos de tiendas LatAm sobre VTEX)
   ShopifyAdapter ─► Plaza Lama · (+ cualquier Shopify en cualquier país)
   MagentoAdapter ─► Nacional · Jumbo · (+ Magento GraphQL en otros mercados)
   PedidosYaAdapter► Ole · Sirena · Carrefour · Plaza Lama … (Delivery Hero = toda LatAm)
   UberEatsAdapter ► Sirena · Carrefour … (global)
   MobileApiAdapter► Bravo (BravoVa) · casos propietarios
   AgentAdapter ───► fallback IA para lo que no tenga API (cualquier tienda, cualquier país)
```

**El patrón que te hace escalar:** el código NO conoce países ni cadenas. Conoce **plataformas**.
Un país nuevo = una **fila en un registro** (`store_registry`): *"cadena X del mercado CO usa
plataforma VTEX con base_url Y"*. Cero código nuevo salvo que aparezca una plataforma inédita.
Esto es exactamente el `Market` de `arquitectura-mvp.md` §4 y las tablas `capability_market` /
`market_id` por ID de ADR 33 — **ya está previsto en tu arquitectura**, solo hay que respetarlo.

**Doctrina de acceso (elegí SIEMPRE el nivel más alto disponible, en este orden):**
1. **API oficial pública** (VTEX `/pub/`, Shopify `products.json`, Magento GraphQL) — limpio, estable, legal-friendly.
2. **API de app móvil** (reverse-eng del backend de la app — Bravo) — estable, menos anti-bot que la web.
3. **Feed estructurado** (sitemap, JSON-LD Schema.org `Product/Offer`, RSS de ofertas).
4. **Agente-IA de extracción** (Firecrawl/ScrapeGraphAI sobre el HTML renderizado) — para SPAs sin API.
5. **Browser automation** (Playwright/browser-use) — último recurso, para anti-bot fuerte (agregadores).

## 3. Arquitectura de ingesta — el "puente/filtro" de saneamiento

Pipeline **medallion** (bronze→silver→gold), cada etapa auditable e idempotente:

```
 [CatalogSource port]                    ── el puente que intuiste ──
   fetch()  ──►  RAW / bronze     (JSON crudo tal cual vino, inmutable, con source_ts + hash)
                    │  parse + normalize
                    ▼
                 CLEAN / silver   (nombre limpio, marca, tamaño→unidad base kg/L/und,
                    │              precio en minor units, imagen, EAN si viene)
                    │  entity resolution (MATCHING — el 70%)
                    ▼
                 CANONICAL / gold (canonical_product único + store_product por tienda)
                    │
                    ├──► price (append-only, time-series)  ← el foso incopiable
                    ├──► taxonomía canónica (categoría_tienda → canónica)
                    └──► índice de búsqueda (pg_trgm + pgvector)
```

**Etapa por etapa (dónde la IA ayuda y dónde NO):**

| Etapa | Determinístico | IA / LLM | Humano |
|-------|----------------|----------|--------|
| Fetch | ✅ adaptadores | Agente solo si no hay API | — |
| Normalizar unidades | ✅ **el precio/unidad se calcula en enteros** | LLM parsea el *string* ("1.5Lt", "12x330ml") → cantidad estructurada | — |
| Matching | EAN exacto → fuzzy `pg_trgm` (blocking) | **embeddings `pgvector` (blocking semántico) + LLM juzga los dudosos** | **cola de revisión** para baja confianza |
| Taxonomía | mapa `categoría_tienda→canónica` cacheado | LLM propone el mapeo de categorías nuevas | aprueba el mapeo |
| Anomalías de precio | ✅ reglas (salto > X%) | detección de "oferta falsa" sobre el histórico | revisa alertas |

**Reglas de oro del puente:**
- **Idempotencia** — re-correr una ingesta no duplica; `hash(source_row)` decide insert/skip.
- **Append-only en `price`** — nunca UPDATE; cada corrida agrega una fila fechada (= el histórico).
- **Confianza explícita** — todo match lleva `confidence ∈ [0,1]`; < umbral → NO se auto-mergea,
  va a la cola humana. Esto evita el peor bug del dominio (mezclar dos productos distintos).
- **Monitoreo de ruptura** — si un adaptador devuelve 0 productos o el schema cambió → alerta
  (no falla silencioso). Igual que el "monitoreo de ruptura" de `arquitectura-mvp.md` §línea 982.

## 4. La capa de IA / agentes (2025-2026)

**Extracción (para las fuentes sin API limpia):**
- **Firecrawl** — API que convierte web (incluso SPA con JS) en Markdown/JSON limpio; renderiza JS. Managed.
- **ScrapeGraphAI** — OSS (~26k ★), extrae JSON estructurado con un prompt en lenguaje natural. Self-host.
- **Crawl4AI** — OSS, output "LLM-ready" para pipelines RAG.
- **browser-use / Stagehand** — agentes que manejan un browser real por objetivo en lenguaje natural (para anti-bot / flujos con login como los agregadores).
- **Patrón de referencia:** `hmshb/scraping-agent-ai` — agente de scraping con **LangGraph + LangSmith + Firecrawl + Anthropic** (¡tu MISMO stack de AISpace! reusable).

**Matching semántico (el 70% — "semantic entity resolution"):**
- Multi-señal: **EAN** (exacto) → **`pg_trgm`** (fuzzy blocking barato) → **embeddings en `pgvector`**
  (blocking semántico: agrupa candidatos) → **LLM** juzga/mergea los dudosos → **humano** los < umbral.
- Es el patrón que la investigación 2025-2026 llama *"embeddings para blocking + LLM para match/merge"*.
- Encaja con tu infra ya decidida: **Postgres + pgvector** (`arquitectura-mvp.md` §línea 715) y el
  layout `save/infrastructure/matching/` ya creado.

**Herramientas delegables (lo que pediste):** cada `CatalogSource` puede ser un **nodo/agente**
con sus tools (`fetch_catalog`, `normalize`, `propose_matches`) — reusa el patrón router-a-nodos de
AISpace (§7.1). La orquestación pesada, sin embargo, NO va en LangGraph (eso es para el chat); va en
un orquestador de datos (§5).

## 5. El PANEL DE CONTROL (migraciones · sync · limpieza) — tu requerimiento central

Lo que pediste: *"un panel donde yo maneje las migraciones, sincronizaciones y las limpiezas de
todas esas fuentes"*. Diseño en dos capas:

**A. Motor — orquestador de datos: recomiendo Dagster** (sobre Airflow/Prefect) porque es
**asset-centric**: modelás cada `canonical_product`/`price` como un *data asset* con **lineage
visual** (ves de qué fuente vino cada dato), **checks de calidad nativos** (integra Great
Expectations / Soda dentro del DAG) y trae **su propia UI web** de runs/estado/reintentos. Airflow
es task-centric (peor para linaje de datos); Prefect es bueno para flujos dinámicos pero menos
opinado en calidad. Para "sincronizar y limpiar catálogos", data-first = Dagster.

**B. Consola de operación (tu panel) — construida encima del motor:**
| Módulo | Qué hace |
|--------|----------|
| **Registro de fuentes** | alta/baja de cadenas por país+plataforma (`store_registry`); estado de salud (última corrida, #productos, ✅/🔴 ruptura) |
| **Disparar sync** | correr ingesta on-demand por fuente / país / categoría; ver progreso; reintentos |
| **Gates de calidad** | resultados de Great Expectations/Soda (nulls, precios fuera de rango, unidades no parseadas) antes de promover silver→gold |
| **Cola de revisión de matches** | **el corazón** — aprobar/rechazar matches de baja confianza (el trabajo humano del 70%); cada decisión reentrena el blocking |
| **Curaduría de taxonomía** | aprobar mapeos `categoría_tienda→canónica` propuestos por el LLM |
| **Anomalías de precio** | alertas de saltos raros / ofertas falsas sobre el histórico |
| **Migraciones** | correr/rollback de migraciones de schema `save` (Alembic) desde la UI |

**Build vs buy:** Dagster OSS (self-host) como motor + una consola propia. La cola de revisión y la
curaduría de taxonomía conviene tenerlas **propias** (es tu ventaja competitiva y tu dato). El resto
(runs, lineage, DQ) lo da Dagster de fábrica → no reinventes eso.

## 6. Proyectos / repos / artículos de referencia (2025-2026)

**Arquitectura de comparadores:**
- [Building A Real-Time Grocery Price Comparison System — OpenSourceForU (feb 2026)](https://www.opensourceforu.com/2026/02/building-a-real-time-grocery-price-comparison-system/) — microservicios por tienda, Selenium+CDP, FastAPI, Docker/K8s. Útil como anti-patrón (un scraper por tienda escala mal) y como base.
- [sakina27/price-scanner-app] — implementación con microservicios + Docker + K8s.

**Scrapers de fuentes RD/LatAm (reusables/estudiables):**
- [whoknowsi/pedidosya-scraper-api](https://github.com/whoknowsi/pedidosya-scraper-api) — PedidosYa vía Playwright → API con Cloudflare Workers + Hono + MongoDB. **Directamente relevante.**
- [memo23/uber-eats-scraper (Apify)](https://apify.com/memo23/uber-eats-scraper) · [easyapi/uber-eats-store-search (OpenAPI)](https://apify.com/easyapi/uber-eats-store-search-scraper/api/openapi) — UberEats menú/catálogo.
- [Scrape.do — UberEats scraping guide](https://scrape.do/blog/ubereats-scraping/) — cómo hallar `getStoreV1`/`getCatalogPresentationV2` desde un HAR.
- Scrapers de supermercados (patrones): [TonyCui02/grocer (NZ)](https://github.com/TonyCui02/grocer) · [lizametcalfe/Grocery_Scrapers](https://github.com/lizametcalfe/Grocery_Scrapers) · [prashcr/supermarket-scraping (HK→MongoDB)](https://github.com/prashcr/supermarket-scraping).

**IA para scraping y matching:**
- [Firecrawl](https://www.firecrawl.dev/) · [firecrawl/firecrawl (repo)](https://github.com/firecrawl/firecrawl) · [ScrapeGraphAI](https://scrapfly.io/blog/posts/best-tools-for-ai-webscraping) — comparativa de herramientas AI-scraping 2026.
- [hmshb/scraping-agent-ai](https://github.com/hmshb/scraping-agent-ai) — **LangGraph + Firecrawl + Anthropic** (tu stack).
- [AI-Powered Entity Matching con LLM embeddings + vector search (Medium, 2026)](https://medium.com/@akulkarni5208/ai-powered-entity-matching-how-i-built-a-multi-signal-matching-system-using-llm-embeddings-and-763c039220da) · [The Rise of Semantic Entity Resolution — Towards Data Science](https://towardsdatascience.com/the-rise-of-semantic-entity-resolution/) · [Entity Matching using LLMs (arXiv)](https://arxiv.org/pdf/2310.11244).

**APIs de plataforma (integración limpia):**
- [VTEX API Reference](https://developers.vtex.com/docs/api-reference) · [VTEX Search API](https://developers.vtex.com/docs/api-reference/search-api) · endpoint público `/api/catalog_system/pub/products/search`.
- [Carrefour replatformed to VTEX (caso)](https://vtex.com/us-en/cases/how-carrefour-is-disrupting-online-grocery-with-vtex/) — confirma VTEX en Carrefour LatAm.

**Orquestación / calidad de datos (el panel):**
- [Dagster vs Prefect vs Airflow — ZenML](https://www.zenml.io/blog/orchestration-showdown-dagster-vs-prefect-vs-airflow) · [Best Data Pipeline Tools 2026 — Bruin](https://getbruin.com/blog/best-data-pipeline-tools-2026/) · [FreeAgent — comparación orquestadores](https://engineering.freeagent.com/2025/05/29/decoding-data-orchestration-tools-comparing-prefect-dagster-airflow-and-mage/). Dagster integra **Great Expectations / Soda** para DQ dentro del DAG.

## 7. Gobernanza legal — la verdad dura para un fintech regulado

**No la endulzo:** scraping = zona gris. SupermercadosRD (tu competidor) **bloquea bots de IA** en su
`robots.txt` y cita copyright europeo para proteger SU base — mientras agrega la de otros. Los ToS de
PedidosYa/UberEats **prohíben** scraping y tienen anti-bot. Para un producto donde *la confianza es el
producto*, hay una jerarquía de limpieza:
1. **API oficial pública** (VTEX `/pub/`, Shopify `products.json`) — el retailer la expone; uso legítimo. **Preferí esto.**
2. **Acuerdo/partnership** con la cadena (endgame fase 3: proveedores cargan su data y pagan promoción).
3. **OCR del recibo del propio usuario** — 100% legal (es SU dato); además habilita el triángulo (sobrepago a nivel de ítem). **El camino más limpio y el más defensible.**
4. Scraping de agregadores — **último recurso**, con rate-limit respetuoso y consciencia del riesgo.

> Recomendación: para RD arrancá con **VTEX/Shopify API (limpio) + OCR de recibos (legal)**. Los
> agregadores como *enriquecimiento*, no como columna vertebral.

## 8. Recomendación / roadmap por fases

| Fase | Qué | Fuentes | Entregable |
|------|-----|---------|-----------|
| **0 · Núcleo** | Puerto `CatalogSource` + `VtexAdapter` + normalización de unidades + matching sobre **1 categoría (arroz)** | Sirena (VTEX) | Pipeline validado end-to-end, testeado RED-first |
| **1 · Cobertura limpia** | `ShopifyAdapter` + `MagentoAdapter` | + Plaza Lama, Nacional/Jumbo | 4 cadenas por API, sin scraping frágil |
| **2 · Panel de control** | Dagster + consola: registro, sync, DQ gates, **cola de revisión de matches**, taxonomía | — | Operación humana del 70% |
| **3 · Agregadores + IA** | `PedidosYaAdapter`/`UberEatsAdapter` + `AgentAdapter` (Firecrawl/ScrapeGraphAI) para Bravo/Garrido/Ole | + resto | Cobertura total RD |
| **4 · Multi-país** | Registro `store_registry` por `market_id`; reuso de adaptadores | CO, otros | Escala sin código nuevo |

## 9. Decisiones abiertas (para vos)

1. **¿Motor del panel?** Dagster (recomendado, data-first) vs Prefect vs construir liviano propio.
2. **¿Dónde vive la ingesta?** ¿Servicio Python aparte (`apps/ingestion` / `platform/jobs`) o dentro de `apps/api`? (Recomiendo servicio aparte: la ingesta escala distinto que la API.)
3. **¿Agregadores sí/no en el MVP?** Riesgo legal vs cobertura. (Recomiendo diferirlos a fase 3.)
4. **¿OCR de recibos como fuente primaria de precios?** Es el camino legal-limpio + habilita el triángulo. ¿Lo priorizamos junto con VTEX?
5. **¿La consola de revisión va en el admin web o embebida en algún panel existente?**

---

**Fuentes de datos crudas (enlaces del brief):** Sirena [sirena.do/supermercado](https://www.sirena.do/supermercado) · Jumbo [jumbo.com.do](https://jumbo.com.do/supermercado) · Nacional [supermercadosnacional.com](https://supermercadosnacional.com/) · Ole [pedidosya](https://www.pedidosya.com.do/cadenas/hipermercados-ole) · Carrefour [pedidosya](https://www.pedidosya.com.do/restaurantes/santo-domingo-d.n./carrefour-market-eb9d1b97-7e94-43cf-be14-513f02acf2e5-menu) · Bravo [bravova.superbravo.com.do](https://bravova.superbravo.com.do/) · Plaza Lama [plazalama.com.do/ca/supermercado/11](https://plazalama.com.do/ca/supermercado/11) · Garrido [garrido.com.do/ca/supermercado/24](https://www.garrido.com.do/ca/supermercado/24).
