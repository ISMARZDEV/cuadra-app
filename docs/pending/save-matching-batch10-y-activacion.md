# Save F2.0 Matching — Batch 10 (spike) + activación de la cascada

> Estado al **2026-07-05**. Rama `feat/save-f2`. La fundación de matching (Batches 1-9) está
> **code-complete y mergeable, pero SHIP-DARK** (`SAVE_MATCHING_CASCADE_ENABLED=false`). Este doc
> recoge lo que queda: el spike no bloqueante (Batch 10) y la secuencia operativa para ENCENDERLA.
> Plan completo: `docs/sdd/save-matching/plan.md`. Artefactos SDD en aispace-men `sdd/save-matching/*`.

---

## 1. Batch 10 — spike offline BGE-M3 vs Qwen3-Embedding-0.6B (NO bloqueante)

**Por qué está diferido:** no es una tarea de escribir código. La cascada ya default-ea a BGE-M3
detrás del puerto `EmbeddingProvider`; cambiar de modelo después = nueva impl del puerto + re-embed
del catálogo (regla de oro de embeddings, ver plan §2). El spike solo decide SI vale la pena cambiar.

**Requisitos previos:** los mismos que la activación (sección 2) — necesita catálogo real poblado
+ pares etiquetados. Por eso va DESPUÉS de un primer run de ingestión, no antes.

**Pasos del spike:**
1. Reunir ~50 pares de SKU dominicanos reales (match / no-match) a partir del catálogo poblado por
   las 213 queries de la canasta (`ingestion/save/sources.py`).
2. Correr los dos modelos offline (BGE-M3 y Qwen3-Embedding-0.6B) sobre esos pares.
3. Medir precisión/recall (recall@k sobre los pares) de cada uno en el dominio.
4. **Decisión:** si Qwen3-0.6B gana con margen decisivo → implementar un segundo `EmbeddingProvider`
   + migración de backfill re-embebiendo `canonical_product.embedding` + reindex HNSW. Si no → quedarse
   con BGE-M3 (default actual).
5. Con los mismos pares, **tunear los umbrales** `MATCH_HIGH_THRESHOLD=0.85` / `MATCH_MID_THRESHOLD=0.55`
   (`infrastructure/matching/cascade/banding.py`) — hoy son defaults documentados, no calibrados con datos.

---

## 0. Actualización 2026-07-06 (rama `feat/save-bravova-adapter`)

Trabajo hecho que ADELANTA la activación (más allá del estado 2026-07-05 de arriba):

- **Gap crítico encontrado + resuelto — escritura de embeddings de canónicos.** Nada poblaba
  `canonical_product.embedding` en runtime → la etapa vectorial era **inerte** (0 candidatos
  siempre). Añadido: `build_embedding_text` (receta ÚNICA compartida query/índice),
  `EmbedCanonicalProducts` (backfill idempotente), `CanonicalProductRepository.list_without_embedding`
  + `set_embedding`. **Wired** en la ingesta: `build_canonical_embedder` (`composition.py`, mismo
  gate/modelo que `build_matcher`), corre en `save-refresh` (CLI) y en el nuevo asset Dagster
  `embed_canonicals` (upstream de las fuentes). Todo flag-gated (no-op si dark).
- **La consola admin de revisión YA EXISTE** (el paso 3 de abajo decía que no). Es `feat/save-admin-review`
  (cola de revisión + resolve, RBAC). La revisión ya NO es solo por SQL.

**Lo que queda para encender es ahora puramente OPERATIVO** (no código): endpoint de embeddings +
env vars + correr. Ver secuencia abajo.

### Actualización 2026-07-07 (rama `feat/save-matching-activacion`)

- **Bug de wiring corregido — provider inconsistente matcher vs índice (gotcha #5).** `build_matcher`
  (`ingestion/save/composition.py`) construía `BgeM3EmbeddingProvider(save_bge_m3_endpoint_url)` DIRECTO,
  mientras `build_canonical_embedder` usaba `build_embedding_provider()` (que cae a in-process sin URL).
  Resultado: sin `SAVE_BGE_M3_ENDPOINT_URL`, el ÍNDICE de canónicos se escribía in-process
  (SentenceTransformers) pero el MATCHER consultaba vía `BgeM3EmbeddingProvider("")` → base HTTP vacía
  que revienta en query time, y providers distintos (viola la regla de vectores comparables). **Fix:**
  `build_matcher` ahora usa `build_embedding_provider()` — matcher e índice comparten selección. El
  camino de activación in-process (sin endpoint) queda funcional. Cubierto por `tests/ingestion/test_composition.py` (TDD).

## 2. Secuencia para ENCENDER la cascada (de dark a live)

La cascada está enchufada pero apagada. Para activarla, en orden:

1. **Desplegar el endpoint de BGE-M3** (self-host: HF Text Embeddings Inference o wrapper
   sentence-transformers) y setear `SAVE_BGE_M3_ENDPOINT_URL` en el entorno.
2. **Primer run de ingestión con matcher** — para poblar catálogo real hay que activar el flag; hacerlo
   primero en un entorno de staging/dev, NO en prod:
   - `SAVE_MATCHING_CASCADE_ENABLED=true`
   - `make save-refresh` (CLI) o el asset de Dagster `save_daily_refresh`.
   - Esto materializa `store_product` desde las 213 queries y los enruta a la cascada → llena
     `product_match` (auto-links + cola de revisión).
3. **Revisar la cola humana** — la persistencia (`ProductMatchRepository.list_review_queue`) Y la
   **consola admin de revisión YA EXISTEN** (`feat/save-admin-review`, actualización 2026-07-06). Se
   revisa/resuelve desde el panel, no por SQL. Sin revisar la cola, la calidad queda sin validar.
4. **Tunear umbrales** con los resultados reales (ver Batch 10, paso 5).
5. **Correr Batch 10** (spike) para confirmar/cambiar el modelo de embeddings.
6. Solo entonces, **activar el flag en producción** por entorno.

---

## 3. Dependencias de otros milestones F2 (contexto)

- **Consola admin (Refine)** sobre `product_match` (cola de revisión + curaduría de taxonomía +
  active-learning). Necesaria para operar la cola humana a escala. — milestone F2 aparte.
- **PurchasesAgent** — consume el catálogo matcheado; su calidad depende de esta fundación.
- **Alternativas / Relacionados** (pendiente web F1) — desbloqueado por los embeddings de esta fundación.

---

## 4. Riesgo a vigilar al encender

- **Coste del Claude-juez:** solo se invoca en la banda gris, pero sin instrumentar tokens/mes el
  gasto puede crecer con el catálogo. El adapter (`claude_judge.py`) ya loguea tokens por llamada →
  conectar ese log a una métrica antes de subir el volumen.
- **Falsos merges:** el umbral no está calibrado con datos reales (Batch 10). No subir el flag a prod
  sin haber revisado una muestra de la cola primero.
