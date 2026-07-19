# Save · Fase 4 — Orquestación: estado y pendientes

> **Estado 2026-07-19** · Rama `feat/save-orchestration` (12 commits, **NUNCA pusheada**) desde
> `developer` `8c7de48`. Sub-bloques **4.1 → 4.6 y 4.2b COMPLETOS y commiteados**. Falta **4.7**.
> Dominio del módulo: skill `cuadra-save-orchestration`.

---

## 1. Qué quedó construido

| # | Bloque | Commit |
|---|---|---|
| 4.1 | Capability propia + ruta SSR gateada + i18n | `5d9e2f1` |
| 4.2 | `OrchestrationPolicy` + `GlobalConfig` + migración + `cronsim` | `f123e93` |
| 4.3 | `auto_linked` / `queued_for_review` en `RefreshResult` | `2297810` |
| — | Limpieza de docs que describían código muerto | `6703084` |
| 4.4 | `PipelineOrchestrator` + adapter GraphQL crudo | `61b153c` |
| — | **Fix estructural de Alembic** (`include_object`) | `2898111` |
| 4.5 | Correlación corrida→match→canónico | `b65eb22`, `229fb79` |
| 4.5 | Snapshot de métricas por corrida | `1c46f6c` |
| 4.5 | 9 endpoints admin auditados | `9b8f530` |
| 4.6 | UI: KPIs + tabla de proveedores | `8464aa3` |
| 4.2b | Sensor DB-driven de policies programadas | `4924556` |

**Verificación al cierre:** 925 backend · 62 ingestion · 312 web · ruff limpio · lint-imports 2 kept/0 broken · typecheck web limpio.

---

## 2. LO QUE FALTA — #4.7 (el único bloque abierto)

### 2.A — Deep-link corrida → cola (código, riesgo bajo) — ✅ COMPLETA (sin commit)

El operador ve "esta corrida dejó 40 a la cola" y hoy tiene que buscarlos a mano.

- [x] `run_id` como filtro en `ListReviewQueue` (puerto + repo SQL + use-case + endpoint `?run_id=`)
- [x] **Ancla corregida (decisión del usuario 2026-07-19):** NO el KPI agregado (suma varias corridas
      → no tiene un `run_id` único; un link ahí mentiría). El **número "a la cola" de CADA fila** de la
      consola enlaza a `/admin/review-queue?run_id={su last_run_id}` — preciso: el número clicado iguala
      la cola filtrada. Helper puro `runQueueHref` (solo enlaza si hay corrida Y `queued>0`).
- [x] La cola lee el query param y **declara** qué corrida filtra (banner + "Quitar filtro")
- [x] Verificación visual (`cuadra-ui-verify`): banner en vivo dark+light × es/en/pt + caso sin-run;
      consola de Orquestación en vivo (rama sin-métricas). La **rama linkeada** del número (requiere
      una corrida real de Dagster = 2.B) se cubre con test de render + unit de `runQueueHref`.
- [x] i18n es/en/pt (`admin.reviewQueue.runFilter.*` + `admin.orchestration.outcome.{linked,queued,new}Part`)

**Verificación:** 877 save + 62 ingestion · ruff limpio · lint-imports 2 kept/0 broken · `make openapi`
OK · 322 web + typecheck limpio. **Sin migración nueva** (la columna + índice existían desde 4.5).

> Nota de diseño: `admin.orchestration.outcome.summary` (un solo string) se partió en 3 claves para
> poder linkear SOLO el número "a la cola" (§5.1 limpieza: la clave vieja se retiró, no convive).

### 2.B — Encender la cascada = CIERRE DE FASE 2 (**efectos reales**)

⚠️ **No es escribir código: es operar el sistema contra las APIs REALES de los súper.**

- [ ] `SAVE_MATCHING_CASCADE_ENABLED=true` (hoy `false`, `config.py:57`)
- [ ] Decidir BGE-M3: `SAVE_BGE_M3_ENDPOINT_URL` está VACÍA → hoy el embedding corre **in-process**
      (pesado en CPU/RAM; una ingesta que "parece colgada" suele estar lenta, no trabada)
- [ ] Corrida de descubrimiento medida
- [ ] **Re-medir el baseline**: el "85% auto-link / 15% cola" está INFLADO (era el bug del EAN sin
      normalizar, ver `save-modelo-descubrimiento-matcheo.md` §4). Éste sería el primer número real
      con `by_text` vivo y EAN normalizado.

**DECISIONES PENDIENTES DEL USUARIO antes de tocar nada:**
1. **¿Quién dispara la corrida?** Recomendación: el usuario, desde la consola nueva — es el uso real
   del módulo y sirve de aceptación.
2. **Alcance de la primera corrida**: `SAVE_REFRESH_QUERY_LIMIT=10` y **UNA sola tienda**. La canasta
   completa × 3 tiendas de entrada es cómo se llega a un 429 (ya pasó una vez).
3. **¿Hay endpoint BGE-M3 levantado**, o se acepta in-process con la lentitud?

---

## 3. Follow-ups anotados (fuera del alcance de F4)

