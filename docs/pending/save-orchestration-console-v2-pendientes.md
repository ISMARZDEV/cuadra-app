# Save · Consola de Orquestación v2 — estado y pendientes

> **Estado 2026-07-20** · Rama **`feat/save-orchestration-console-v2`** (desde `developer` `c057515`).
> **SIN COMMITEAR** — 29 archivos en el working tree.
> Cierra todo el §14 del SDD que NO estaba bloqueado: **P0 + P1 + KPI de SLA + US-OR-L5**.
> Este doc es el registro de la rama: qué se construyó, qué falta, y qué NO se hizo a propósito.

---

## 1. Qué se construyó

### Backend

| Pieza | Dónde |
|---|---|
| `SlaStatus` + `OrchestrationPolicy.sla_status(last_success_at, now)` | `contexts/save/domain/entities/orchestration.py` |
| `runner_statuses_for()` — inverso del mapa de estados | `contexts/save/domain/entities/orchestration_run.py` |
| `list_runs(..., states=)` en el puerto + filtro server-side en el adapter | `domain/ports/orchestrator.py` · `infrastructure/orchestrator/dagster_graphql.py` |
| `sla_status` + `last_success_at` en `ProviderFlowDto` | `api/v1/controllers/admin_orchestration.py` |

### Web (`apps/web/src/features/admin/resources/save-orchestration/`)

`OrchestrationScreen` (shell + polling + paginación + confirmaciones) · `OrchestrationRow` (8 columnas)
· `OrchestrationActionsMenu` · `OrchestrationToolbar` (search + **Popover** de filtros + CTA) ·
`OrchestrationKpis` (4 cards con badge y chart) · `PolicyModal` · `CreateFlowModal` ·
`lib/{run-state,filter-flows}`.

### Compartido (fuera del módulo, a propósito)

- **`features/admin/components/ConfirmDialog.tsx`** — NUEVO. **Nadie en el admin confirmaba acciones
  destructivas.** Vive en `admin/components` porque Canónicos (archivar) y Productos lo exigen igual
  en sus SDD; construirlo local era duplicarlo tres veces.
- **`save-matching/components/kpi/types.ts`** — NUEVO. `KpiSentiment`/`SeriesPoint` vivían en
  `review-queue-kpis.ts`, que **§5.1 manda BORRAR** cuando llegue `GetMatchingMetrics`. Tener el
  contrato de un componente compartido dentro de un archivo condenado convertía esa limpieza en una
  cascada de roturas.
- **`KpiCard`** ganó `placeholder` (una ausencia `—` no se renderiza a 40px, que se lee como barra de
  censura) y `children` pasó a opcional.

**Verificación:** **957 backend** (`pytest tests/save tests/ingestion` en UN proceso, como manda el
§6.2 del plan maestro) · **375 web** · ruff limpio · lint-imports 2 kept/0 broken · typecheck web
limpio · `make openapi` regenerado.

> [!warning] Correr las dos suites POR SEPARADO esconde bugs — 2026-07-20
> Este doc decía antes *"895 backend save · 62 ingestion"*: **dos números, dos procesos**. Así pasaba
> verde una guarda rota (`test_the_adapter_does_not_import_dagster`), que preguntaba por el
> `sys.modules` **global del proceso** para afirmar que el adapter no importa `dagster` — y
> `tests/ingestion` lo importa por definición. Pasaba SOLA y fallaba ACOMPAÑADA, por un motivo ajeno
> al adapter.
>
> Corregido midiendo en un **intérprete limpio** (`subprocess`), y verificado que la guarda **falla
> cuando debe**: 455 módulos `dagster*` detectados si el SDK entra, 0 si no.
>
> **Regla:** el número de verificación del backend es UNO solo. Si son dos, la suite combinada nunca
> se corrió.

---

## 2. Verificación visual — cerrada por el usuario

El **modo claro** se verificó con capturas del usuario, y de ahí salieron 6 correcciones reales.

> [!success] Modo oscuro — dado por bueno por el usuario (2026-07-20)
> El oscuro no se verificó con screenshot: no hay tooling en el repo (sin playwright/puppeteer) y el
> usuario declinó la extensión de Chrome. **Decisión suya, tomada explícitamente**, no un olvido.
>
> Los puntos de riesgo quedan anotados por si algo se ve mal más adelante: colores hardcodeados
> heredados del patrón (`bg-[#daff9f]`/`border-[#b7e36f]` del trigger de acciones,
> `border-[#8daeae]/40` del buscador) y el `ring-muted/60 dark:ring-secondary` del badge de filtros.

Otro punto a confirmar al levantar el entorno: la API en `:8005` debe haber recargado DESPUÉS de
estos cambios. Si no, no devuelve `sla_status` y el KPI sale `—` sin que sea un bug del código
(recordar: `settings` es singleton de módulo — tras editar `.env` hay que REINICIAR la API).

---

## 3. Lo que FALTA — bloqueado por señal o endpoints inexistentes

Numeración del §14 del SDD (`Sub-modulo List - Orquestacion Save - SDD Refinado.md`).

