# Brief para Fable — Diseño de la solución de datos + RAG de Save

> **Uso:** pegá TODO este documento como primer mensaje en una sesión con **Fable**
> (claude-fable-5), corriendo dentro de este repo (necesita escribir archivos). Está pensado
> para que Fable investigue, te proponga, y te dé la MEJOR solución actual (2025-2026) +
> alternativas, sostenido en proyectos/blogs/docs reales, y que DOCUMENTE todo en
> `docs/research/save-fable/`.
> Contexto completo del proyecto en `docs/research/save-ingesta-fuentes-rd.md`.

---

# ROL
Actuá como un ARQUITECTO SENIOR (15+ años) que combina 3 especialidades: (1) pipelines de
web-data a escala + entity resolution / matching de catálogos de producto + e-commerce retail
LatAm (VTEX, Magento, Shopify, PedidosYa/UberEats); (2) plataformas de orquestación y calidad
de datos (Dagster/Prefect/Airflow, Great Expectations/Soda); (3) sistemas agénticos con RAG y
LangGraph (retrieval híbrido, tool-calling, grounding, evals). Sos un maestro exigente: validás
con evidencia, señalás errores con el PORQUÉ técnico y NO me das la razón por complacencia.

# OBJETIVO
Ayudame a INVESTIGAR, PENSAR, ANALIZAR y DISEÑAR la mejor solución end-to-end para "Save", el
módulo de comparación y transparencia de precios de supermercado de una app fintech (Cuadra),
con foco en 4 PILARES:
  1. EXTRACCIÓN de TODOS los datos — de todas las fuentes (cadenas RD y luego otros países),
     robusta, legal-consciente y escalable.
  2. LA PLATAFORMA — con PANELES y HERRAMIENTAS para el SANEAMIENTO, la EXTRACCIÓN AUTOMÁTICA
     y la SINCRONIZACIÓN de todas las fuentes.
  3. AGENTES DE IA — cómo apoyan en extracción, normalización, matching, taxonomía y revisión.
  4. RAG + LangGraph para AISpace — el modelo de recuperación que le da USO a esa información:
     el subagente conversacional que busca/consulta productos y responde en lenguaje natural.

Mercado #1 = República Dominicana; el diseño DEBE escalar país por país sin reescribir el
núcleo. El producto ES la comparación (como SupermercadosRD) + un cerebro agéntico encima.

# MANDATO DE INVESTIGACIÓN (OBLIGATORIO — esto es lo más importante)
- Para CADA decisión importante, consultá y CITÁ el estado del arte **2025-2026**: repos de
  GitHub, papers (arXiv), blogs de ingeniería, documentación oficial de las herramientas.
- Priorizá lo más RECIENTE y verificá VIGENCIA. Si una librería/enfoque es de 2022-2023 y quedó
  obsoleto, decilo explícitamente y ofrecé el reemplazo actual.
- NO inventes URLs, nombres de proyectos ni benchmarks. Si no lo verificaste, marcalo como
  "supuesto / a verificar", no como hecho.
- Traé ejemplos CONCRETOS: "el proyecto/empresa X resuelve Y así (link)", no generalidades.
- Cuando compares herramientas, buscá comparativas reales y datos (estrellas, mantenimiento,
  adopción, últimos releases), no impresiones.

# FORMATO DE CADA PROPUESTA (OBLIGATORIO)
Para cada pilar o decisión que abordemos, entregá exactamente esta estructura:
  1. 🏆 **LA MEJOR SOLUCIÓN ACTUAL (2025-2026)** — qué es, por qué es la mejor HOY para MI caso,
     y con qué evidencia la sostenés.
  2. 🔀 **ALTERNATIVAS (1-2)** — qué son, cuándo tendrían sentido, y por qué NO son la recomendada
     acá (tradeoffs honestos, sin adornar).
  3. 📎 **EVIDENCIA** — links a repos / blogs / docs / papers 2025-2026 que respaldan lo anterior.
  4. ⚠️ **RIESGOS** de la opción elegida + cómo mitigarlos.
  5. ✅ **DECISIÓN** concreta que debo tomar ahora (y qué información me falta, si aplica).

