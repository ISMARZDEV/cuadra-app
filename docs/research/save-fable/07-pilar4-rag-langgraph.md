# 07 · Pilar 4 — RAG + LangGraph para AISpace (el subagente de compras)

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** 4 (el último)
> Cómo el subagente conversacional (PurchasesAgent) USA el catálogo saneado sin alucinar precios.
> Extiende el patrón router-a-nodos de `arquitectura-mvp.md` §7.1. Append-only, sin resúmenes.

---

## 1. Pregunta que resuelve este doc
El usuario pregunta *"¿dónde está más barato el arroz Rica?"* o *"armame la compra más barata del
mes"*. ¿Cómo el agente entiende la intención difusa, recupera el producto correcto, y responde con
precios EXACTOS sin inventar ni un centavo?

## 2. 🔑 EL LÍMITE (la decisión más importante del pilar): RAG entiende, TOOL determinístico responde
```
Usuario: "¿dónde está más barato el arroz Rica?"
   │
   ▼  (1) RAG / retrieval híbrido  → resuelve INTENCIÓN DIFUSA
   │     "arroz Rica" → canonical_product_id(s)   (sinónimos, typos, "habichuela"≠"frijol")
   ▼  (2) TOOL determinístico compare_prices(canonical_product_id)  → SQL a Postgres
   │     devuelve NÚMEROS EXACTOS (precio, unit_price, tienda, price_type, captured_at)
   ▼  (3) LLM formatea la respuesta CITANDO los números de la tool  → NO emite un precio propio
```
- **RAG (búsqueda semántica)** = SOLO para resolver *qué producto/categoría* quiso decir + FAQ/
  conocimiento + grounding. NUNCA para los números.
- **Tool determinístico** = los precios salen de Postgres en minor units. El LLM invoca la tool y
  **formatea**; jamás calcula ni inventa un precio. Grounding **por construcción**.
- **⚠️ Descartado para precios: text-to-SQL libre.** Aunque LangGraph lo soporta, para un fintech es
  riesgoso (alucina nombres de tabla/columna, agregaciones erróneas, superficie de inyección). Se
  usan **tools fijas con parámetros** (`compare_prices(id)`, `search_product(q)`), auditables y
  seguras. Text-to-SQL, si acaso, solo para analítica interna del admin, nunca para el precio al usuario.

Esto ancla la REGLA SAGRADA a nivel de agente: *el modelo estructura y recupera, nunca calcula el precio.*

## 3. Qué se indexa/embebe (4a) — separación limpia
- **Índice de retrieval (pgvector + full-text):** el "documento de identidad" del `canonical_product`
  = nombre + marca + sinónimos + categoría + tamaño, **por mercado**. **NO se embeben precios**
  (son estructurados, se consultan por tool).
- **Doc de conocimiento (chico):** diccionario de **sinónimos dominicanos** + FAQ de producto →
  para que el retrieval entienda el habla local.
- Resultado: RAG = identidad de producto; precios = SQL. Cada uno en lo que es bueno.

## 4. Retrieval híbrido + reranking (4b)
### 🏆 **pg_trgm/BM25 (léxico) + pgvector/BGE-M3 (semántico) → RRF → reranker → top-k**
- **Híbrido:** el léxico (full-text/BM25 de Postgres) atrapa términos exactos (marca, tamaño); el
  denso (BGE-M3 en pgvector) atrapa paráfrasis/sinónimos. Se **fusionan con Reciprocal Rank Fusion
  (RRF, k=60 estándar)** — el patrón que usan Cohere/OpenAI en producción.
- **Pipeline típico 2026:** recuperar **top-50** híbrido → **rerank a top-5** (cross-encoder) → al LLM.
- **Reranker:** **BGE-Reranker-v2-m3 (self-host)** — misma familia que BGE-M3, multilingüe, costo ~0.
  🔀 Alternativas hosted: **Voyage rerank-2.5** (ago-2025, +7.94% vs Cohere, instruction-following) o
  **Cohere Rerank 3** — mejores pero de pago/externos. El reranker se agrega solo si el top-50 crudo
  no basta (mide primero; no lo metas por default → latencia).
- **Nota de costo/altura:** para búsquedas simples de góndola (mayormente léxicas, ver doc 03), el
  `pg_trgm` solo puede bastar; el vector+rerank entra cuando la consulta es semántica/ambigua.