| # | Ítem | Qué lo desbloquea | Alcance |
|---|---|---|---|
| ~~**9**~~ | ~~Tab **Assets Dagster**~~ | ✅ **HECHA 2026-07-20** — ver abajo | — |
| ~~**10**~~ | ~~Barra de tabs~~ | ✅ **HECHA 2026-07-20**, junto con #9 | — |
| **11** | **Detalle por proveedor** `/admin/orchestration/providers/{id}` | Es el SDD hermano (`Orquestacion Save List - Details by Provider`). Ya tiene su §11 con el plan por batches reordenado y sus 3 bloqueos anotados | **Rama propia** |
| **13** | KPIs `Corridas exitosas/fallidas hoy` | Listado GLOBAL de runs por día en el port (hoy solo `list_runs(policy_id)`) | Backend |
| **14** | Progreso `queries_processed / queries_total` | **Un contador de queries real.** `seen` cuenta productos DEVUELTOS, no búsquedas ejecutadas. Hay que instrumentarlo en la ingesta y propagarlo al snapshot | Ingesta + backend + front |
| **15** | `log_excerpt` / eventos de corrida | `get_run_events()` en el port + `RunEventSnippetDto` | Backend + front |
| **16** | Handler **`provider_coverage`** (v1.1) | Le da a la consola su segunda acción natural: **Matchear por EAN**. Al sumarlo a `FlowKey`, el test `test_every_supported_flow_has_exactly_one_job_mapping` exige mapearlo en `JOB_BY_FLOW` | Dominio + ingesta |
| **17** | **`depends_on_flow`** en la policy (R7) | La regla "Sirena siembra los EAN antes de que el job EAN de Bravo sea efectivo" **no se puede expresar con `priority`**. Ver la nota de abajo: el control de `priority` se RETIRÓ del form | Dominio + migración |

> [!bug] `priority` borraba la prioridad en cada guardado — corregido 2026-07-20
> `PolicyDto` (lectura) **no expone `priority`**, pero `PolicyModal` lo editaba leyéndolo con un cast
> (`policy as { priority?: number | null }`). El cast devolvía SIEMPRE `undefined` → el input nacía
> vacío → `toNullableInt("")` → `null` → **cada guardado del modal pisaba la prioridad con `null`**.
> La UI no fallaba en un punto: mentía coherentemente, porque el campo vacío parecía el estado real.
>
> **Arreglo:** se retiró el control (input + estado + la clave del body + la clave i18n
> `fieldPriority`) y murieron los DOS casts que silenciaban a TypeScript, que tenía razón. El PATCH
> usa `model_dump(exclude_unset=True)`, así que un campo ausente **no se toca**: la prioridad
> guardada queda intacta. **No se tocó la columna, la entidad ni `UpdatePolicyRequest`** (§5.3).
>
> **No se re-expuso a propósito.** Nada en el dominio LEE `priority` — solo se persiste
> (`models.py:625`, `orchestration.py:129`, round-trip en `policy_repository.py`). Exponerlo habría
> hecho que el formulario funcionara *correctamente* guardando un número que nadie consume: eso no
> arregla la mentira, la vuelve consistente. El orden real llega con **#17**.
>
> Fijado por test: *"NEVER sends `priority`"* en `PolicyModal.test.tsx`.
| **18** | Policies `scope=asset` | Recién ahí el sensor reemplaza a los 3 `ScheduleDefinition` que **siguen en código a propósito** (`save_coverage_daily`, `save_freshness_frequent`, `save_price_refresh_frequent`) | Dominio + sensor |
| **19** | "Ejecutar ahora" con **overrides de una vez** (p. ej. `limit=10`) | Un parámetro en `POST /policies/{id}/run` que no mute la policy. Idea tomada de SupermercadosRD | Backend + front |

### #9 + #10 — Tab "Assets Dagster" (HECHO 2026-07-20)

El hueco más grande del módulo: hasta hoy **el browse REST de Bravo no era operable desde el admin**.

| Capa | Qué entró |
|---|---|
| Dominio | `PipelineAsset` · `AssetPartitionStats` (con `coverage_ratio`) · `AssetHealth` · `list_assets()`/`get_asset()` en el puerto |
| Adapter | `assetNodes` + `assetNodeOrError` sobre GraphQL crudo · `_materialization_ts` |
| API | `GET /assets` (503 si el runner no responde) · `GET /assets/{key:path}` (404 si no existe) · `AssetAdminRowDto`/`AssetListDto`/`LineageNodeDto`/`AssetDetailDto` |
| Web | `AssetsTab` (carga al abrir la pestaña) · `OrchestrationTabs` · i18n es/en/pt |

