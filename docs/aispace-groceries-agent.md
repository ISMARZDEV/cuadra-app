# 🛒 AISpace · GroceriesAgent — el subagente de Save en el chat

> **Fecha:** 2026-08-02 · **Estado:** plan aprobado, implementación no iniciada
> **Rama:** `feat/aispace-groceries-agent` (desde `developer` @ `8f92f08`)
> **Deriva de:** [`arquitectura-mvp.md`](./arquitectura-mvp.md) §7 ·
> [`research/save-fable/07-pilar4-rag-langgraph.md`](./research/save-fable/07-pilar4-rag-langgraph.md) (decisiones resueltas 2026-07-03) ·
> [`research/save-fable/04-save-funcionalidades.md`](./research/save-fable/04-save-funcionalidades.md) (G3 del foso)
>
> **Principio rector heredado:** *el LLM razona la intención; las herramientas determinísticas hacen
> los números.* Acá se lleva al extremo: **cada precio viaja de Postgres a la respuesta sin que el
> modelo lo toque.**

---

## Tabla de contenido

0. [**Rol del agente ejecutor y protocolo de trabajo**](#0-rol-del-agente-ejecutor-y-protocolo-de-trabajo) ← **empezar acá**
1. [Qué resuelve y por qué ahora](#1-qué-resuelve-y-por-qué-ahora)
2. [Estado real medido](#2-estado-real-medido)
3. [Decisiones cerradas (con el porqué)](#3-decisiones-cerradas-con-el-porqué)
4. [Arquitectura — dónde encaja](#4-arquitectura--dónde-encaja)
5. [El catálogo de tools](#5-el-catálogo-de-tools)
6. [Búsqueda híbrida](#6-búsqueda-híbrida)
7. [La canasta por presupuesto](#7-la-canasta-por-presupuesto)
8. [Grounding anti-alucinación](#8-grounding-anti-alucinación)
9. [Rendimiento: costo, latencia y precisión](#9-rendimiento-costo-latencia-y-precisión)
10. [Fases de implementación](#10-fases-de-implementación)
11. [Reglas de skills](#11-reglas-de-skills)
12. [Tests y evals](#12-tests-y-evals)
13. [Riesgos](#13-riesgos)
14. [Verificación end-to-end](#14-verificación-end-to-end)
15. [Abierto y futuro](#15-abierto-y-futuro)
- [Apéndice A — Entorno y comandos](#apéndice-a--entorno-y-comandos)
- [Apéndice B — Contratos concretos](#apéndice-b--contratos-concretos)
- [Apéndice C — Artefactos a crear](#apéndice-c--artefactos-a-crear)
- [Apéndice D — Lo que esta fase NO toca](#apéndice-d--lo-que-esta-fase-no-toca)

---

## 0. Rol del agente ejecutor y protocolo de trabajo

> **Esta sección se lee ANTES que cualquier otra.** Define quién ejecuta este plan y cómo.

### 0.1 Tu rol

Sos **experto en desarrollo de sistemas multiagente con LangGraph**, con años construyendo software
agéntico en producción. Eso significa concretamente que dominás:

- **Graph API vs Functional API** — y sabés elegir. Acá es **Graph API** (routing condicional y
  orquestación multiagente); la decisión ya está tomada y el grafo existe.
- **El estado y sus reducers.** Sabés que el comportamiento por defecto es **sobreescribir**, y que
  un campo que debe acumular necesita `Annotated[list, add]` explícito. Es la fuente #1 de bugs de
  «estado perdido».
- **Persistencia y `thread_id`.** Sin `thread_id` en cada `invoke`, el checkpointer no guarda y
  `interrupt()` se rompe.
- **Interrupts y HITL.** `interrupt()` sin checkpointer compilado **revienta**.
- **Streaming.** `stream_mode` no es intercambiable: `"messages"` es token a token (lo que quiere un
  chat), y el default `"values"` **no** es lo que querés.
- **Patrones de orquestación** — router-a-nodos, handoff, supervisor, fan-out con `Send` y reducer de
  síntesis — y **cuándo cada uno cuesta más de lo que aporta**.

Y como ingeniero, no solo como usuario de LangGraph:

- **Arquitectura hexagonal** — dominio PURO, puertos como `Protocol`, inyección en el composition
  root. `lint-imports` lo verifica; si falla, el diseño está mal, no el linter.
- **Estructuras de datos deliberadas** — `@dataclass(frozen=True, slots=True)` para value-objects,
  tipos que hacen imposible el estado inválido, `Decimal`/`int` para dinero y **jamás `float`**.
- **Tipado estricto** — `mypy` limpio, sin `Any` de conveniencia ni `# type: ignore` sin justificar.
- **Nombres que discriminan** — un nombre que aplica a dos cosas distintas no identifica ninguna.
  Este documento tiene dos casos reales de ese defecto (§3.3 y Fase 1); no agregues un tercero.

### 0.2 Estándares no negociables

| Regla | Detalle |
|---|---|
| **TDD estricto** | RED → GREEN → REFACTOR. El test se escribe **primero**, siempre. Un test que nunca falló no prueba nada |
| **Dominio puro** | `save/domain/*` no importa infraestructura. Sin excepciones |
| **Dinero** | Minor units enteros. Nunca `float`, en ninguna capa |
| **El LLM no calcula** | Todo número viaja de Postgres → tool → respuesta sin que el modelo lo toque |
| **Prompts en inglés** | Todo lo que **lee el modelo** va en inglés; el output va en el idioma del usuario |
| **`user_id` por closure** | Nunca es parámetro visible al LLM (anti-IDOR) |
| **Comentarios cortos** | Explican el **porqué**, no el **qué** |
| **Medir antes de construir** | Si una regla se puede validar contra datos reales, se valida **antes** de escribirla |
| **Construir para la familia** | Este es el **primer** agente de Save, no el único. Antes de cada archivo: *¿un agente de tarjetas de crédito usaría esto?* Si sí, **no va dentro de `agents/groceries/`**. Ver [§4.4](#44--groceriesagent-es-el-primero-de-una-familia-no-una-pieza-suelta) |

### 0.3 ⛔ Protocolo de fases — PARAR Y PREGUNTAR

> **Regla dura: al terminar CADA fase, te detenés. No encadenás fases.**

Al cerrar una fase, en este orden:

1. **Correr la verificación de la fase** — sus tests, más `ruff`, `mypy` y `lint-imports`.
2. **Reportar en un párrafo**: qué se construyó, qué número salió de la medición si la fase tenía
   una, y qué quedó fuera.
3. **PREGUNTAR EXPLÍCITAMENTE si commitear**, y **esperar la respuesta**.
4. **No avanzar a la fase siguiente** hasta que el usuario conteste.

```
✅ Fase N completa · <tests> verdes · linters limpios
   <un párrafo de qué se hizo y qué se midió>

   ¿Commiteo esta fase y sigo con la Fase N+1?   ← PARAR ACÁ
```

**Nunca** commitear, pushear ni abrir un PR sin que el usuario lo pida en ese momento. Que los tests
estén verdes **no es permiso para commitear**.

Si en medio de una fase encontrás algo que invalida el plan —como el cortocircuito del router de la
Fase 1—, **parás igual y lo decís**, antes de seguir construyendo sobre una base equivocada.

---

## 1. Qué resuelve y por qué ahora

### 1.1 El triángulo, y el lado que falta

El MVP de Cuadra se apoya en un triángulo (§1.1 de `arquitectura-mvp.md`):

```
            AISpace · Chat IA (Orquestador)
               /              \
        INSIGHTS  ←─────────→  SAVE
       (tu dinero)           (el catálogo de precios)
```

Hoy los tres vértices **existen**, pero **Save y AISpace no se tocan**: verificado por grep, hay
**cero referencias cruzadas** entre `contexts/aispace` y `contexts/save`. El chat no sabe que existe
un catálogo de precios.

Este documento define el puente: el **`GroceriesAgent`**.

### 1.2 Las preguntas que debe responder

| Pregunta del usuario | Qué exige |
|---|---|
| *«¿dónde está más barato el arroz Rica?»* | Resolver un producto difuso → comparar entre tiendas → enlazar |
| *«precio del aceite»* | Búsqueda + precio + tiendas |
| **«con RD$10,000, ¿qué me alcanza para la compra del hogar?»** | **La feature estrella.** Optimizador determinista de canasta |
| *«armame una lista de compra»* | Composición de canasta, devuelta como respuesta |
| *«¿qué bajó de precio?»* | Reuso de `ListPriceDrops` |

La estrella no salió de un roadmap: el usuario la describió con la analogía del **reel viral** —
*«con X pesos, ¿qué compro en el súper?»*. Es una pregunta que la gente ya se hace en redes y que
**nadie en RD puede responder con datos reales**. SupermercadosRD tiene el catálogo pero no un
agente; Cleo/MonAi tienen el agente pero no el catálogo local.

### 1.3 Por qué cuesta menos de lo que el roadmap supone

La documentación está desactualizada **en la dirección buena**. §16 de `arquitectura-mvp.md` dice
que AISpace *«no se ha iniciado»*. La realidad medida:

| Pieza | Estado real |
|---|---|
| Grafo LangGraph | ✅ construido |
| Router (cortocircuito + clasificador LLM con structured output) | ✅ construido |
| Checkpointer Postgres | ✅ construido |
| HITL con `interrupt()` + `/chat/resume` | ✅ construido |
| Streaming SSE con allowlist por nodo | ✅ construido |
| `FinanceAgent`, `GeneralAgent` | ✅ construidos |
| Chat mobile con SSE real, dock de interacciones, links | ✅ construido |
| `agents/purchases/__init__.py` | ⬜ **existe y está VACÍO — esperando** |

**Lo que de verdad falta** no es el andamiaje agéntico: es la mitad de lectura de Save (la búsqueda
es un `ILIKE`) y un optimizador de canasta que no existe.

### 1.4 De «ver precios» a «comprar mejor» — lo que la audiencia realmente pide

> Deriva del análisis de contenido y comentarios de la audiencia dominicana (2026-08). Cambia el
> **propósito** del agente, no solo su tono.

**El insight central:**

> La gente **no quiere saber qué producto está más barato. Quiere saber qué le conviene de verdad.**

Y «conveniencia real», para ellos, incluye: si el ahorro compensa el traslado, si la calidad vale la
pena, si el producto es **comparable de verdad**, si la recomendación aplica a una compra normal, y
si el dato **sigue vigente**.

#### Lo que valida decisiones que ya tomamos

| Hallazgo de la audiencia | Qué confirma |
|---|---|
| Ante contenido que implica visitar varias tiendas, saltan objeciones de **gasolina, tiempo y distancia**. El usuario optimiza por **precio neto percibido**, no absoluto | La canasta **en una sola tienda** (§3.2). No era una simplificación: es como la gente compra |
| Exigen **metodología visible**: fechas, tiendas incluidas, límites explícitos | Las citas obligatorias de §8.2 (`provider` + `captured_at` + `price_type` + disclaimer) |
| Señalan de inmediato una contradicción, una tienda omitida o un precio desactualizado | La degradación honesta de §8.1. **Aparentar cobertura destruye la confianza más rápido que admitir un hueco** |
| Los formatos de **presupuesto cerrado** («qué compro con RD$3,000 / 5,000 / 8,000») son de los más compartibles | La feature estrella (§7) |

#### Lo que CAMBIA en cómo debe responder el agente

1. **Conclusiones condicionadas, nunca absolutas.** La audiencia tolera muy bien afirmaciones
   fuertes **si están encuadradas**. Funciona *«en esta categoría»*, *«entre estas tiendas»*, *«en
   este período»*, *«sin evaluar sabor ni calidad»*. Esa precisión **no debilita la respuesta: la
   vuelve creíble.** → va al system prompt (Apéndice C.3).
2. **Confirmar intuiciones con números.** Mucho de lo que la gente valora no es descubrir algo
   nuevo, sino que alguien **le ponga nombre, número y prueba a algo que ya sospechaba** (*«el
   empaque grande no siempre conviene»*, *«no hay un único súper más barato»*). El precio por unidad
   base es justamente esa herramienta.
3. **El precio no es el único eje.** La conversación siempre deriva a calidad, frescura, sabor,
   cercanía y confianza en la tienda. El agente **no tiene esos datos** — y por eso debe decir sobre
   qué eje está comparando, en vez de dar a entender que evaluó todo.

---

### 1.5 Mapa de capacidades: qué se puede HOY y qué desbloquea la ingesta

Los indicadores que sostienen ese tipo de respuestas, contrastados con lo que el sistema puede dar
**hoy**:

#### Bloque 1 — lo rentable de entrada

| Indicador | Estado |
|---|---|
| **Precio por unidad normalizada** | ✅ existe (`unit_price_minor`) |
| **Ahorro absoluto en pesos** | ✅ existe (`extra_minor`) |
| **Ahorro porcentual** | ✅ derivable de lo anterior |
| **Ranking por tienda y categoría** | ✅ existe (`is_cheapest`, listados) |
| **Costo de canasta** | ✅ Fase 4 |
| **Fecha de actualización del dato** | ✅ existe (`captured_at`) |
| **Variación 7 / 30 / 90 días** | ❌ **bloqueado: 1 solo snapshot** |
| **Mediana histórica** | ❌ **bloqueado: 1 solo snapshot** |

#### Bloque 2 — comparabilidad sofisticada

| Indicador | Estado |
|---|---|
| **Score de similitud entre productos** | 🟡 los embeddings BGE-M3 ya existen; falta exponerlos como «parecido y más barato» |
| **Nivel de confianza del match** | ✅ **ya existe** — `product_match.confidence` de la cascada |
| Diferencias nutricionales | ❌ no se ingiere ese dato |
| Canastas por perfil de hogar | 🟡 la canasta existe; el perfil no |

#### Bloque 3 — «conveniencia real»

| Indicador | Estado |
|---|---|
| Ahorro **neto** estimado (descontando el traslado) | ❌ nuevo |
| Valor incremental de visitar una **segunda tienda** | ❌ nuevo — pero es la respuesta directa a la objeción más repetida |
| Umbral mínimo para que un desvío valga la pena | ❌ nuevo |

#### El vocabulario de KPIs — contrato de nombres

Las tools deben devolver estos indicadores **con estos nombres**. Un vocabulario fijo es lo que
permite que el mismo cálculo alimente al agente, al contenido y a la analítica sin recalcularse tres
veces con tres criterios distintos.

| KPI | Prio | De dónde sale hoy | Estado | Lo expone |
|---|---|---|---|---|
| `precio_por_unidad_normalizada` | 🔴 Alta | `unit_price_minor` + `unit_measure` | ✅ existe | `compare_prices`, `search_groceries` |
| `ahorro_rd` | 🔴 Alta | `extra_minor` (sobreprecio vs la más barata) | ✅ existe | `compare_prices` |
| `ahorro_pct` | 🔴 Alta | derivado de `extra_minor` / precio | 🟡 **derivar en la tool** | `compare_prices` |
| `gap_precio` | 🔴 Alta | `spread_minor` (más caro − más barato) | ✅ existe | `compare_prices` |
| `ranking_por_tienda_y_categoria` | 🔴 Alta | `is_cheapest` + listados | ✅ existe | `compare_prices`, `cheapest_store_by_category` |
| `costo_canasta` | 🔴 Alta | Fase 4 | 🟡 se construye | `basket_for_budget`, `monthly_cost` |
| `fecha_actualizacion` | 🔴 Alta | `captured_at` | ✅ existe | **todas** |
| `variacion_7d` / `variacion_30d` | 🔴 Alta | tabla `price` | ❌ **bloqueado: 1 snapshot** | — |
| `match_confidence` | 🟡 Media | `product_match.confidence` | ✅ **existe, sin exponer** | — |
| `score_similitud` | 🟡 Media | embeddings BGE-M3 | 🟡 existen, sin exponer | `explore_alternatives` |
| `ahorro_neto_estimado` (umbral) | 🟡 Media | aritmética sobre precios | 🟡 §7.6 | `worth_second_store` |
| `anomaly_score` | 🟡 Media | tabla `price` | ❌ bloqueado | — |
| `costo_mensual` / `costo_anual` | 🟡 Media | proyección de la canasta | 🟡 derivable de Fase 4 | — |
| `diferencia_nutricional` | 🟡 Media | — | ❌ no se ingiere ese dato | — |

> **`ahorro_pct` se deriva en la tool, no en el modelo.** Es una división — y una división la hace
> código, nunca un LLM (§5.4).

#### Categorías que activan debate

Café, **carnes**, productos de **bebé**, aceites y **marcas blancas** concentran la conversación. Eso
tiene una consecuencia práctica y barata: **el set de consultas etiquetadas (Apéndice C.1) y el
dataset de evals (§12.3) deben estar sesgados hacia esas categorías**, no distribuidos parejo. Es
donde el agente va a ser puesto a prueba de verdad.

> **Dos conclusiones que este mapa deja claras.**
>
> 1. **La mitad de lo que la audiencia más valora depende del historial de precios**, que hoy no
>    existe (1 snapshot por producto). Todo el territorio de *inflación, alertas y «qué subió esta
>    semana»* está bloqueado por **cobertura de ingesta**, no por el agente. Es el argumento más
>    fuerte para arrancar el reloj de la ingesta ya — ver
>    [`pending/save-huecos-para-estar-completo.md`](./pending/save-huecos-para-estar-completo.md) §3.
> 2. **El Bloque 3 es un diferenciador que nadie tiene**, y es barato: responder *«¿vale la pena ir a
>    la segunda tienda?»* es aritmética sobre datos que ya tenemos, más un supuesto de costo de
>    traslado. Queda **fuera de esta fase** (el alcance es solo lectura de lo que existe), anotado
>    como el candidato más obvio para la siguiente.

---

## 2. Estado real medido

> Medido contra la base de desarrollo el **2026-08-02**. Estos números son el piso desde el que
> arranca el agente, y explican por qué la Fase de *grounding* no es opcional.

### 2.1 Densidad del catálogo

| Métrica | Valor |
|---|---:|
| Proveedores activos / con datos | 8 / **3** (Sirena 120 · Nacional 144 · Bravo 52) |
| `store_product` | 316 |
| `canonical_product` | 133 |
| **Comparables (>1 tienda)** | **20 = 15%** |
| Snapshots de precio por producto | **1** → cero historial |
| Cola `pending_review` | 161 |

**Consecuencia directa de diseño:** el agente responderá *«lo encontré en Sirena»* mucho más seguido
que *«está más barato en Bravo»*, porque **113 de 133 canónicos viven en una sola tienda**. Eso no es
un bug del agente — es cobertura de ingesta. El agente debe ser **honesto**, no aparentar.

### 2.2 Lo que Save ya expone (y se reusa tal cual)

| Caso de uso | Ruta | Aporta |
|---|---|---|
| `CompareProduct` | `save/application/compare.py` | **La joya**: tabla por tienda con `is_cheapest`, `unit_price_minor`, `spread_minor` y **`url`** |
| `GetPriceHistory` | `save/application/history.py` | Series por proveedor (hoy sin datos) |
| `ListTodaysDeals` · `ListPriceDrops` | `application/listing.py` · `drops.py` | Ofertas y bajadas |
| `ListCategoryProducts` | `application/listing.py` | Filtros por tienda/marca/precio |
| `compare()` | `save/domain/comparison.py` | **PURO** — ordena, marca el más barato, calcula el extra |
| Embeddings BGE-M3 | `matching/embeddings.py` | `Vector(1024)` **ya poblado** en `canonical_product` |
| trgm + vector + RRF | `infrastructure/matching/` | El patrón exacto que necesita la búsqueda |
| **`basket_query`** | migración `0990d45c068a` | **213 queries curadas en 20 grupos del hogar** |

### 2.3 Lo que NO existe

- **Búsqueda de usuario decente.** `SearchProducts` es literalmente `name.ilike(f"%{query}%")` —
  sin trigram, sin ranking, sin `brand`, sin tolerancia a typos.
- **Optimizador de canasta por presupuesto.**
- **Dominio `ShoppingList`** (no hay tabla, entidad ni caso de uso).
- ~~**Skill de la capa agéntica**~~ → **creada en la Fase 2**: `.claude/skills/cuadra-aispace/`.
- **Scaffolding de evals de faithfulness** — cero referencias a `ragas`, y `observability.py` es
  tracing, no evals. **Matiz medido:** sí existe un harness de evals (`apps/api/evals/finance_eval.py`,
  `make eval`) que cubre routing y montos del `FinanceAgent`. Lo que falta es **faithfulness**, que
  es otra cosa: no «¿eligió bien?» sino «¿el texto dice lo que devolvió la tool?».
- **Save en mobile** más allá de la campana de alertas: no hay buscador, ni categorías, ni detalle,
  ni comparación, ni tarjeta de producto.

---

## 3. Decisiones cerradas (con el porqué)

### 3.1 Heredadas del pilar 4 (resueltas 2026-07-03)

1. **Tools fijas deterministas para precios — NUNCA text-to-SQL.**
   Un LLM es un generador **probabilístico**: si le pedís un número, lo *inventa* con cara de verdad.
   La tool fija es una función con SQL escrito y testeado por nosotros. Text-to-SQL se descarta
   porque deja que el modelo **escriba la query** — reintroduce alucinación de columnas y superficie
   de inyección. Inaceptable en una app de finanzas.

2. **Retrieval híbrido con rerank condicional.**
   Léxico (`pg_trgm`, atrapa marca y tamaño exactos) + semántico (BGE-M3, atrapa sinónimos y typos),
   fusionados con RRF. El rerank es una segunda pasada más cara que **solo se paga cuando el
   resultado es ambiguo**.

3. **Evals con faithfulness como gate.**
   No se puede revisar a mano cada respuesta. Si faithfulness baja del umbral, **no se publica**.
   Un precio inventado destruye la confianza, que es el producto.

### 3.2 Tomadas en esta sesión

| Decisión | Valor | Porqué |
|---|---|---|
| **Nombre** | `GroceriesAgent`, intent `groceries` | Ver §3.3 |
| **Alcance** | Router existente + solo este agente | Entregar uno completo antes que cuatro a medias |
| **Mutaciones** | **Solo lectura** | Cero riesgo de HITL mal hecho; `ShoppingList` no existe |
| **Presupuesto** | El monto que el usuario **dice en el chat** | Funciona aunque no haya datos en Insights |
| **Canasta** | **Una tienda**, y se comparan entre sí | Refleja un viaje real de compra, y convierte la pregunta en una comparación |
| **Criterio** | **Cobertura del hogar por prioridad** | Un óptimo de mochila daría 30 paquetes de sal |
| **Superficie** | Backend + tests **y** mobile | La web queda para después |

### 3.3 Por qué NO se llama `PurchasesAgent`

El §7.1 de `arquitectura-mvp.md` lo bautizó `PurchasesAgent`. **Se renombra**, y el argumento es el
mismo que resolvió el sesgo del token `arroz` en el clasificador de categorías:

> **Un nombre que aplica a dos cosas distintas no discrimina ninguna.**

`Purchases` nombra el **verbo** (comprar), no el **dominio**. Cuando llegue el agente de productos
financieros de Save, comprar un seguro también es una compra — el nombre no separa a los hermanos.
Y el que más sufre es el **clasificador del router**: separar `purchases` de `financial_products` es
pedirle al modelo que adivine un matiz; separar `groceries` de `financial_products` es trivial.
**El nombre del intent es parte del prompt del router**, no una etiqueta cosmética.

Además hay precedente en el propio código: `FinanceAgent` está nombrado por el dominio que sirve
(Insights), no por el verbo.

```
agents/
  finance/      → Insights · tu dinero
  groceries/    → Save · supermercados        ← ESTE
  insurance/    → Save · seguros y préstamos  (futuro)
  coach/        → el triángulo                (futuro)
  support/      → FAQ                         (futuro)
```

> ⚠️ **Regla de nomenclatura futura.** El hermano financiero **no** debe llamarse `FinancialAgent`:
> sería indistinguible del `FinanceAgent` de Insights, para un humano y para el clasificador.
> Nómbralo por su vertical concreta.

---

## 4. Arquitectura — dónde encaja

### 4.1 El grafo NO se toca

```
START → classify_intent → (route_by_intent) ─┬─ agent_run → prepare_flow → hitl → END
                                              └─ respond_other → END
```

`orchestration/graph.py` queda **intacto**. Añadir un agente es:

1. Una clase que cumple `AgentSpec` (`agents/base.py`).
2. Una entrada en la lista de `orchestration/registry.py::build_registry`.
3. Un valor más en el `Literal` de `_IntentOut` y una línea en `_CLASSIFY_PROMPT`.

Ese es todo el costo de integración. El patrón escala por **registry**, no por supervisor.

### 4.2 El contrato del agente

```python
class GroceriesAgent:            # cumple agents/base.py::AgentSpec
    intents = ("groceries",)
    def run(self, state) -> dict:      # → {messages, pending_action: None, ui_actions: [...]}
    def commit(self, state) -> str:    # no-op: es de SOLO LECTURA
```

> ⚠️ **Corrección respecto de una versión previa de este documento.** Se afirmaba que `run()` nunca
> devuelve `pending_action` y que eso garantizaba la no-mutación. **Ya no es cierto**: el flujo de
> desambiguación (§5.4·A) sí usa el canal de interacción. La garantía es otra, y es más fuerte:

**La garantía de que esta fase no muta nada es que `commit()` es no-op y NO EXISTE ninguna tool de
escritura.** El agente no tiene con qué escribir, ni aunque el grafo lo lleve por el camino de
interacción. Usar el dock para *elegir un producto* no es lo mismo que usarlo para *confirmar una
escritura*: el primero es lectura con desambiguación, el segundo es HITL.

### 4.3 Los enlaces salen gratis

El requisito *«que entregue los enlaces para ser redirigidos a esas tiendas»* **ya tiene canal**:

```python
lang = state.get("ui_language") or state.get("language", "es")
return {
    "messages": ...,
    "pending_action": None,
    # El texto del enlace es CHROME determinista → catálogo i18n, nunca hardcodeado (§4.3.1)
    "ui_actions": [
        {"type": "link", "text": t("save.buy_at", lang, provider=cheapest.provider_name),
         "href": cheapest.url}
    ],
}
```

#### 4.3.1 ⚠️ Cuadra es es/en/pt — y el enlace es CHROME, no charla

Una versión previa de este documento escribía `"text": "Comprar en Bravo"` a mano. **Está mal**, y
rompe a un usuario en inglés o en portugués de Brasil. El repo ya distingue **dos canales de texto**
y hay que respetarlos:

| | Texto libre del LLM (la respuesta) | Strings deterministas (chrome) |
|---|---|---|
| Sale de | el modelo, guiado por el prompt | el catálogo `shared/i18n`, vía `t(key, lang, **params)` |
| Campo de idioma | **`state["language"]`** — la detección por-mensaje puede pisar el locale | **`state["ui_language"]`** — el locale que el usuario ELIGIÓ, nunca se pisa |
| Cómo | `PROMPT.format(language=language_name(lang))` → `"Reply EXCLUSIVELY in português"` | `t("save.buy_at", lang, provider=...)` |

Concretamente, en este agente van por el catálogo (con entrada **es / en / pt**, las tres):

- el **texto de cada enlace** de tienda (`ui_actions`),
- el **prompt y las opciones** del dock en el flujo de desambiguación (§5.4·A),
- los mensajes de **degradación honesta** de §8.1 que no genere el LLM.

Y al revés: **la salida de las tools se queda en inglés neutro y compacto** (`provider=`,
`unit_price=`, `no_data:`), igual que hace hoy `get_monthly_summary`. Si la tool devolviera español,
anclaría el idioma de la respuesta y el agente contestaría en español a un usuario brasileño. **El
dato es neutro; el idioma lo pone el prompt.**

Verificado end-to-end:

- `ComparedPriceDto.url` ya trae la URL de cada tienda.
- `orchestration/sse.py::links()` ya emite los frames `link`.
- El nodo `hitl` devuelve `{}` sin pisar `ui_actions` cuando no hay `pending_action`.
- Mobile (`use-chat.ts`) ya soporta **N links por turno**.

**Cero cambios en el grafo, el SSE o el contrato.** El único arreglo real está en mobile (§10, Fase 9).

### 4.4 ⚠️ `GroceriesAgent` es el PRIMERO de una familia, no una pieza suelta

> **Esta es la restricción de diseño más importante del documento.** Si se ignora, lo que se
> construya funcionará y habrá que rehacerlo entero cuando entre el segundo agente.

#### El destino de Save

Save **no es «el comparador de supermercados»**. Es un **catálogo multi-vertical de proveedores** —
lo dice el propio concepto (*«estilo Uber Eats / Pedidos Ya. MVP = supermercados. Futuro: bancos
—tarjetas, préstamos, inversión—, aseguradoras, agricultores, tiendas, vendedores independientes»*).

**El modelo de datos ya nació así**, no hay que migrarlo:

```python
# save/domain/entities/provider.py
class ProviderType(StrEnum):
    SUPERMARKET = "supermarket"     # ← los 8 proveedores de hoy
    BANK = "bank"                   # ← ya existe
    INSURER = "insurer"             # ← ya existe
```

Así que el chat va a tener, con el tiempo, **varios puentes hacia Save**:

| Agente (futuro) | Vertical | Preguntas que responde |
|---|---|---|
| **`GroceriesAgent`** ← este | supermercados | precios, dónde está más barato, canasta por presupuesto |
| `CardsAgent` | tarjetas de crédito | comparar tasas, cashback, anualidad, cuál me conviene |
| `LoansAgent` / `InsuranceAgent` | préstamos, seguros | comparar productos, cuotas, coberturas |
| `PromotionsAgent` | promociones | ofertas activas, descuentos por banco/comercio |
| `InvestmentsAgent` | inversión | dónde poner los ahorros, certificados, rendimientos |

#### Qué significa para ESTA implementación

**Todo lo que no sea específicamente «comida» debe nacer reusable.** La tabla de corte:

| Pieza | ¿La reusan los hermanos? | Dónde debe vivir |
|---|---|---|
| `rank_fusion` (RRF) | ✅ **Sí** — todos buscan productos difusos | `save/domain/rank_fusion.py` — **por eso se eleva** (§6.3) |
| Búsqueda híbrida (trgm + vector) | ✅ **Sí** — un préstamo también se busca por texto | Caso de uso genérico, filtrable por `ProviderType` |
| `domain/comparison.py` | ✅ **Sí** — ya es genérico (cotizaciones + cantidad) | Ya está bien. **No lo ensucies con lógica de góndola** |
| Patrón de tools (closure, docstring en inglés, salida compacta) | ✅ **Sí** | Convención → va a la **skill** `cuadra-aispace` |
| Reglas de grounding y citas | ✅ **Sí, y más estrictas** | Skill + prompt base |
| Registro de intent (registry + `Literal` + prompt) | ✅ **Sí** — es el mecanismo de extensión | Ya está. **No lo toques** |
| `domain/basket.py` (canasta del hogar) | ❌ **No** — es de supermercado | `save/domain/basket.py`, específico y honesto |
| Grupos de `basket_query` | ❌ **No** | Específico del vertical |

> **La pregunta que hay que hacerse antes de escribir cada archivo:**
> *¿un agente de tarjetas de crédito usaría esto?* Si la respuesta es sí, **no lo metas dentro de
> `agents/groceries/`.**

#### ⛔ El anti-patrón: el `SaveAgent` que sabe de todo

La tentación al llegar el segundo vertical será ampliar este agente. **No.** Un solo agente que
compare arroz *y* tasas de interés necesita un prompt que mezcla dos dominios sin relación, un
catálogo de tools que crece sin límite (y con él caen la precisión de selección y el costo por turno,
§9.3), y evals que no se pueden interpretar.

**Un agente por vertical, con el nombre de su vertical** (§3.3). El router ya sabe repartir.

#### Un aviso sobre el vertical financiero

Cuando lleguen tarjetas, préstamos e inversión, **el listón de grounding sube**: una tasa, una cuota
o un rendimiento mal citados no son un error de UX — son un problema regulatorio y de confianza mucho
más grave que equivocar el precio del arroz. Las reglas de §8 son el **piso**, no el techo, y por eso
tienen que vivir en la skill compartida y no enterradas en este agente.

---

## 5. El catálogo de tools

### 5.1 Patrón de construcción

Idéntico al de `agents/finance/tools/*.py`:

```python
def build_compare_prices(session_factory, market_id: str):
    @tool
    def compare_prices(product: str) -> str:
        """Compare the price of ONE product across supermarkets. ..."""   # ← EN INGLÉS
        with session_factory() as session:
            ...
    return compare_prices
```

- **Docstring en inglés**: es literalmente el prompt que ve el modelo (skill `cuadra-agent-prompts`).
- **Una Unit-of-Work por invocación** (`with session_factory() as session:`).
- **Sin `user_id`**: a diferencia de Finance, Save es catálogo **público** por `market_id`. No aplica
  el anti-IDOR — pero tampoco se acepta `market_id` desde el LLM: se cierra por closure.

### 5.2 ⚠️ Auditoría previa: dos tools candidatas están MUERTAS AL NACER

Antes de fijar el catálogo se auditó cada tool contra los datos reales. Resultado:

```
filas en save.price:                                        316
productos con >1 snapshot (necesarios para una bajada):       0
```

`ListPriceDrops` compara **pares consecutivos** de precio (`list_price_changes` → `detect_drops`), y
`ListTodaysDeals` *«reusa el feed de bajadas de G4 como proxy»* — su propio docstring lo dice. Con
**cero** productos con más de un snapshot, **las dos devuelven lista vacía**.

> **Lección para el catálogo:** una tool que existe en el código no es una tool que funciona con los
> datos que hay. **Cada tool se audita contra la base antes de entrar**, no después de que el agente
> responda «no encontré nada» delante del usuario.

### 5.3 Las tools de la v1

Siete tools, todas verificadas contra datos que **sí existen hoy**:

| # | Tool | Firma | Reusa | Responde a |
|---|---|---|---|---|
| 1 | `search_groceries` | `(query)` | §6 (nuevo) | *«precio del aceite»* |
| 2 | `compare_prices` | `(product)` | `CompareProduct` ✅ | *«¿dónde está más barato?»* |
| 3 | `explore_alternatives` | `(product)` | `ListBrandProducts` ✅ + embeddings 🟡 | *«el grande no siempre conviene»* · *«más barato y parecido»* |
| 4 | `basket_for_budget` | `(amount_minor)` | `basket_query` ✅ + §7 | **«con RD$10,000 qué compro»** |
| 5 | `cheapest_store_by_category` | `(category)` | `ListCategoryProducts` ✅ | *«no hay un único súper más barato»* |
| 6 | `monthly_cost` | `(group)` | `basket_query` ✅ + §7 | *«cuánto cuesta un bebé al mes»* |
| 7 | `worth_second_store` | `(product_or_basket)` | §7.6 (nuevo) | **«¿vale la pena el viaje?»** |

#### Por qué cada una gana su lugar

**3 · `explore_alternatives`** — consolida **dos** líneas editoriales fuertes en una sola tool, porque
para el usuario son la misma pregunta (*«¿qué otras opciones tengo?»*):
- **Otros formatos del mismo producto** → `ListBrandProducts` ya trae las variantes de tamaño;
  comparadas por `precio_por_unidad_normalizada` producen el hallazgo *«el empaque grande sale más
  caro por libra»*, que es el patrón de contenido que más rompe creencias.
- **Sustitutos más baratos y parecidos** → los embeddings BGE-M3 ya poblados dan `score_similitud`;
  filtrado por la misma hoja de taxonomía, produce *«esto es 30% más barato y muy parecido»*.

  > Se mantienen como **una** tool y no dos a propósito: dos tools que responden la misma pregunta
  > del usuario son la receta para que el modelo elija mal (§9.3).

**5 · `cheapest_store_by_category`** — rompe la creencia más arraigada: *«no existe un único
supermercado más barato; cada uno gana en algo distinto»*. Es agregación sobre `ListCategoryProducts`,
que ya sabe filtrar por tienda y ordenar por precio unitario.

**6 · `monthly_cost`** — el territorio de **costo de vida**. Los grupos de `basket_query` incluyen
literalmente **`Bebé`**, `Limpieza`, `Higiene personal` y `Café`, así que *«cuánto cuesta mantener un
bebé al mes»* es la canasta de §7 acotada a un grupo y proyectada. **Reuso casi total.**

**7 · `worth_second_store`** — el Bloque 3 de §1.5, y **el diferenciador que nadie tiene**. Responde
la objeción más repetida de la audiencia (gasolina, tiempo, distancia) con aritmética sobre datos que
ya tenemos. Detalle en §7.6.

#### Las tools BLOQUEADAS por datos (no entran, y se documenta por qué)

| Tool | Por qué no |
|---|---|
| `price_history` | 1 snapshot → no hay serie |
| `list_deals` | Depende de bajadas → **devuelve vacío** |
| `list_price_drops` | Ídem |
| `whats_rising` / `anomaly_score` | Necesitan historial |

**Las cuatro entran solas** —sin trabajo de agente— en cuanto la ingesta acumule historial. Hasta
entonces, **no se exponen**: una tool que siempre responde «no hay nada» le enseña al modelo a
inventar y al usuario a desconfiar.

### 5.4 Flujos conversacionales — el agente pregunta, no adivina

Hasta acá el agente era **pregunta → respuesta** de un solo turno. Eso desperdicia infraestructura ya
construida y, sobre todo, **adivina donde debería preguntar** — que es justo lo que la audiencia
castiga (§1.4: señalan al instante una comparación que consideran injusta o incompleta).

**Todo lo de abajo es de solo lectura.** No muta nada; usa el canal de interacción para *elegir*, no
para *confirmar una escritura*.

#### Flujo A — Desambiguación con el dock ⭐ el de mayor retorno

```
Usuario:  "¿dónde está más barato el arroz?"
          ↓  el retrieval devuelve 14 arroces sin ganador claro
Agente:   "Tengo varios. ¿Cuál?"
          [ Arroz Campos 20Lb ] [ Arroz Bisonó 50Lb ] [ Arroz Selecto 10Lb ]   ← pills del dock
          ↓  el usuario toca una
Agente:   la comparación del producto EXACTO, con enlaces
```

**Por qué es el de mayor retorno:**

- **Reusa UI ya construida.** `DockInteractionView` en mobile ya renderiza `prompt` + `options` como
  pills o chips; `ChatDock` ya se abre solo cuando llega una `interaction`. **Cero UI nueva.**
- **Ataca el fallo más caro.** Una comparación del producto equivocado es exactamente lo que la
  audiencia detecta y castiga. Preguntar cuesta un turno; equivocarse cuesta la credibilidad.
- **Sube la precisión sin subir el modelo.** Es la alternativa barata al rerank: cuando el retrieval
  duda, decide el humano — 100% de acierto y cero tokens de razonamiento.

> ⚠️ **A verificar en su fase:** el motor de `flows/` se construyó para el registro de gastos
> (multi-step con escritura al final). Hay que confirmar que soporta un flujo **sin `commit`**, o
> usar el camino `pending_action` genérico. Si ninguno encaja limpio, **se dice y se replantea** — no
> se fuerza.

#### Flujo B — Revelación progresiva de la canasta

La canasta son ~20 líneas × 3 proveedores. Volcarlo entero es un muro de texto en el chat **y** un
gasto de tokens que casi nadie va a leer.

```
Agente:   "Con RD$10,000:
             Bravo      24 artículos · sobra RD$180
             Nacional   21 artículos · sobra RD$95
             Sirena     20 artículos · sobra RD$310
           Bravo te rinde 3 artículos más."
          [ Ver la lista de Bravo ]  [ Comparar con Nacional ]      ← pills
```

El detalle **solo se genera si lo piden**. Gana el usuario (titular primero) y gana el costo (§9.1:
salida compacta, nunca volcados).

#### Flujo C — Seguimiento elíptico (arreglar §9.6, no aceptarlo)

```
Usuario:  "¿dónde está más barato el arroz Campos?"     → groceries
Usuario:  "¿y el aceite?"                               → hoy cae en `general` ❌
```

**Intent pegajoso:** si el turno anterior fue `groceries` y el mensaje nuevo es corto o elíptico, se
**mantiene** el intent sin pagar clasificación. El estado ya lleva `intent`; es leerlo antes de
clasificar.

Gana en las tres dimensiones a la vez: **más preciso** (no se pierde el hilo), **más barato** (se
salta una llamada LLM) y **más rápido** (un salto menos antes del primer token).

> Requiere una guarda: un mensaje **largo y claramente de otro tema** rompe la pegajosidad. Si no,
> el agente secuestra la conversación — el defecto de la Fase 1 al revés.

#### Flujo D — Handoff cuando no le toca

*«¿cuánto gasté en el súper este mes?»* es **Insights**, no Save. El mecanismo `select_new_agent`
existe en `orchestration/handoff.py` pero **no está cableado**. Con el segundo agente de dominio
empieza a pagarse.

**Fuera de esta fase**, pero el `GroceriesAgent` debe al menos **reconocer que no le toca** y decirlo,
en vez de intentar responder con datos de catálogo.

### 5.5 La ley del agente

> **Cada número —precio, total, diferencia, precio por unidad— viaja de Postgres a la tool a la
> respuesta sin que el modelo lo toque.**

Reforzado estructuralmente: las tools devuelven **texto ya formateado** por `Money.format()`, nunca
enteros crudos que el modelo pueda «ayudar a redondear». El LLM elige *qué* tool y con qué
argumentos; jamás calcula.

---

## 6. Búsqueda híbrida

### 6.1 El problema

```python
# save/infrastructure/repositories.py — SqlCanonicalProductRepository.search()
CanonicalProductModel.name.ilike(f"%{query}%")
```

Sin trigram, sin ranking, sin `brand`, sin `description`, sin tolerancia a typos. *«arros»*,
*«arroz Rica»* o *«habichuela»* vs *«frijol»* devuelven **cero resultados**.

**Si esto no funciona, el agente no funciona** — todo lo demás depende de resolver «qué producto
quiso decir».

### 6.2 El diseño

```
query ──┬─► pg_trgm sobre name + brand ──┐
        │                                 ├─► RRF (k=60) ─► ¿ambiguo? ─┬─ no ─► top-5
        └─► pgvector BGE-M3 (ya poblado) ─┘                            └─ sí ─► rerank ─► top-5
```

1. **Léxico** — `pg_trgm`, patrón de `find_candidates_trgm`. Atrapa marca y tamaño exactos.
2. **Semántico** — pgvector sobre `canonical_product.embedding`. Atrapa paráfrasis y sinónimos.
3. **RRF** — `matching/cascade/fusion.py::reciprocal_rank_fusion`, ya existe.
4. **Rerank CONDICIONAL** — solo si el top-1 no gana con claridad. Si gana por paliza, se salta:
   ahorra latencia y costo.

### 6.3 El único refactor no-aditivo del plan

`reciprocal_rank_fusion` vive hoy bajo `infrastructure/matching/` — detalle interno de la cascada de
ingesta. Consumirlo desde la lectura pública cruzaría una frontera fea (**infra de ingesta →
aplicación de usuario**), y `lint-imports` existe justamente para que eso duela.

**Se eleva a `save/domain/rank_fusion.py`** — PURO, sin dependencias — y **ambos** caminos lo
consumen de ahí. Es el único cambio no-aditivo; todo lo demás suma sin mover nada.

### 6.4 ⚠️ La distinción que no se puede perder

| | Matching (ingesta) | Búsqueda (usuario) |
|---|---|---|
| Pregunta | ¿este `store_product` **es** este canónico? | ¿qué quiso decir el usuario? |
| Error caro | **Falso merge** → corrompe el catálogo | Ninguno grave |
| Postura | **Conservadora**: ante duda, a la cola humana | **Generosa**: un resultado de más no hace daño |

Comparten técnica; **no comparten umbrales ni gates**. Mezclarlos sería reintroducir los falsos
positivos que costó una campaña entera cerrar.

### 6.5 Degradación

Si `SAVE_BGE_M3_ENDPOINT_URL` no está desplegado, `build_api_embedder` ya devuelve `None` y el
retrieval cae a **trgm-only** sin romper. **Exige un test explícito** — si no, el día que el endpoint
se caiga la búsqueda empeora en silencio y nadie se entera.

### 6.6 Criterio de éxito

Set etiquetado de **~30 consultas dominicanas reales** (typos, sinónimos, marca+tamaño):

- **top-1 correcto ≥ 80%**
- **top-5 correcto ≥ 95%**

Se mide **antes** de escribir el agente. Si no llega, se ajusta acá — **nunca en el prompt**.

#### ✅ Resultado medido (2026-08-02, N=30)

Set en `apps/api/tests/save/fixtures/retrieval_queries.py`; se reproduce con **`make eval-retrieval`**.

| Configuración | top-1 | top-5 |
|---|---:|---:|
| Léxica sola (trgm) — la degradación de §6.5 | 86.7% | **93.3%** ❌ |
| Semántica sola (pgvector/BGE-M3) | 93.3% | 96.7% |
| **Híbrida (trgm + pgvector + RRF)** | **96.7%** ✅ | **96.7%** ✅ |

**Las dos metas se cumplen, y la ablación es lo que justifica el costo:** la híbrida le gana a las
dos etapas por separado, así que RRF y el embedder **se pagan**. Y al revés: **la léxica sola NO
llega al objetivo de top-5** — con `frijoles rojos` devuelve **lista vacía**. Ese es el precio
exacto de quedarse sin embedder, medido en vez de supuesto.

**Por eso NO se construyó el rerank condicional de §6.2.** El número llega sin él; construirlo
sería maquinaria sin evidencia. Queda anotado para cuando el catálogo crezca y el número baje.

> ⚠️ **Advertencia obligatoria al leer estos porcentajes.** El catálogo de dev es **monotemático**
> (93 de 133 canónicos son «Arroz, Granos & Legumbres»; **café = 0, carnes = 0, aceites = 1**), así
> que el Apéndice C.1 —que pedía sesgar el set hacia café, carnes, bebé y aceites— **no se pudo
> cumplir**. El número está **inflado** por un catálogo fácil y estrecho. Cuando la ingesta traiga
> las categorías que faltan, **este set hay que rehacerlo y el número de hoy no será comparable**.
>
> El único fallo real es `porotos negros` (término del Cono Sur, no dominicano) — ni trgm ni BGE-M3
> lo puentean a «habichuelas negras».

---

## 7. La canasta por presupuesto

### 7.1 Reuso clave — `basket_query` ya define «la compra del hogar»

La tabla `basket_query` (sembrada por la migración `0990d45c068a`) tiene **213 queries curadas en 20
grupos dominicanos**:

```
Granos y legumbres · Víveres · Aceites y grasas · Lácteos · Huevos · Panadería y galletas
Pastas · Salsas y condimentos · Café · Azúcar y endulzantes · Sal y especias
Enlatados y conservas · Embutidos · Carnes · Bebidas · Limpieza · Higiene personal
Bebé · Harinas y horneo · Cereales y avena
```

Con `category_label` (el grupo) y `position` (la prioridad). **No hay que inventar la lista ni
hardcodear una constante nueva**: existe, está versionada en una migración, es editable desde la
consola admin y está scopeada por mercado.

> **Nota.** Son *queries de texto*, no IDs de producto. Resolverlas a productos es exactamente lo que
> hace la búsqueda híbrida de §6 — de ahí la dependencia entre fases.

### 7.2 El algoritmo

```
para cada proveedor con datos:
    grupos ← basket_query del mercado, ordenados por `position`

    ronda 1 (COBERTURA):
        por cada grupo, el artículo más barato disponible EN ESE PROVEEDOR
        que quepa en el presupuesto restante

    ronda 2+ (SOBRANTE):
        repetir sobre los grupos ya cubiertos, con tope de unidades por ítem,
        hasta que no entre nada más

→ comparar los proveedores por grupos cubiertos y por artículos
```

### 7.3 Por qué NO es un problema de mochila NP-difícil

**Porque no buscamos el óptimo.** Buscamos una canasta **realista y explicable**.

Un óptimo de mochila sobre 133 productos maximizaría artículos por peso y devolvería *30 paquetes de
sal* — matemáticamente superior e **inútil para comprar**. La cobertura por prioridad es greedy,
`O(n log n)`, con bucles acotados, **determinista** y trivial de testear.

Esa elección es la que mantiene el resultado defendible ante el usuario: *«primero lo esencial, un
artículo por rubro, y con lo que sobra repetimos»* es una frase que una persona entiende y puede
auditar. «Maximicé el valor sujeto a restricción presupuestaria» no lo es.

### 7.4 Dónde vive

| Pieza | Ruta | Capa |
|---|---|---|
| `plan_basket(...)` | `save/domain/basket.py` | **PURA** — sin DB, testeable sola |
| `BudgetBasket` orquestador | `save/application/budget_basket.py` | aplicación |
| DTOs | `save/application/dtos.py` | aplicación |

Todo el dinero en **minor units enteros**. Cero float, en ninguna línea.

### 7.5 Casos borde con test obligatorio

| Caso | Comportamiento |
|---|---|
| El presupuesto no alcanza ni para un artículo | Decir cuánto falta para el primero. No devolver canasta vacía sin explicación |
| Un grupo sin oferta en ese proveedor | Omitirlo **explícitamente**. Jamás rellenar con otra cosa |
| Presupuesto cero o negativo | Error claro, no crash |
| Proveedor sin cobertura suficiente | Aparece en la comparación con menos grupos, no se oculta |

---

### 7.6 `worth_second_store` — ¿vale la pena el viaje?

Responde la objeción **más repetida** de la audiencia: gasolina, tiempo, distancia. El usuario no
optimiza por precio absoluto sino por **precio neto percibido y esfuerzo** (§1.4).

#### El truco de diseño: NO estimar el costo del viaje

La tentación es inventar un supuesto (*«asumiendo RD$150 de gasolina…»*). **Sería exactamente el tipo
de número inventado que este documento prohíbe** — no sabemos si el usuario tiene carro, moto,
guagua, ni a qué distancia vive.

**La solución es dar vuelta la pregunta y devolver el UMBRAL DE EQUILIBRIO:**

```
Comprando todo en Bravo:                    RD$9,820
Comprando en Bravo + Nacional (lo mejor):   RD$9,610
                                            ─────────
Ahorro bruto de la segunda parada:            RD$210
   … repartido en 3 productos

→ "Te conviene solo si llegar a Nacional te cuesta menos de RD$210
   entre transporte y tiempo. Eso lo sabés vos mejor que yo."
```

**Por qué es la forma correcta:**

- **Cero supuestos inventados.** El único número que damos es aritmética pura sobre precios reales.
- **Es una conclusión condicionada** en el sentido exacto de §8.4: *«conviene SI…»*, no *«conviene»*.
- **Respeta al usuario.** Él sabe su costo de traslado; nosotros sabemos los precios. Cada uno aporta
  lo que tiene.
- **Es honesto cuando el ahorro es ridículo**: si la segunda parada ahorra RD$18, el agente debe
  decir *«no vale la pena»* con todas las letras. **Un comparador que siempre empuja a comparar más
  pierde credibilidad**; uno que a veces dice «quedate donde estás» la gana.

**Dónde vive:** dominio PURO, junto a la canasta (`save/domain/basket.py`). Es una resta.

**Degradación:** con **20 canónicos comparables** hoy, muchas veces la respuesta será *«no tengo el
mismo producto en dos tiendas, así que no puedo calcularlo»*. Correcto y honesto.

---

### 7.7 `monthly_cost` — el costo de vida

*«¿Cuánto cuesta mantener un bebé al mes?»* es de los formatos más compartibles, y `basket_query`
tiene literalmente los grupos **`Bebé`**, `Limpieza`, `Higiene personal` y `Café`.

**Es la canasta de §7.2 acotada a un grupo.** Reuso casi total.

> ⚠️ **La trampa del «al mes».** Proyectar a un mes exige saber **cuántas unidades se consumen**, y
> eso no lo sabemos. Multiplicar por cuatro sería inventar un patrón de consumo.
>
> **Regla:** la tool devuelve el costo de **una canasta del grupo**, y declara explícitamente qué
> incluye. Si el usuario quiere la proyección mensual, **da él la frecuencia** y ahí sí se multiplica
> — porque entonces el supuesto es suyo, no nuestro.

---

## 8. Grounding anti-alucinación

### 8.1 La tabla de degradación honesta

Cada fila es un caso **real hoy**, no hipotético:

| Situación | Realidad medida | Comportamiento exigido |
|---|---|---|
| El retrieval no encuentra nada | Frecuente con 133 canónicos | *«No tengo ese producto en el catálogo»*. **Nunca inventar** |
| Producto en **una sola** tienda | **113 de 133** | *«Lo encontré en Sirena»* — **NO** *«Sirena tiene el mejor precio»* |
| Sin historial | **1 snapshot** | La tool no existe (§5.3). Sin superficie no hay alucinación |
| Producto sin tamaño | Recién permitido (PR #45) | Omitir el precio por unidad. **Nunca** imprimir `RD$0.00/kg` |
| Grupo sin oferta en la canasta | — | Decirlo explícitamente |
| Presupuesto insuficiente | — | Decir cuánto falta |

> El matiz de la segunda fila **no es cosmético**. Decir «tiene el mejor precio» cuando solo hay una
> opción es una afirmación comparativa falsa. El usuario la creería.

### 8.2 Citas obligatorias

Cada precio se muestra con:

- **`provider`** — de qué tienda salió
- **`captured_at`** — cuándo se capturó
- **`price_type`** — `online` / `delivery` / `shelf` / `receipt`
- **disclaimer**: es precio online y **puede variar en tienda**

Sin esto, el usuario no puede detectar que el dato está viejo o que es de otra modalidad.

### 8.3 Generación context-only

Regla dura, escrita en el system prompt (en inglés, como manda `cuadra-agent-prompts`):

> *Every price, URL, provider name and total you mention MUST come verbatim from a tool result.
> Never compute, estimate, convert or round a price yourself. If a tool returns no data, say so.*

### 8.4 Conclusiones CONDICIONADAS, nunca absolutas

Viene directo del comportamiento de la audiencia (§1.4): toleran muy bien una afirmación fuerte
**siempre que esté encuadrada**, y castigan de inmediato la que suena a verdad universal.

| ❌ Absoluto | ✅ Condicionado |
|---|---|
| «El arroz está más barato en Bravo» | «Entre las 3 tiendas que tengo, y al precio del 2 de agosto, el más barato es Bravo» |
| «Esta es la mejor opción» | «Es la más barata **por kilo** — no evalúo sabor ni calidad» |
| «Te conviene comprar el grande» | «El de 20 Lb sale más barato **por libra**; si no lo vas a consumir, el ahorro no es real» |

Las cuatro dimensiones que **siempre** deben quedar explícitas cuando el agente afirma algo
comparativo: **qué universo** (qué tiendas entraron), **qué período** (fecha del dato), **qué eje**
(precio absoluto o por unidad) y **qué NO evaluó** (calidad, sabor, frescura, cercanía).

> **Por qué importa más de lo que parece:** la audiencia detecta al instante una tienda omitida o un
> precio que no coincide con lo que vio esa semana. Un encuadre honesto convierte una limitación en
> credibilidad; una afirmación absoluta convierte la misma limitación en un error.

---

## 9. Rendimiento: costo, latencia y precisión

> Son **tres ejes distintos y en tensión**. El modelo más preciso suele ser el más caro y el más
> lento; el más barato suele fallar más. Este documento fija un objetivo para cada uno y **cómo se
> mide**, porque «va rápido» y «responde bien» no son afirmaciones auditables.

### 9.0 Los objetivos, juntos

| Eje | Objetivo | Se mide con |
|---|---|---|
| **Costo** | **< US$0.01** por interacción | LangSmith (tokens in/out por nodo) |
| **Latencia percibida (TTFT)** | **< 1 s** al primer token | LangSmith + medición en el cliente |
| **Latencia total** | **p95 < 4 s** end-to-end, sin STT | LangSmith |
| **Precisión de ruteo** | **≥ 95%** sobre el set de frases etiquetadas | Test de router |
| **Precisión de tool** | **≥ 90%** llama a la tool correcta | Trajectory eval |
| **Precisión de retrieval** | **top-1 ≥ 80%**, top-5 ≥ 95% | Set de ~30 consultas (§6.6) |
| **Faithfulness** | **≥ umbral, o no se publica** | RAGAS (§12.3) |

---

### 9.1 Costo — las palancas

| Palanca | Decisión |
|---|---|
| **Router** | Tier `fast` + **cortocircuitos deterministas antes del LLM**. Rutear no debe costar un modelo caro |
| **Supervisor** | ❌ **NO**. Mete una llamada LLM por turno solo para rutear (~3× tokens) |
| **Agente** | Tier `fast` por defecto. `smart` **solo si los evals lo prueban** |
| **Prompt caching** | System prompt + definiciones de tools son estables → lecturas a ~**0.1×** |
| **Salida de tools** | Texto compacto y **ya agregado**. Nunca volcados de filas |
| **Rerank** | **Condicional** — solo se paga ante ambigüedad real |

**El ruteo por costo es la palanca de mayor retorno documentada**: mandar el grueso del tráfico a un
modelo barato y reservar el caro para lo que de verdad razona produce recortes del **30-70%**, y las
cascadas agresivas (90% al barato) llegan a **~87%**. Nuestro router-a-nodos ya es esa cascada — la
disciplina es **no romperla** subiendo el agente a `smart` «por las dudas».

---

### 9.2 Latencia — el TTFT es lo que el usuario siente

**La métrica que importa no es el tiempo total, es el tiempo al primer token.** Con streaming, una
respuesta que tarda varios segundos en completarse puede empezar a aparecer en **menos de medio
segundo** — y la percepción del usuario la fija ese primer token, no el último.

#### ⚠️ La trampa de LangGraph que hay que verificar en la Fase 6

Un agente ReAct **dentro de un nodo** de un `StateGraph` **puede perder el streaming**: el grafo
espera a que el nodo termine y devuelve la respuesta completa en un solo bloque. El síntoma es que
el chat se queda mudo y después escupe todo junto.

Las dos causas habituales:

1. **Envoltorios síncronos bloqueantes** dentro del nodo — hay que ir por el camino asíncrono
   (`astream`) de punta a punta.
2. **Filtrado de metadata mal puesto**, que descarta los chunks del agente.

> ### ✅ RESUELTO 2026-08-02 — medido, arreglado y vuelto a medir
>
> El diagnóstico de abajo era correcto, y la causa raíz resultó **arreglable**. El experimento
> decisivo, contra el grafo real con LLM real:
>
> | Agente ReAct (`create_agent`) | chunks emitidos | TTFT | nodos que reporta |
> |---|---:|---:|---|
> | `graph.stream(...)` como estaba | **0** | — | `agent_run` |
> | `graph.stream(..., subgraphs=True)` | **22** | 1.63 s | **`model`, `tools`** ← los INTERNOS |
>
> Dos causas encadenadas, no una: (1) sin `subgraphs=True` los tokens del grafo anidado **no
> afloran**; (2) cuando afloran, llevan el nombre del nodo **interno**, así que la allowlist
> `langgraph_node == "agent_run"` los tiraba igual.
>
> **El arreglo** (`orchestration/sse.py`): `subgraphs=True` + mover la allowlist al **NAMESPACE**
> (`ns[0]` empieza con `agent_run:`), conservando el camino directo (`ns=()` + nodo `agent_run`)
> para un agente que llama al LLM dentro del nodo. Lo que debía callarse **sigue callado**: el
> clasificador emite texto de verdad (6 chunks de `{"intent":…}` medidos) y corre en el namespace
> raíz, igual que los LLM internos de un flow. Cuatro tests lo fijan.
>
> **Resultado medido (`make eval-perf`, N=3, FinanceAgent):**
>
> | | Antes | Después |
> |---|---:|---:|
> | TTFT p50 | 3.23 s | **1.79 s** |
> | Latencia total p95 | 3.24 s | 3.83 s ✅ (objetivo <4 s) |
> | Corridas que gotean | **0/3** | **3/3** |
>
> **Queda un hueco honesto:** TTFT 1.79 s todavía incumple el objetivo de <1 s. La causa ya no es
> el streaming sino lo que este mismo documento anticipaba — el agente **llama tools antes de
> generar texto**. Para cerrarlo hace falta otra palanca (texto puente antes de la tool, o tools
> más rápidas), no más streaming.
>
> **Corrección de una afirmación previa:** el `GeneralAgent` **sí** goteaba (24 chunks); una
> heurística demasiado estricta lo había reportado como «todo junto». El que no streameaba era
> exclusivamente el agente ReAct.
>
> ---
>
> 🔴 **DIAGNÓSTICO ORIGINAL (Fase 2).** Una
> versión previa de este documento afirmaba que *«el `FinanceAgent` streamea hoy»*. **Es falso, y el
> propio código lo documenta.** `sse.py` tiene un fallback `if not emitted:` cuyo comentario dice
> literalmente que un agente ReAct construido con `create_agent` corre un **grafo anidado** cuyos
> tokens **no afloran** en el loop de `stream_mode="messages"` — y que por eso hay que emitir el
> mensaje final **entero**. Hay una segunda razón independiente: aunque afloraran, esos chunks
> llevarían el nombre del nodo **interno**, así que la allowlist `langgraph_node == "agent_run"` los
> descartaría igual. El test `test_stream_emits_coach_message_then_interaction_then_done` codifica
> ese comportamiento.
>
> **Consecuencia para los objetivos de §9.0:** para un agente ReAct, **TTFT ≈ latencia total** — el
> chat se queda mudo y después escupe todo junto. El objetivo de *TTFT < 1 s* del `GroceriesAgent`
> **no lo regala la infraestructura existente**: o se mide y se acepta como riesgo, o exige trabajo
> real (emitir un texto puente antes de llamar a las tools, o sacar el agente del nodo). Se decide
> en la Fase 6 **con la medición en la mano**, no antes.

`orchestration/sse.py` ya usa `stream_mode="messages"` con allowlist por `langgraph_node`. **Hay que
medir el TTFT del `GroceriesAgent` explícitamente**, y además su `run()` hace llamadas a tools
**antes** de generar texto: si esas tools son lentas, el primer token llega todavía más tarde.

#### Las palancas de latencia

| Palanca | Aplicación acá |
|---|---|
| **Streaming** | Ya está. Es la que más mueve el TTFT |
| **Ruteo de modelo** | `fast` para todo por defecto |
| **Prompt caching** | Baja costo **y** latencia de prefill |
| **Cortocircuito del router** | Una consulta que se rutea por regex **no paga ninguna llamada LLM** |
| **Rerank condicional** | La segunda pasada solo cuando hace falta |
| **Tools rápidas** | Cada tool es **una** query indexada. Nada de N+1 |

> **Regla de diseño:** cualquier interacción de cara al usuario que pase de **2 segundos** debe
> mostrar progreso. Si una tool va a tardar, el agente debe emitir texto antes de llamarla.

---

### 9.3 Precisión — que elija bien, no solo que responda

La precisión de un agente con tools se rompe en **tres lugares distintos**, y cada uno se mide
aparte. Confundirlos es la razón típica por la que «el agente responde mal» y nadie sabe dónde tocar:

| Dónde falla | Síntoma | Se mide con |
|---|---|---|
| **Ruteo** | La consulta ni siquiera llega al agente | Test de router (Fase 1) |
| **Selección de tool** | Llega, pero llama a la tool equivocada | Trajectory eval (§12.2) |
| **Retrieval** | Tool correcta, producto equivocado | Set de ~30 consultas (§6.6) |
| **Redacción** | Todo correcto, pero el texto dice otra cosa | Faithfulness (§12.3) |

#### Por qué acá se pueden dejar todas las tools en contexto

Hay un resultado conocido: con catálogos **grandes** de tools, meterlas todas en el contexto baja la
precisión de selección **por debajo del 50%**, y hace falta una capa de ruteo semántico (búsqueda por
embeddings sobre las descripciones de tools) que la sube a **~86%**.

**Ese problema aparece a escala, y nosotros tenemos siete tools.** Con siete descripciones bien
escritas, todas en contexto sigue siendo lo correcto: más simple, más barato y sin una capa extra que
puede fallar sola.

> **Tripwire explícito — y ahora estamos más cerca de él.** Si el agente pasa de **~10 tools** o la
> precisión de selección cae por debajo del 90%, **esta decisión se revisa** y entra ruteo semántico
> de tools. Con siete quedan **tres de margen**: cada tool nueva que se proponga tiene que justificar
> por qué no es un parámetro de una existente.
>
> Ese criterio ya se aplicó una vez: *«otros tamaños»* y *«sustitutos parecidos»* iban a ser dos
> tools y se fusionaron en `explore_alternatives`, porque para el usuario son **la misma pregunta**
> (*«¿qué otras opciones tengo?»*) — y dos tools que responden lo mismo son la receta para que el
> modelo elija mal.

#### Las palancas de precisión

1. **Docstrings de tools bien escritos.** Son el prompt que decide la selección. Cada uno debe decir
   **cuándo usar la tool y cuándo NO** — el error típico es describir qué hace y omitir cuándo no
   aplica.
2. **Structured output en el router** (ya está): `Literal` + Pydantic hace imposible un intent
   inválido. El tipo cierra la puerta que el prompt solo pediría amablemente.
3. **Contexto acotado.** Menos contexto y mejor elegido rinde más que más contexto: el trabajo de
   *context engineering* muestra saltos de fiabilidad enormes al recortar y ordenar lo que entra.
   Concretamente acá: las tools devuelven **top-5 compacto**, no la tabla entera.
4. **Ejemplos de frontera en el prompt del clasificador** — sobre todo `groceries` vs
   `register_expense`, que es el par confundible (§13, riesgo 5).
5. **Cortocircuitos deterministas** donde el lenguaje es inequívoco: **100% de precisión y costo
   cero**. Pero con la lección de la Fase 1 grabada: **un patrón que matchea dos intenciones no
   discrimina ninguna.**

---

### 9.4 Cómo se mide (y cuándo)

No es opcional ni «cuando haya tiempo»: sin esto, las tres tablas de arriba son deseos.

> ⚠️ **LangSmith NO se puede usar (verificado 2026-08-02): la cuenta responde `429 — Monthly
> unique traces usage limit exceeded`.** Además de no trazar, inunda la salida de `pytest`
> (workaround: `LANGSMITH_TRACING=false`). Para que eso no bloqueara la fase se construyó
> **`apps/api/evals/agent_perf.py`** (`make eval-perf`), que mide TTFT y latencia total **desde el
> propio camino SSE** — que además es donde el usuario SIENTE la latencia. Es el harness con el que
> se midió y se validó el arreglo de [§9.2](#92-latencia--el-ttft-es-lo-que-el-usuario-siente).
> El **costo por interacción** sigue pendiente: eso sí necesita la traza del proveedor o la factura.

- **LangSmith ya está en el stack** — da trazas con **tokens, costo y latencia por nodo**. Eso
  responde «¿dónde se fue el tiempo?» sin instrumentar a mano.
- **Se mide al cerrar la Fase 6** (el agente ya responde end-to-end) sobre las 5 preguntas guía de
  §1.2, **N=20 corridas**, y se reporta: costo/interacción, TTFT p50/p95, latencia total p50/p95.
- **Si un objetivo no se cumple, se documenta como riesgo** — no se ajusta el objetivo para que dé.

---

### 9.5 Por qué NO supervisor, en concreto

Con tres agentes (Finance, General, Groceries), el router de dos capas resuelve el ruteo en **una
llamada barata con structured output**. Un supervisor LLM añadiría una llamada completa por turno sin
mejorar la precisión de un clasificador de 3-4 clases, y complicaría un grafo que hoy es lineal y
testeable de forma determinista con fakes.

El patrón ya escala por **registry**: añadir un agente es una entrada en una lista.

### 9.6 ⚠️ Limitación conocida del multi-turno

El clasificador solo ve **el último mensaje humano** (`router.py`: `text = state["messages"][-1].content`).
Un seguimiento elíptico —*«¿y el aceite?»* después de hablar de precios— puede caer en `general`
porque, aislado, no parece una consulta de supermercado.

**En v1 se documenta y se acepta** (el usuario reformula). El arreglo —pasar también el último turno
del asistente al clasificador— queda anotado como mejora, no como bloqueante.

---

## 10. Fases de implementación

> Ordenadas por **riesgo**, no por comodidad: lo que puede invalidar el diseño va primero.
>
> ⛔ **TODAS las fases terminan igual:** verificación → reporte → **preguntar si commitear** → esperar.
> Ver [§0.3](#03--protocolo-de-fases--parar-y-preguntar). No se encadenan fases.

### Fase 1 — Desbloquear el router ⚠️ BLOQUEANTE

**El cortocircuito determinista secuestra la feature estrella.** En `orchestration/router.py`:

```python
_EXPENSE_RE = re.compile(r"\b(gast|gaste|gasté|pagu|pagué|compr)", re.IGNORECASE)
if _EXPENSE_RE.search(text) and any(c.isdigit() for c in text):
    return {"intent": "register_expense"}       # ← sin pasar por el clasificador
```

**Medido** contra las frases reales:

| Frase | Hoy |
|---|---|
| «con RD$10,000 qué me alcanza para **la compra** del hogar» | **SECUESTRADA** → `register_expense` |
| «quiero **comprar** 2 libras de pollo, cuál está más barato» | **SECUESTRADA** |
| «armame **la compra** del mes con 5000 pesos» | **SECUESTRADA** |
| «¿dónde está más barato el arroz Rica?» | pasa ✅ |

Es **el mismo defecto** que el token `arroz` en el léxico de categorías: **`compr` nombra dos
intenciones opuestas** — «compré» (registrar un gasto pasado) y «compra/comprar» (ir al súper). Un
token que matchea dos clases no discrimina ninguna.

**Arreglo:** sacar `compr` del cortocircuito. Los verbos `gast|pagu` casi nunca aparecen en una
pregunta de precio, así que el cortocircuito sigue haciendo aquello para lo que fue diseñado, y el
clasificador LLM —que sí distingue tiempo verbal y contexto— resuelve el resto.

**✅ Éxito:** test de regresión con las 4 frases + «gasté 500 en gasolina» sigue en `register_expense`.

---

### Fase 2 — Documentación y reglas

- **Este documento.**
- **`.claude/skills/cuadra-aispace/SKILL.md`** — skill NUEVA. Codifica: el contrato `AgentSpec`, el
  patrón de tools por closure, la regla anti-IDOR, la allowlist del SSE, cómo se registra un intent,
  y los gotchas de LangGraph (reducers que sobreescriben, `thread_id` obligatorio, `interrupt()` sin
  checkpointer).
- **Actualizar `arquitectura-mvp.md`** §7.1 (Purchases→Groceries) y §16 (desactualizado: dice que
  AISpace no se inició).

**✅ Éxito:** los tres documentos existen; la skill pasa su propio criterio de calidad.

**Hecho (2026-08-02).** Además de lo previsto, la fase produjo **cuatro correcciones al plan** que
salieron de leer el código en vez de confiar en el documento:

1. **§9.2 — el `FinanceAgent` NO streamea.** El plan lo daba por hecho; el código lo desmiente.
   Para un agente ReAct, **TTFT ≈ latencia total**. Afecta un objetivo de §9.0.
2. **§4.3.1 — multi-idioma.** El ejemplo hardcodeaba `"Comprar en Bravo"` en español; Cuadra es
   **es / en / pt-BR**. Añadida la tabla de los dos canales de texto y la regla 8 de §11.1.
3. **Riesgo #7 — `basket_query` NO está vacía** (213 filas medidas). El prerrequisito de la Fase 4
   ya estaba cumplido.
4. **§2.3 — sí existe un harness de evals** (`make eval`); lo que falta es *faithfulness*.

También se corrigió el docstring de `orchestration/state.py`, que afirmaba que `ui_actions` usa el
reducer `add` cuando el campo es **overwrite** — la clase no tiene `Annotated`. Un docstring que
miente sobre su propio reducer es exactamente el bug #1 de LangGraph esperando a ocurrir.

---

### Fase 3 — Búsqueda híbrida

Todo el §6. Incluye el refactor de `rank_fusion` al dominio.

**✅ Éxito:** top-1 ≥ 80%, top-5 ≥ 95% sobre las ~30 consultas etiquetadas. Test explícito de
degradación sin embedder.

**Hecho (2026-08-02) — con dos bloqueos que hubo que resolver primero:**

1. 🔴 **El índice semántico estaba VACÍO.** §2.2 afirmaba que el `Vector(1024)` estaba «ya
   poblado»: eran **0 de 133**. Se corrió el backfill (`EmbedCanonicalProducts` + BGE-M3
   in-process) → **133/133 en 16.6 s**. Sin ese paso, la Fase 3 **no cumplía** su propio objetivo:
   la léxica sola se queda en 93.3% de top-5.
2. 🔴 **El set del Apéndice C.1 era inconstruible** (café = 0, carnes = 0 en el catálogo). Se
   rehízo contra el catálogo real, con la advertencia escrita en el propio fixture.

Resultado: **top-1 96.7% · top-5 96.7%** (tabla y ablación en [§6.6](#66-criterio-de-éxito)).

**Bug preexistente encontrado y arreglado en el camino:** un canónico **sin tamaño** se guardaba
bien y **reventaba al leerlo** (`UnitMeasure(None)`). La base ya tenía las columnas nullable
(PR #45), pero `models.py` decía `nullable=False` —desfase que habría hecho que el próximo
`autogenerate` propusiera volver a NOT NULL sobre NULLs legítimos— y el mapper no toleraba NULL.
Cero filas así en dev, por eso nadie lo vio; pero **§8.1 cuenta con que existan**.

---

### Fase 4 — La canasta por presupuesto

Todo el §7.

> ✅ **Prerrequisito de datos — CUMPLIDO (medido 2026-08-02).** `basket_query` **no está vacía**:
> tiene las **213 filas** repartidas en los 20 grupos. El aviso anterior era incorrecto. Lo único
> real es la deriva descrita en el riesgo #7 (1 fila con `category_label` NULL), que hay que decidir
> si se limpia o si la canasta la tolera.

**✅ Éxito:** por proveedor, `{items, total_minor, remaining_minor, groups_covered}` con la suma
verificada en entero y los 4 casos borde de §7.5 cubiertos con test. **Incluye `worth_second_store`
(§7.6) y `monthly_cost` (§7.7)** — las tres piezas viven en el mismo dominio puro y se testean sin DB.

**Hecho (2026-08-02).** `domain/basket.py` (puro) + `application/budget_basket.py` + puerto y
adapter. Contra la base real, el ganador **cambia con el presupuesto** — que es justo lo que hace
interesante a la feature: RD$1,000 → Nacional (6 rubros) · RD$5,000 → Sirena (20 rubros, 32
artículos) · RD$10,000 → Sirena (60 artículos).

Dos decisiones que conviene no re-litigar:

- **Las 213 queries se resuelven en UNA query SQL**, no llamando a la búsqueda 213 veces (serían
  213 llamadas al embedder por request).
- **`groups_unavailable` y `groups_unaffordable` se reportan por SEPARADO.** «La tienda no lo
  vende» y «no te alcanzó» son hechos distintos para quien compra.
- **`project_recurring_cost` no tiene default de frecuencia.** Un default sería un supuesto de
  consumo disfrazado de dato.

#### ⚠️ El defecto que la corrida contra datos reales destapó — y cómo se cerró

La resolución por similitud de NOMBRE atribuía productos al rubro equivocado:

```
[Aceites y grasas]    Atún En ACEITE Calvo      ← word_similarity = 1.0, y es atún
[Huevos]              Spaghetti Rica
[Granos y legumbres]  GALLETA CLAS INTEGRAL     ← 10 galletas entraron como granos
[Carnes]              2 compotas de bebé · 2 alimentos para perro · 2 platos preparados
```

**Es el mismo defecto que `compr` en el router y `arroz` en el léxico, por TERCERA vez**: un token
que aplica a dos cosas distintas no discrimina ninguna. Y subir el piso **no** lo arregla — «Aceite»
es palabra entera dentro de «Atún En Aceite», así que su 1.0 es legítimo.

En la canasta duele más que en la búsqueda: allí un resultado de más no hace daño; acá el producto
mal atribuido **ocupa el lugar del rubro y desplaza al correcto**, que es exactamente lo que §8.1
prohíbe.

**Solución (`domain/basket_taxonomy.py`): el nombre PROPONE, la taxonomía DISPONE.** Un producto
entra en un rubro sólo si su hoja —o algún ancestro— está en el conjunto curado de ese rubro. Los
dos vocabularios no mapean 1:1 (20 rubros contra 17 raíces / 138 hojas), así que el puente es una
tabla curada **derivada de medir** qué hojas caían en cada rubro. Un rubro sin mapeo **no
desaparece**: degrada al comportamiento anterior.

Efecto secundario: la segunda tensión se cerró sola. Antes, a RD$10,000 los tres gastaban ~RD$7,000
y sobraban ~RD$3,000; con los productos correctos —más caros y reales— ahora gastan RD$9,760-9,943.

Test explícito del umbral de equilibrio: dado un ahorro bruto conocido, la respuesta debe ser un
**umbral condicionado**, nunca una recomendación absoluta.

---

### Fase 5 — Las tools

Las **siete** tools de §5.3, cada una con su test.

> ⛔ **Antes de escribir cada tool: auditarla contra la base.** Es la lección de §5.2 — `list_deals`
> y `list_price_drops` existen en el código y devuelven **vacío** con los datos de hoy. Una tool que
> no tiene datos **no entra al catálogo**.

**✅ Éxito:** las 7 devuelven datos reales de la base (ninguna vacía por falta de datos); ninguna
acepta `market_id` desde el LLM; el vocabulario de KPIs de §1.5 se respeta **con esos nombres**.

---

### Fase 6 — El agente, el router y los flujos

- `agents/groceries/agent.py` implementando `AgentSpec`, con `create_agent` (ReAct). `commit()` es
  **no-op** y **no existe ninguna tool de escritura** — esa es la garantía de no-mutación (§4.2), no
  el camino que tome el grafo.
- Router: `groceries` en el `Literal` de `_IntentOut` y en `_CLASSIFY_PROMPT`, con **2-3 ejemplos de
  frontera** contra `register_expense`.
- Registry: una entrada más. **`graph.py` NO se toca.**
- **Los flujos conversacionales de §5.4**, en orden de retorno:
  **A** desambiguación con el dock ⭐ · **C** intent pegajoso · **B** revelación progresiva ·
  **D** reconocer que no le toca.

> ⚠️ El flujo **A** exige verificar **primero** que el motor de `flows/` soporte un flujo **sin
> `commit`** (se construyó para el registro de gastos, que escribe al final). Si no encaja limpio,
> **se reporta y se replantea** — no se fuerza. El flujo **C** necesita su guarda: un mensaje largo y
> claramente de otro tema debe **romper** la pegajosidad, o el agente secuestra la conversación —
> el defecto de la Fase 1 al revés.

**✅ Éxito:** las 5 preguntas guía de §1.2 llegan al agente y responden con datos reales — **y se
corre la medición de rendimiento de [§9.4](#94-cómo-se-mide-y-cuándo)** (N=20): costo/interacción,
TTFT p50/p95 y latencia total p50/p95, contrastados contra los objetivos de §9.0. Un objetivo que no
se cumple **se reporta como riesgo**, no se relaja.

---

### Fase 7 — Grounding

Todo el §8, cada fila de la tabla con su test.

**✅ Éxito:** los 6 casos de degradación responden honestamente; ninguno inventa.

---

### Fase 8 — Tests y evals

Todo el §12.

**✅ Éxito:** el runner de faithfulness corre verde sobre el dataset.

---

### Fase 9 — Mobile (Expo)

**Ya existe** (no se reconstruye): SSE con `expo/fetch`, dock de interacciones con pills/chips,
frames `link`, `formatMoney`, y soporte de **N links por turno**.

**El bug a arreglar:** `features/aispace/components/agent-message.tsx` hace `router.push(href)`
**siempre** — funciona para `/insights` pero **rompe con una URL externa** como
`https://sirena.do/...`. Además **no hay un solo uso de `Linking` ni `expo-web-browser` en toda la
app**.

Arreglo acotado (~10 líneas): si el `href` empieza con `http`, `Linking.openURL`; si es relativo,
`router.push`.

**Decisión abierta:** burbujas de link (lo que el contrato ya soporta, cero riesgo) vs. tarjeta de
producto rica. **Recomendación: burbujas para la v1** — ya cumple el requisito de enlaces sin
construir UI nueva.

**✅ Éxito:** tap en un enlace de tienda abre el navegador. Verificación visual por `cuadra-ui-verify`
en ambos temas antes de decir «listo».

---

## 11. Reglas de skills

> **Obligatorio.** Cargar la skill **antes** de escribir código del área, no después.

| Al tocar… | Cargar |
|---|---|
| Cualquier cosa bajo `apps/api` | **`cuadra-api`** |
| Un agente, intent, tool, flujo HITL, el router, el SSE o el estado del grafo | **`cuadra-aispace`** |
| Dominio, casos de uso o endpoints de Save | **`cuadra-save`** |
| Prompts, docstrings de tools, prompt del clasificador | **`cuadra-agent-prompts`** |
| Grafos, nodos, checkpointer, streaming, interrupts | **`langgraph`** |
| El léxico o la taxonomía de categorías | **`cuadra-save-vocabulary`** |
| La cascada de matching (si se toca al elevar `rank_fusion`) | **`cuadra-save-matching`** |
| Cualquier cosa bajo `apps/mobile` | **`cuadra-mobile`** + **`cuadra-mobile-testing`** |
| Antes de decir «listo» sobre cualquier cambio visual | **`cuadra-ui-verify`** |
| Ramas, PR, merge | **`cuadra-git-workflow`** |

### 11.1 Las reglas que más se violan, explícitas

1. **Instrucciones en INGLÉS, respuesta en el idioma del usuario.** Todo lo que **lee el modelo**
   (system prompts, docstrings de tools, prompt del clasificador) va en inglés: mejor adherencia,
   −24% tokens, estable multi-turno. El **output** va en el idioma del usuario, inyectado como valor
   concreto. *Idioma del prompt ≠ idioma del output.*
2. **TDD estricto**: RED → GREEN → REFACTOR. El test se escribe primero, siempre.
3. **El dominio es PURO.** `save/domain/basket.py` y `save/domain/rank_fusion.py` no importan
   infraestructura. `lint-imports` lo verifica (ADR 31/33).
4. **Dinero en minor units enteros.** Nunca float, en ninguna capa.
5. **`user_id` nunca es parámetro visible al LLM** — se liga por closure (anti-IDOR §12.1).
6. **Nunca commitear ni pushear** sin que el usuario lo pida explícitamente en el turno actual.
   Al cerrar cada fase se **para y se pregunta** — ver [§0.3](#03--protocolo-de-fases--parar-y-preguntar).
7. **Comentarios de código CORTOS.** Explican el *porqué*, no el *qué*.
8. **Cuadra es es / en / pt-BR.** Ningún string de cara al usuario se hardcodea en español — ni el
   texto de un enlace, ni un prompt del dock, ni un mensaje de «no encontré nada». Van al catálogo
   `shared/i18n` con las **tres** entradas y se resuelven con `t(key, ui_language)`. El texto que
   genera el LLM se localiza por el prompt (`language`); el chrome, por el catálogo (`ui_language`).
   Ver [§4.3.1](#431--cuadra-es-esenpt--y-el-enlace-es-chrome-no-charla).

---

## 12. Tests y evals

### 12.1 La pirámide

| Nivel | Qué cubre | Cómo |
|---|---|---|
| **Unit sin LLM** | Dominio de la canasta, `rank_fusion`, mecánica del grafo | Puros sin DB; agentes fake + `MemorySaver()` (patrón `tests/aispace/unit/test_graph.py`) |
| **Unit con modelo fake** | Prompt, idioma, tools ofrecidas | `FakeModel` con `.invoke()`, inyectado por el parámetro `model=` |
| **Integración con DB** | Las tools contra datos reales | Fixture `db_session`, sin LLM |
| **Integración con LLM real** | Elección de tool y redacción | `pytest.mark.skipif(not settings.*_api_key)` |
| **Evals** | Faithfulness y trayectoria | Runner aparte |

### 12.2 Trajectory eval — evaluar el CAMINO, no solo la respuesta

Un agente puede dar una respuesta que suena bien habiendo llegado por el camino equivocado. Eso no lo
detecta ningún test de contenido, y es el fallo típico de los agentes con tools. Las cuatro
dimensiones que se miden sobre la traza:

| Dimensión | Pregunta |
|---|---|
| **Selección de tool** | ¿Llamó a la correcta? (`compare_prices` vs `search_groceries`) |
| **Calidad del plan** | ¿La secuencia tenía sentido, o dio vueltas? |
| **Fidelidad por paso** | ¿Cada paso se apoyó en lo que devolvió el anterior? |
| **Completitud** | ¿Resolvió lo que el usuario pidió, o respondió otra cosa? |

La primera es la que tiene **objetivo numérico** (≥ 90%, §9.0); las otras tres se revisan sobre las
trazas de LangSmith cuando algo falla, para saber **dónde** falló.

### 12.3 El gate de faithfulness

**No existe scaffolding hoy** — cero referencias a `ragas` en el repo; `observability.py` es tracing
genérico, no evals. Es trabajo nuevo:

1. Dataset de ~15-20 preguntas en `tests/aispace/evals/`.
2. Runner que invoca el grafo real y compara **el texto de la respuesta contra el output crudo de las
   tools** (el «contexto» es literal, no recuperado — encaja bien con RAGAS).
3. **Gate:** si `faithfulness < umbral`, falla.

> **Por qué es el test más importante del proyecto:** un precio inventado en una app de finanzas no
> es un bug cosmético, es la destrucción de la confianza que constituye el producto.

**Decisión abierta:** ¿entra a CI obligatorio de PRs o corre aparte (nocturno/manual) por costo de
LLM? *Recomendación: aparte.*

---

## 13. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **El cortocircuito del router** secuestra la feature estrella | Fase 1, verificado con evidencia |
| 2 | **El catálogo es delgado** — 133 canónicos, 20 comparables, cero historial | **No lo resuelve este plan.** Es dependencia de ingesta. El §8 lo vuelve honesto en vez de vergonzoso |
| 3 | **La búsqueda no llega al umbral** | Fase temprana con número que cumplir antes de escribir el agente |
| 4 | **Precio alucinado** — el peor bug posible | Tools fijas por construcción + gate de faithfulness |
| 5 | `groceries` vs `register_expense` en frases mixtas («gasté 500 comprando arroz») | Ejemplos de frontera en el prompt + tests de router |
| 6 | La canasta depende de resolver 213 queries | Se mide con las 213 reales, no con una muestra |
| 7 | ~~**`basket_query` vacía en la base local**~~ | ❌ **DESCARTADO — medido 2026-08-02 (Fase 1)**: la tabla tiene las **213 filas** en 20 grupos. No hay nada que reponer. Sí hay **deriva**: 1 fila con `category_label` NULL y filas semilla editadas desde la consola (`arroz la garza` → `arroz`), que es lo que hace fallar `test_backfill_populated_do_basket_queries` — un test que assertea contenido semilla exacto sobre una tabla que el admin puede editar |
| 8 | `SAVE_MARKET` hardcodeado a `"DO"` | No es regresión de este plan (todo Save es así). Documentado |

---

## 14. Verificación end-to-end

1. `uv run pytest tests` — sin regresiones sobre las **1995** actuales.
2. `uv run ruff check src tests` · `uv run mypy src` · `uv run lint-imports`
   — el dominio de la canasta y `rank_fusion` deben seguir **puros**.
3. **Retrieval:** script sobre las ~30 consultas etiquetadas → tabla top-1 / top-5.
4. **Canasta:** `basket_for_budget(1_000_000, "DO")` contra la base real; verificar **a mano** que la
   canasta es comprable y que los totales cierran en entero.
5. **Chat real:** `POST /v1/aispace/chat/stream` con las 5 preguntas de §1.2. **Cada número debe
   aparecer en la traza de la tool ANTES que en el texto.**
6. **Mobile:** correr la app, mismas preguntas, tap en un enlace de tienda abre el navegador.
   Captura + `cuadra-ui-verify` en ambos temas.
7. **Evals:** RAGAS faithfulness sobre el dataset; no pasa si baja del umbral.

---

## 15. Abierto y futuro

### 15.1 Decisiones pendientes del usuario

- **¿El flujo de desambiguación (§5.4·A) entra en esta fase o en la siguiente?** Es el de mayor
  retorno de los cuatro flujos y reusa UI ya construida, pero **hay que verificar que el motor de
  `flows/` soporte un flujo sin `commit`** — se construyó para el registro de gastos. Si no encaja
  limpio, agrega trabajo que no estaba previsto.

- **Mobile:** ¿burbujas de link o tarjeta de producto rica? *Recomendación: burbujas para v1.*
- **Gate de faithfulness:** ¿CI obligatorio o runner aparte? *Recomendación: aparte.*
- **Escritura con HITL** (guardar lista, crear alerta): se decide **al terminar** esta fase. El
  dominio `ShoppingList` **no existe** y habría que construirlo entero (entidad, tabla, migración,
  casos de uso) antes de que el agente pueda usarlo.

### 15.2 Lo que este agente habilita después

- **«¿Vale la pena ir a la segunda tienda?»** — el Bloque 3 de §1.5. Responde la objeción **más
  repetida** de la audiencia (gasolina, tiempo, distancia) y es **aritmética sobre datos que ya
  tenemos** más un supuesto de costo de traslado. Es el candidato más obvio para la fase siguiente:
  bajo costo de construcción, y **nadie en el mercado lo ofrece**.
- **Todo el territorio de inflación y alertas** («qué subió esta semana», mediana histórica,
  variación 7/30/90 días) — desbloqueado en el momento en que la ingesta acumule historial. **No
  requiere trabajo de agente**, solo que el reloj arranque.

- **`CoachAgent` y el fan-out del triángulo.** Cuando la pregunta cruza *tu gasto* × *precios de
  mercado* (*«esa compra costaba RD$450 menos en Bravo»*), el patrón es `Send` a Insights **y** a
  Save en paralelo, con nodo de síntesis y reducer `operator.add`. **Este agente es la mitad Save de
  ese fan-out.**
- **`select_new_agent` (handoff).** El mecanismo está diseñado en `orchestration/handoff.py` pero
  **no cableado**. Con dos agentes de dominio empieza a pagarse: todo clasificador se equivoca, y el
  handoff evita que una mala clasificación obligue al usuario a reempezar.
- **Los hermanos de Save** — tarjetas de crédito, préstamos, seguros, promociones, inversión. Mismo
  patrón, otra vertical, con la regla de nomenclatura de §3.3 y la disciplina de reuso de
  [§4.4](#44--groceriesagent-es-el-primero-de-una-familia-no-una-pieza-suelta). **Cada uno debería
  costar una fracción de este**, porque la búsqueda híbrida, la fusión, la comparación, el patrón de
  tools y las reglas de grounding ya van a estar construidas y compartidas.

> **La medida de éxito real de este trabajo** no es que el `GroceriesAgent` funcione: es que el
> segundo agente de Save se construya en una fracción del tiempo, reusando todo salvo su dominio.

---

---

## Apéndice A — Entorno y comandos

> Todo lo de acá se verificó ejecutándolo. Los tres primeros puntos son **gotchas que cuestan una
> hora** si se descubren solos.

### A.1 Puertos FIJOS del entorno

| Servicio | Puerto |
|---|---:|
| web (Vike) | **3006** — nunca 3000 |
| api (FastAPI) | **8005** |
| metro (Expo) | **8087** |
| postgres | **5433** |

### A.2 ⚠️ Gotchas del entorno

1. **Nunca leer `.env` directo** (hay regla que lo deniega). Para inspeccionar configuración, CORS,
   URLs o proveedor de LLM: **`scripts/env-doctor.sh`**.
2. **`CORS_ORIGINS` fantasma.** Si está exportada en la shell (apuntando a `:3000`), rompe el
   preflight del web. `dev-up.sh` se protege solo, pero un API levantado a mano **no**. Ante un error
   de CORS inexplicable: `unset CORS_ORIGINS`.
3. **`uv` resuelve el venv por el CWD.** Hay que correr desde `apps/api`, no desde la raíz:

```bash
cd apps/api && uv run pytest tests -q
```

### A.3 Comandos de la fase

```bash
# Tests (desde apps/api)
uv run pytest tests -q                       # suite completa — piso: 1995 verdes
uv run pytest tests/aispace -q               # solo AISpace
uv run pytest tests/save/unit -q             # dominio de Save

# Calidad — los tres deben pasar antes de commitear
uv run ruff check src tests
uv run mypy src
uv run lint-imports                          # el dominio debe seguir PURO

# Script de medición contra la base real (retrieval, canasta)
cd apps/api && PYTHONPATH=$PWD uv run python /ruta/absoluta/al/script.py
```

> ⚠️ **En un script de medición, una query fallida ABORTA la transacción de SQLAlchemy** — los
> `SELECT` siguientes fallan en cascada con `InFailedSqlTransaction`. Envolver cada uno o usar
> sesiones separadas.

### A.4 Proveedor de LLM en dev

`LLM_PROVIDER=openai` → tier `fast` = **gpt-4o-mini**, tier `smart` = **gpt-4o**.
En producción cambia a `anthropic` (`claude-haiku-4-5` / `claude-sonnet-4-6`).

> El nombre de clase `ClaudeJudge` **es engañoso en dev**: corre gpt-4o.

---

## Apéndice B — Contratos concretos

### B.1 Frames SSE (`orchestration/sse.py`)

Lo que el cliente recibe. **No cambia en esta fase.**

```jsonc
{"type": "token",       "content": "..."}                    // token a token
{"type": "interaction", "interaction": {...}}                // HITL (no aplica a este agente)
{"type": "link",        "text": "<localizado es/en/pt vía t()>",
                        "href": "https://..."}               // ← el canal de los enlaces
{"type": "done",        "thread_id": "..."}                  // cierre
```

Los `link` salen de `state["ui_actions"]` filtrando `type == "link"`. **Pueden ser varios por turno.**

### B.2 `ComparedPriceDto` — la fila de la tabla comparativa

```python
provider_id: str
provider_name: str
price_minor: int
currency: str
unit_price_minor: int | None   # None si el producto no declara cantidad
unit_measure: str | None       # "mass" | "volume" | "count"
is_cheapest: bool
extra_minor: int               # sobreprecio vs la más barata
url: str | None = None         # ← el enlace a la tienda
```

> `unit_price_minor` y `unit_measure` son `None` desde el PR #45 (canónicos sin tamaño). **La tool
> debe omitir la línea de precio por unidad**, nunca imprimir `RD$0.00/kg`.

### B.3 Intents existentes en el router

```python
Literal["register_expense", "query_metrics", "general"]   # router.py:36
```

Se le suma **`"groceries"`**. Los tres actuales **no se tocan**.

---

## Apéndice C — Artefactos a crear

### C.1 El set etiquetado de retrieval (Fase 3)

Es el **gate** de la fase: sin él no hay forma de saber si la búsqueda sirve. ~30 consultas con su
`canonical_product` esperado, cubriendo los cinco modos de fallo:

| Modo de fallo | Ejemplos semilla |
|---|---|
| **Typo** | `arros`, `asucar`, `abichuela`, `aseite` |
| **Sinónimo regional** | `habichuela` ↔ `frijol`, `guineo` ↔ `banana`, `víveres` |
| **Marca + producto** | `arroz Rica`, `aceite Crisol`, `habichuelas La Famosa` |
| **Producto + tamaño** | `arroz 20 libras`, `aceite 1 galón` |
| **Descripción difusa** | `algo para sofreír`, `qué le echo al arroz` |

**Sesgado hacia las categorías que activan debate** (§1.5): café, carnes, bebé, aceites y marcas
blancas. No se distribuye parejo entre las 20 categorías — se concentra donde el agente va a ser
puesto a prueba de verdad.

Vive en `apps/api/tests/save/fixtures/` y se mide con un script del scratchpad, **no** con un test
(el umbral es una medición de calidad, no una aserción binaria).

### C.2 Esqueleto de la skill `cuadra-aispace`

Secciones mínimas que debe cubrir:

1. **El contrato `AgentSpec`** — `intents` / `run` / `commit`, y qué significa devolver
   `pending_action`.
2. **El patrón de tools por closure** — y por qué `user_id` **nunca** es parámetro visible al LLM.
3. **Cómo se registra un intent nuevo** — los 3 puntos de contacto (`registry`, `_IntentOut`,
   `_CLASSIFY_PROMPT`) y que `graph.py` **no se toca**.
4. **La allowlist del SSE** — por qué solo el nodo `agent_run` gotea tokens.
5. **Gotchas de LangGraph** — los reducers sobreescriben por defecto, `thread_id` es obligatorio en
   cada `invoke`, `interrupt()` sin checkpointer revienta.
6. **El cortocircuito del router** — y la lección de que un token que matchea dos intenciones no
   discrimina ninguna (el caso `compr`).
7. **Qué es compartido y qué es del vertical** — la tabla de corte de §4.4. La skill es el lugar
   donde viven las convenciones que **todos** los agentes de Save deben respetar: patrón de tools,
   reglas de grounding y citas, nomenclatura por vertical. Un agente nuevo debería poder construirse
   leyendo la skill, sin releer este documento entero.

### C.3 Borrador del system prompt

**En inglés** (lo lee el modelo). Debe contener, como mínimo:

```
You are the groceries assistant for Cuadra, a Dominican price-comparison app.

RULES — these are absolute:
- Every price, total, unit price, provider name and URL you mention MUST come verbatim
  from a tool result. Never compute, estimate, convert or round a price yourself.
- If a tool returns no data, say so plainly. Never invent a product or a price.
- If a product is available in only ONE store, say "I found it at X".
  Do NOT say "X has the best price" — there is nothing to compare against.
- Always include the store URL when you name a price.
- Always state when the price was captured and that online prices may differ in store.

FRAMING — every comparative claim must be CONDITIONED, never absolute.
Always make explicit:
  - which stores you compared (the universe you actually had)
  - the date of the data
  - the axis (absolute price vs. price per base unit)
  - what you did NOT evaluate (quality, taste, freshness, distance)
Say "among the 3 stores I have, as of Aug 2, the cheapest is X" — never "X is the cheapest".
An honest frame turns a limitation into credibility; an absolute claim turns the same
limitation into an error the user will catch.

Reply in {language}.
```

> El `{language}` se inyecta como **valor concreto** (`"Reply in Spanish"`), no como regla vaga.
> Idioma del prompt ≠ idioma del output.

---

## Apéndice D — Lo que esta fase NO toca

Explícito para no perder tiempo en trabajo que no corresponde:

| No se toca | Por qué |
|---|---|
| **Migraciones de Alembic** | La fase es de **solo lectura**. Cero cambios de esquema |
| **`make openapi`** | No se añaden endpoints REST — las tools son internas del agente |
| **`@cuadra/api-client`** | Se regenera solo si cambia el OpenAPI, y no cambia |
| **`orchestration/graph.py`** | Añadir un agente es registry + intent. El grafo queda igual |
| **El contrato SSE** | Los frames `link` ya existen y alcanzan |
| **Los 3 intents actuales** | Solo se **suma** `groceries` |
| **La cascada de matching** | Salvo elevar `reciprocal_rank_fusion` al dominio (§6.3) |
| **`apps/web`** | La superficie web queda para después |

---

> **Este documento es la fuente de verdad de la implementación.** Si algo del código contradice lo
> escrito acá, uno de los dos está mal — y hay que decidir cuál antes de seguir.
