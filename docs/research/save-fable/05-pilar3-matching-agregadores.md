# 05 · Pilar 3 — Agentes IA: MATCHING (el 70%) + agregadores (Hero/Uber)

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** 3
> Es el corazón del producto: sin matching no hay "N tiendas" ni tabla comparativa ni alternativas.
> Alimenta las features C4/B4/C6 del doc 04. Append-only, sin resúmenes.

---

## 1. Pregunta que resuelve este doc
(a) ¿Cómo decidimos que "Arroz Enriquecido La Garza 1Lt" (Nacional) == "ARROZ LA GARZA
ENRIQ. 1L" (Sirena) de forma confiable y a escala? (b) ¿Cómo extraemos los agregadores
(PedidosYa/UberEats) con su anti-bot? (c) ¿Dónde exactamente apoyan los agentes de IA?

---

# PARTE A — MATCHING / ENTITY RESOLUTION (el 70% del trabajo)

## A.1 La cascada (barata → cara), con blocking
El principio: **comparar todos-contra-todos es imposible** (100k × 8 tiendas = billones de pares).
El **blocking reduce los pares 99%+** sin perder matches verdaderos. Cascada:
```
1. EAN/código de barras exacto        → match directo (cuando el dato viene; barato, altísima confianza)
2. pg_trgm (blocking LÉXICO)          → candidatos por marca+nombre+tamaño (trigram, barato, en Postgres)
3. embeddings pgvector (blocking SEMÁNTICO) → candidatos que el léxico pierde (sinónimos, orden distinto)
4. LLM juez (Claude) sobre los DUDOSOS → decide match/no-match en la banda gris (caro → solo la franja)
5. cola de revisión HUMANA            → confianza < umbral; cada decisión reentrena (active-learning)
```
El truco de costo: cada nivel **filtra** para que el siguiente (más caro) vea MENOS pares. El LLM
solo toca la "banda gris", no los 100k.

## A.2 Herramientas de entity resolution (2025-2026)
- **Splink** — el punto de partida OSS más fuerte: linkage probabilístico Fellegi-Sunter,
  backends SQL (¡corre sobre Postgres/DuckDB!), diagnósticos interactivos, blocking rules
  explícitas, term-frequency, umbrales de probabilidad y clustering. **Ideal para nosotros:** vive
  en SQL, se integra con el Postgres que ya tenemos, es transparente/auditable.
- **Zingg** — ML + **active-learning** near-data-platform (Spark), integración LangChain. Bueno si
  el volumen se vuelve masivo y querés un labeler ML dedicado. Más pesado (Spark).
- **dedupe (Python)** — active-learning entrenado por humano, fuzzy matching modular. Liviano,
  bueno para prototipos.
- **Cuándo pasar a algo propio:** cuando necesitás señales multi-modales (imagen del producto +
  texto + tamaño) o umbrales por-categoría. Se construye sobre pgvector + reglas propias.

## A.3 Modelo de embeddings (para el blocking semántico y el retrieval del agente)
El stack usa Anthropic (que NO tiene modelo de embeddings) → hay que elegir uno aparte:
- **🏆 BGE-M3 (self-host)** — workhorse de RAG multilingüe self-host, **100+ idiomas** (español
  incluido), y **búsqueda híbrida nativa (denso + sparse)** = encaja perfecto con nuestra estrategia
  pg_trgm(léxico)+vector(semántico). Apache, costo marginal ~0, privacidad (el catálogo no sale).
- **🔀 OpenAI text-embedding-3-large (hosted)** — el default hosted más seguro, buen multilingüe;
  ❌ costo por token recurrente + el dato sale a un tercero.
- **🔀 voyage-3-large (Q4 2025)** — comercial optimizado para retrieval; alternativa hosted premium.
- Descartados por ahora: NV-Embed-v2 (top inglés, no multilingüe-first), Nomic v2 (bueno pero
  BGE-M3 gana en híbrido).

## A.4 🏆/🔀/📎/⚠️/✅ — PROPUESTA de matching

