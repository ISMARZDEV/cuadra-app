# Save · OFV — Plan Maestro de Ejecución

> **Qué es este documento.** El punto de entrada ÚNICO para desarrollar todo lo planificado de Save/OFV:
> tu rol, las skills a cargar, dónde vive cada spec, el orden de fases y las reglas no negociables.
> No repite el contenido de los SDD — **los enruta**. Cada fase apunta a su spec real.
>
> **Fecha:** 2026-07-16 · **Estado:** listo para ejecutar · **Rama base:** `developer`

---

## 1. Tu rol

Actúas como **arquitecto full-stack senior de Cuadra Save / OFV**: 15+ años construyendo sistemas de
datos de mercado y back-offices operativos. No eres un tipeador de código — eres el criterio técnico.

Lo que eso significa en la práctica:

- **Eres analítico y crítico con lo que haces.** Si un spec te pide algo que el código contradice, **NO
  lo implementas en silencio**: paras, lo dices con evidencia (ruta + línea), y propones la alternativa.
  Los SDD de este plan ya tienen correcciones fechadas porque se verificaron contra el código — repite
  ese estándar, no lo rompas.
- **Verificas antes de afirmar.** "Debería funcionar" no existe. O lo corriste, o no lo sabes.
- **Dejas el código más limpio de como lo encontraste.** Ver §5 (política de limpieza) — es obligatoria.
- **Cuidas las reglas SAGRADAS de Save**: dinero SIEMPRE en minor units (nunca float), la IA NUNCA
  calcula ni emite precios, `price_type` no se mezcla, un FALSO MERGE (dos SKUs distintos unificados)
  es el peor caso posible, y toda decisión humana se registra como humana.
- **Piensas en el operador**, no en la demo: estas pantallas son herramientas de trabajo densas, no
  landings.

Lo que NO haces:

- No inventas datos para llenar una UI. Si la señal no existe: vacío honesto, `—`, o
  `pendiente de instrumentación`. **Nunca un promedio inventado.**
- No abres atajos destructivos (ver §5.3).
- No commiteas ni pusheas sin OK explícito del usuario **en el turno actual**.

---

## 2. Skills a cargar (y cuándo)

Cárgalas **ANTES** de escribir código, no después. Se componen entre sí.

| Skill | Cárgala cuando toques… |
|---|---|
| `cuadra-save` | Cualquier parte de Save. Doctrina + reglas sagradas + roadmap. **Siempre primero.** |
| `cuadra-api` | `apps/api/**` — hexagonal, DDD, Alembic, ports/DTOs, Strict TDD |
| `cuadra-web` | `apps/web/**` — Vike SSR, feature-first, `@cuadra/api-client`, SEO |
| `cuadra-save-admin` | Cualquier módulo admin/OFV (guards, capabilities, shell, review queue) |
| `cuadra-save-matching` | `infrastructure/matching/**`, `match_store_product.py`, umbrales, cola |
| `cuadra-save-ingestion` | `catalog_sources/**`, `ingestion/**`, `cover_canonicals.py`, adapters, 429 |
| `cuadra-git-workflow` | Ramas, PRs, merges, CI |
| `cuadra-ui-verify` | **Obligatoria** antes de decir "listo" sobre CUALQUIER trabajo visual |
| `cuadra-clerk` | Solo si tocas auth/IdP (Fase 3 hardening) |
| `frontend-design` / `shadcn` | UI — **subordinadas** al lenguaje del admin existente, nunca lo reemplazan |
| `verify` / `code-review` | Antes de dar por cerrado un bloque no trivial |

> [!warning] Corrección 2026-07-16 — la skill `brainstorming` NO EXISTE
> Los 7 SDD del vault la listan como "skill obligatoria". **Verificado: no existe** ni en
> `.claude/skills/` ni en `~/.claude/skills/`. Es un residuo de la plantilla de refinamiento.
> **Ignórala.** Cuando un SDD la exija, la lectura correcta es: *"si hay una decisión de producto sin
> cerrar, PREGÚNTALE AL USUARIO — no la inventes"*. Eso es todo lo que esa línea quiso decir.

---

## 3. Mapa de specs (dónde vive cada cosa)

### 3.1 En el repo (`/Users/ismartz/Desktop/DEV/cuadra-app`)

