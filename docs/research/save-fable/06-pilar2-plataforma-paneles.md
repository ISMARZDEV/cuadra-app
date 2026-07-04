# 06 · Pilar 2 — Plataforma de datos + paneles (orquestación, calidad, consola)

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** 2
> El "puente/filtro" operable: motor de sync/limpieza + consola para migraciones, sincronización,
> gates de calidad y la **cola de revisión de matches** (del pilar 3). Reconcilia con
> `arquitectura-mvp.md` (que menciona Inngest/Temporal/cron para Save jobs). Append-only, sin resúmenes.

---

## 1. Pregunta que resuelve este doc
¿Con qué motor orquestamos la ingesta+limpieza, con qué validamos la calidad, dónde vive el
servicio, y cómo es la consola donde el humano opera migraciones/sync/revisión?

## 2. Arquitectura de la plataforma (dónde encaja cada pieza)
```
 apps/ingestion (servicio Python aparte)
   ├─ CatalogSource adapters (P1) ──► BRONZE (raw)
   │                                     │  (Pandera en dev · Soda gate bronze→silver)
   ├─ normalización + matching (P3) ──► SILVER (limpio) ──► GOLD (canonical + price append-only)
   │                                     │  (Soda gate silver→gold)
   └─ ORQUESTADOR (Dagster/Prefect) coordina jobs, scheduling, reintentos, lineage, alertas
                                          │
 Postgres (schema save) ◄────────────────┘
   ▲
 apps/api (FastAPI) ── expone catálogo + cola de revisión ──►  CONSOLA ADMIN (Refine)
                                                                 (registro fuentes, sync, DQ,
                                                                  revisión de matches, taxonomía,
                                                                  anomalías, migraciones)
```

## 3. DECISIÓN 1 — Motor de orquestación

### 🏆 LA MEJOR SOLUCIÓN ACTUAL (2025-2026): **Dagster OSS (self-host)**
Para un problema que es **limpieza y linaje de catálogos**, el modelo **asset-centric** de Dagster
es el que mejor calza: modelás `canonical_product` y `price` como **software-defined assets** con
**lineage visual** (ves qué fuente produjo cada dato — auditable, clave en fintech) y **data-quality
checks nativos** (Great Expectations/Soda dentro del DAG). Trae su **propia UI** de runs/estado/
reintentos. Es lo que un "panel de migraciones/sync/limpieza" necesita de base.

### 🔀 ALTERNATIVAS
- **Prefect OSS** — envolvés tus funciones Python (los adapters) con `@flow`/`@task`, **boilerplate
  casi cero**, assets opt-in. **Mejor si la prioridad #1 es simplicidad** y el equipo es chico. ❌
  Menos opinado en lineage/calidad de datos (los assets son opcionales, no el corazón). **Es la
  opción correcta si el peso de ops de Dagster te frena.** Fuerte candidato — no lo descartes.
- **Temporal / Inngest** (los que menciona tu arquitectura) — motores de **ejecución durable** para
  workflows de app/event-driven. ❌ NO dan asset-graph, lineage ni DQ → sirven para *job scheduling*
  pero no para el framing de "plataforma de datos". Úsalos si algún flujo necesita durabilidad
  transaccional, no como el orquestador del catálogo.

### ⚠️ Corrección de mi recomendación previa + riesgos
- **Pricing 2026 (importante):** Dagster+ Solo/Starter **ya NO incluyen créditos** (desde 1-may-2026);
  1 crédito = 1 materialización/observación/check + serverless a US$0.010/min. → **usá Dagster OSS
  self-host, NO Dagster+ cloud**, o el costo escala feo con materializaciones diarias de catálogo.
- Prefect Cloud cobra por asientos (sin cargo por task/run), serverless a US$0.005/min (mitad de
  Dagster). Si en algún momento querés managed, Prefect Cloud sale más barato para equipo chico.
- **Riesgo ops:** Dagster self-host en K8s pide más inversión operativa que Prefect. Mitigación:
  empezar Dagster en Docker simple (no K8s) hasta que el volumen lo pida.

