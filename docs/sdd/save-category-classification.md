# SDD: save-category-classification (clasificar productos por categoría)

> Modo: Interactivo · Artefacto: este único .md · Strict TDD: ON · Rama: `feat/save-category-classification` (off developer)

Poblar la **categoría** de los productos de Save (hoy `taxonomy_node_id = NULL` para todo lo ingestado real) mediante un **clasificador por nombre** que espeja la cascada de matching F2.0. Desbloquea: el badge de categoría en la Cola de revisión (Figma `483:12413`, ya pre-cableado), y a futuro los filtros/rails por categoría en web y mobile.

Fuente de taxonomía: `docs/research/save-fable/Categorias_y_Subcategorias.md` — **15 categorías tope**, 2 niveles (categoría → subcategoría).

## Decisiones del usuario (fijadas antes del explore)

| Decisión | Elección |
|---|---|
| **Granularidad** | **Hoja + roll-up**: clasifica a la subcategoría hoja cuando hay confianza; el badge/filtro sale del ancestro tope (nivel 0). |
| **Alcance** | **Backfill + inline**: job que clasifica lo existente NULL + enganche en el pipeline de ingesta para lo nuevo. |
| **Modo SDD** | **Interactivo**: pausa tras cada fase. |

---

## Fase 1 — EXPLORE ✅

### El hueco
- `store_product` **NO tiene columna de categoría** (`infrastructure/models.py:232`). `canonical_product` sí tiene `taxonomy_node_id` (nullable) + `embedding Vector(1024)`, pero **ningún path automático lo puebla** para productos reales — solo el seed demo y el alta admin manual (`create_canonical_and_link.py`). Confirmado: todo lo ingestado entra con categoría NULL.
- La Cola de revisión muestra el badge sobre `store_product`s **aún sin matchear** (Figma) → la clasificación debe correr sobre el `store_product` por su **nombre**, independiente del matching y de la marca.

### Punto de enganche inline
- `RefreshCatalogPrices.execute()` (`application/refresh_prices.py:41-94`) — justo donde `record_observation(...)` materializa el `store_product` (con `name`/`brand`/`size_text` ya persistidos) y devuelve su id. La clasificación se inserta ahí, **sin depender del matcher**.
- Composition-root a clonar: `build_matcher(session)` / `build_canonical_embedder(session)` (`ingestion/save/composition.py:36-61`), gated por flag ship-dark, compartiendo la misma `session`/UoW. Se replica como `build_classifier(session)` / `build_category_embedder(session)`.
- Dos raíces de wiring ya convergen aquí: el CLI `seeds/save_refresh.py` y los assets Dagster `ingestion/save/assets.py`. Enganchar en `RefreshCatalogPrices` cubre ambas.

### Ladrillos reutilizables (cascada de matching)
| Pieza | Ubicación | Reuso |
|---|---|---|
| `EmbeddingProvider` (BGE-M3 HTTP + in-process) | `infrastructure/matching/embeddings.py` | **Sin cambios** — puerto genérico `embed(texts)`. |
| `LlmJudge` (fail-safe, nunca inventa) | `infrastructure/matching/llm_judge.py` | Mismo `get_chat_model("smart")`; prompt propio de clasificación. |
| RRF · banding · scoring | `infrastructure/matching/cascade/*` | Se espejan (fusion, thresholds). |
| SQL `pg_trgm` (`func.similarity` + `.op("%")`) / `pgvector` (`.cosine_distance`) | `matching/repository/product_match_repository.py` | Patrón para `find_categories_trgm` / `find_categories_vector`. |
| `build_embedding_text(name,brand,size)` | `matching/cascade/embedding_text.py` | **Regla de oro**: index-side y query-side deben usar la MISMA receta o los vectores son incompatibles. |

`ClassifyStoreProduct` = `MatchStoreProduct` **sin la etapa EAN** + **una etapa léxica nueva** (sin precedente en el código).

### Cola de revisión — pre-cableada
- `SqlProductMatchRepository.list_review_queue()` (`product_match_repository.py:272-275`) hoy hardcodea `category_slug=None, category_name=None` **con un comentario que apunta a este cambio**.
- `ReviewQueueRow.category_*` y `AdminReviewQueueRowDto.category` (+ `CategoryRefDto`) YA existen. Solo falta el JOIN + roll-up al tope una vez que exista el storage. **Cero cambios de UI del badge** (`CategoryBadge` + `category-colors.ts` ya viven en web).

### Embeddings + seed + tests + flags
- Embeddings: solo `canonical_product.embedding`. La etapa semántica necesita **embeddear las categorías** (columna nueva en `taxonomy_node`, índice chico: 15 topes + ~130 subcats), reusando el mismo BGE-M3.
- Seed: hoy solo hojas demo con estructura distinta. Hace falta un **seed nuevo** que parsee las 15 categorías del MD (2 niveles, `market_id="DO"`, `uuid5`-por-path idempotente). Slug se deriva en read-time (sin columna).
- Tests (RED-first): plantillas `tests/save/unit/test_match_store_product.py` (cascada con fakes), `test_embed_canonical_products.py` (backfill), `integration/test_product_match_repository.py` + `test_list_review_queue.py` (SQL real).
- Flags: nuevo `save_classification_enabled: bool = False` (espeja `save_matching_cascade_enabled`); reusa `save_bge_m3_endpoint_url`. Reusa `llm_provider` (dev = OpenAI gpt-4o vía el `ClaudeJudge` mal-nombrado).

---

## Fase 2 — PROPOSE

### Decisión A — Forma de persistencia (la que domina el diseño)