## 5. Arquitectura del grafo LangGraph (4c)
Extiende el router-a-nodos de §7.1 (no lo reemplaza):
```
 voz/texto ──► ROUTER (clasificador barato: Haiku/encoder, §7.8)
                 └─► PurchasesAgent (nodo Save)
                       tools: search_product(q)        → retrieval híbrido (§4)
                              compare_prices(id)        → SQL determinístico (§2)
                              add_to_list(id) [HITL]    → interrupt() confirma
                              list_offers(provider?)    → SQL
                              set_price_alert(id) [HITL] → interrupt() confirma
                       └─► format_response (cita precios de las tools) → ui_actions
                 ↔ handoff select_new_agent → CoachAgent (fan-out triángulo Insights×Save)
   memoria: checkpointer Postgres (§7.5) · HITL: interrupt()+pending_action (ADR 30)
```
- **CoachAgent = fan-out del triángulo:** cuando la pregunta cruza *tu gasto* × *precios de mercado*,
  el Coach llama a tools de Insights Y de Save en paralelo (`Send`) → síntesis con reducer.
- **HITL** en toda acción que MUTA (agregar a lista, crear alerta): `interrupt()` + confirmación.
- **Handoff** (patrón Cleo): si el router se equivocó, `select_new_agent` reenruta sin reempezar.

## 6. Grounding anti-alucinación (4d)
- Tools fijas para números (no text-to-SQL) → §2.
- **Generación context-only:** el agente responde SOLO desde el resultado de las tools; si no hay
  dato, lo dice ("no tengo el precio de X"), no lo inventa.
- **Citas obligatorias:** cada precio muestra `source` + `captured_at` + `price_type`
  (online/delivery/shelf) → el usuario ve de dónde viene (y que "online puede variar en tienda", doc 01).
- **Faithfulness como gate** en evals (§7).

## 7. Evals del agente (4e)
### 🏆 **RAGAS (offline, sin ground-truth) + LangSmith (online, ya en tu stack) + eval de trayectoria**
- **RAGAS:** faithfulness, context precision/recall, answer relevancy — sin dataset anotado (rápido).
- **LangSmith** (Cuadra ya lo usa, §arquitectura): evaluadores pre-hechos de context-precision y
  **faithfulness/groundedness** (LLM-as-judge extrae afirmaciones y las chequea contra el contexto),
  sobre trazas reales de producción.
- **Trajectory eval:** ¿el agente llamó la tool CORRECTA? (compare_prices vs search_product) — clave
  en agentes con tools.
- **Métrica crítica = groundedness/faithfulness:** ¿el precio citado coincide con la BD? Un fallo acá
  es el peor bug del producto (precio inventado en un fintech).

## 8. Latencia y costo (4f)
- **Router barato** (Haiku/encoder, §7.8) clasifica intención → no gastes Sonnet en rutear.
- **Retrieval es barato** (Postgres). El **reranker añade latencia** → úsalo condicional.
- **LLM completo (Sonnet)** solo para síntesis/consultas complejas.
- Observabilidad: LangSmith (trazas, costo/latencia por nodo) — ya en el stack.

## 9. 🏆/🔀/📎/⚠️/✅ — resumen de decisiones del pilar

### 🏆 LA MEJOR SOLUCIÓN ACTUAL (2025-2026)
Subagente `PurchasesAgent` en el LangGraph existente, con **tools fijas determinísticas para precios**
+ **retrieval híbrido (pg_trgm+BGE-M3+RRF, rerank condicional)** para intención, **grounding
context-only con citas**, **HITL** en mutaciones, **handoff al CoachAgent** para el triángulo, y
**evals RAGAS+LangSmith** con faithfulness como gate. Reusa TODO tu stack (LangGraph, Anthropic,
pgvector, LangSmith) → cero tecnología nueva.

### 🔀 ALTERNATIVAS
- **Text-to-SQL agéntico para todo:** más flexible para preguntas abiertas. ❌ Riesgo de alucinación
  numérica + inyección → inaceptable para precios en fintech. Solo para analítica interna del admin.
- **RAG puro (embeber todo, incluso precios):** más simple de montar. ❌ Precios en un índice vectorial
  = obsoletos y alucinables; rompe la regla sagrada. Descartado.

