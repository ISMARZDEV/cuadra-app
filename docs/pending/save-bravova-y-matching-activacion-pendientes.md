# Pendientes — Adapter Bravo Va + Activación del matching

> Estado **2026-07-06**. Rama `feat/save-bravova-adapter` (stackeada sobre `feat/save-admin-review`,
> sin mergear). 7 commits. Skills: `cuadra-save-matching` (internals de la cascada) ·
> `cuadra-save` (dominio) · `cuadra-api` (backend/TDD). Docs relacionados:
> `save-ingesta-cobertura-cadenas.md` (fuentes) · `save-matching-batch10-y-activacion.md` (activación).

## Estado: qué quedó HECHO (contexto)

- **Adapter Bravo Va (A–D)**: `RestCatalogAdapter` genérico + `bravova_profile`, wiring en la factory
  (`SourcePlatform.REST_CATALOG`), dry-run "Probar", seed del `Provider`+`StoreRegistry` (41 secciones).
- **Activación del matching (E1–E3)**: camino de escritura de embeddings (`EmbedCanonicalProducts` +
  `build_embedding_text` compartido + repo), wiring en la ingesta (CLI + asset Dagster `embed_canonicals`),
  provider BGE-M3 in-process (`SentenceTransformersEmbeddingProvider`) con selección endpoint-vs-local.
- **Verificado end-to-end** contra `cuadra-db`: 65 canónicos embebidos, etapa vectorial 0→3 candidatos,
  cascada auto-linkeó un producto SIN EAN (`hybrid`, confidence 1.000). 414 tests verdes, ruff +
  import-linter limpios.

---

## Pendientes

### P0 — Activación del matching en staging/prod (operativo, no código)
- [ ] **Tunear umbrales con datos reales** (`cascade/banding.py`: `MATCH_HIGH_THRESHOLD=0.85`,
      `MATCH_MID_THRESHOLD=0.55`, `JUDGE_MATCH_MIN_CONFIDENCE=0.70`). Hoy son defaults SIN calibrar.
      Es el "Batch 10 spike" del doc de activación — ya es posible porque la cascada corre.
- [ ] **`ANTHROPIC_API_KEY`** en el entorno (juez de banda gris). Sin ella, los casos ambiguos caen a
      la cola por fail-safe (no rompe, pero no auto-linkea la banda gris).
- [ ] **Endpoint de embeddings para prod**: o `SAVE_BGE_M3_ENDPOINT_URL` (HF TEI, servicio dedicado)
      o el provider local in-process (válido para batch). `build_embedding_provider` ya elige según el env.
- [ ] **Secuencia de encendido**: flag `SAVE_MATCHING_CASCADE_ENABLED=true` en staging → correr
      ingesta → revisar la cola en el panel admin → tunear → recién ahí subir el flag en prod.
      (Riesgo a vigilar: coste del juez por tokens; falsos merges si se sube a prod sin revisar la cola.)

### P1 — Conectar Bravo Va al pipeline de ingesta real
- [ ] Bravo **NO está en `ingestion/save/sources.py::build_sources`** ni en `SOURCE_KEYS` de Dagster
      (`assets.py`) — hoy solo sirena/nacional/jumbo. El adapter, la factory y el seed están listos,
      pero un `make save-refresh` / Dagster **no toca Bravo** todavía.
- [ ] **Decisión de diseño pendiente**: Bravo es **browse-full** (catálogo completo, 41 secciones),
      no query-based como VTEX/Magento (canasta curada). Mezclar full-catalog con basket-scoped en el
      mismo refresh es un cambio de estrategia. Además, ingerir el catálogo completo solo aporta datos
      una vez el matching esté activo (si no, los desconocidos se descartan). Por eso conviene hacerlo
      JUNTO con la activación, no antes.

### P2 — Follow-ups menores del adapter Bravo
- [ ] **URL de imagen**: la respuesta no la trae; hay `idArticulo` + `imageCatalogVersion`. Falta
      capturar el patrón del CDN con Proxyman (una request de imagen) → hoy `image_url=None`.
- [ ] **`extract_size` con fracciones**: "CAFE 1/2 LB" → hoy parsea `"2 LB"` (limitación del helper
      COMPARTIDO con VTEX/Magento, no del adapter Bravo). Lo normaliza `parse_size` aguas abajo.
- [ ] **EAN de Bravo**: `associatedEan` viene vacío en el catálogo probado; cuando traiga valor, su
      shape exacto está sin verificar (`_first_ean` solo acepta string plano). Verificar con un caso real.
- [ ] **Secciones promo excluidas del seed** (OFERTAS/PROMO/Productos Nuevos/etc.): si en algún momento
      se quieren marcar "producto nuevo" u "oferta" explícitamente, se añaden a `_BRAVO_SECTIONS` en
      `save_seed.py` (data-safe: `store_product` dedup por `(provider_id, external_id)`).

### P3 — Logística / cierre
- [ ] **PR**: la rama está stackeada sobre `feat/save-admin-review` (sin mergear). El PR de esto va
      DESPUÉS de mergear la base. Preguntar squash vs rebase al abrirlo (workflow Cuadra).
- [ ] **Limpieza dev opcional**: `cuadra-db` quedó con store_products `source='verify'` de la prueba
      end-to-end (inocuos; re-seed es idempotente).
- [ ] **Dep pesada**: `sentence-transformers` (+torch) se sumó al dep-group `ingestion` (aislado del
      deploy de la API). Vigilar tamaño de imagen si el grupo se empaqueta.

---

## Comandos útiles

```bash
cd apps/api && uv run pytest tests/save tests/ingestion -q   # suite matching+ingesta (needs cuadra-db)
cd apps/api && uv run python -m seeds                         # seed idempotente (crea Bravo + canónicos)
cd apps/api && SAVE_MATCHING_CASCADE_ENABLED=true make save-refresh   # ingesta con cascada (staging)
cd apps/api && uv run lint-imports                            # domain-puro debe quedar KEPT
```
