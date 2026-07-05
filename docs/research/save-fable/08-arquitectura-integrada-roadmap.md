# 08 · Arquitectura integrada + Roadmap de implementación (consolidación)

> **Fecha:** 2026-07-03 · **Estado:** consolidación · **Teje:** docs 00-07 (todos DECIDIDOS).
> Single source of truth del diseño de Save. De acá sale el handoff a SDD para codear.
> Append-only.

---

## 1. Resumen ejecutivo (una página)
**Save** = la sección de Cuadra que **compara y transparenta precios de supermercado en RD** (paridad
con SupermercadosRD) **+ el foso que ellos no pueden**: el triángulo Insights×Save sobre TUS
transacciones, precio de góndola real (recibo/e-CF), y un subagente conversacional (AISpace). Se
consume desde **web y app móvil**. Diseñado **microservices-ready** (ADR 33) para escalar país por
país sin reescribir, y con un vertical financiero (bancos/seguros) como continuación.

**Doctrina central:** integrar **plataformas** (VTEX/Shopify/Magento/agregadores), no cadenas → un
adaptador sirve N cadenas y N países. El **70% del trabajo es el matching**, no la extracción. La IA
**estructura y recupera, NUNCA calcula el precio** (determinístico en minor units).

## 2. Stack consolidado (todas las decisiones, con doc de origen)
| Área | Decisión | Doc |
|------|----------|-----|
| Fuente de precio | Online (API) + góndola (recibo/e-CF), **etiquetados por `price_type`, nunca mezclados** | 01 |
| OCR de recibo | **Claude vision** primario + Veryfi/Mindee fallback; spike **e-CF/QR** (dato estructurado legal) | 01 |
| Extracción | **API-first por plataforma** (VtexAdapter/ShopifyAdapter/MagentoAdapter) + **Hero/Uber managed** | 02, 05 |
| Scoping | **Canasta canónica** (alta rotación), no full-catalog diario | 02 |
| Taxonomía | **Jerárquica** (semilla = la de SupermercadosRD, 15 tope + ramas) | 03 |
| Producto | **Paridad total** + foso; MVP = corte vertical simple (+ alertas + histórico) | 04 |
| Matching | **EAN → pg_trgm → BGE-M3/pgvector → Claude-juez → cola humana**, motor **Splink/Postgres**, bootstrap **canasta curada ~200 SKU** | 05 |
| Embeddings | **BGE-M3 self-host** (multilingüe, híbrido, privado) | 05, 07 |
| Orquestación | **Dagster OSS self-host** (asset-centric, lineage, DQ) | 06 |
| Calidad de datos | **Soda Core** (gates SQL) + **Pandera** (in-code) | 06 |
| Consola admin | **Refine** (OSS) sobre FastAPI, en `/admin` gateado por rol | 06 |
| Ingesta | **`apps/ingestion`** (proceso aparte, mismo monorepo, microservices-ready) | 06 |
| Web | **`apps/web` única** (portal público + `/admin`) | 06 |
| Agente | **PurchasesAgent** en LangGraph: **tools fijas para precios** (no text-to-SQL) + **retrieval híbrido + rerank condicional** + grounding + handoff a CoachAgent | 07 |
| Evals | **RAGAS + LangSmith**, **faithfulness como gate** de release | 07 |

