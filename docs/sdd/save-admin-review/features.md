# OFV Admin — Features del módulo de revisión de matching (Save), por prioridad

> Estado **2026-07-05**. Change SDD `save-admin-review` (F2 milestone B1). Rama `feat/save-admin-review`.
> Primer módulo de la **OFV** (back-office único: app + web). Enfoque AHORA = Save Supermercados
> (cola de matching + ops de ingesta). Módulos futuros (accesos/RBAC, News, financieros, seguros) =
> mismo shell, aditivos, fuera de scope.
>
> Decisiones ya cerradas por el usuario: shell = **shadcn/ui + TanStack Table** en `apps/web/@admin`
> (seam `AdminResource` mínimo ahora) · candidatos del revisor = **tabla `review_candidate`** · se
> arregla el **bug del FK** en `resolve_review`. Enriquecido con investigación 2025-2026 (fuentes
> abajo). Artefactos: aispace-men `sdd/save-admin-review/{explore,proposal,research-features}`.

**Leyenda de prioridad:** **P0** = sin esto el módulo no existe · **P1** = power pack, lo que lo hace
poderoso · **P2** = fast-follow (aditivo tras P0/P1) · **P3** = módulo OFV futuro (otro milestone).
**Seam** = dónde se apoya en el código que ya existe.

---

## P0 — Núcleo de la cola de revisión (obligatorio para B1)