**A1 · FK `taxonomy_node_id` en `store_product`** (+ el que ya está en `canonical_product`)
- ➕ Simple, espeja `canonical_product`, JOIN directo en la review-queue.
- ➖ Acopla la clasificación a una fila SCD-4 de observación de precios. NO guarda confianza / método / candidatos → sin auditoría ni cola de revisión de clasificación a futuro. Al re-clasificar se pierde el historial.

**A2 · Tabla dedicada `category_classification`** — 👈 **RECOMENDADA**
- Espeja el split `product_match` / `review_candidate` del matching (registro de decisión + snapshots de candidatos).
- Columnas: `id, store_product_id (FK, nullable), canonical_product_id (FK, nullable), taxonomy_node_id (FK, la HOJA asignada), confidence, method (lexicon|trgm|vector|hybrid|llm|human), status (auto|review|rejected), created_at` (+ opcional `category_candidate` para snapshots).
- ➕ Guarda confianza + método + candidatos; cubre `store_product` **y** `canonical_product` uniforme; habilita una **cola de revisión de clasificación** análoga a la de matching; re-clasificar es un insert, no una sobreescritura.
- ➖ Una tabla más + un JOIN en la review-queue. (Mismo costo que ya pagamos en matching.)

> **Recomendación firme: A2.** Coherencia con el subsistema de matching, auditable, y no ata la señal de categoría a la tabla de precios. El badge de la review-queue sale de `store_product → category_classification → taxonomy_node → ancestros → tope`.
>
> ✅ **CONFIRMADO por el usuario (Decisión A = A2)**, con justificación de normalización: `confidence`/`method`/`status` describen el *acto de clasificar* (no al producto → 2NF/3NF); el historial es 1:N (→ 1NF exige tabla). Precedente en el propio código: `product_match` es tabla separada, aunque el *link* (`canonical_product_id`) sí se denormaliza en `store_product` por lectura. Regla derivada: la categoría "actual" se **deriva** de `category_classification` (última / `status=active`); NO se duplica en `store_product` salvo denormalización consciente por lectura.

### Decisión B — La cascada de clasificación

Espejo de matching, **sin EAN**, con etapa léxica al frente (barata, alta precisión):

```
nombre del store_product
  │
  1. LÉXICO determinista   (diccionario keyword→subcategoría, sembrado de los
  │                          propios nombres de subcategoría/categoría del MD;
  │                          match exacto de palabra → asigna directo, confianza alta)
  │
  2. pg_trgm               (similitud nombre vs nombres de subcategoría)
  │
  3. pgvector / BGE-M3     (nombre-producto [query] vs categorías-embeddeadas [index])
  │
  4. RRF                   (consenso trgm+vector → subcategoría ganadora)
  │
  5. banding               (auto | grey | human) — reusa thresholds del matching
  │
  6. juez LLM              (SOLO banda grey; piso de confianza; degrada a "sin clasificar"
                            si duda, NUNCA inventa categoría)
  ↓
asigna taxonomy_node_id (HOJA)  ·  o deja sin clasificar → badge "N/A"
```

Roll-up: el badge/filtro tope se deriva con `SqlTaxonomyRepository.ancestors(node_id)[0]` (nivel 0).

**Control de costo (riesgo de volumen):** los `store_product` son órdenes de magnitud más que los `canonical`. Mitigación: (1) la etapa léxica resuelve el grueso sin LLM; (2) solo la banda grey llega al juez; (3) el backfill clasifica **una vez por `store_product`** (gate "solo sin clasificar", como `list_without_embedding`), no en cada refresh de precio; (4) batch configurable (mirror `EmbedCanonicalProducts.execute(batch_size=128)`).

### Decisión C — Seed de taxonomía
Nuevo `seeds/save_taxonomy_seed.py` (o extensión de `save_seed`) que parsea el MD → 15 nodos `level=0` + subcats `level=1`, `market_id="DO"`, `uuid5`-por-path idempotente. **Riesgo de coexistencia**: la taxonomía demo actual usa nombres/estructura distintos bajo el mismo `market_id="DO"` → decidir en spec si se migra la demo, se limpia, o coexisten (recomiendo consolidar en la taxonomía real y re-apuntar el seed demo a hojas reales).

### Alcance
**Dentro:** tabla `category_classification` + migración; columna `embedding` en `taxonomy_node`; seed de taxonomía real; `EmbedCategories` (backfill de embeddings de categoría); `ClassifyStoreProduct` (cascada) + etapa léxica; `ClassifyBackfill` (job sobre store_product + canonical NULL); enganche inline en `RefreshCatalogPrices`; wiring de composición + flag; JOIN/roll-up en `list_review_queue`; flag `save_classification_enabled`.

**Fuera (follow-ups):** filtros/rails por categoría en web/mobile (consumo); cola de revisión HUMANA de clasificación (UI admin); las 4 tarjetas de métricas del workspace (concern aparte); discriminador de calidad (Premium/Integral/Gourmet).

### Riesgos / decisiones abiertas para SPEC
1. **Storage** — confirmar A2 (tabla) vs A1 (FK). *Recomendado A2.*
2. **Etapa léxica** — diccionario derivado de nombres de subcategoría (auto) vs curado a mano. Empezar auto-derivado + override manual.
3. **Coexistencia de taxonomía demo vs real** (misma `market_id`).
4. **Embedding de categorías** — ¿nombre solo, o nombre + subcategorías/sinónimos? (mejor recall con contexto).
5. **Umbral del juez** y qué hacer con baja confianza (dejar NULL vs cola de revisión de clasificación — MVP: NULL).
6. **Backfill de volumen** — batch + rate-limit del juez.

---

---

## Fase 3 — SPEC (Strict TDD)