### 📎 EVIDENCIA
- [Orchestra — Dagster vs Prefect vs Airflow 2026](https://www.getorchestra.io/blog/dagster-vs-prefect-vs-airflow-complete-data-orchestration-comparison-2026) · [Bruin — mejores data pipeline tools 2026](https://getbruin.com/blog/best-data-pipeline-tools-2026/) · [Prefect — self-serve plans comparados (pricing 2026)](https://www.prefect.io/blog/dagster-vs-prefect-self-serve-plans-compared) · [Dagster — vs Prefect](https://dagster.io/vs/dagster-vs-prefect).

### ✅ DECISIÓN
¿**Dagster OSS** (data-fit, lineage, auditable — recomendado) o **Prefect OSS** (simplicidad, menos
ops)? Mi recomendación: **Dagster self-host** por el fit de "plataforma de datos" y la auditabilidad
que un fintech necesita; pero si querés arrancar YA con mínima fricción, Prefect es defendible.

## 4. DECISIÓN 2 — Calidad de datos (los "gates" de saneamiento)
### 🏆 **Soda Core (gates SQL/YAML entre capas) + Pandera (validación in-code en dev)**
- **Soda Core** — checks SQL/YAML, livianos, ideales como **gate entre medallion layers**
  (bronze→silver→gold): "0 precios negativos", "unidad base no nula", "moneda ISO válida", "precio no
  saltó > X% sin oferta". Integra con Dagster como asset-check.
- **Pandera** — validación Python-native (type-annotations sobre dataframes), productiva "en una
  tarde"; para el desarrollador en el código de normalización.
### 🔀 Great Expectations (GX Core) — más completo/declarativo, pero más pesado de setup; overkill
para el MVP. Deequ — Spark-first, descartado (no usamos Spark).
### 📎 [DataKitchen — landscape OSS data-quality 2026](https://datakitchen.io/blog/the-2026-open-source-data-quality-and-data-observability-landscape/) · [endjin — Pandera vs Great Expectations](https://endjin.com/blog/a-look-into-pandera-and-great-expectations-for-data-validation) · [Branch Boston — GX vs Deequ vs Soda](https://branchboston.com/great-expectations-vs-deequ-vs-soda-data-quality-testing-tools-compared/).
### ✅ ¿Soda Core + Pandera (recomendado) o preferís GX Core desde ya?

## 5. DECISIÓN 3 — Consola admin (migraciones/sync/**revisión de matches**)
### 🏆 **Refine (OSS, React) sobre la API FastAPI**
Refine es un framework React **OSS** hecho para internal tools/admin panels, flexible (Ant/MUI/
Mantine), monta CRUD sobre REST/GraphQL rápido. Encaja: ya tenés React (Expo) y FastAPI → la consola
es una app Refine que consume `apps/api`. La **cola de revisión de matches es un CRUD custom** (no la
da el orquestador) → Refine es el lugar natural.
### 🔀 **Retool** — drag-and-drop, POC rapidísimo. ❌ Paredes de customización + costo; "evitá Retool
para algo más allá de un POC". **react-admin** — maduro (25k+ usuarios) pero menos flexible que Refine.
### 📎 [Refine — comparación con react-admin/Retool](https://refine.dev/core/docs/further-readings/comparison/) · [refinedev/refine (GitHub)](https://github.com/refinedev/refine) · [Refine — alternativas a Retool](https://refine.dev/alternatives/retool-alternatives/).
### ✅ ¿Refine (recomendado) o querés un POC rápido en Retool primero?

### Módulos de la consola (inventario)
| Módulo | Qué hace | Se apoya en |
|--------|----------|-------------|
| **Registro de fuentes + salud** | alta/baja cadena por país+plataforma (`store_registry`); estado (última corrida, #productos, ✅/🔴 ruptura) | Dagster runs + tabla registro |
| **Disparar sync** | correr ingesta on-demand por fuente/país/categoría; progreso; reintentos | Dagster API |
| **Gates de calidad** | ver resultados Soda/Pandera antes de promover silver→gold | Soda + Dagster checks |
| **🔴 Cola de revisión de matches** | aprobar/rechazar matches de baja confianza (el 70% humano); cada decisión reentrena (active-learning) | pgvector/Splink + API |
| **Curaduría de taxonomía** | aprobar mapeos `categoría_tienda→canónica` propuestos por LLM | LLM + API |
| **Anomalías / ofertas falsas** | alertas de saltos raros sobre el histórico append-only | reglas + `price` |
| **Migraciones** | correr/rollback de Alembic (schema `save`) desde la UI | Alembic |

## 6. DECISIÓN 4 — Dónde vive la ingesta
### 🏆 **Servicio Python APARTE (`apps/ingestion` / `platform/jobs`), NO dentro de `apps/api`**
- La ingesta es **batch/scheduled pesado**; la API es **request/response liviano** → escalan
  distinto, y aislás fallos (un scraper colgado no tumba la API). Coherente con ADR 33 y con el
  layout que YA prevé tu `estructura-monorepo.md` (`apps/ingestion`, `platform/jobs`).
- Comparte el dominio `save` (mismo Postgres, schema `save`), distinto proceso/deploy.
### 🔀 Dentro de `apps/api`: menos servicios que operar al inicio. ❌ Acopla ciclos de vida, un job
largo compite con requests, y rompe el aislamiento. Aceptable solo para un prototipo desechable.
### ✅ ¿Servicio aparte (recomendado) desde el inicio, o monolito hasta validar?

## 7. Scheduling y observabilidad
- **Dos ritmos:** incremental frecuente (canasta canónica) + full periódico (semanal, descubrir altas/bajas).
- **Detección de ruptura:** un asset-check que falla si un adapter devuelve 0 productos / schema cambió / aparece WAF → alerta (Slack/email) desde el orquestador. No falla silencioso.
- **Observabilidad:** lineage de Dagster + logs; para el runtime del app reusar Sentry/LangSmith que ya usa Cuadra.

---

**Decisiones que deberías tomar ahora:** las 4 (§3-§6): motor, DQ, consola, ubicación.
**Qué investigar después:** **Pilar 4 (RAG + LangGraph)** — cómo el subagente consume este catálogo
saneado (el límite RAG/tool-call, grounding, el grafo, evals). Es el último pilar y el que te
diferencia como producto conversacional.

---

## ✅ RESOLUCIÓN (2026-07-03) — decisiones del usuario + aclaración de arquitectura

**D1 Motor:** **Dagster OSS (self-host)** — ELEGIDO. (No Dagster+ cloud, por el pricing 2026.)

**D2 Calidad — aclaración "¿cuál es mejor?":** NO es either/or; **Soda y Pandera hacen trabajos
distintos.** Recomendación: **arrancar con Soda Core** (los gates SQL entre capas en Postgres = el
control de mayor valor, protege el catálogo) y **sumar Pandera** en el código Python de normalización
cuando convenga (validación in-memory, dev-time). **GX Core NO** por ahora (más potente pero pesado;
solo si superás a Soda). → **Mejor para tu caso HOY: Soda Core.**

**D3 Consola — "¿cuál recomiendas?":** **Refine** (OSS, React, sobre FastAPI). Claro y sin vueltas.
Retool solo si querés un POC desechable; react-admin es el plan B. → **Refine.**

**D4 "servicio aparte" — ACLARACIÓN (yo mezclé ingesta con web):**
Estado real: `apps/api` (FastAPI) + `apps/mobile` (Expo); **no hay web app aún**; Save está vacío →
nada de esto rompe lo actual. Arquitectura objetivo en 3 capas:
```
BACKEND (Python, mismo monorepo, mismo Postgres schema `save`):
  ├─ apps/api        (YA existe) — FastAPI. Sirve mobile + web + admin. Endpoints de lectura de Save.
  └─ apps/ingestion  (NUEVO) — worker headless: adapters + Dagster + matching. Batch/scheduled.
                       "Aparte" = PROCESO/DEPLOY separado de apps/api, NO repo aparte, NO "con el
                       frontend". Comparte la DB. Escala y falla independiente de la API.

FRONTEND (web, NUEVO — apps/web, Next.js):
  ├─ Portal público Save   (rutas públicas: buscar/comparar/canasta)     ┐  MISMA web app,
  └─ Panel administrativo  (rutas /admin detrás de auth+rol: Refine)     ┘  admin gateado por rol.
```
- **La ingesta NO va "junto al frontend"** — es backend headless (sin UI). Va como `apps/ingestion`,
  proceso separado de `apps/api`, compartiendo Postgres.
- **La web SÍ puede manejar portal + panel en una sola app** (rutas públicas + `/admin` protegido por
  rol). Es el patrón más simple para un fundador solo. Alternativa: `apps/admin` separado si querés
  aislamiento duro (no necesario al inicio).
- **¿Afecta el proyecto ahora?** No: `apps/ingestion` y `apps/web` son NUEVOS y aditivos; `apps/api`
  y `apps/mobile` siguen igual. La única pieza compartida es el schema `save` en Postgres.
- **Atajo MVP (opcional):** si querés MENOS servicios al arrancar, se puede correr Dagster como
  módulo dentro de `apps/api` y separarlo a `apps/ingestion` después. Cleaner separarlo de una, pero
  válido diferir.
### ✅ Estado: D1/D2/D3 decididos. D4: confirmar (a) ingesta como `apps/ingestion` separado desde ya
o módulo en `apps/api` al inicio; (b) web única con `/admin` gateado, o `apps/web` + `apps/admin`.

### ✅ RESOLUCIÓN D4 (2026-07-03) — decisión del usuario
- **Monorepo + microservices-ready:** la ingesta vive en el monorepo (`apps/ingestion`) PERO
  diseñada para poder **extraerse a un backend/deploy aparte después sin reescribir**. Esto ES el
  **ADR 33** del proyecto (schema propio `save`, sin acceso a la DB de otro contexto, referencias
  cross-context por ID). El dato de Save lo consumen **la web Y la app móvil vía `apps/api`** (una
  sola puerta/API). → Cumplir ADR 33 a rajatabla es lo que habilita el split futuro.
- **Web única con `/admin` gateado por rol** (no `apps/admin` separado). Portal público + panel
  administrativo en la misma `apps/web` (Next.js), admin detrás de auth+capability (reusa el gating
  de `identity`/capabilities que ya existe).
- **Pilar 2: DECIDIDO** (D1 Dagster OSS · D2 Soda Core→+Pandera · D3 Refine · D4 monorepo
  microservices-ready + web única /admin).
