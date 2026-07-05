# Plan · `save-matching` (Save F2.0 — Fundación de Matching)

> **Estado:** planificado (SDD: explore → propose → spec → design → tasks completados) · **Fecha:** 2026-07-05
> **Rama:** `feat/save-f2` · **Artifact store:** aispace-men (`sdd/save-matching/*`) + este `.md` consolidado
> **Modo:** interactivo · **Strict TDD:** ON (RED → GREEN → REFACTOR)
>
> Este documento consolida las 5 fases SDD en un solo plan committeable. Fuente de la verdad
> viva en aispace-men (`#514` explore · `#515` proposal · `#518` spec · `#517` design · `#519` tasks).
> El **porqué** del diseño de Save está en `docs/research/save-fable/` (docs 05/06/07/08).

---

## 0. Contexto — dónde encaja esto

Save = comparar y transparentar precios de supermercado en RD. **F0/F1 están cerrados y mergeados**
(dominio + adapters VTEX/Magento + portal web + lista + alertas + histórico + colecciones + slug SEO).

**F2.0 = el primer y más importante ladrillo del foso:** el **matching automático**, que la doctrina
llama *"el 70% del trabajo"*. Hoy, en ingestión, las `store_product` que no se reconocen **se TIRAN**
(`application/refresh_prices.py:33-34`). Sin matching confiable, nada más en Save importa.

**Alcance de F2.0 (IN):** migración pgvector/pg_trgm + tabla `product_match` + índice HNSW · entidad
`ProductMatch` + puertos `ProductMatchRepository`/`EmbeddingProvider` · cascada
`EAN → pg_trgm → pgvector(BGE-M3) → Claude-juez → cola humana` · adapter del juez · persistencia de la
cola · crecer canasta 1→~200 SKU · spike offline de embeddings.

**Fuera de alcance (milestones F2 posteriores):** consola admin (Refine), PurchasesAgent, OCR/e-CF,
agregadores (Apify), evals RAGAS, multi-país (F3).

---

## 1. Reglas SAGRADAS que gobiernan este cambio (violación = P0)

1. **La IA ESTRUCTURA y RECUPERA, nunca calcula un precio.** Scoring determinístico > generación LLM
   para la DECISIÓN de match. El juez solo clasifica la banda gris citando campos; jamás inventa.
2. **Dinero en minor units (BIGINT).** Formateo solo en el borde UI.
3. **`price_type` etiquetado, nunca mezclado** (online | delivery | shelf | receipt).
4. **Nada bajo el umbral auto-mergea** → `confidence` + `method` explícitos + cola humana.

**Guarda arquitectónica (import-linter, ADR 31):** el cliente Anthropic del juez vive SOLO en
`infrastructure/matching/`, nunca en `domain/`. Schema `save` aislado (ADR 33, sin FK cross-schema).

---

## 2. Decisiones cerradas (firmadas por el usuario)

| Decisión | Elegido | Descartado | Razón |
|---|---|---|---|
| **Motor ER** | Cascada **a mano** (pg_trgm + pgvector + score ponderado propio) | Splink · GoldenMatch | Máxima auditabilidad, cero dep ER externa, suficiente para bootstrap ~200 SKU. Splink = "revisitar a escala". GoldenMatch rechazado (2 meses, 1 mantenedor, benchmarks auto-reportados). |
| **Embeddings** | **BGE-M3** ahora (self-host, dense+sparse híbrido, Apache-2.0) | Qwen3-0.6B (por ahora) | Calza con el blocking de dos capas; no bloquea el arranque. Spike Qwen3 corre en paralelo y solo cambia la elección con números reales. |

### Regla de oro de embeddings (blindada — task 1.3 + docstring 5.2)
> **Un solo modelo de embeddings puebla el índice a la vez.** Vectores de modelos distintos NO son
> comparables. Cambiar de modelo = **re-embeber TODO el catálogo + reindexar HNSW** vía nueva
> migración, **nunca** un flip de config. Por eso `EmbeddingProvider` es un puerto y el spike Qwen3
> corre ANTES de llenar el catálogo.

> **Aclaración clave:** BGE-M3 (embeddings) y el LLM generativo (Claude/GPT del juez) son **capas
> ortogonales**. El generativo es intercambiable libremente sin tocar BGE-M3. Solo aplica la regla de
> oro dentro de la capa de embeddings.