**Cuatro cosas que la INTROSPECCIÓN del schema salvó** (gotcha #4 pagando de nuevo):

1. **`MaterializationEvent.timestamp` es `String!` en MILISEGUNDOS**, mientras que `Run.startTime` es
   `float` en SEGUNDOS. Dos tipos y dos unidades en el mismo schema. El primer intento hacía
   `timestamp / 1000` sobre un string (`TypeError`), y tratarlo como los runs habría dado fechas del
   **año ~57000**: absurdas para el operador, perfectamente plausibles para un parser. Por eso la
   conversión vive en `_materialization_ts` y NO se comparte con `_epoch_to_dt`.
2. **`AssetKey` es `{path: [segmentos]}`**, no un string → la clave se une con `/` y la ruta usa
   `{key:path}`. Con el converter por defecto, todo asset multi-segmento sería inalcanzable.
3. **`assetNodes` es una lista PELADA; `assetNodeOrError` es una UNIÓN.** Caminos de error distintos:
   un `_unwrap` uniforme habría convertido *"ese asset no existe"* (404) en *"el orquestador no
   responde"* (503) — el error exacto que F4 ya cometió una vez.
4. **`dependencyKeys`/`dependedByKeys` son CAMPOS del nodo, no una query.** Por eso el puerto tiene
   **dos** métodos y no los tres que proponía el §14: `get_lineage()` habría sido un segundo
   round-trip para recomponer lo que `list_assets()` ya trajo (devuelve el grafo COMPLETO).

**Dos decisiones de honestidad:**

- **Los assets NO viajan por SSR.** Las policies viven en NUESTRA DB (por eso la lista degrada con el
  runner caído), pero los assets viven SOLO en Dagster y su endpoint da 503. Por SSR, un runner
  muerto habría tumbado la consola ENTERA — justo cuando el operador más necesita ver su
  configuración. Se piden al ABRIR la pestaña, así el fallo queda contenido ahí.
- **Tres estados distintos y ninguno confundible**: `loading` · `unavailable` (**se declara**, nunca
  una tabla vacía) · `ready` (que sí puede estar legítimamente vacío). Una lista vacía diría "el
  pipeline no tiene assets" cuando la verdad es "no pudimos preguntar".

> [!warning] Verificación visual de la tab — PENDIENTE
> La tab tiene cobertura de tests (render + cableado), pero **no se miró el render real**. Sigue sin
> haber tooling de screenshot en el repo. `cuadra-ui-verify` lo exigiría antes de decir "listo".

### Decisiones de NO construir (no son olvidos)

- **Filtro y columna de país** — hay un solo mercado (`DO`). Un filtro de un valor único es un
  control que no filtra.
- **Acción `Ver detalle` en la fila** — la pantalla destino no existe (#11): sería un enlace a 404.
  **Entra junto con #11.**
- **Barra de progreso por fila** — bloqueada por #14 (no hay contador de queries).
- **Delta/trend en los KPIs** — requiere histórico por día (mismo bloqueo que #13).

---

## 4. Lo que esta rama enseñó (no re-aprender)

**El patrón de los seis errores:** en todos, se miró UNA sola referencia y se dio el resultado por
bueno. Se construyó la consola mirando `save-sources` sin mirar `save-matching`, que es **la**
referencia visual del admin. El usuario tuvo que señalarlo dos veces.

→ **Corolario, ya escrito en `cuadra-save-admin`:** antes de construir cualquier pantalla admin, leer
la sección *"shared UI inventory"* y mirar **las dos** referencias. Existe un
`features/admin/components/` compartido (`ProviderLogo`, `filters/*`, `ConfirmDialog`) y un
`kpi/` con `KpiCard` + 4 charts. Nada de eso debe re-implementarse.

**Cuatro bugs de la clase "verde pero roto", ninguno visible sin ejercitarlo:**

| Bug | Cómo apareció |
|---|---|
| `DropdownMenuLabel` fuera de su `RadioGroup` → `MenuGroupContext is missing`, el menú de filtros NO abría | **Un test de render**, escrito para otra cosa. Sin navegador no se habría visto nunca |
| Un `<svg>` sin contenedor flex toma el ancho del padre y **desborda el card** | Screenshot del usuario |
| El fake de integración usa `**_` → un argumento nuevo del port (`states=`) quedaba SIN cobertura | Sospecha guiada por el gotcha #16 de la skill |
| `—` a `text-[40px]` se lee como **barra de censura**, no como "sin dato" | Screenshot del usuario |

**Dos mentiras de UI que se evitaron a conciencia:**
1. **No usar `Skeleton`** (tiene `animate-pulse` = "está cargando") cuando el dato está
   **no disponible**. Se usa un esqueleto INERTE de la forma del indicador.
2. **No dibujar un gauge al 0%** cuando no hay datos: un cero es una AFIRMACIÓN. Va `—` + esqueleto.

**Y una regla de arquitectura que se pagó:** un panel de filtros con controles de formulario es un
**`Popover`**, no un `Menu`. Los menús son para comandos, y anidarles un `<Select>` pelea con su
cierre por click-outside (el popup del select se portalea FUERA y cuenta como "afuera").

---

## Referencias

- **Spec + backlog vivo:** vault `Sub-modulo List - Orquestacion Save - SDD Refinado.md` §14
- **Registro de F4:** `docs/pending/save-fase4-orquestacion-pendientes.md`
- **Skills:** `cuadra-save-orchestration` (módulo) · `cuadra-save-admin` (§ shared UI inventory)
- **Plan maestro:** `docs/pending/save-plan-maestro-ejecucion.md`