### 📎 EVIDENCIA
- Agentic RAG / tool vs SQL: [LangChain — Build a RAG agent](https://docs.langchain.com/oss/python/langchain/rag) · [Agentic RAG survey (arXiv 2501.09136)](https://arxiv.org/pdf/2501.09136) · [LangGraph RAG self-correcting](https://machinelearningplus.com/gen-ai/langgraph-rag-agent-retrieval-augmented-generation/).
- Híbrido + rerank: [Hybrid Search BM25+Vector+Reranking 2026](https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026) · [Reranking cross-encoders (BGE/Cohere/Jina/Voyage)](https://localaimaster.com/blog/reranking-cross-encoders-guide) · [Hybrid + reranking en producción 2026](https://appscale.blog/en/blog/hybrid-search-and-reranking-production-rag-bm25-dense-cross-encoder-2026).
- Evals: [Atlan — RAGAS/TruLens/DeepEval](https://atlan.com/know/llm-evaluation-frameworks-compared/) · [LangSmith — evaluation](https://www.langchain.com/langsmith/evaluation) · [DeepEval — LLM-as-judge 2026](https://deepeval.com/blog/llm-as-a-judge).

### ⚠️ RIESGOS + mitigación
- **Precio alucinado** → tools fijas + context-only + faithfulness eval gate. (El riesgo #1 del pilar.)
- **Retrieval trae el producto equivocado** → híbrido + rerank + citar para que el usuario detecte.
- **Latencia del rerank/LLM** → router barato + rerank condicional + Sonnet solo en síntesis.
- **Sinónimos dominicanos** → diccionario + BGE-M3 multilingüe.
- **Precios de distinto `price_type` mezclados en la respuesta** → la tool filtra por tipo; el agente etiqueta.

### ✅ DECISIÓN que deberías tomar ahora
1. ¿Confirmás **tools fijas determinísticas para precios** (no text-to-SQL) como ley del agente?
2. ¿**Retrieval híbrido con rerank condicional** (BGE-Reranker self-host) o arrancás con solo
   `pg_trgm` y sumás vector/rerank cuando la búsqueda simple falle?
3. ¿**Evals con RAGAS + LangSmith** desde el inicio (faithfulness como gate de release)?

---

**Decisiones que deberías tomar ahora:** las 3 de §9·✅.
**Qué investigar/hacer después:** los **4 pilares + transversales están cubiertos**. El siguiente
paso natural NO es más investigación, es **consolidar**: un doc de arquitectura integrada + un plan
de implementación por fases (o handoff a SDD) que teja los 7 docs en un solo camino ejecutable.

---

## ✅ RESOLUCIÓN (2026-07-03) — decisiones del usuario (con el PORQUÉ)
1. **Tools fijas determinísticas para precios — SÍ.** *Por qué:* un LLM es un generador
   PROBABILÍSTICO (predice el token más plausible); si le pedís un número, lo INVENTA con cara de
   verdad, no lo consulta. La tool fija es una función con SQL escrito y testeado por nosotros: el
   LLM solo decide QUÉ tool y con qué producto; el NÚMERO viaja de Postgres→tool→respuesta sin que el
   modelo lo toque. Text-to-SQL se descarta porque deja que el LLM ESCRIBA la query (reintroduce
   alucinación de columnas/agregaciones + inyección) — inaceptable en fintech.
2. **Retrieval híbrido con rerank condicional — SÍ.** *Qué es:* buscar el producto por DOS vías a la
   vez — léxica (`pg_trgm`, por letras/palabras: atrapa marca/tamaño exactos) + semántica (vector
   BGE-M3, por significado: atrapa sinónimos/typos) — y fusionarlas con RRF. El **rerank** es una
   segunda pasada más cuidadosa (cross-encoder) que reordena los ~50 candidatos y deja el top-5.
   **Condicional** = solo se paga esa segunda pasada cuando el resultado es ambiguo; si hay ganador
   obvio, se salta (ahorra latencia/costo).
3. **Evals RAGAS + LangSmith con faithfulness como gate — SÍ.** *Por qué:* no podés revisar a mano
   cada respuesta; necesitás medir automáticamente si el agente se INVENTA cosas. RAGAS puntúa
   faithfulness (¿cada afirmación de la respuesta está respaldada por el dato recuperado?) sin
   dataset anotado; LangSmith (ya en el stack) lo corre sobre trazas reales. El **gate** = si
   faithfulness baja de un umbral, NO se publica esa versión → es el "test de CI" del cerebro. Un
   precio inventado destruye la confianza (el producto), así que se exige garantía MEDIDA, no "se veía bien".

**Pilar 4: DECIDIDO.** Los 4 pilares + transversales quedan cubiertos → siguiente: consolidación.