Storage fijado = **A2**. Requisitos con escenarios ejecutables. Cada `R` es RED-first: el test falla antes de existir la implementación.

### Modelo de datos

**`category_classification`** (nueva tabla, schema `save`)
| Columna | Tipo | Nota |
|---|---|---|
| `id` | UUID PK | |
| `store_product_id` | UUID FK → `store_product` **nullable** | uno de los dos FK presente |
| `canonical_product_id` | UUID FK → `canonical_product` **nullable** | |
| `taxonomy_node_id` | UUID FK → `taxonomy_node` | la **HOJA** asignada |
| `confidence` | float | [0,1] |
| `method` | text | `lexicon\|trgm\|vector\|hybrid\|llm\|human` |
| `status` | text | `active\|superseded\|rejected` |
| `created_at` | timestamptz | |

- **Invariante CHECK**: exactamente uno de (`store_product_id`, `canonical_product_id`) NO nulo (XOR).
- **Índice único parcial**: `(store_product_id) WHERE status='active'` y `(canonical_product_id) WHERE status='active'` → a lo sumo UNA clasificación activa por producto (la "actual"; re-clasificar marca la anterior `superseded`).

**`taxonomy_node.embedding`** — nueva columna `Vector(1024)` nullable (BGE-M3, mismo modelo que `canonical_product.embedding`).

### Requisitos

**R1 · Migración** — Alembic revision crea `category_classification` (con CHECK XOR + índices únicos parciales) y agrega `taxonomy_node.embedding Vector(1024)`.
- *Escenario*: `alembic upgrade head` → `downgrade` → `upgrade` round-trip limpio; la tabla y la columna existen tras upgrade y desaparecen tras downgrade.
- *Escenario*: insertar una fila con AMBOS FK nulos → falla el CHECK. Insertar dos `active` para el mismo `store_product_id` → falla el índice único parcial.

**R2 · Seed de taxonomía real** — nuevo `seeds/save_taxonomy_seed.py` parsea `Categorias_y_Subcategorias.md` → 15 nodos `level=0` + subcats `level=1`, `market_id="DO"`, idempotente (`uuid5`-por-path). Slug derivado en read-time (sin columna).
- *Escenario*: correr el seed 2× no duplica nodos (mismo count). El árbol tiene 15 raíces; `Despensa & Abarrotes` tiene sus subcategorías del MD como hijos `level=1`.
- *Escenario*: `ListCategories.execute("DO")` devuelve las 15 categorías con sus subcategorías tras el seed.

**R3 · Etapa léxica (determinista, pura)** — `lexicon_match(name) → (leaf_node_id, confidence) | None`. Diccionario keyword→hoja auto-derivado de los nombres de subcategoría/categoría del MD (normalizado con `slugify`/tokens), con override manual opcional.
- *Escenario*: nombre `"Arroz Blanco Sirena 5 Lb"` con token `arroz` → hoja `Arroz, Granos & Legumbres` (o la hoja del MD que lo contenga), confianza alta determinista.
- *Escenario*: nombre swithout keyword conocido (`"Producto XYZ"`) → `None` (pasa a la siguiente etapa).

**R4 · Etapa trgm** — `find_categories_trgm(name, limit)` sobre nombres de subcategoría vía `func.similarity` + `.op("%")` (índice GIN pg_trgm). Devuelve ranking de hojas candidatas.
- *Escenario (integración, DB real)*: `"Detergente en polvo"` rankea `Lavado De Ropa` por encima de categorías no relacionadas.

**R5 · Etapa vector** — `EmbedCategories` (backfill) puebla `taxonomy_node.embedding` con `build_category_embedding_text(node)` (receta ÚNICA compartida index/query). `find_categories_vector(product_embedding, limit)` vía `.cosine_distance` (HNSW).
- *Escenario*: index-side y query-side usan la MISMA función de texto (test que asegura que ambos llaman a la receta compartida — regla de oro).
- *Escenario (integración)*: producto embeddeado por nombre rankea su categoría semánticamente cercana aunque no comparta tokens exactos.

**R6 · Fusión RRF** — `reciprocal_rank_fusion(trgm_ranked, vector_ranked)` → hoja ganadora por consenso (reusa `cascade/fusion.py`, k=60).
- *Escenario*: hoja presente en ambos rankings gana a una presente en solo uno.

**R7 · Banding + juez** — banda por score (`auto|grey|human`, thresholds reusados). El juez LLM corre **solo en grey**, con piso de confianza; ante duda degrada a "sin clasificar" (NUNCA inventa categoría).
- *Escenario*: score ≥ high → `auto` (asigna sin juez). Score en grey → juez; verdict `match` con confianza ≥ piso → asigna; verdict `uncertain` o error del cliente → NO asigna (queda sin clasificar).
- *Escenario*: score < mid → `human`/sin asignar (no se inventa).

**R8 · `ClassifyStoreProduct` (orquestación)** — use case que corre la cascada (léxico → trgm+vector → RRF → banding → juez) y persiste una fila `category_classification` con `status='active'`, marcando `superseded` cualquier `active` previa del mismo producto (misma transacción). El `taxonomy_node_id` persistido es la **HOJA**.
- *Escenario (unit, fakes)*: producto que resuelve en léxico → se persiste 1 fila `active` con `method='lexicon'`, sin llamar al embedder ni al juez.
- *Escenario*: re-clasificar un producto ya clasificado → la fila vieja pasa a `superseded`, la nueva queda `active` (invariante: 1 sola activa).
- *Escenario*: producto sin resolución → NO se persiste fila `active` (o se persiste `status` no-active según diseño de banding) → la categoría derivada es NULL.