### 🏆 LA MEJOR SOLUCIÓN ACTUAL (2025-2026)
**Cascada EAN→pg_trgm→BGE-M3/pgvector→Claude-juez→cola humana, orquestada con Splink sobre
Postgres, con active-learning.**
- Blocking en dos capas ya presentes en tu infra: `pg_trgm` (léxico) + `pgvector` con **BGE-M3
  self-host** (semántico híbrido).
- **Splink** para el scoring probabilístico y el clustering (corre en SQL sobre tu Postgres →
  cero infra nueva pesada).
- **Claude como juez** SOLO en la banda gris (pares que el blocking dejó pero con score ambiguo) →
  costo acotado; respeta la regla sagrada (juzga identidad, NO calcula precios).
- **Cola de revisión humana** para confianza < umbral; cada decisión es un LABEL que reentrena el
  matcher (active-learning) → el sistema mejora solo con el uso (y resuelve su propio cold-start).
- `confidence` explícito en cada `store_product ↔ canonical_product`; nada < umbral se auto-mergea.

**Por qué es la mejor HOY:** máxima reutilización de tu stack (Postgres+pgvector), transparencia
(Splink es auditable, clave para un fintech), costo LLM acotado a la franja gris, privacidad
(BGE-M3 self-host), y multilingüe español de fábrica. Escala por-mercado sin reescribir.

### 🔀 ALTERNATIVAS
- **(A) Todo-LLM (Claude juzga cada par candidato):** más simple de escribir, altísima precisión. ❌
  Costo explota a escala (aunque sea solo sobre candidatos), latencia, y menos auditable que Splink.
  Úsalo solo en la banda gris, no como matcher primario.
- **(B) Zingg (ML + Spark):** potente a escala masiva con active-learning integrado. ❌ Trae Spark
  (infra pesada) — sobredimensionado hasta que el volumen lo justifique. Candidato de fase 3.