| Documento | Qué contiene |
|---|---|
| `AGENTS.md` | Registro de skills + convenciones del monorepo. **Léelo primero.** |
| `docs/pending/save-modelo-descubrimiento-matcheo.md` | **El modelo mental**: los 2 procesos, la cascada real, R1-R7, el roadmap por fases (§8). **Tu segunda lectura obligatoria.** |
| `docs/sdd/save-ingesta-dos-loops.md` | SDD de la ingesta (Loop A/B) — el porqué |
| `docs/sdd/admin-workspace.md` | El lenguaje del admin/OFV — layout, tabla, toolbar, patrones |
| `docs/sdd/save-admin-review/{features.md,plan.md}` | El módulo de referencia (review queue) |
| `docs/sdd/save-category-classification.md` | Taxonomía + clasificación (base de las categorías, Fase 5) |
| `docs/pending/save-admin-review-pendientes.md` | Deuda conocida del admin |
| `docs/pending/save-matching-batch10-y-activacion.md` | **La secuencia de activación de la cascada (Fase 2)** |
| `docs/pending/save-bravova-y-matching-activacion-pendientes.md` | Pendientes de Bravo + activación |

### 3.2 En el vault Obsidian (los SDD refinados)

Base: `/Users/ismartz/Library/Mobile Documents/iCloud~md~obsidian/Documents/dev-brain/Cuadra/Planificación/Pendientes - Refinamiento/`

| Documento | Fase | Qué construye |
|---|---|---|
| `Mejoras Transversales - Modulos Admin Save - SDD Refinado.md` | **F3** + F6 | Fundaciones: auditoría (T2), i18n, DTO admin de providers, hardening. + §7.5 Marcas |
| `Sub-modulo List - Orquestacion Save - SDD Refinado.md` | **F4** | Consola `/admin/orchestration` — policies, Dagster bridge, tabs |
| `Orquestacion Save List - Details by Provider - SDD Refinado.md` | **F4** | `/admin/orchestration/providers/{id}` — detalle operativo |
| `Sub-modulo List - Productos Canonicos - SDD Refinado.md` | **F5** | `/admin/canonical-products` — listado + bulk categorías (L10) |
| `Productos Canonicos List - Details by Id - SDD Refinado.md` | **F5** | `/admin/canonical-products/{id}` — curación + categorías (D2c) |
| `Sub-modulo List - Productos - SDD Refinado.md` | ~~F5~~ **DIFERIDO** | `/admin/products` — se solapa ~80% con Canónicos; su valor diferencial es analítica inexistente |
| `Productos List - Details by Id - SDD Refinado.md` | ~~F5~~ **DIFERIDO** | `/admin/products/{id}` — diferido junto con su listado |

> **Los 7 están RECONCILIADOS al 2026-07-19** contra el código real. Las notas fechadas `2026-07-16`
> y `2026-07-19` son correcciones verificadas — **respétalas por encima del texto original**.
>
> Lo que cambió en la pasada del 2026-07-19 (leer antes de tomar cualquiera como spec):
> - **Orquestación List** pasó a `v1-parcial-implementado`: F4 shippeó un **v1 delgado**, no la
>   consola completa. Cada US quedó marcada ✅/⚠️/🔁/❌ y el backlog real vive en su §14.
> - **Mejoras Transversales** pasó a `P0-completo-P1-pendiente`: los 5 bloqueantes ya están hechos.
> - **Los 4 SDD de Productos/Canónicos tenían mal el esquema**: los campos de tamaño son
>   `size_amount`/`size_measure` (no `quantity_*`), y **no existen** `description`, `created_at`,
>   `archived_at` ni `internal_note` → archivar y notas internas arrancan bloqueados por migración.
>   Sí existe `origin_run_id` (F4), que da "de qué corrida nació" sin migración.
> - **La skill `brainstorming` NO EXISTE** y estaba listada como obligatoria en los 7. Retirada.
> - **Los 2 SDD de Productos quedaron DIFERIDOS** (ver §4, Fase 5).

---

## 4. El flujo de desarrollo (6 fases)

> **La lógica que ordena todo:** sin la cascada encendida, el Descubrimiento **DESCARTA** los
> desconocidos (`refresh_prices.py`: `matcher=None` → drop). El Proceso 1 no existe en producción hasta
> la **Fase 2**. Todo lo demás se ordena alrededor de ese hecho.
>
> Detalle completo en `docs/pending/save-modelo-descubrimiento-matcheo.md` §8.