**R9 · Roll-up al tope** — dado un `taxonomy_node_id` hoja, la categoría de badge/filtro es el ancestro `level=0` vía `SqlTaxonomyRepository.ancestors(node_id)[0]`.
- *Escenario*: hoja `Arroz, Granos & Legumbres` → tope `Despensa & Abarrotes` (slug `despensa-abarrotes`, que ya mapea a color en web).

**R10 · Backfill (`ClassifyBackfill`)** — job que clasifica productos SIN clasificación `active`: `store_product` (todos los reales) y `canonical_product` con `taxonomy_node_id` NULL. Batched (mirror `EmbedCanonicalProducts`, `batch_size` configurable). Gate "solo sin clasificar" (idempotente, no re-clasifica en cada corrida).
- *Escenario (unit, fakes)*: repo con 3 productos sin clasificar y 1 ya `active` → el backfill procesa 3, salta el 1. Segunda corrida procesa 0.

**R11 · Enganche inline** — en `RefreshCatalogPrices.execute()`, tras `record_observation(...)`, si el flag está ON y el `store_product` no tiene clasificación `active`, se invoca `ClassifyStoreProduct`. Independiente del resultado del matcher. NO re-clasifica en cada refresh de precio.
- *Escenario (unit)*: refresh de un `store_product` NUEVO con flag ON → se clasifica 1 vez. Refresh del MISMO producto (precio cambia) → NO se re-clasifica.
- *Escenario*: flag OFF → `RefreshCatalogPrices` se comporta idéntico a hoy (cero llamadas al clasificador).

**R12 · Wiring de la cola de revisión** — `SqlProductMatchRepository.list_review_queue()` deja de hardcodear `None`: JOIN `store_product → category_classification (active) → taxonomy_node → ancestro tope`, poblando `category_slug`/`category_name` con la categoría TOPE. Sin clasificación → sigue `None` (badge "N/A").
- *Escenario (integración)*: `store_product` con clasificación activa hoja `Frutas` → la row trae `category = {slug: 'frutas-verduras', name: 'Frutas & Verduras'}`. Sin clasificación → `category = None`.
- *Sin cambios* en `ReviewQueueRow`, `AdminReviewQueueRowDto`, ni la UI del badge.

**R13 · Feature flag ship-dark** — `save_classification_enabled: bool = False` (config.py, espeja `save_matching_cascade_enabled`). `build_classifier(session)`/`build_category_embedder(session)` en `ingestion/save/composition.py` devuelven `None` si el flag está OFF. Reusa `save_bge_m3_endpoint_url` y `llm_provider`.
- *Escenario*: flag OFF → `build_classifier` devuelve `None`; el pipeline no clasifica.

**R14 · Sin regresión** — suite backend verde; matching intacto; `RefreshCatalogPrices` con flag OFF sin cambios de comportamiento.

### Fuera de spec (follow-ups)
Consumo en filtros/rails web+mobile; cola de revisión HUMANA de clasificación (UI admin); métricas del workspace; discriminador de calidad; override manual del diccionario léxico vía UI.

### Decisiones abiertas menores (resolver en design)
- Etapa léxica: estructura exacta del diccionario (in-code const vs tabla sembrada).
- Receta de `build_category_embedding_text` (nombre solo vs nombre + subcats/sinónimos).
- Qué persiste el caso "sin resolución": ¿fila `status='review'` para una futura cola, o simplemente ninguna fila `active`? (MVP: ninguna → NULL).

---

---

## Fase 4 — DESIGN

Traducción de los 14 requisitos a contratos. Respeta la hexagonal de `contexts/save`: **domain PURO** (sin SQLAlchemy/HTTP), **ports = Protocols**, **application** orquesta, **infrastructure** implementa, **composición** en `ingestion/save/composition.py`. Schema `save` aislado (import-linter).

### Mapa de archivos (nuevo/tocado)

```
apps/api/src/contexts/save/
  domain/
    classification.py                     [NEW] entidades + value objects PUROS
    ports/repositories.py                 [EDIT] + Protocols de clasificación
  application/
    classify_store_product.py             [NEW] use case orquestador (cascada)
    embed_categories.py                   [NEW] use case backfill de embeddings de categoría
    classify_backfill.py                  [NEW] use case backfill de clasificación
    dtos.py                               [EDIT] + DTOs de clasificación (si hace falta salida)
    refresh_prices.py                     [EDIT] enganche inline (R11)
  infrastructure/
    models.py                             [EDIT] CategoryClassificationModel + taxonomy_node.embedding
    repositories.py                       [EDIT] SqlCategoryClassificationRepository + queries de candidatos
    classification/                       [NEW dir] espejo de matching/
      __init__.py
      lexicon.py                          [NEW] matcher léxico determinista (PURO)
      category_embedding_text.py          [NEW] receta ÚNICA index/query
      category_judge.py                   [NEW] juez LLM (reusa get_chat_model)
      cascade/                            [reusa fusion/banding/scoring de matching/cascade]
  seeds/save_taxonomy_seed.py             [NEW] seed de las 15 categorías del MD
  ingestion/save/composition.py           [EDIT] build_classifier + build_category_embedder
apps/api/src/config.py                    [EDIT] save_classification_enabled
```

> **Decisión de reuso**: `fusion.py` (RRF), `banding.py` (thresholds) y `scoring.py` de `matching/cascade/` son PUROS y agnósticos del dominio → se **importan tal cual** desde `classification/`, no se duplican. (Si import-linter marca el cruce matching→classification dentro del mismo contexto, se promueven a `save/shared/` — decisión de apply.)

### Domain — `classification.py` (PURO)