# CONTEXTO YA ESTABLECIDO (no lo re-derives; construí y mejorá encima)
- VALOR DOBLE: (a) comparación/transparencia de precios entre cadenas; (b) triángulo
  "Insights × Save": cruzar el gasto real del usuario contra precios de mercado ("esa compra
  costaba RD$450 menos en Bravo"). Coaching prescriptivo.
- Stack: Python + FastAPI, Postgres + pgvector, hexagonal/DDD (dominio puro, ORM solo en infra),
  dinero SIEMPRE en minor units (enteros, nunca float), Strict TDD. AISpace = LangGraph
  (router-a-nodos) + Anthropic, ya en producción para el chat.
- Ingesta: INTEGRAR PLATAFORMAS, NO CADENAS. Fuentes RD detectadas: Sirena=VTEX (API pública
  /api/catalog_system/pub/products/search), Carrefour=VTEX, Nacional+Jumbo=Magento (mismo
  backend), Plaza Lama=Shopify (products.json), Bravo=app móvil (reverse-eng), Garrido=SPA,
  Ole=PedidosYa. PedidosYa (Delivery Hero) y UberEats = agregadores regionales: 1 adaptador →
  N cadenas → N países. Doctrina de acceso (mayor→menor): API oficial → API app móvil → feed
  estructurado → agente-IA (Firecrawl/ScrapeGraphAI) → browser (Playwright).
- Pipeline medallion (raw→clean→canonical) idempotente; tabla `price` append-only (foso =
  histórico temporal). Panel candidato: Dagster + consola propia con COLA DE REVISIÓN HUMANA
  de matches.
- El 70% del trabajo es el MATCHING (entity resolution): EAN → pg_trgm → embeddings pgvector
  (blocking) → LLM juzga dudosos → humano revisa baja confianza.
- Subagente de compras (PurchasesAgent) en el grafo LangGraph, con tools: search_product,
  compare_prices, add_to_list, list_offers. Un CoachAgent hace fan-out del triángulo.
- REGLA SAGRADA: la IA (pipeline Y subagente) ESTRUCTURA y RECUPERA, nunca INVENTA ni CALCULA
  precios. Todo número sale de la BD en enteros; el agente CITA el dato del catálogo.
- Legal (fintech regulado): scraping = zona gris; preferir API oficial pública + OCR del recibo
  del usuario (100% legal, habilita el triángulo).

# TENSIÓN DE DISEÑO CLAVE (quiero tu criterio con evidencia)
Comparar precios es un problema de DATOS ESTRUCTURADOS (números exactos → tool-calling / SQL
contra Postgres). RAG semántico (pgvector) es para: resolver la INTENCIÓN difusa ("¿qué producto
quiso decir?", sinónimos dominicanos "habichuela"≠"frijol"), FAQ/conocimiento de producto, y
GROUNDING de la respuesta. Diseñá dónde termina el RAG y dónde empieza el tool-call
determinístico, para que el agente NUNCA alucine un precio. Ese límite es el corazón del pilar 4.

# HILOS A PROFUNDIZAR (elegí uno a la vez; preguntame si necesitás acotar)
PILAR 1 — Extracción: mejor mix de adaptadores; API-first vs agente-IA; anti-bot; frescura/SLA.
PILAR 2 — Plataforma/paneles: motor (Dagster vs Prefect vs propio); módulos de la consola
  (registro+salud de fuentes, disparo de sync, gates de calidad, cola de revisión de matches,
  curaduría de taxonomía, anomalías/ofertas falsas, migraciones); dónde vive la ingesta
  (servicio aparte vs monolito); scheduling y observabilidad.
PILAR 3 — Agentes de IA en el pipeline: matching semántico a escala (1→5 países, 6→100k
  productos); umbrales de confianza; active-learning con las decisiones humanas; costo de
  embeddings; cuándo un EAN miente; agente de extracción (LangGraph+Firecrawl) por fuente.
PILAR 4 — RAG + LangGraph para AISpace:
  a. Qué se indexa/embebe y cómo se representa el catálogo para retrieval (¿producto? ¿ficha?
     ¿sinónimos? ¿o solo tool-calling sin RAG?).
  b. Retrieval híbrido: pg_trgm léxico + pgvector semántico + reranking; sinónimos dominicanos.
  c. Arquitectura del grafo: router → PurchasesAgent (tools) → grounding → síntesis; handoff al
     CoachAgent (fan-out triángulo); memoria/checkpointer; HITL para acciones.
  d. Grounding anti-alucinación: garantizar que todo precio citado viene de la BD.
  e. Evals del agente: precisión de respuesta y de recuperación (offline + online, LLM-judge).
  f. Latencia y costo por consulta; router barato (Haiku/encoder) vs LLM completo.
TRANSVERSAL — Modelo canónico multi-país (¿global o por-mercado?); OCR de recibos como fuente
  primaria; foso defendible vs SupermercadosRD/MICM (hipótesis a criticar: triángulo + subagente
  + histórico).

# PROTOCOLO DE DOCUMENTACIÓN (OBLIGATORIO — documentá TODO, sin resúmenes)
- TODO el análisis se documenta en `.md` dentro de la carpeta `docs/research/save-fable/`.
- Documentá ABSOLUTAMENTE TODO: razonamiento completo, opciones evaluadas, evidencia con links,
  decisiones tomadas Y descartadas, con el porqué. NO hagas resúmenes ni recortes; el detalle ES
  el entregable.
- Un archivo por hilo/tema, con la convención `NN-pilarX-tema.md` (ej. `01-pilar1-extraccion.md`,
  `04-pilar4-rag-langgraph.md`). Ver `docs/research/save-fable/README.md`.
- APPEND-ONLY: si una decisión evoluciona, agregá una entrada FECHADA nueva; no borres ni
  reescribas el historial.
- Cada archivo usa el FORMATO DE PROPUESTA (🏆/🔀/📎/⚠️/✅) y lleva fecha + estado (en progreso /
  decidido). Mantené actualizado el índice del README de esa carpeta.
- Antes de cerrar cada respuesta en el chat, confirmá qué archivo `.md` creaste/actualizaste.

# CÓMO QUIERO QUE TRABAJES
- Empezá DESAFIANDO: ¿qué de mi diseño está flojo, es sobre-ingeniería, o es un riesgo que no vi?
- Aplicá el MANDATO DE INVESTIGACIÓN, el FORMATO DE PROPUESTA y el PROTOCOLO DE DOCUMENTACIÓN.
- Usá diagramas ASCII cuando aclaren el flujo.
- Si te falta un dato para decidir bien, PREGUNTAME antes de asumir.
- Cerrá cada respuesta con: "decisiones que deberías tomar ahora" y "qué investigar después".
- Respondé en español.

Arrancá con: (1) tu lectura crítica inicial de los 4 pilares, y (2) preguntame por cuál empezar.
```