---

## 3. Enfoque técnico

Use-case de cascada `MatchStoreProduct` (capa application) invocado desde la rama `unmatched` de
`refresh_prices.py`. Etapas de más barata a más cara:

```
EAN exacto
  → pg_trgm (blocking léxico)
  → pgvector/BGE-M3 (blocking semántico)
  → RRF (fusión de RANKS, k=60) + boosts determinísticos (marca/tamaño)
  → bandas por umbral:
       score ≥ HIGH (0.85)  → auto-link            (method = hybrid|trgm|vector)
       MID [0.55, 0.85)     → Claude-juez (banda gris)
       < MID  o  sin cands. → cola humana           (method = human)
  → Claude-juez: {decision, confidence, cited_fields}
       match      → auto-link (method = llm)
       no_match / uncertain / fallo de esquema / timeout → cola humana
```

**`product_match` es la única fuente de verdad de la vinculación.**
`store_product.canonical_product_id` es un puntero denormalizado que se escribe SOLO junto a una fila
`product_match`, en la MISMA transacción (mata el riesgo de deriva que marcó el explore).

**Juez fail-safe:** salida inválida/no parseable → forzado a `uncertain` → cola humana. Nunca se
arriesga un merge falso por un error de parseo. Token usage logueado por llamada (instrumentación de
coste). El juez solo se invoca en la banda gris — EAN/trgm/pgvector resuelven la mayoría sin LLM.

---

## 4. Especificación (requisitos + escenarios)

### Dominio `product-matching` (nuevo) — 8 requisitos / 15 escenarios

- **EAN exacto:** EAN único → `ProductMatch(method="ean", confidence=1.0)` auto-link, salta etapas.
  EAN nulo/sin match → sigue a léxico. **Colisión de EAN** (>1 canónico) → NO auto-link, va a review.
- **Blocking léxico (pg_trgm):** ranking por similitud de trigramas sobre nombre/marca/tamaño
  normalizados, acotado por tamaño máx + piso de similitud. Sin candidatos sobre el piso → sigue a ANN
  semántico sobre todo el catálogo.
- **Blocking semántico (pgvector + `EmbeddingProvider`):** score ponderado léxico+semántico por
  candidato (BGE-M3, HNSW). `≥ HIGH` → auto-link (juez NO invocado). `< LOW` → NO auto-link (rechazo o
  new-canonical/cola). `LOW ≤ score < HIGH` → banda gris → juez. *(SPIKE: BGE-M3 vs Qwen3 no es
  unit-testable; lo resuelve el spike offline, no bloqueante, swapeable por el puerto.)*
- **Juez de banda gris:** invocado SOLO para grises — nunca origina un match sin pedirlo, nunca calcula
  precio. `match` → auto-link `method="llm"`. `no_match`/`uncertain`/fallo/timeout → review.
- **Contrato de salida estructurada del juez:** valida `{decision: match|no_match|uncertain,
  confidence: float 0..1, cited_fields: list[str]}`. Texto libre / campos faltantes / confidence fuera
  de rango → tratado como `uncertain`. Salida malformada degrada seguro → cola.
- **Integridad confidence+method:** todo `ProductMatch` con `confidence` no-nulo y
  `method ∈ {ean,trgm,vector,llm,human}`. Nada auto-mergea con `confidence < HIGH` salvo `method="human"`.
- **Persistencia de cola humana:** grises/uncertain/rechazados persistidos con `store_product_id`,
  candidato(s), `method`, `confidence`, campos citados — suficiente para un revisor futuro (UI admin
  fuera de alcance). **Idempotente:** re-run sin info nueva no duplica entradas pendientes.

### Dominio `catalog-ingestion` (delta)
- **La `store_product` no matcheada pasa por la cascada** en vez de tirarse *(antes:
  `refresh_prices.py:33-34` la descartaba en silencio)* — cuando el feature-flag está ON.
- **Fallback con feature-flag:** flag OFF restaura el comportamiento legacy (drop-unmatched).