```python
@dataclass(frozen=True, slots=True)
class CategoryCandidate:            # una hoja candidata rankeada
    taxonomy_node_id: str
    score: float
    source: str                    # "trgm" | "vector"

@dataclass(frozen=True, slots=True)
class ClassificationResult:         # salida de la cascada, antes de persistir
    taxonomy_node_id: str | None    # HOJA asignada; None = sin clasificar
    confidence: float
    method: str                     # lexicon|trgm|vector|hybrid|llm|human
    band: str                       # auto|grey|human  (reusa determine_band)

@dataclass(frozen=True, slots=True)
class CategoryClassification:       # el registro persistente (fila active)
    id: str
    store_product_id: str | None
    canonical_product_id: str | None
    taxonomy_node_id: str
    confidence: float
    method: str
    status: str                     # active|superseded|rejected

@dataclass(frozen=True, slots=True)
class ClassifiableProduct:          # input a la cascada (mirror IncomingStoreProduct)
    ref_id: str                     # store_product_id o canonical_product_id
    is_canonical: bool
    name: str
    brand: str
    size_text: str
```

### Domain — Ports (Protocols nuevos en `ports/repositories.py`)

```python
class CategoryClassificationRepository(Protocol):
    def active_for(self, ref_id: str, *, is_canonical: bool) -> CategoryClassification | None: ...
    def save_active(self, c: CategoryClassification) -> None:
        """Inserta la nueva 'active' y marca superseded la anterior — MISMA transacción (invariante 1-activa)."""
    def list_unclassified(self, market_id: str, *, is_canonical: bool, limit: int) -> list[ClassifiableProduct]:
        """Productos sin fila active (gate del backfill, R10)."""

class CategoryCandidateRepository(Protocol):
    def find_leaves_trgm(self, name: str, market_id: str, limit: int) -> list[CategoryCandidate]: ...
    def find_leaves_vector(self, embedding: list[float], market_id: str, limit: int) -> list[CategoryCandidate]: ...

class CategoryIndexRepository(Protocol):          # para EmbedCategories (R5)
    def leaves_without_embedding(self, market_id: str, limit: int) -> list[tuple[str, str]]:  # (node_id, text)
    def set_embedding(self, node_id: str, embedding: list[float]) -> None: ...

class CategoryJudgePort(Protocol):                # mirror del LlmJudge de matching
    def judge(self, product: ClassifiableProduct, candidate_name: str) -> JudgeVerdict: ...
```

Se **reusa** el `EmbeddingProvider` (puerto genérico `embed(texts)`) sin cambios. `JudgeVerdict` = el mismo shape del matching (`decision`, `confidence`, `cited_fields`).

### Domain — `lexicon.py` (PURO, sin puerto — función)

```python
def lexicon_match(name: str, index: LexiconIndex) -> tuple[str, float] | None:
    """token exacto de subcategoría en el nombre → (leaf_node_id, confidence alta). None si no hay match."""

def build_lexicon_index(leaves: list[tuple[str, str]]) -> LexiconIndex:
    """(node_id, subcat_name) → dict token→node_id, derivado con slugify/tokenización. Auto del seed."""
```

### Application — Use cases

```python
class ClassifyStoreProduct:          # R8 — orquestador de la cascada
    def __init__(self, classifications, candidates, embedder, judge, lexicon_index): ...
    def execute(self, product: ClassifiableProduct, market_id: str) -> ClassificationResult:
        # 1. lexicon_match → si hit: persist active(method=lexicon), return  (sin embedder/juez)
        # 2. trgm = candidates.find_leaves_trgm(...)
        # 3. vec  = candidates.find_leaves_vector(embedder.embed([text])[0], ...)
        # 4. winner = reciprocal_rank_fusion(trgm, vec)      [reuso matching]
        # 5. score = apply_boosts(...) ; band = determine_band(score)
        # 6. band==auto → persist active(hybrid); band==grey → judge → persist o NULL; band==human → NULL
        # persist = classifications.save_active(...) (supersede la anterior, misma tx)

class EmbedCategories:               # R5 — backfill de embeddings de categoría
    def execute(self, market_id: str, batch_size: int = 128) -> int: ...

class ClassifyBackfill:              # R10 — backfill de clasificación (store + canonical)
    def execute(self, market_id: str, *, is_canonical: bool, batch_size: int = 128) -> int:
        # loop: list_unclassified(...) → ClassifyStoreProduct.execute por cada uno → hasta vacío
```

**Enganche inline (R11)** en `RefreshCatalogPrices.execute()`:
```python
# tras record_observation(...) → store_product_id, si self._classifier is not None:
if self._classifier and self._classifications.active_for(store_product_id, is_canonical=False) is None:
    self._classifier.execute(ClassifiableProduct(ref_id=store_product_id, is_canonical=False,
                                                 name=..., brand=..., size_text=...), market_id)
```
`RefreshCatalogPrices.__init__` recibe `classifier: ClassifyStoreProduct | None = None` (default None = flag OFF, R14 sin regresión).

### Infrastructure

- **`CategoryClassificationModel`** (schema `save`): columnas del spec + CHECK XOR + índices únicos parciales `WHERE status='active'`. `taxonomy_node.embedding = Vector(1024)` nullable.
- **`SqlCategoryClassificationRepository`**: `save_active` = `UPDATE ... SET status='superseded' WHERE ref=... AND status='active'` + `INSERT` nueva active, en la sesión/UoW compartida. `list_unclassified` = `LEFT JOIN` anti-active.
- **Candidatos** (`find_leaves_trgm`/`find_leaves_vector`) sobre `taxonomy_node` filtrando `level=1` (hojas) del market: `func.similarity(name, TaxonomyNode.name)` + `.op("%")` (trgm) y `.cosine_distance(embedding)` (vector) — mismo patrón que `product_match_repository.py`.
- **`category_embedding_text.py`**: `build_category_embedding_text(node_name, parent_name) -> str` — receta ÚNICA; la usa `EmbedCategories` (index) y `ClassifyStoreProduct` NO (el producto se embeddea con su propia receta de nombre; ver decisión abajo).
- **`category_judge.py`**: `SqlL... no` → adapter sobre `get_chat_model("smart")`, fail-safe idéntico a `llm_judge.py`.