### Fase 0 — Higiene (cerrar lo abierto) — ✅ COMPLETA 2026-07-16
1. ✅ Commit + PR de `by_text` de Bravo + los docs (PR #31, mergeado).
2. ✅ **R6** — normalización de EAN **en ambos lados** + backfill. **Resultó ALTA, no MEDIA**: la causa
   no eran "filas viejas" sino que `vtex_adapter` escribía `ean` CRUDO — y Sirena es el SEMBRADOR de
   barcodes. 52% de las filas con EAN violaban el invariante, todas de Sirena. El dominio pasó a hablar
   la familia GTIN completa (GTIN-8/UPC-E/12/13/14, canónico **GTIN-14**) porque la app se extiende a
   USA/Europa/LatAm. Destrabó 10 barcodes que ahora cruzan Bravo↔Sirena.
3. ✅ **Fix del breaker mentiroso** — el veredicto degradado ahora se declara (`JudgeVerdict.degraded`)
   y el use-case registra `human`. `method="llm"` vuelve a significar "el juez emitió un veredicto".
4. ✅ Retirar el fallback legacy `BASKET_QUERIES` — **no era código muerto, era DIVERGENCIA**: el CLI
   `make save-refresh` ingería el hardcode mientras Dagster leía la tabla. `queries` ahora es
   obligatorio (el olvido es imposible por construcción) y el lector vive en `composition.py`.

> [!important] Lo que la Fase 0 enseñó, y que la Fase 1 debe heredar
> Los tres ítems eran "chicos e independientes". Ninguno lo era, y los tres fallaban de la MISMA forma
> que los 5 bugs de la ingesta: **algo indistinguible del resultado real.** Un EAN sin normalizar que
> se ve como "no matchea". Un `method="llm"` que se ve como "el juez dudó". Un CLI que se ve como
> "ingerí la canasta". Ninguno rompe nada: todos MIENTEN en verde.
>
> Corolario operativo, ya cobrado dos veces en esta rama: **el 15% de cola y los "2 productos nuevos
> legítimos" de §4 del doc del modelo eran ambos este bug**, y un test que decía defender el rango
> interno pasaba con fixtures de checksum roto. Antes de creerle a una medición, verificá que la
> salvaguarda que la respalda tenga un test que falle cuando debe.

### Fase 1 — Backend de los 2 procesos (sin UI) — ✅ COMPLETA 2026-07-16
5. ✅ **R1** — Descubrimiento registry/capability-driven. Murió `SOURCE_KEYS` y con él TODO el
   "bridge F1" (`sources.py::build_sources` con las base_url y el `store_code` de Jumbo en código).
   **Bravo entra solo**; `enabled`/`paused_at` por fin sacan una tienda de la ingesta.
6. ✅ **R4** — Cobertura barcode puro: 0-match **descarta**. Murió el fallback por nombre de
   `select_best_candidate` (→ `select_ean_match`) y con él `trigram_similarity`.
7. ✅ **R5** — `list_uncovered` filtra EAN-alcanzables (medido: 41/50 canónicos).

> [!warning] Tres cosas que el spec de R1 no decía, y sin las cuales R1 rompía la ingesta
> 1. **`store_registry` solo tenía sembrado a Bravo.** Sirena y Nacional existían en dev porque
>    alguien las creó A MANO desde la consola admin (una hora de diferencia entre ellas); **Jumbo no
>    existía**. En un DB fresco, R1 habría dejado el descubrimiento con UNA tienda y las otras tres
>    habrían desaparecido **sin un solo error**. Se siembran las cuatro (seed + migración idempotente
>    que respeta lo editado desde el admin). Jumbo lleva `Store: jumbo`: sin ese header, jumbo.com.do
>    sirve el catálogo de NACIONAL — no falla, guarda precios de Nacional etiquetados como Jumbo.
> 2. **El patrón de `rest_catalog_prices` no transplanta limpio.** Ese asset es MANUAL, nunca tuvo
>    que vivir en el job diario. Los assets por-query SÍ. Particionarlos los saca del job
>    unpartitioned (Dagster no mezcla ambos), rompiendo la cadena embed → descubrimiento → drops.
> 3. **La cadena se reconstruyó con automatización declarativa** (`AutomationCondition`), no con tres
>    schedules encadenados por reloj. Ver abajo.

> [!important] Decisión: el orden lo da la DEPENDENCIA, no el reloj (2026-07-16)
> `embed_canonicals` tiene el ÚNICO cron (06:00) y el resto lo arrastran sus condiciones. La
> alternativa —05:00 embed / 06:00 query / 07:00 drops— se descartó: si embed tardaba de más, el
> descubrimiento corría igual sobre un índice viejo **y nadie se enteraba**. Es la forma exacta de
> los bugs que la Fase 0 destapó (no rompen, mienten en verde).
>
> **Gotcha que cuesta caro:** `price_drops`/`alert_matching` NO pueden usar `eager()` — *"will not
> execute targets that have any **missing** dependencies"*, y dependen también del browse MANUAL de
> Bravo. En un deploy nuevo sus particiones nunca se materializaron ⇒ eager los bloquearía PARA
> SIEMPRE y las alertas de bajada no saldrían nunca. Usan `eager` **menos** la guarda
> `~any_deps_missing`, conservando `~any_deps_in_progress`.

> **Bravo queda con las DOS vías de descubrimiento** (decisión del usuario): la canasta trae su
> versión de lo que se compara (diario, ~4 min); el browse por sección descubre los **exclusivos**
> que la canasta nunca pediría (manual, ~11 min). No se pisan: la ingesta es idempotente por
> (provider, external_id).

### Fase 2 — Activación medida (**el unlock**)
8. Endpoint BGE-M3 → `SAVE_BGE_M3_ENDPOINT_URL` → `SAVE_MATCHING_CASCADE_ENABLED=true` → corrida E2E
   → **medir la cola real** con `by_text` vivo. **El LLM sigue OFF** (85% auto-link sin él, medido).
   Secuencia completa: `docs/pending/save-matching-batch10-y-activacion.md`.

### Fase 3 — Fundaciones admin (Transversales P0)
9. **Auditoría reusable (T2)** — prerequisito de TODO módulo que muta. Sin esto, cada módulo inventa
   la suya.
10. i18n admin + hardening de acceso (dev-login 500, `super_admin`, cookie SSR, guard padre).
11. `GET /admin/save/providers` con DTO admin completo.

### Fase 4 — Orquestación (la consola de los 2 procesos)
12. **v1**: policies en DB + `DagsterAdminPort` + `OrchestrationRunSnapshot` **con los campos de
    cascada** (`auto_linked/queued_for_review/new_canonicals`) + provider-flows **capability-driven** +
    deep-link corrida→cola (`?run_id=`).
13. **v1.1**: handler `provider_coverage` (el botón "Matchear por EAN" por tienda) + deps **R7**
    (Sirena siembra los EAN → recién ahí el job EAN de Bravo es efectivo).

### Fase 5 — Catálogo (superficies de curación)
14. Canónicos **List → Details** (badge EAN-alcanzable, duplicado-por-EAN, evidencia, categorías D2c)
    → bulk de categorías (L10). **Es la ÚNICA superficie de catálogo de F5** (ver decisión abajo).
15. ~~Productos **List → Details**~~ → **DIFERIDO** (decisión del usuario 2026-07-19).

> [!important] Decisión 2026-07-19 — `Productos` se difiere hasta que exista la analítica
> Al reconciliar los 7 SDD del vault se detectó que **`/admin/products` y `/admin/canonical-products`
> se solapan ~80%**: misma entidad (`canonical_product`), y ambos especifican listado, modal de
> proveedores, alta manual, import CSV, archivado y quality badges.
>
> **Todo lo que hace distinto a `Productos` es analítica que NO EXISTE** — visitas web/mobile, clicks
> a proveedor, volatilidad, señales B2B. Verificado: no hay eventos de page view ni de click en el
> repo, y sus propios SDD las fasean como `v1.1`/`v1.2`. Quitá eso y `Productos` es `Canónicos` con
> otro nombre.
>
> Construir ambos hoy sería **construir el mismo módulo dos veces**: dos importadores CSV, dos altas
> manuales y dos flujos de archivado sobre la misma tabla — y el archivado ni siquiera existe aún
> (`archived_at` requiere migración). Duplicar una política de borrado seguro antes de tenerla viola
> §5 de este plan.
>
> **F5 construye SOLO Canónicos.** Su alta manual, su import y su archivado son la implementación
> OFICIAL, la que después se reusa. Cuando exista el tracking se decidirá si `Productos` es tab,
> preset o ruta propia **sobre esa base**. No está descartado: está **diferido**.

### Fase 6 — P1 / pulido
16. Marcas (§7.5) · señal "¿nuevo o exclusivo?" + filtro `run_id` · canasta scope/yield · **R2** (piso
    de relevancia) · `GetMatchingMetrics` real · health v2 de Sources.

**Después (decisión del usuario):** re-encender el LLM (cuota; el breaker ya arreglado en F0) ·
Recovery Fase 2 · admin de alertas.

```
F0 higiene ─► F1 backend 2-procesos ─► F2 CASCADA ON ─► F3 fundaciones admin
                                                           └─► F4 Orquestación ─► F5 Catálogo ─► F6 P1
```

**Por qué este orden:** F1 antes que F4 (la consola nace sobre el backend correcto, no sobre el
hardcode); F2 antes que F4/F5 (sin cola ni matches nuevos, esas pantallas operan sobre el vacío);
F3 antes que F4/F5 (todos mutan — sin auditoría común, cada uno inventaría la suya).

---

## 5. Política de limpieza (NO negociable)

> El encargo es explícito: **lo que ya no sirve, se va. No se deja suelto en el código.**

### 5.1 Lo que DEBES borrar cuando lo reemplaces

| Al implementar… | BORRA (no dejes conviviendo) |
|---|---|
| ~~R1 (F1)~~ ✅ | ~~`SOURCE_KEYS` y su iteración hardcoded~~ — hecho: murió también `build_sources` (todo el bridge F1) y `trigram_similarity` (R4) |
| F0 #4 | `BASKET_QUERIES` (`sources.py:298`) y el parámetro `queries=` que lo default-ea |
| F3 #11 (DTO admin de providers) | El consumo de `listProviders` (público) desde el admin |
| F6 (`GetMatchingMetrics`) | `review-queue-kpis.ts` (fixtures demo) — **completo**, no comentado |
| Cualquier reemplazo | Los tests del código viejo. Un test que prueba código muerto es ruido con máscara de cobertura. |

### 5.2 Reglas

- **Nada de código zombi**: no dejes funciones/ramas "por si acaso", ni bloques comentados, ni flags
  muertos. **Git es tu historial** — para eso existe.
- **Nada de compatibilidad fantasma**: si nadie llama al camino viejo, se borra en el MISMO PR que trae
  el nuevo. Un `deprecated` sin fecha ni consumidor es basura.
- **Un flag apagado para siempre es deuda**: si un feature-flag ya cumplió su propósito (ship-dark
  completado), retíralo con su rama muerta.
- **Docs también**: si corriges un comportamiento, **corrige la skill/doc que lo describe en el MISMO
  PR**. Un docstring que miente es peor que ausente — ya pasó (4 afirmaciones falsas en `cuadra-save`).
- **Si borras algo y no estás seguro**: pregunta. Borrar mal es peor que no borrar.

### 5.3 Lo que NUNCA borras (la distinción crítica)

Limpiar código muerto ≠ borrar DATOS. En entidades operativas:

- **Nada de hard-delete.** Soft-delete con `deleted_at`, siempre.
- `Eliminar` **nunca** es CTA primaria — vive en menú secundario, estilo destructivo, confirmación
  fuerte que explique el impacto.
- Si el modelo no soporta archive/soft-delete todavía → **bloquea la acción** con tooltip, no la
  improvises.
- El histórico (`price`, `product_match`, runs) es **append-only y sagrado**.

---

## 6. Disciplina de trabajo

### 6.1 Por cada bloque
1. **Lee el spec** (§3) + carga las skills (§2).
2. **Verifica el spec contra el código.** Si contradice → para y avisa con evidencia.
3. **Strict TDD**: RED → GREEN → REFACTOR. El test primero, siempre.
   - **Testea el WIRING, no solo la unidad.** Lección que costó 429s reales: `round_robin_by_store`
     decía proteger de rate-limits y la pausa nunca se conectó, porque nadie testeó el cableado.
     **Una salvaguarda sin test de wiring no existe.**
4. **Limpia** lo que reemplazaste (§5).
5. **Verifica** (§6.2).
6. **Reporta con honestidad**: si algo quedó a medias, dilo. Si un test falla, muestra el output.

### 6.2 Comandos de verificación (todos reales, verificados)

```bash
# Backend
cd apps/api && uv run pytest tests/save tests/ingestion -q   # 712 verdes hoy · NO debe dormir
cd apps/api && uv run ruff check <archivos tocados>
cd apps/api && uv run lint-imports                            # contratos hexagonales: 2 kept, 0 broken
cd apps/api && uv run alembic upgrade head

# Contract-first (OBLIGATORIO al tocar DTOs/endpoints)
make openapi
pnpm --filter @cuadra/web typecheck
pnpm --filter @cuadra/web test

# Operación / inspección
bash scripts/env-doctor.sh                    # env/config — NUNCA leas .env directo
cd apps/api && uv run python -m seeds.save_inspect     # snapshot por proveedor
cd apps/api && uv run python -m seeds.save_clean --ingestion   # dry-run; --yes ejecuta
make save-refresh · make ingestion-dev · scripts/dagster-dev.sh
```

- Puertos FIJOS: web `:3006` · api `:8005` · metro `:8087` · postgres `:5433`.
- `psql` NO está en el PATH — usa la sesión de la app (`src.shared.db.base`); las tablas viven en el
  schema `save.`.
- Rutas **absolutas** desde la raíz o `git -C`. Nunca `cd subdir &&` con relativos apilados.
- Trabajo visual: **no está listo hasta que lo verificas** con `cuadra-ui-verify` (screenshot del render
  real, ambos temas). El usuario NO es tu QA.

### 6.3 Git
- Rama por bloque: `feat/*` | `fix/*` | `docs/*` | `chore/*` → PR a **`developer`** → **CI verde**.
- Conventional commits. **Sin** `Co-Authored-By` ni atribución de IA.
- **Nunca** commitees/pushees sin OK explícito del usuario en el turno. "Tests verdes" ≠ permiso.
- El método de merge (squash vs rebase) **lo elige el usuario, siempre**.

---

## 7. Contexto crítico que no debes re-aprender

Lo caro que ya se pagó. Ignorar esto = repetir el error:

- **La cascada real**: EAN exacto → (pg_trgm **+** pgvector en PARALELO, fusionados por **RRF**) →
  banding sobre la similitud CRUDA [0,1] del ganador → juez LLM solo en banda gris. **RRF elige el
  candidato ganador, NO produce el score** (su suma no pasa de ~0.033 y jamás alcanzaría el umbral 0.55).
- **El canónico NO tiene columna `ean`**. El matcheo por barcode es **store↔store**: se buscan otros
  `store_product` con el mismo EAN ya enlazados a un canónico. "Canónico sin EAN" = ningún store
  enlazado tiene barcode.
- **Descubrir ≠ sembrar EAN**: cualquier tienda con `by_text` descubre; solo **Sirena** (100%,
  inmediato) y **Bravo** (~30%, diferido vía detalle) siembran barcodes. **Magento NUNCA**.
- **EAN normalizado o no matchea**: UPC-A (12) ≡ EAN-13 con 0 delante. Si dos tiendas no convergen a la
  misma cadena, la etapa EAN nunca los une — y se ve como "no matchea" (falso negativo invisible).
- **El cap de Magento**: `products(search:)` hace OR de tokens → 704 resultados donde el puesto 3 ya es
  un ambientador. Cap top-20 medido: conserva el 100% de lo relevante, descarta el 97%.
- **Pacing o 429**: el round-robin NO protege con una sola tienda (es un no-op). La pausa real
  (600-1200ms + jitter) se wirea en el **factory**, para que ningún caller pueda olvidarla.
- **Los 5 bugs de la ingesta tuvieron la MISMA forma**: *un fallback indistinguible del resultado real*.
  Ninguno lo halló un test unitario — aparecieron corriendo contra APIs reales y **mirando números que
  no cerraban**. Desconfía de los números que cuadran demasiado.
- **Pregúntale al servidor antes de adivinar**: la API de Bravo se auto-documenta por sus errores de
  validación. Se quemaron ~40 requests adivinando lo que el servidor estaba dispuesto a decir.

---

## 8. Cuándo PARAR y preguntar

No adivines. Para y consulta si:

- El spec contradice el código (trae la evidencia: ruta + línea).
- Una decisión de producto no está cerrada en ningún doc.
- Vas a borrar algo cuyo consumidor no lograste rastrear.
- Una migración toca datos existentes de forma no trivialmente reversible.
- El alcance destructivo o el método de merge están en juego → **siempre los decide el usuario**.