### Dominio `curated-basket-bootstrap` (nuevo)
- **Crecer `BASKET_QUERIES`** hacia ~200 SKU para producir datos de bootstrap etiquetados.
  *(SPIKE: el tuneo de precisión/recall contra la canasta necesita pares reales etiquetados —
  validación manual/data-driven, no un unit test.)*

### Criterios de aceptación
- Con flag ON, el **100%** de las `store_product` no matcheadas recibe una decisión (auto-link /
  new-canonical / cola) — nunca un drop silencioso.
- Todo `ProductMatch` siempre tiene confidence+method; nada bajo HIGH auto-mergea salvo `human`.
- Toda llamada al juez valida esquema; salida malformada siempre degrada a `uncertain` → cola.
- `BASKET_QUERIES` tiende a 200 (rastreado; no requiere los 200 para cerrar).
- BGE-M3 es default y Qwen3 es sustituible sin tocar la cascada (lo decide el spike, no bloqueante).

---

## 5. Diseño

### Modelo de datos (migración greenfield, reversible)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE save.canonical_product ADD COLUMN embedding vector(1024);
CREATE INDEX ix_canonical_product_embedding ON save.canonical_product
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 100);
CREATE INDEX ix_canonical_product_name_trgm ON save.canonical_product
  USING gin (name gin_trgm_ops);