### Composición (`ingestion/save/composition.py`)

```python
def build_classifier(session) -> ClassifyStoreProduct | None:
    if not settings.save_classification_enabled: return None
    prov = build_embedding_provider()                    # REUSO exacto
    return ClassifyStoreProduct(SqlCategoryClassificationRepository(session),
                                SqlCategoryCandidateRepository(session),
                                prov, CategoryJudge(get_chat_model("smart")),
                                build_lexicon_index(SqlCategoryIndexRepository(session).all_leaves(market)))

def build_category_embedder(session) -> EmbedCategories | None:
    if not settings.save_classification_enabled: return None
    return EmbedCategories(SqlCategoryIndexRepository(session), build_embedding_provider())
```
`save_refresh.py` + `ingestion/save/assets.py` pasan `classifier=build_classifier(session)` a `refresh_source`/`RefreshCatalogPrices`.

### Flujo de la cascada (R3-R8)

```
ClassifiableProduct(name, brand, size)
   │
   ├─ lexicon_match ── hit ─────────────────────────► persist active(lexicon, conf alta) ─► END
   │   miss
   ├─ find_leaves_trgm ─┐
   ├─ find_leaves_vector┤─► RRF ─► winner + score ─► determine_band
   │                     
   ├─ auto  ───────────────────────────────────────► persist active(hybrid) ─► END
   ├─ grey  ─► judge(product, winner.name) ─ match&conf≥piso ─► persist active(llm) ─► END
   │                                        └ uncertain/error ─► NO persist (NULL) ─► END
   └─ human ────────────────────────────────────────► NO persist (NULL) ─► END
```

### Wiring cola de revisión (R12)

`list_review_queue` agrega: `LEFT JOIN category_classification cc ON cc.store_product_id = sp.id AND cc.status='active'` → `LEFT JOIN taxonomy_node leaf ON leaf.id = cc.taxonomy_node_id` → resolver ancestro tope (recursivo o `ancestors()` en repo) → `category_slug = slugify(top.name)`, `category_name = top.name`. Sin `cc` → `None`.

### Decisiones menores resueltas (las 3 de spec)

1. **Diccionario léxico** → **in-code index construido en runtime** desde las hojas sembradas (`build_lexicon_index`), NO tabla nueva. Simple, sin migración extra, testeable puro. Override manual = un dict const opcional que se mergea.
2. **Receta de embedding de categoría** → `"{parent_name} {node_name}"` (categoría + subcategoría) para dar contexto; el PRODUCTO se embeddea con su nombre (receta de producto ya existente). Son espacios comparables (mismo BGE-M3).
3. **Caso sin resolución** → **ninguna fila `active`** (categoría derivada = NULL, badge "N/A"). La cola de revisión humana de clasificación queda como follow-up; el schema ya soporta `status` para habilitarla sin migración.

### Riesgos de design
- **Cruce de imports matching↔classification** dentro del mismo contexto (reuso de `cascade/fusion|banding|scoring`). Si import-linter lo prohíbe → promover esos 3 módulos puros a `save/shared/`. Verificar en la primera task.
- **Volumen del backfill de store_product**: el juez solo corre en grey; medir el % que cae a grey en un spike antes del backfill masivo (task de calibración).
- **Dos espacios de embedding** (producto vs categoría) deben venir del MISMO modelo BGE-M3 — garantizado por reusar `build_embedding_provider()`.

---

---

## Fase 5 — TASKS (Strict TDD, apply faseado)

Cada task es RED→GREEN. `[R#]` = requisito que cubre. Las dependencias entre batches están en el encabezado. Un batch = una unidad de PR/commit coherente.

### Batch 0 — Guardas previas (bloquea todo) ✅ DONE
- [x] 0.1 **import-linter verificado**: `uv run lint-imports` verde (2 contratos KEPT). Los contratos son (a) independencia cross-context y (b) `save.domain ↛ save.infrastructure`; **ninguno prohíbe** `application→infrastructure` ni `infrastructure→infrastructure` dentro de `save`. Precedente: `application/match_store_product.py` ya importa `banding`/`fusion`/`scoring` de `infrastructure/matching/cascade/`. **DECISIÓN: reuso directo, NO se promueve a `save/shared/`.** Guarda: `domain/classification.py` debe quedar puro (el linter lo vigila).

### Batch 1 — Migración & modelos [R1] ✅ DONE (foundation, bloquea 4-11)
- [x] 1.1 Alembic revision `4933e9cd6bcc` (down_revision=`0990d45c068a`): tabla `category_classification` (schema `save`).
- [x] 1.2 CHECK XOR `(store_product_id IS NULL) <> (canonical_product_id IS NULL)` + 2 índices únicos parciales `WHERE status='active'` (uno por FK).
- [x] 1.3 `ALTER TABLE save.taxonomy_node ADD COLUMN embedding vector(1024)` (SQL crudo, patrón de 614e370d452c; HNSW → Batch 5).
- [x] 1.4 `CategoryClassificationModel` + `TaxonomyNodeModel.embedding` (`infrastructure/models.py`), imports `CheckConstraint`+`text`.
- [x] 1.5 Test integración `test_category_classification_model.py` (5 tests): RED genuino (ImportError) → GREEN. Round-trip `upgrade→downgrade→upgrade` verificado; CHECK XOR y único-parcial verificados (rechazan ambos-null y 2ª active; permiten superseded+active); embedding round-trips. lint-imports 2/2 KEPT.
- **Gotcha**: autogenerate arrastró drops espurios (checkpoints LangGraph, spike_transaction, índices HNSW/trgm de canonical creados por SQL crudo) → limpiados a mano en la migración.