### 1. Vista comparativa lado a lado con diff de campos resaltado
**Qué:** el `store_product` (nombre/marca/tamaño/imagen crudos) frente a cada canónico candidato, con
los campos que **coinciden en verde y difieren en rojo** — no dos bloques de texto que el humano tenga
que comparar a ojo. **Por qué:** es la palanca #1 de velocidad y calidad; la investigación (CROW) midió
~25% menos tiempo y menos fatiga con diffs auto-resaltados, y advierte que **lado-a-lado SIN resaltado
es MÁS lento y con más errores** (anti-patrón). **Seam:** requiere persistir los atributos crudos +
`review_candidate` (ver #4). *Fuente: [PMC9644659](https://pmc.ncbi.nlm.nih.gov/articles/PMC9644659/).*

### 2. Resolver: aprobar / rechazar / elegir candidato
**Qué:** el revisor aprueba (elige cuál canónico es), rechaza, o marca "ninguno". **Por qué:** es la
razón de ser del módulo — convierte la cola en decisiones. **Seam:** `resolve_review(match_id,
canonical_product_id, decided_by)` **+ el fix del bug**: hoy NO escribe `store_product.canonical_product_id`
→ hay que enlazar el FK en la misma transacción (invariante de la cascada).

### 3. Crear canónico nuevo inline
**Qué:** cuando ningún candidato sirve, crear el `canonical_product` ahí mismo y enlazar. **Por qué:**
sin esto, los productos genuinamente nuevos se atascan en la cola para siempre. **Seam:**
`CanonicalProductRepository.add` (ya existe, autogenera slug).

### 4. Persistencia de datos del revisor (atributos crudos + `review_candidate`)
**Qué:** guardar en write-time el `name/brand/size/image` crudo del `store_product` **+ los top-N
candidatos** (tabla `review_candidate`: `product_match_id`, `canonical_product_id`, `name`, `brand`,
`score`). **Por qué:** hoy esos datos se DESCARTAN tras el matching → la cola no le muestra nada al
revisor. Determinista (no recomputar on-demand: el catálogo pudo moverse). Es el **driver real del
scope de B1**. **Seam:** migración de schema `save` + wiring en `refresh_prices.py`/`match_store_product.py`.

### 5. Gate por rol server-side
**Qué:** solo un usuario con capability de revisión ve `/admin`; validado en el servidor, no en el
cliente. **Por qué:** un admin nunca se gatea solo en el front (anti-patrón de seguridad). **Seam:**
`require_capability` + `RoleKey.SUPER_ADMIN` (ya construido, sin usar) + nueva
`CapabilityKey.ADMIN_SAVE_MATCHING_REVIEW`.

### 6. Auditoría (quién decidió qué y cuándo)
**Qué:** mostrar `decided_by` + `decided_at` en cada fila resuelta. **Por qué:** trazabilidad =
confianza; en fintech toda aprobación humana debe ser rastreable. **Seam:** columnas ya existen en
`product_match`, solo hay que exponerlas.

---

## P1 — Power pack (lo que lo hace PODEROSO)

### 7. ⭐ Cola ordenada por INCERTIDUMBRE primero (no FIFO)
**Qué:** mostrar primero los matches más ambiguos (los más cerca del umbral de decisión), no los más
viejos. **Por qué:** es, según la investigación (Prodigy), **la mayor palanca de throughput de un
revisor** — atacas donde el humano aporta más. **Seam:** ordenar por distancia de `confidence` a los
umbrales (`banding.py`). *Fuente: [Prodigy vs Label Studio](https://www.ertas.ai/blog/prodigy-vs-label-studio-regulated-industries).*

### 8. Color-coding de confianza en la LISTA
**Qué:** en la vista de lista, colorear cada fila por certeza (oscuro = casi seguro, claro = necesita
ojo) ANTES de abrir el detalle. **Por qué:** triage de un vistazo; el revisor prioriza sin entrar a
cada uno. **Seam:** `confidence`/`method` de `product_match`. *Fuente: [OpenRefine](https://openrefine.org/docs/manual/reconciling).*

### 9. Reason-codes al rechazar + "por qué" del match
**Qué:** al rechazar, elegir el motivo ("otro tamaño", "otra marca", "otro producto"); y mostrar **qué
señal decidió** el match (ean/trgm/vector/llm), no solo un número. **Por qué:** doble oro — los motivos
**alimentan el tuneo de umbrales y el active-learning** (cada decisión enseña), y mostrar la señal evita
el anti-patrón de "score pelado que degrada en silencio". **Seam:** nueva columna de motivo + exponer
`method`. *Fuentes: [Senzing explainability](https://senzing.com/explainability/), [Snorkel](https://docs.snorkel.ai/docs/25.4/user-guide/intro/active-learning-weak-supervision/).*

### 10. Revisión por teclado
**Qué:** aprobar/rechazar/siguiente con atajos (sin mouse). **Por qué:** multiplica el throughput
cuando la cola crece; estándar en herramientas de labeling serias. **Seam:** UI (TanStack Table + hotkeys).
*Fuente: Prodigy (esquema exacto "to verify").*

### 11. Acciones en lote + filtros faceted + vistas compartibles por URL
**Qué:** aprobar/rechazar varios de golpe; filtrar por proveedor/método/confianza; y que el **estado del
filtro viva en la URL** (link compartible: "revisa esta cola filtrada"). **Por qué:** productividad +
colaboración entre revisores; consenso 2026 de data-grids. **Seam:** TanStack Table server-side +
query params. *Fuente: [tablecn](https://github.com/sadmann7/tablecn) (patrones, no adopción).*

### 12. CRUD de supermercados + subir logo
**Qué:** crear/editar `provider` (nombre, tipo, plataforma, mercado, activo) y **subir su logo**. **Por
qué:** dar de alta un súper sin tocar código; y el logo **resuelve un pendiente real** (la home web
muestra los súper como badges de texto por falta de logos). **Seam:** `provider` (schema ya existe).

### 13. Fuentes de extracción: CRUD + "probar fuente"
**Qué:** configurar la fuente (`store_registry`: plataforma vtex|shopify|magento|aggregator, `base_url`,
endpoints, **headers** —ej. `Store: jumbo`—, auth, activo) y un **botón "probar"** que hace dry-run y
muestra una muestra de productos ANTES de guardar. **Por qué:** es literalmente "colocar las URLs que
ayudan con la extracción", y "test connection before saving" es estándar, no opcional. **Seam:** puerto
`CatalogSource` + adapters existentes. *Fuente: [Meltano](https://hub.meltano.com/), [Airbyte](https://docs.airbyte.com/).*

### 14. Editor de la canasta curada
**Qué:** editar las queries de la canasta desde la UI. **Por qué:** hoy las **213 queries viven en
CÓDIGO** (`ingestion/save/sources.py`) — moverlo a la UI deja que un no-dev crezca la canasta a 1000+
sin tocar el repo. Palanca directa para escalar el catálogo. **Seam:** `BASKET_QUERIES` → tabla/config.

### 15. ⭐ Salud de fuentes: badge unificado + auto-pausa en ruptura
**Qué:** un **semáforo por fuente** que une frescura + errores + detección de ruptura; y **auto-pausar**
una fuente cuando su esquema cambia de forma rompedora (con política de re-activación), no solo detectar
pasivamente. **Por qué:** la doctrina dice "nunca falle en silencio" — esto lo hace visible Y reactivo;
Airbyte auto-pausa en cambios rompedores, Dagster unifica todo en un badge de salud. **Seam:**
detección de ruptura del pipeline + estado en `store_registry`. *Fuentes: [Airbyte schema changes](https://docs.airbyte.com/platform/using-airbyte/schema-change-management), [Dagster health](https://docs.dagster.io/guides/observe/asset-health-status).*

### 16. ⭐ Métricas de matching + COSTO del juez
**Qué:** tablero con tasa de auto-link, tamaño de cola en el tiempo, % que llega al juez, y **costo/tokens
del juez** — con latencia por **percentiles p50/p95/p99 (no promedios)** y el costo anidado bajo cada run
de ingesta. **Por qué:** sabes si la cascada está sana y **cuánto cuesta** (ya logueamos tokens por
llamada); los promedios ocultan la cola de gasto/latencia (anti-patrón). **Seam:** el log de tokens de
`claude_judge.py` + métricas de `product_match`. *Fuentes: [Langfuse](https://langfuse.com/docs/observability/features/token-and-cost-tracking), [Helicone](https://www.helicone.ai/blog/the-complete-guide-to-LLM-observability-platforms).*

---

## P2 — Fast-follow (aditivos tras el núcleo, mismo shell)

### 17. Merge / split de canónicos
**Qué:** unir dos canónicos que son el mismo producto, o partir uno que son dos. **Por qué:** el caso
clásico de entity-resolution que ninguna cascada resuelve sola; limpia el catálogo. **Seam:** repos de
canonical + product_match. *Fuente: patrones de ER (Splink/Senzing).*

### 18. Tuneo de umbrales desde UI + export de "gold set"
**Qué:** ajustar HIGH/MID/piso-del-juez viendo el impacto en una muestra; y **exportar las decisiones
humanas como conjunto etiquetado** para tuneo offline. **Por qué:** cierra el loop con los reason-codes;
las etiquetas del revisor **son** el gold set para calibrar umbrales y para el Batch 10 spike / evals.
**Seam:** `banding.py` (constantes) + export de `product_match` resueltos. *Fuente: [Splink](https://moj-analytical-services.github.io/splink/).*

### 19. QA de revisores: doble-revisión + acuerdo entre anotadores
**Qué:** muestrear un % de la cola para doble revisión y medir el acuerdo (Krippendorff/alpha), más un
dashboard de throughput/skip por revisor. **Por qué:** QA no solo del modelo sino **de los humanos** —
detecta un revisor que aprueba a la ligera antes de que corrompa el catálogo. **Seam:** nuevo, sobre
`product_match`. *Fuentes: [Argilla](https://docs.argilla.io/latest/how_to_guides/annotate/), [Label Studio](https://labelstud.io/blog/make-your-labeling-team-more-efficient-with-label-studio/).*

### 20. Explorar/editar canónicos + editor de taxonomía + reasignar match
**Qué:** buscar y corregir atributos de un canónico, curar el árbol de categorías, y re-asignar un
`store_product` mal matcheado a otro canónico después del hecho. **Por qué:** los errores pasan; hay que
poder corregirlos sin SQL. **Seam:** repos de canonical/taxonomy (existen).

### 21. Command palette (cmd-K) + re-correr matching
**Qué:** saltar a cualquier recurso con cmd-K; y forzar el re-match de un proveedor/producto. **Por qué:**
hace que la OFV se sienta pro desde el día 1 y da control operativo. **Seam:** UI + un endpoint de re-run.

---

## P3 — Módulos OFV futuros (fuera de scope; el shell los soporta)

- **Gestión de accesos / RBAC** (usuarios, roles, capabilities — `require_capability` ya existe).
- **News** · **Productos financieros** · **Seguros** — otros verticales, mismo `AdminResource`.
- **Colecciones/ofertas curadas** · **curación del home** (rails A6).
- **Dashboard de data-quality** (gates Soda/Pandera del pipeline, ya existen).
- **Feed de actividad + notificaciones** (Slack/email en ruptura o cola creciente).

---

## Anti-patrones a EVITAR (de la investigación)

1. **Lado-a-lado sin diff resaltado** → más lento y más errores. Siempre resaltar coincidencias/diferencias.
2. **Promedios en métricas de costo/latencia** → ocultan la cola. Usar **percentiles p50/p95/p99**.
3. **Score de confianza "pelado"** sin instrumentar por-señal → degrada en silencio. Mostrar **qué señal
   decidió** + reason codes.
4. **Cola FIFO** → desperdicia al revisor. Ordenar por **incertidumbre** (distancia al umbral).
5. **Gate de admin solo en el cliente** → agujero de seguridad. Gate **server-side**.

---

## Alcance sugerido para ESTE milestone (B1)

**Entra:** todo **P0** + del power pack **P1**: #7 (incertidumbre), #8 (color-coding), #9 (reason-codes),
#12 (proveedores+logo), #13 (fuentes+probar), #14 (editor de canasta), #15 (salud+auto-pausa), #16
(métricas+costo). #10 (teclado) y #11 (lote/URL) si el tiempo lo permite.
**Fast-follow (P2)** y **futuros (P3)** = milestones aditivos sobre el mismo shell.

> **Nota de método:** las features marcadas ⭐ son las de mayor ROI según el estado del arte
> (incertidumbre-first, salud+auto-pausa, costo del juez por percentiles). Si hay que recortar, se
> recorta de P2 hacia arriba, nunca del núcleo P0.

## Fuentes (2025-2026)
- Entity-resolution review: CROW ([PMC9644659](https://pmc.ncbi.nlm.nih.gov/articles/PMC9644659/)),
  [Senzing](https://senzing.com/explainability/), [OpenRefine](https://openrefine.org/docs/manual/reconciling),
  [Splink](https://moj-analytical-services.github.io/splink/).
- HITL labeling: [Prodigy vs Label Studio](https://www.ertas.ai/blog/prodigy-vs-label-studio-regulated-industries),
  [Label Studio](https://labelstud.io/blog/make-your-labeling-team-more-efficient-with-label-studio/),
  [Argilla](https://docs.argilla.io/latest/how_to_guides/annotate/), [Snorkel](https://docs.snorkel.ai/docs/25.4/user-guide/intro/active-learning-weak-supervision/).
- Ingesta/fuentes: [Airbyte](https://docs.airbyte.com/platform/using-airbyte/schema-change-management),
  [Dagster](https://docs.dagster.io/guides/observe/asset-health-status), [Meltano](https://hub.meltano.com/).
- Costo LLM: [Langfuse](https://langfuse.com/docs/observability/features/token-and-cost-tracking),
  [Helicone](https://www.helicone.ai/blog/the-complete-guide-to-LLM-observability-platforms).
- Admin building blocks: [tablecn](https://github.com/sadmann7/tablecn).