CREATE TABLE save.product_match (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_product_id UUID NOT NULL REFERENCES save.store_product(id),
  canonical_product_id UUID REFERENCES save.canonical_product(id),  -- NULL mientras pending_review
  confidence NUMERIC(5,4) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('ean','trgm','vector','hybrid','llm','human')),
  status TEXT NOT NULL CHECK (status IN ('auto_linked','pending_review','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,  -- 'system' | admin user_id (ADR 33: sin FK, id string)
  UNIQUE (store_product_id)
);
```

**Invariante** (en el use-case `MatchStoreProduct`, no en un trigger DB — la lógica vive en application
por ADR 31): escribir `store_product.canonical_product_id` ocurre SOLO dentro de la misma transacción
que el insert/update de `product_match` que lo produjo. `downgrade()` dropea índice, tabla, columna y
extensiones (greenfield — nada más depende de ellas todavía).

**Decisiones de diseño:** embedding como columna `vector(1024)` en `canonical_product` (relación 1:1,
path caliente HNSW sin join) · `product_match` como fuente de verdad (el FK nullable de hoy no tiene
confidence/method/audit) · fusión **RRF de RANKS** k=60 (trigram-similarity y cosine-distance no son
escalas comparables) · juez solo en banda gris · fallo del juez → `uncertain`.

### Puertos (`domain/ports/repositories.py` + nuevo archivo)

```python
class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...

class ProductMatchRepository(Protocol):
    def record_match(self, *, store_product_id: str, canonical_product_id: str | None,
                     confidence: float, method: str, status: str) -> str: ...
    def find_candidates_trgm(self, name: str, market_id: str, limit: int = 20) -> list[MatchCandidate]: ...
    def find_candidates_vector(self, embedding: list[float], market_id: str, limit: int = 20) -> list[MatchCandidate]: ...
    def list_review_queue(self, market_id: str) -> list[ProductMatch]: ...
    def resolve_review(self, match_id: str, canonical_product_id: str | None, decided_by: str) -> None: ...
```

Entidad `ProductMatch` (`domain/entities/product_match.py`, frozen dataclass):
`store_product_id, canonical_product_id: str | None, confidence: float,
method: Literal["ean","trgm","vector","hybrid","llm","human"],
status: Literal["auto_linked","pending_review","rejected"]`.

### Serving de BGE-M3
Inferencia self-host (HF Text Embeddings Inference o wrapper FastAPI fino sobre sentence-transformers),
llamada síncrona por `BgeM3EmbeddingProvider` (infra) en **tiempo de ingestión** (write path dentro de
la cascada), nunca por request de lectura. El spike Qwen3-0.6B es un script offline fuera del puerto;
swapear después = implementar un segundo `EmbeddingProvider` + backfill re-embebiendo
`canonical_product.embedding`.

### Feature flag
`RefreshCatalogPrices` recibe `matcher: MatchStoreProduct | None`. `None` (flag off) = comportamiento
de hoy (drop). El composition root cablea el matcher real solo cuando `SAVE_MATCHING_CASCADE_ENABLED=true`.
La cascada **sale dark** y se enciende por entorno tras bootstrapear la canasta ~200 SKU.

### Estrategia de tests
| Capa | Qué | Cómo |
|---|---|---|
| Unit (puro) | RRF, score ponderado, banding, invariantes `ProductMatch` | pytest plano, sin DB/mocks |
| Integración | Round-trip repo, queries trgm/vector | Postgres real, patrón `_seed_provider_and_canonical()` |
| Adapter | Parseo del juez + fail-safe en salida inválida | Cliente Anthropic **mockeado** — cero API real, cero tokens |
| Application | La cascada rutea a la etapa/method correcta | Fakes (repo/embedder/juez), TDD RED-first |

---

## 6. Checklist de tareas (TDD, RED-first) — 10 batches / 30 tasks

**Orden:** `1 → 2 → 3 → 4,5,6 (paralelas) → 7 → 8 → 9 (paralela con 4-8) → 10 (paralela, no bloqueante)`

### Batch 1 — Migración y extensiones *(fundación, bloquea todo)*
- [ ] 1.1 Nueva revisión Alembic (`down_revision`=head via `alembic heads`), espejo de `c73bedb700cf`:
  `CREATE EXTENSION vector, pg_trgm`; `save.canonical_product.embedding vector(1024)`; índice HNSW
  (m=16, ef_construction=100, cosine); índice GIN trgm en `name`. *[manual: `alembic upgrade head` +
  `alembic downgrade -1` para verificar reversibilidad]*
- [ ] 1.2 Misma migración: crear `save.product_match` (CHECK method/status incl. `hybrid`,
  UNIQUE(store_product_id)). *[manual: `\d save.product_match`]*
- [ ] 1.3 **NOTA-CONSTRAINT (en docstring/comment de la migración):** un solo modelo de embeddings
  puebla `embedding` a la vez; swap = re-embed completo + reindex HNSW en nueva migración, nunca flip.

### Batch 2 — Dominio: entidad + puertos *(puro, unit, RED-first)*
- [ ] 2.1 RED: unit test de invariantes `ProductMatch` — `tests/unit/domain/entities/test_product_match.py`.
- [ ] 2.2 GREEN: `domain/entities/product_match.py`.
- [ ] 2.3 Añadir Protocols `EmbeddingProvider` + `ProductMatchRepository` a `domain/ports/repositories.py`
  (sin test — interfaz; import-linter fuerza la pureza).

### Batch 3 — Motor de scoring *(puro, unit, RED-first)*
- [ ] 3.1 RED: tests RRF (k=60, por rank) — `tests/unit/matching/test_fusion.py`.
- [ ] 3.2 GREEN: `infrastructure/matching/cascade/fusion.py`.
- [ ] 3.3 RED: tests score ponderado (boosts marca/tamaño) — `tests/unit/matching/test_scoring.py`.
- [ ] 3.4 GREEN: `infrastructure/matching/cascade/scoring.py`.
- [ ] 3.5 RED: tests banding (HIGH=0.85 / [0.55,0.85) grey→juez / <0.55 o vacío→human) —
  `tests/unit/matching/test_banding.py`.
- [ ] 3.6 GREEN: `infrastructure/matching/cascade/banding.py`.

### Batch 4 — `ProductMatchRepository` *(integración, RED-first, DB real)*
- [ ] 4.1 RED: tests integración (`db_session`) de `record_match`, `find_candidates_trgm/_vector`,
  `list_review_queue`, `resolve_review` + idempotencia — `tests/integration/matching/test_product_match_repository.py`.
- [ ] 4.2 GREEN: `infrastructure/matching/repository/product_match_repository.py`.

### Batch 5 — Adapter `EmbeddingProvider` *(adapter, RED-first)*
- [ ] 5.1 RED: test con cliente BGE-M3 mockeado (sin inferencia real) —
  `tests/adapter/matching/test_bge_m3_embedding_provider.py`.
- [ ] 5.2 GREEN: `infrastructure/matching/embeddings.py` (`BgeM3EmbeddingProvider`), síncrono en
  write-time. Docstring: modelo FIJO por deployment; swap = nuevo impl + backfill re-embed.

### Batch 6 — Adapter Claude-juez *(adapter-mock, RED-first)*
- [ ] 6.1 RED: tests con Anthropic mockeado — match/no_match/uncertain, JSON malformado, confidence
  fuera de rango, timeout → todo degrada a `uncertain` (cero tokens) — `tests/adapter/matching/test_claude_judge.py`.
- [ ] 6.2 GREEN: `infrastructure/matching/claude_judge.py` con validación `{decision, confidence,
  cited_fields}` + logging de tokens.

### Batch 7 — Use-case cascada *(application, RED-first, solo fakes)*
- [ ] 7.1 RED: tests EAN único/nulo/colisión, fallthrough léxico→semántico, ruteo por banding, juez
  solo en banda gris, invariante de escritura FK en misma-tx, re-run idempotente —
  `tests/application/test_match_store_product.py`.
- [ ] 7.2 GREEN: `application/match_store_product.py`.

### Batch 8 — Wiring *(integración, RED-first)*
- [ ] 8.1 RED: `RefreshCatalogPrices` con `matcher=None` inalterado (drop legacy) y con fake matcher
  rutea filas antes tiradas — `tests/application/test_refresh_prices_matching.py`.
- [ ] 8.2 GREEN: param opcional `matcher: MatchStoreProduct | None` en `application/refresh_prices.py`.
- [ ] 8.3 Composition root: instanciar matcher real solo si `SAVE_MATCHING_CASCADE_ENABLED=true`.
- [ ] 8.4 Si cambió algún DTO/endpoint: `make openapi` (esperado: ninguno en F2.0 — solo interno;
  verificar y anotar en el PR si dispara).

### Batch 9 — Crecer canasta curada *(data-dependent, no TDD)*
- [ ] 9.1 Crecer `BASKET_QUERIES` en `ingestion/save/{sources,assets}.py` hacia ~200 SKU.
- [ ] 9.2 Chequeo de escenario: assert de que la lista creció (len, no precisión/recall — eso es Batch 10).

### Batch 10 — Spike paralelo no bloqueante *(manual, data-dependent, NO bloquea 1-9)*
- [ ] 10.1 Script offline BGE-M3 vs Qwen3-0.6B (precisión/recall contra pares etiquetados de la canasta).
  Informa el tuneo de umbrales (constantes de 3.5) — revisita post-spike, no bloquea shipear la cascada
  dark tras el flag.

---

## 7. Riesgos + mitigación

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Falsos merges | Media | Umbral conservador + confidence+method siempre + cola humana en la banda gris |
| Cold-start (sin labels) | Alta | Bootstrap de canasta a ~200 SKU antes de tunear umbral |
| Coste LLM (juez) | Media | Juez acotado a banda gris + instrumentar tokens/mes |
| Violación import-linter | Baja | Cliente Anthropic solo en `infrastructure/matching/` |
| Deriva `product_match` vs FK nullable | Media | `product_match` = única fuente; FK escrito solo vía cascada, misma-tx |
| Incertidumbre Qwen3 vs BGE-M3 | Baja | Spike offline antes de fijar; aislado tras el puerto |

**Rollback:** todo aditivo (tabla/puertos/módulo nuevos), migración reversible, feature-flag de vuelta
al "drop unmatched".

---

## 8. Comandos

```bash
cd apps/api && uv run alembic upgrade head          # aplicar migración schema save
cd apps/api && uv run alembic downgrade -1          # verificar reversibilidad
cd apps/api && uv run pytest tests/save             # suite Save (unit + integración; requiere make db-up)
make openapi                                        # solo si cambia algún DTO/endpoint (F2.0: no esperado)
```

---

## 9. Siguiente paso

`sdd-apply` empezando por **Batch 1** (migración + extensiones). Batches 4/5/6 son paralelizables una
vez caigan 2+3; Batch 9 corre en paralelo con 4-8; Batch 10 (spike) es no bloqueante en cualquier
momento. Strict TDD: cada task con comportamiento va RED-first.

**Milestones F2 siguientes (fuera de este cambio):** consola admin (Refine) sobre la cola de revisión ·
PurchasesAgent + evals RAGAS · OCR de recibo / e-CF (precio de góndola → triángulo) · agregadores (Apify).