1. **Policies `scope=asset` en la consola.** Hasta que existan, los tres `ScheduleDefinition`
   (`save_coverage_daily`, `save_freshness_frequent`, `save_price_refresh_frequent`) **SIGUEN en
   código a propósito** — ver la nota en `ingestion/definitions.py`. Recién ahí el sensor los
   reemplaza y corresponde retirarlos (§5.1).
2. **Tab "Assets Dagster"** (US-OR-L4): necesita `GET /admin/save/orchestration/assets`. No se pintó
   vacía porque sería una pestaña que miente.
3. **Handler `provider_coverage`** (v1.1): el job por EAN por proveedor. Al agregarlo al `FlowKey`,
   el test `test_every_supported_flow_has_exactly_one_job_mapping` exige mapearlo en `JOB_BY_FLOW`.
4. **Deps R7** (Sirena siembra EAN → job EAN de Bravo): no se expresa con `priority`; necesita
   `depends_on_flow` en la policy.
5. **"Ejecutar ahora" con overrides de una sola vez** (idea tomada de SupermercadosRD, ausente del
   SDD): correr con `limit=10` para probar SIN mutar la policy.
6. **KPIs del SDD que no se implementaron por falta de señal**: corridas exitosas/fallidas hoy
   (necesita listado global de runs en el bridge), proveedores dentro del SLA (el SLA no está
   definido en ningún doc), queries ejecutadas vs límite (`seen` ≠ queries).
7. **Detalle por proveedor** `/admin/orchestration/providers/{id}`: es el segundo SDD del vault,
   merece su propia rama.

---

## 4. Deuda consciente NO tocada (con su razón)

- **`ingestion/save/sources.py`** — 22 líneas cuyo único export vivo es `SAVE_MARKET`, importado
  desde 10 sitios con un patrón deliberado de import local anti-ciclos. Está mal nombrado, pero
  moverlo es riesgo real por beneficio cosmético.
- **`review-queue-kpis.ts`** — fixtures demo. §5.1 manda borrarlo **con** `GetMatchingMetrics`, que
  es F6. Borrarlo antes dejaría la pantalla sin datos.
- **Los 7 SDD del vault Obsidian siguen describiendo el mundo pre-R1.** Ya costaron tiempo esta
  sesión (su "Estado real confirmado" lista assets y jobs que R1 eliminó). **Son el spec de la
  Fase 5** — conviene corregirlos ANTES de arrancarla.

---

## 5. Estado del entorno (para retomar)

- **Rama sin pushear**: 12 commits solo en local. Único riesgo de pérdida real.
- **Datos de prueba en el DB de dev**: se crearon 3 provider-flows (Sirena, Bravo, Nacional) para
  verificar la UI. Configuración válida, todos en `manual` → no disparan nada. Si se quiere el DB
  limpio, retirarlos con soft-delete.
- **`SAVE_DAGSTER_GRAPHQL_URL`** ya está en `apps/api/.env` (la puso el usuario).
  ⚠️ **Tras editar `.env` hay que REINICIAR la API**: `settings` es singleton de módulo y el
  file-watch de uvicorn recarga por cambios de CÓDIGO, no de `.env`. Costó 20 minutos descubrirlo.
- Dagster se levanta con `./scripts/dagster-dev.sh` (:3070) y se baja con `./scripts/dagster-down.sh`.
- Scripts de verificación en el scratchpad de la sesión: `smoke44.py` (adapter contra Dagster real),
  `verify41.cjs` (screenshots ambos temas + computed styles).

---

## 6. Lo que esta fase enseñó (no re-aprender)

**Cinco bugs de la clase "tests verdes, producción rota"**, ninguno detectado por un test:

| Bug | Cómo apareció |
|---|---|
| Alembic quería DROPear LangGraph + los índices HNSW/trgm, en CADA migración | leyendo la migración generada |
| El selector de `launchRun` en `""` → nunca habría lanzado nada | mirando los `..` de un error real |
| `AttributeError: get_by_provider` → 500 en todos los POST | un `curl` |
| "Orquestador caído" siendo falso (un flujo sin correr ≠ runner muerto) | un screenshot |
| `cronsim(reverse=True)` pierde el tick del borde exacto | probando la librería a mano |

**Corolario, visto 3 veces más**: una señal se calculaba y se descartaba en silencio
(`matcher.execute()` sin asignar · 4 fakes devolviendo `None` · el runner agregando sin propagar).
→ **Si un valor se calcula y nadie lo lee, asumí que se pierde en un tramo intermedio.**

**Y la trampa del tipado estructural**: los `Protocol` de Python no garantizan nada sobre el adapter
real. Un fake que implementa una firma inventada deja la suite en verde y el endpoint en 500. La
guarda vive en `tests/save/unit/test_orchestration_protocol_conformance.py`.

---

## Referencias

- Skill del módulo: `cuadra-save-orchestration` · consola: `cuadra-save-admin` · dominio: `cuadra-save`
- Plan maestro: `docs/pending/save-plan-maestro-ejecucion.md` · modelo: `save-modelo-descubrimiento-matcheo.md`
- SDD del vault: `Sub-modulo List - Orquestacion Save` + `Orquestacion Save List - Details by Provider`
- **`ingestion/definitions.py` es LA fuente de verdad de assets/jobs/schedules** — verificar ahí antes
  de citar un nombre de job.