## 3. Arquitectura integrada (end-to-end)
```
 FUENTES                      apps/ingestion (Python, Dagster OSS)          Postgres schema `save`
 ┌───────────┐   CatalogSource (puerto)                                    (medallion)
 │ VTEX      │──►┐  ├ VtexAdapter ┐                    ┌ normalización ┐    ┌──────────┐
 │ Shopify   │──►│  ├ ShopifyAdapt │─► BRONZE (raw) ──►│ (unidad base) │──► │ SILVER   │
 │ Magento   │──►│  ├ MagentoAdapt │   (Pandera dev)   └───────────────┘    │ (limpio) │
 │ Hero/Uber │──►│  ├ Aggregator(Apify managed)                            └────┬─────┘
 │ SPA/app   │──►│  └ AgentAdapter (Firecrawl)         MATCHING (Splink+     Soda gate
 │ Recibo/eCF│──►┘     (price_type: online|delivery|shelf)  pg_trgm+BGE-M3   │
 └───────────┘         Dagster: scheduling, lineage,   +Claude juez+cola)    ▼
                       DQ checks, detección de ruptura  ─────────────────►  GOLD
                                                                             canonical_product
                                                                             store_product
                                                                             price (append-only) ← foso
                                                                             offer · taxonomy
                                                     ┌───────────────────────────┘
                                       apps/api (FastAPI, contexts/save)
                                         endpoints: search · compare · lista · alertas · historial
                                         + cola de revisión (admin) + AISpace (PurchasesAgent/Coach)
                                       ┌──────────────┴───────────────┐
                                 apps/web (Next.js)              apps/mobile (Expo)
                                  ├ Portal Save (público)         Save en la app
                                  └ /admin (Refine, gateado)      (mismos endpoints)
```

## 4. Modelo de datos consolidado (schema `save`, ADR 33)
```
store_registry(id, provider_id, market_id, platform[vtex|shopify|magento|aggregator|spa],
               base_url, enabled)                      -- el "país nuevo = una fila" (escalabilidad)
provider(id, name, type[super|bank|insurer|...], platform, market_id)
taxonomy_node(id, parent_id, name, level)              -- árbol jerárquico (doc 03)
canonical_product(id, name, brand, quality, quantity{amount,unit}, taxonomy_node_id, market_id, embedding vector)
store_product(id, provider_id, canonical_product_id, current_price_minor, currency, url, ean?)
product_match(store_product_id, canonical_product_id, confidence, method[ean|trgm|vector|llm|human], reviewed_by?)
price(id, store_product_id, value_minor, currency, captured_at, price_type[online|delivery|shelf|receipt], source)  -- append-only
offer(id, provider_id, canonical_product_id, offer_price_minor, valid_until)
shopping_list(id, user_id, name) · list_item(id, list_id, canonical_product_id, qty)
price_alert(id, user_id, canonical_product_id, threshold_minor)   -- feature G4 (MVP)
```
Reglas: dinero en BIGINT minor units; `user_id`/`market_id` cross-context por ID (sin FK); `price`
NUNCA update; comparación por default dentro del mismo `price_type`.

## 5. Dónde vive en el monorepo
| Ruta | Qué | Estado |
|------|-----|--------|
| `apps/api/src/contexts/save/` | dominio + application + infra (repos, adapters) + endpoints | scaffolding → construir |
| `apps/ingestion/` | worker Dagster: adapters + pipeline + matching (Splink) | **NUEVO** |
| `apps/web/` | portal Save + `/admin` (Refine) | **NUEVO** |
| `apps/mobile/src/features/save/` | Save en la app (consume `apps/api`) | `.gitkeep` → construir |
| `packages/api-client` | cliente generado (web + mobile) | existe |

## 6. Roadmap por fases
### F0 · Núcleo testeado (MVP invisible) — valida el pipeline de valor
- Dominio `save` (canonical_product, store_product, price, taxonomy) puro + **normalización a unidad
  base** (RED-first) + domain service `compare()`.
- **VtexAdapter** (Sirena) + **canasta curada ~200 SKU** matcheados a mano (bootstrap).
- Endpoints `search`/`compare` + tests. Migración schema `save`.
- **Entregable:** comparar arroz entre tiendas, con precio/unidad, testeado.