### 📎 EVIDENCIA
- ER libs: [Tilores — Splink vs Zingg vs dedupe (cuándo ir más allá)](https://tilores.io/content/best-open-source-entity-resolution-and-record-linkage-libraries-splink-zingg-dedupe-and-when-to-move-beyond-them/) · [Zingg — Blocking a escala (parte 3)](https://www.zingg.ai/post/entity-resolution-at-scale-part-3-blocking) · [TDS — Entity Resolution para product matching e-commerce](https://towardsdatascience.com/streamlining-e-commerce-leveraging-entity-resolution-for-product-matching-6a507fd5e925/) · [Awesome-Entity-Resolution (GitHub)](https://github.com/OlivierBinette/Awesome-Entity-Resolution) · [OpenSanctions Pairs — LLM entity matching a gran escala (arXiv 2026)](https://arxiv.org/pdf/2603.11051).
- Embeddings: [BentoML — mejores embeddings OSS 2026 (BGE-M3)](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models) · [ZeroEntropy — mejor embedding multilingüe 2026](https://zeroentropy.dev/articles/best-multilingual-embedding/) · [pecollective — best embedding models 2026](https://pecollective.com/tools/best-embedding-models/).

### ⚠️ RIESGOS + mitigación
- **Cold-start del matcher** (no hay labels) → arrancar con la **canasta curada** (matcheo manual de
  ~200 SKU) = los primeros labels; a partir de ahí active-learning. (Corrige mi crítica previa: el
  matching ML no bloquea el MVP porque la canasta curada lo bootstrappea.)
- **Falsos merges** (dos productos distintos unidos) = el peor bug → umbral conservador + cola humana + `confidence`.
- **EAN que miente** (mismo EAN, presentaciones distintas; o falta) → EAN es señal, no verdad absoluta; siempre corroborar con tamaño+marca.
- **Costo LLM** → solo banda gris; medir tokens/mes y cachear decisiones.
- **Deriva multilingüe/regional** (marcas locales RD) → BGE-M3 multilingüe + diccionario de sinónimos dominicanos.

### ✅ DECISIÓN que deberías tomar ahora
1. ¿**BGE-M3 self-host** para embeddings (privacidad+multilingüe+costo) o preferís hosted (OpenAI/Voyage) por simplicidad operativa?
2. ¿**Splink sobre Postgres** como motor de ER (auditable) o querés empezar todo-LLM en la canasta chica y sofisticar después?
3. ¿Confirmás **canasta curada (~200 SKU matcheados a mano)** como bootstrap de labels del matcher?

---

# PARTE B — AGREGADORES (PedidosYa / UberEats = "Hero y Uber")

## B.1 Qué aportan y qué cuestan
- **Aportan cobertura:** una API → muchas cadenas (Ole, Ritmo, Líder, PriceSmart, Sirena, Carrefour,
  Plaza Lama…) y se reusa por país (Delivery Hero y Uber son regionales/globales).
- **Cuestan:** el precio es de **DELIVERY** (`price_type = delivery`, aún más inflado que `online`;
  NUNCA se mezcla con góndola) + **anti-bot fuerte** (Cloudflare, tokens, geofencing por dirección).

## B.2 Vías técnicas de extracción
- **UberEats:** API interna `getCatalogPresentationV2` / `getStoreV1`; los ítems viven en
  `catalogSectionsMap › payload › standardItemsPayload › catalogItems`. Se identifican capturando un
  HAR. **[firme]**
- **PedidosYa (Delivery Hero):** API interna GraphQL/REST; el proyecto `whoknowsi/pedidosya-scraper-api`
  la resuelve con **Playwright** (bootstrap de sesión/token) → sirve la data como API propia. **[firme]**
- **Managed:** actores de **Apify** (UberEats/PedidosYa) y **Bright Data** manejan proxies+anti-bot.

## B.3 🏆/🔀/📎/⚠️/✅ — PROPUESTA de agregadores

### 🏆 LA MEJOR SOLUCIÓN ACTUAL
**Reverse-eng de la API interna donde sea estable (Playwright solo para bootstrap de token) +
fallback a actor managed (Apify/Bright Data) para el anti-bot pesado — todo detrás del MISMO puerto
`CatalogSource` (`PedidosYaAdapter`, `UberEatsAdapter`), con `price_type=delivery`.**
- Preferir la **API interna** (JSON estructurado, barato) sobre scrapear el DOM.
- **Playwright headless** solo para obtener el token/cookies de sesión, luego llamadas directas.
- **Managed (Apify/Bright Data)** como fallback cuando el anti-bot rompe el enfoque directo → pagás
  solo por lo que el reverse-eng no aguanta.
- Rate-limit conservador + rotación responsable; consciencia de que ToS lo prohíbe (riesgo asumido,
  ver doc legal futuro) → los agregadores son **enriquecimiento**, no la columna vertebral.

### 🔀 ALTERNATIVAS
- **(A) Solo managed (Apify/Bright Data) desde el día 1:** cero mantenimiento de anti-bot. ❌ Costo
  por request recurrente; menos control del schema. Bueno para validar rápido, caro a escala.
- **(B) Solo DOM scraping con agente-IA (Firecrawl):** funciona sin entender la API. ❌ Más frágil y
  caro por token que la API interna; reservar para SPAs sin API (Bravo/Garrido), no para agregadores.

### 📎 EVIDENCIA
- [whoknowsi/pedidosya-scraper-api (Playwright→API)](https://github.com/whoknowsi/pedidosya-scraper-api) · [Scrape.do — UberEats scraping (getStoreV1/getCatalogPresentationV2)](https://scrape.do/blog/ubereats-scraping/) · [Apify — Uber Eats scraper](https://apify.com/memo23/uber-eats-scraper) · [Bright Data — Uber Eats / PedidosYa scrapers](https://brightdata.com/products/web-scraper/pedidosya).

### ⚠️ RIESGOS + mitigación
- **Precio delivery ≠ góndola ≠ online** → `price_type=delivery`, nunca se mezcla; se muestra etiquetado.
- **Anti-bot / ToS** → API interna + fallback managed + rate-limit; asumir riesgo legal (enriquecimiento, no base).
- **Geofencing por dirección** → fijar direcciones-ancla por ciudad para estabilizar resultados.
- **Ruptura del schema interno** → detección de ruptura (pilar 2) + fallback managed.

### ✅ DECISIÓN que deberías tomar ahora
1. ¿Agregadores como **enriquecimiento** (recomiendo) o querés que sean fuente de primer nivel pese al `price_type=delivery`?
2. ¿Empezamos **reverse-eng propio** (más barato/control) o **managed (Apify)** para validar rápido y migrar después?

---

# PARTE C — DÓNDE APOYAN LOS AGENTES DE IA (resumen operativo)
| Tarea | Rol de la IA | Determinístico/Humano |
|-------|--------------|-----------------------|
| Extracción de SPAs sin API (Bravo/Garrido) | **Agente LangGraph + Firecrawl/ScrapeGraphAI** (patrón `hmshb/scraping-agent-ai`, tu stack) | — |
| Normalización de unidades | LLM parsea el *string* de tamaño ("12x330ml") | el precio/unidad se **calcula** en enteros |
| Matching banda gris | **Claude juez** identidad | umbral + cola humana |
| Mapeo de taxonomía | LLM propone `categoría_tienda→canónica` | humano aprueba |
| Detección de ofertas falsas | IA sobre el histórico | reglas de anomalía |

**Reuso clave:** el agente de extracción y el juez de matching corren sobre el MISMO LangGraph +
Anthropic que ya usa AISpace → no es un stack nuevo, es el mismo cerebro en modo pipeline.

---

**Decisiones que deberías tomar ahora:** A.4·✅ (3) + B.3·✅ (2).
**Qué investigar después:** **Pilar 2 (plataforma/paneles)** — Dagster + consola con la cola de
revisión que este pilar alimenta; y **Pilar 4 (RAG+LangGraph)** — cómo el agente consume este catálogo.

---

## ✅ RESOLUCIÓN (2026-07-03) — decisiones del usuario ("dale con tus recomendaciones y el porqué")

1. **Embeddings = BGE-M3 self-host.** *Por qué:* (a) **multilingüe** de fábrica (100+ idiomas) →
   maneja el español y las marcas locales RD sin tuning; (b) hace **búsqueda híbrida nativa
   (denso+sparse)** = calza exacto con nuestra estrategia `pg_trgm`(léxico)+`pgvector`(semántico);
   (c) **self-host** = el catálogo NO sale a un tercero (privacidad fintech) y costo marginal ~0; (d)
   como el stack es Anthropic (sin modelo de embeddings), necesitamos uno igual → mejor el que es
   gratis, privado y multilingüe. Hosted (OpenAI/Voyage) = costo por token recurrente + el dato sale.

2. **Entity Resolution = Splink sobre Postgres.** *Por qué:* (a) **corre en SQL sobre el Postgres que
   YA tenemos** → cero infra nueva pesada; (b) es **transparente/auditable** (Fellegi-Sunter: pesos de
   match, umbrales de probabilidad, clustering visibles) — y en un fintech la auditabilidad del "por
   qué estos dos son el mismo producto" IMPORTA; (c) es el punto de partida OSS más fuerte. Todo-LLM
   = costo explota + caja negra; Zingg = trae Spark (infra pesada, sobredimensionado hasta escalar).

3. **Bootstrap = canasta curada ~200 SKU matcheados a mano.** *Por qué:* resuelve el **cold-start del
   matcher** (hoy NO hay labels para entrenar nada); permite **entregar valor YA** (comparación real)
   con matching manual; y esos matches manuales son los **primeros labels** que alimentan el
   active-learning. Bonus: acota el costo de ops (no extraer 40k×8 diario para arrancar).

4. **Agregadores (Hero/Uber) = MANAGED primero (Apify), reverse-eng propio después.** *Por qué:* los
   agregadores son **enriquecimiento diferido** (no la columna vertebral) y tienen **anti-bot pesado**.
   Hundir ingeniería en reverse-eng ANTES de validar que aportan valor es prematuro. **Apify valida
   rápido y sin mantener anti-bot**; cuando un agregador demuestre su valor y el costo lo justifique,
   se migra ESE al reverse-eng propio detrás del mismo puerto `CatalogSource`. Refina el 🏆 de B.3:
   la secuencia correcta es **managed→propio**, no propio de entrada.

**Pilar 3: DECIDIDO** (BGE-M3 · Splink/Postgres · canasta curada · agregadores managed-first).