### Batch 2 — Seed de taxonomía real [R2] ✅ DONE (depende de 1.4)
- [x] 2.1 `seeds/save_taxonomy_seed.py`: `parse_taxonomy(md)` (puro) + `load_taxonomy_entries()` (lee el MD real) + `seed_taxonomy(session, market, entries?)` + `main()` CLI. Reusa `_taxonomy_leaf` (mismo `_NS`/`uuid5`).
- [x] 2.2 **Coexistencia RESUELTA**: reusar `_NS` + esquema `uuid5(taxonomy:{market}/...)` → el seed real es idempotente y COMPATIBLE con la demo (mismos ids para los mismos nodos; las hojas profundas de la demo quedan como hijos extra). **Cero limpieza.** Verificado: tras correr el seed, DO tiene exactamente **15 raíces** (el "Despensa & Abarrotes" de la demo se fusionó, no duplicó).
- [x] 2.3 Tests (7): unit del parser (4, incl. MD real → 15 cats) + integración (3: idempotencia 2×, 15 raíces + subcats, `ListCategories`). RED (ModuleNotFound) → GREEN 7/7. Seed real ejercitado: **DO = 15 tope + 120 subcategorías**.

### Batch 3 — Domain puro [R3 parcial] ✅ DONE (sin dependencia de DB)
- [x] 3.1 `domain/classification.py`: `ClassifiableProduct`, `CategoryCandidate`, `ClassificationResult`, `CategoryClassification` (frozen slots, PUROS). 4 tests de construcción. lint-imports: domain sigue puro.
- [x] 3.2 `infrastructure/classification/lexicon.py`: `build_lexicon_index(leaves)` + `lexicon_match(name, index)`. Alta precisión: tokens ≥3 sin stopwords, token ambiguo (>1 hoja) DESCARTADO, match solo si pega UNA hoja. Reusa `slugify` (normaliza acento/caja). 6 tests unit (keyword distintivo, single-word, sin-keyword→None, acento, ambiguo→None, stopwords). RED (ModuleNotFound) → GREEN 10/10.

### Batch 4 — Puertos + repo de clasificación [R8 storage] ✅ DONE (depende de 1, 3)
- [x] 4.1 Protocol `CategoryClassificationRepository` en `domain/ports/repositories.py` (`active_for`, `save_active`, `list_unclassified`). Los otros Protocols (Candidate/Index/Judge) se definen en sus batches (5/6) cuando tienen consumidor + test — evita puertos huérfanos sin RED.
- [x] 4.2 `SqlCategoryClassificationRepository` (`repositories.py`): `active_for`, `save_active` (UPDATE superseded → INSERT active, misma tx), `list_unclassified` (store vía JOIN provider por market; canonical vía market_id directo; anti-join `active`). Helper `_classification_to_entity`.
- [x] 4.3 Tests integración (3): round-trip; supersede (1 active + 1 superseded, `active_for` = la nueva); `list_unclassified` excluye clasificados. RED (ImportError) → GREEN.
- **Hallazgo**: `store_product` NO tiene `market_id` (el de línea 290 era `PriceAlertModel`) → el backfill filtra por market vía `JOIN provider`.

### Batch 5 — Candidatos trgm/vector + embeddings de categoría [R4, R5] ✅ DONE (depende de 1, 2)
- [x] 5.1 `category_embedding_text.py`: `build_category_embedding_text(node, parent)` = `"{padre} {subcategoría}"` (contexto). **Corrección de spec**: NO es receta compartida query/index — index embeddea CATEGORÍAS, query embeddea PRODUCTOS (entidades distintas, mismo espacio BGE-M3, distancias comparables). 2 tests unit.
- [x] 5.2 `SqlCategoryIndexRepository` (`leaves_without_embedding` con self-join a padre, `set_embedding`) + `EmbedCategories` use case (batched, idempotente, mirror `EmbedCanonicalProducts`). Puertos `CategoryIndexRepository`. 2 tests unit con fakes.
- [x] 5.3 `SqlCategoryCandidateRepository.find_leaves_trgm` (`func.similarity`, `level=1`, order desc, sin filtro `%` — tabla chica ~135 filas, seq scan OK). Puerto `CategoryCandidateRepository`. Test integración: `"Arroz Blanco"` → `Arroz, Granos & Legumbres` primero.
- [x] 5.4 `find_leaves_vector` (`cosine_distance`, order asc, score=1-dist). Test integración: vector idéntico → hoja target primera. **Sin HNSW** (tabla ~135 filas, seq scan instantáneo; el índice sería sobre-ingeniería). RED (ImportError) → GREEN 6/6.

### Batch 6 — Juez de categoría [R7 parcial] ✅ DONE (depende de 3)
- [x] 6.1 `infrastructure/classification/category_judge.py`: `CategoryJudge` sobre `get_chat_model("smart")`, structured output `_Verdict`, fail-safe (client error/unparseable/validación → `uncertain`, NUNCA `match`). Prompt EN (pertenencia producto→categoría). Puerto `CategoryJudgePort` + `CategoryVerdict` PURO en domain (no viola hexagonal: el puerto no referencia el `JudgeVerdict` de infra). Modelo inyectado → tests sin red. 4 tests adapter (RED→GREEN).