### F1 · MVP visible (paridad simple, supermercados) — doc 04 columna MVP + alertas + histórico
- + **ShopifyAdapter** (Plaza Lama) + **MagentoAdapter** (Nacional/Jumbo).
- `apps/web` portal: buscar → categoría con filtros → detalle con tabla comparativa + disclaimer.
- Lista de compra · **alertas de precio (G4)** · **historial (C9)** (price append-only + chart).
- **Dagster** scheduling (canasta frecuente + full semanal) + **Soda** gates + detección de ruptura.
- **Entregable:** SupermercadosRD-lite propio, 3 cadenas por API, en la web + app.

### F2 · Foso Cuadra — lo que ellos no pueden
- **Matching automático** (pg_trgm→BGE-M3→Claude-juez) + **consola `/admin` (Refine)** con **cola de
  revisión humana** + curaduría de taxonomía + active-learning.
- **PurchasesAgent** (LangGraph: tools fijas + retrieval híbrido + grounding) + **CoachAgent** (triángulo).
- **OCR de recibo (Claude vision)** + **spike e-CF/QR** → precio de góndola real → alimenta el triángulo.
- **Agregadores Hero/Uber (Apify managed)** para más cobertura (`price_type=delivery`).
- Evals **RAGAS+LangSmith** con faithfulness gate.
- **Entregable:** el triángulo + el agente conversacional + góndola real = el diferenciador.

### F3 · Escala y verticales
- **Multi-país** vía `store_registry` (reuso de adaptadores por plataforma).
- **Save financiero:** `provider.type=bank|insurer` (nuevos verticales del marketplace).
- Reverse-eng propio de agregadores de alto volumen (migrar desde managed).
- SEO/landings programáticas + análisis de precios del histórico.

## 7. Spikes / tareas abiertas (antes o durante F0-F1)
- **Spike e-CF/QR** (autorizado, doc 01): Guía DGII No.6 + recibos reales → ¿el QR da line-items?
- **Spike de verificación de endpoints** (doc 02): que `/pub` de Sirena, `products.json` de Plaza
  Lama y `/graphql` de Nacional respondan con precio; confirmar Carrefour=VTEX, Plaza Lama=Shopify.
- **Medir gap online vs góndola** por cadena (calibra la honestidad del claim).

## 8. Riesgos transversales + mitigación (consolidado)
| Riesgo | Mitigación | Doc |
|--------|-----------|-----|
| Legal / scraping (fintech regulado) | API oficial pública + OCR/e-CF (legal); agregadores = enriquecimiento | 01, 02, 05 |
| Online ≠ góndola | `price_type` etiquetado, nunca mezclar; OCR/e-CF para góndola real | 01, 03 |
| Matching (falsos merges) | umbral conservador + `confidence` + cola humana + canasta curada (cold-start) | 05 |
| Alucinación de precio | tools fijas (no text-to-SQL) + grounding context-only + faithfulness gate | 07 |
| Ruptura de adaptadores | detección de ruptura (asset-check Dagster) + fallback agente/managed | 02, 06 |
| Sobre-ingeniería temprana | fases: F0 canasta curada valida sin la catedral ML/panel | 04, 05 |

## 9. Handoff a SDD (cómo se vuelve ejecutable)
Cada fase = uno o más cambios SDD. Sugerido:
- `sdd-new save-core` (F0): dominio + VtexAdapter + normalización + compare + canasta seed (Strict TDD).
- `sdd-new save-web-mvp` (F1): adapters Shopify/Magento + apps/web portal + lista + alertas + histórico + Dagster.
- `sdd-new save-moat` (F2): matching auto + consola admin + PurchasesAgent + OCR + agregadores + evals.
- `sdd-new save-scale` (F3): multi-país + vertical financiero.
El plan seed anterior (`docs/sdd/save-mvp/`) se **subsume** en `save-core` (F0), ampliado con esta arquitectura.

---

**Estado:** diseño COMPLETO y consolidado. Los 8 docs cubren investigación→decisión→arquitectura→roadmap.
**Siguiente acción (no investigación):** arrancar **F0 (`save-core`)** por SDD, empezando por el spike
de verificación de endpoints + el dominio con normalización RED-first.
