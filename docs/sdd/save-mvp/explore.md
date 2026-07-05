# SDD · Save MVP (supermercados) — Fase 1: EXPLORE

> **Cambio:** `save-mvp` · **Rama:** `feat/save-supermercados` · **Fase:** explore
> **Fecha:** 2026-07-03 · **Ejecución:** interactivo · **Artefactos:** `.md`
> **No decide diseño** — investiga idea, mapea código existente y fija restricciones.
> Fuentes: `docs/arquitectura-mvp.md` §6, `docs/research/supermercadosrd-analisis.md`,
> `docs/estructura-monorepo.md` §6.

---

## 1. Qué queremos construir (intención)

**Save** = la pieza 2 de Cuadra: un **catálogo de precios de supermercados** que replica
SupermercadosRD, para que el usuario sepa **dónde comprar más barato**. El diferenciador de
Cuadra NO es Save por separado — es el **triángulo Insights × Save vía Coach** (§5·"gana solo
por el triángulo"): *"esa compra costaba RD$450 menos en Bravo"*.

MVP = **supermercados** únicamente. Futuro (fase 3): bancos, seguros, proveedores que cargan su
propia data y pagan por promoción (marketplace de dos lados).

## 2. Estado real del código (punto de partida = greenfield)

| Lado | Ruta | Estado |
|------|------|--------|
| API | `apps/api/src/contexts/save/` | **scaffolding vacío**: `__init__.py` en `domain/`, `application/`, `infrastructure/`, `infrastructure/matching/`, `infrastructure/catalog_sources/` + README stub. Cero lógica. |
| Mobile | `apps/mobile/src/features/save/` | solo `.gitkeep`. |

Contexto de referencia para imitar patrones: **`insights`** (ya implementado, DDD completo):
`domain/{entities,ports,ledger}` puro · `application/{use_cases,dtos,mappers,queries}` ·
`infrastructure/{repositories,models,mappers}` (SQLAlchemy).

## 3. El dominio (de §6 + dossier de research)

Pipeline canónico:
```
INGESTA → NORMALIZAR unidades → MATCHING productos → TAXONOMÍA canónica → INDEXAR → SERVIR
```

**Modelo de dominio** (§6.3) y esquema DB previsto (§ líneas 773-779):
```
provider(id, name, type[super|bank|...], platform[vtex|shopify|html])
canonical_product(id, name, brand, base_unit, canonical_category_id)
store_product(id, provider_id, canonical_product_id, current_price, url)
price(id, store_product_id, value, date)        -- append-only (time-series) = el activo incopiable
offer(id, provider_id, product_id, offer_price, valid_until)
shopping_list(id, user_id, name) · list_item(id, list_id, product_id, qty)
```

**Layout DDD previsto** (`estructura-monorepo.md` §6, ya con carpetas creadas):
```
save/
  domain/           # entities · value_objects · ports · enums  (PURO, sin ORM · ADR 31)
  application/      # use_cases · dtos · mappers
  infrastructure/
    catalog_sources/  # CatalogSource (PORT): VtexAdapter · HtmlScraperAdapter · §6.2
    matching/         # EAN → fuzzy(pg_trgm) → embeddings(pgvector) · §6.2
```

### Las 4 piezas duras del pipeline
1. **Ingesta** — puerto `CatalogSource` con un adaptador por cadena. **Regla de oro:** auditar
   PRIMERO si la tienda usa **VTEX** (API JSON `/api/catalog_system/pub/products/search`) →
   evita scrapear HTML frágil. Común en retail LatAm.
2. **Normalización de unidades** — parsear `LB/OZ/ML/und/multipack` → **precio por unidad base**
   (RD$/kg, RD$/L). ES la única comparación justa. Sin esto, "arroz RD$120" no dice nada.
3. **Matching (entity resolution)** — `EAN → fuzzy(marca+nombre+tamaño, pg_trgm) → embeddings
   (pgvector) → revisión humana (admin)`. **Es el 70% del trabajo oculto.**
4. **Histórico de precios** — tabla `price` **append-only**. El foso incopiable (serie temporal).

## 4. Restricciones (ADRs y reglas duras del proyecto)

- **ADR 31 — dominio puro:** `domain/` sin ORM; SQLAlchemy 2.0 + Alembic solo en
  `infrastructure/`. El dominio nunca importa de infra. `import-linter` lo enforcea.
- **ADR 33 — microservices-ready:** cada contexto vive en su **propio schema + rol de DB**;
  NO accede a la DB de otro contexto; referencias cross-context **por ID, no por FK**.
- **ADR 5 + §"Save" del testing (§línea 1077):** *ningún cálculo de dinero se escribe sin un
  test que lo cubra primero* → **Strict TDD RED-first** aplica a normalización de unidades,
  comparación de precios y cualquier aritmética monetaria.
- **Dinero:** minor units (BIGINT), regla del proyecto §12·B. `packages`/`lib/money` en mobile.
- **DB:** PostgreSQL + `pg_trgm` (búsqueda) + `pgvector` (matching/semántica) — Supabase/Neon.

## 5. Riesgos (mapeados en el dossier)

| Riesgo | Sev | Nota |
|--------|-----|------|
| **Legal / scraping en zona gris** | 🔴 | Producto fiscal regulado NO puede arriesgar demanda. SupermercadosRD mismo bloquea bots por copyright. Preferir **VTEX/API oficial** o **OCR del recibo del propio usuario** (100% legal). |
| **Matching = 70% del trabajo** | 🔴 | El costo real no es el código, es la calidad de entity resolution. El MVP debe acotar el dominio para hacerlo confiable antes de escalar. |
| **Cold-start del catálogo** | 🟠 | Scraping = bootstrap. Endgame fase 3 = proveedores cargan data. |
| **Fragilidad de scrapers** | 🟠 | Los catálogos cambian de formato → adaptadores se rompen. Necesita monitoreo de ruptura (§línea 982). |
| **Frescura del dato** | 🟡 | Precios desactualizados destruyen la confianza (el core). |

## 6. Orden de MVP recomendado (del blueprint §11 del dossier)

> **NO construir todo Save de una.** El propio dossier prescribe el corte:
1. **2 tiendas, 1 categoría** (ej. Bravo + Nacional, solo "arroz") → valida el pipeline
   end-to-end sobre el subconjunto donde vive el dolor real.
2. Resolver **normalización + matching** en ese subconjunto.
3. Solo con matching confiable → escalar tiendas y categorías.
4. Buscador + SEO/serving avanzado **al final** (son la cosecha, no la siembra).

## 7. Preguntas abiertas (a resolver en PROPOSE)

1. **¿Fuente de datos del MVP?** VTEX-API real (¿qué cadena RD es VTEX?) vs. **seed/fixtures
   estáticos** para desbloquear dominio+endpoints sin depender del scraping ni del tema legal.
2. **¿Alcance de esta iteración?** ¿Solo backend (dominio + search/compare + lista) o incluye
   la UI móvil de Save?
3. **¿Matching en el MVP?** ¿Entra pgvector/embeddings ya, o el MVP asume productos ya
   matcheados por `canonical_product_id` (matching manual/seed) y difiere el pipeline automático?
4. **¿Endpoints núcleo?** §línea 923 lista `save/search`, `save/compare`, `lista`. ¿Cuáles en
   esta iteración?
5. **¿Necesitamos `pgvector`/`pg_trgm` en infra desde ya**, o arrancamos con matching por
   `canonical_product_id` y búsqueda simple, difiriendo las extensiones?

## 8. Hallazgos clave para la propuesta

- Es **greenfield** con el scaffolding y el esquema DB **ya diseñados** → la propuesta parte de
  un modelo conocido, no de cero.
- El **corte "2 tiendas / 1 categoría / seed"** desacopla el valor de dominio del riesgo legal
  del scraping → permite construir y testear el núcleo YA, y enchufar VTEX real después.
- El **triángulo (Coach cruza Insights × Save)** es el norte, pero depende de que Save exponga
  `compare_prices` como tool → priorizar que el dominio + compare estén sólidos y testeados.

---

**Siguiente fase:** `propose` — 2-3 enfoques con trade-offs para el corte del MVP de Save,
resolviendo las preguntas abiertas de §7.