### Batch 7 — Orquestador `ClassifyStoreProduct` [R6, R7, R8, R9] ✅ DONE (depende de 3,4,5,6)
- [x] 7.1 `application/classify_store_product.py`: cascada léxico→(trgm+vector)→RRF(consenso)→banding(score CRUDO del ganador, NO el RRF)→juez(grey, piso 0.70)→persist. Reusa `determine_band`/`JUDGE_MATCH_MIN_CONFIDENCE`. RRF propio (`_rrf_winner`, ~8 líneas): el del matching está acoplado a `MatchCandidate` (lee `canonical_product_id`). NO usa `apply_boosts` (no hay marca/tamaño de "categoría" que comparar).
- [x] 7.2 Roll-up: **sin helper nuevo** — el ancestro tope se resuelve con el `ancestors()` existente en el wiring de review (Batch 11). El use case persiste la HOJA. Se agregó `name` a `CategoryCandidate` (+ queries de Batch 5) para que el juez reciba el nombre de la categoría ganadora.
- [x] 7.3 Unit con fakes (7): léxico-hit → `lexicon` sin embedder/juez; auto → `hybrid`; grey+match≥0.70 → `llm`; grey+match<0.70 → sin clasificar; grey+uncertain → sin clasificar; human → sin clasificar; sin candidatos → sin clasificar. RED→GREEN. Batería 1-7 = 42 verdes, lint-imports 2/2.

### Batch 8 — Backfill de clasificación [R10] ✅ DONE (depende de 7)
- [x] 8.1 `application/classify_backfill.py`: **snapshot-then-classify** (lee TODO lo sin clasificar paginado por offset ANTES de mutar) para `store_product` o `canonical_product`. **Gotcha resuelto**: un loop ingenuo `while list_unclassified` sería INFINITO — los productos sin resolver (juez uncertain/banda human no persisten fila) se re-devuelven eternamente. El snapshot los procesa 1 vez y termina. Agregado `offset` + `order_by(id)` a `list_unclassified` (Batch 4).
- [x] 8.2 Unit con fakes (3): procesa los 3 sin clasificar 1 vez; 2ª corrida = 0; **caso sin-resolución no hace loop infinito**. RED→GREEN.

### Batch 9 — Composición + flag [R13] ✅ DONE (depende de 7, 8)
- [x] 9.1 `config.py`: `save_classification_enabled: bool = False` (ship-dark, reusa `save_bge_m3_endpoint_url`+`llm_provider`).
- [x] 9.2 `composition.py`: `build_classifier` + `build_category_embedder` + `build_classify_backfill` (None si flag OFF, reusan `build_embedding_provider`). `_build_lexicon(session, SAVE_MARKET)` construye el índice léxico desde la taxonomía sembrada (ingesta single-market; multi-market=F3). Batch 7 intacto (recibe el dict prebuild). 2 tests integración (flag off→None, flag on→objetos reales). RED→GREEN.

### Batch 10 — Enganche inline [R11] ✅ DONE (depende de 7, 9)
- [x] 10.1 `RefreshCatalogPrices.__init__(classifier=None)` + `_classify()` tras `record_observation` en AMBOS caminos (nuevo con matcher + refresh de conocido, capturando el `store_product_id`). **Gate = idempotencia del clasificador** (`execute` checa `active_for` al inicio → no reclasifica en cada refresh, R11) — más limpio que un gate en el caller. Test de idempotencia en Batch 7.
- [x] 10.2 Wiring: `refresh_source(..., classifier=)` (runner) + `save_refresh.py` (build_classifier + build_category_embedder) + `assets.py` (embed de categorías en `embed_canonicals` + classifier en el refresh).
- [x] 10.3 Unit (3): nuevo → clasifica; conocido en refresh → clasifica (idempotente); flag OFF → intacto (R14). RED→GREEN. 23 verdes en la batería refresh+clasificación+composición.

### Batch 11 — Wiring cola de revisión [R12] ✅ DONE (depende de 1, 7)
- [x] 11.1 `list_review_queue`: `outerjoin category_classification (active) → leaf → top (leaf.parent_id)`; `COALESCE(top.name, leaf.name)` = categoría TOPE. `slugify` en read-time (sin columna). Sin clasificación → `None`. Índice único parcial garantiza ≤1 activa → sin fan-out.
- [x] 11.2 Test integración `test_review_queue_category.py` (2): hoja `Arroz, Granos & Legumbres` → row `category={slug:'despensa-abarrotes', name:'Despensa & Abarrotes'}` (tope, no la hoja); sin clasificación → `None`. Review-queue existente 8/8 sin regresión. Sin tocar DTO ni UI.

### Batch 12 — VERIFY [R14] (depende de todo)
- [ ] 12.1 Suite backend completa verde; matching intacto; typecheck/lint.
- [ ] 12.2 (Opcional, en vivo) Spike de calibración: activar el flag en dev, correr un refresh chico, medir % que cae a grey (costo del juez) antes de un backfill masivo. Verificar el badge real en `/admin/review-queue` (smoke visual del usuario — el agente no puede por el SSR gate de Clerk).

### Orden sugerido de PRs
1. **PR-1** (Batches 0-3): guardas + migración + seed + domain puro. Base sin comportamiento activo.
2. **PR-2** (Batches 4-8): repos + candidatos + juez + orquestador + backfill. La cascada completa, ship-dark.
3. **PR-3** (Batches 9-12): composición + enganche + review-queue + verify. Enciende el flag.

---

## Contrato de fase
`status: tasks-complete` · Storage = A2 · 12 batches (0-12) · Próximo: **apply** faseado (Batch 0 primero: decisión import-linter). Rama `feat/save-category-classification` off `developer`.
