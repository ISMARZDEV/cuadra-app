# 00 · Lectura crítica inicial de los 4 pilares

> **Fecha:** 2026-07-03 · **Estado:** en progreso (kickoff de la sesión Fable)
> **Autor:** Fable (arquitecto). Documenta el desafío inicial al diseño ANTES de proponer soluciones.
> No re-deriva contexto; ataca supuestos. Append-only.

---

## Tesis central del desafío: EL ORDEN ESTÁ INVERTIDO

El brief front-loadea el pilar **más pesado en ops, más frágil legalmente y MENOS defensible**
(la plataforma industrial de extracción + matching + panel Dagster) y trata el **OCR del recibo
del usuario** —que es legal, da precios REALES de góndola, y construye el foso— como una nota al
pie. Para un producto donde *la confianza es el producto*, eso es peligroso. Mi recomendación de
arranque es **reordenar**, no ejecutar el brief tal cual. Detalle abajo por pilar.

---

## Riesgo #1 (transversal, el más grave): PRECIO ONLINE ≠ PRECIO DE GÓNDOLA

Toda la doctrina "integrar plataformas (VTEX/Shopify/agregadores)" trae los precios del **catálogo
e-commerce**, que **con frecuencia difieren del precio físico en tienda** — y en los agregadores
(PedidosYa/UberEats) están **inflados por la economía de delivery/markup**. Un comparador que
promete transparencia pero compara precios de *delivery* está **midiendo la cosa equivocada**. Es
el mismo agujero que tiene SupermercadosRD y nadie lo audita.
- **Implicación:** la validez del dato importa MÁS que la mecánica de extracción. Antes de decidir
  "cómo extraigo", hay que decidir "qué precio es el verdadero y cómo lo valido".
- **Refuerza el OCR:** el recibo del usuario ES el precio de góndola real, con fecha y sucursal.
  Es la **fuente más veraz**, no la alternativa legal de consolación.

## Riesgo #2: "extraer TODOS los datos" es una trampa de alcance

Tu palabra fue "todos". Pero no necesitás 40k SKU × 8 cadenas × diario. Necesitás el **subconjunto
COMPARABLE correcto** (una canasta canónica de alta rotación). Extraer todo es costo de ops alto
con valor marginal decreciente y superficie legal máxima. El valor está en **profundidad de la
canasta que la gente realmente compara**, no en cobertura total.

## Pilar 1 — Extracción: bueno, pero incompleto
- ✅ "Plataformas > cadenas" es correcto y escala.
- ⚠️ Ignora el Riesgo #1 (online vs góndola) y el Riesgo #2 (todos vs canasta).
- ⚠️ Los agregadores contaminan la comparación con precios de delivery → NO deberían ser fuente
  primaria de precio (sí de descubrimiento de catálogo).

## Pilar 2 — Plataforma/paneles: SOBRE-INGENIERÍA para el estado actual
- Dagster + consola propia + cola de revisión + gates DQ es una **catedral de data-engineering
  antes de validar PMF**. La cola de revisión humana solo importa cuando el volumen de matching es
  alto — que hoy no existe.
- Con una **canasta curada (~200 SKU) matcheada a mano**, NO necesitás pipeline ML ni panel para
  PROBAR el valor. El panel es un problema de **fase 2/3**, no de arranque.

## Pilar 3 — Agentes IA / matching: PREMATURO en el MVP
- "El 70% es matching" es cierto **a escala**, no en el MVP. A 200 SKU curados el matching es
  trivial/manual.
- El loop de active-learning necesita **labels humanos que todavía no existen** (cold-start del
  propio matcher). Montarlo ahora es optimización prematura.
- Costo real: LLM-juzgar cada match dudoso sobre 40k×8 diario es plata. Hay que acotarlo por diseño.

## Pilar 4 — RAG + LangGraph: el instinto es CORRECTO, pero mal secuenciado
- ✅ La tensión "tool-call determinístico para precios / RAG solo para intención" está bien vista.
  Es exactamente el límite correcto.
- ⚠️ **Sub-pregunta a criticar (4a/4b):** ¿de verdad necesitás pgvector para la BÚSQUEDA de
  producto? La búsqueda de góndola es **mayormente léxica** (marca + nombre + tamaño). Un Postgres
  `pg_trgm` + diccionario de sinónimos dominicanos puede GANARLE en precisión y costo al vector
  search para el lookup. Reservá pgvector para el **matching** (donde sí paga), no lo metas por
  default en el search del agente.
- ⚠️ **Secuencia:** un agente que cita con confianza un precio viejo/erróneo es PEOR que no tener
  agente, para un producto de confianza. Primero el dato válido, DESPUÉS el agente.

## Transversal — Multi-país y foso
- **Canónico multi-país:** comparar "arroz" entre RD y CO es una trampa (distinta moneda, ingreso,
  producto). Multi-país = **REPLICAR la comparación por-mercado**, no un canónico global. El
  canónico debe ser **por-market**; un canónico global es sobre-ingeniería.
- **Foso:** la comparación está commoditizada (SupermercadosRD + MICM estatal ya existen). El foso
  defendible NO es el comparador — es (1) el **triángulo** sobre las transacciones PROPIAS del
  usuario y (2) el **histórico de precios**. La plataforma de extracción es *table-stakes*, no
  moat → no la sobre-inviertas.

---

## Reframe propuesto (la mejor jugada 2025-2026, a validar contigo)
1. **OCR de recibos = fuente co-primaria** (legal + precio real de góndola + alimenta el triángulo).
2. **Canasta curada por APIs limpias** (VTEX/Shopify) para bootstrap de comparación — matcheo manual.
3. **Diferir** Dagster/matching-ML/panel hasta tener volumen y demanda validada.
4. **Agente (Pilar 4)** encima del dato ya confiable, con search léxico primero, pgvector solo donde paga.
5. Multi-país = replicación por-market vía registro, sin canónico global.

**Decisiones que deberías tomar ahora:**
- ¿Aceptás el reframe (OCR co-primario + canasta curada + diferir la catedral) o querés el orden del brief?
- ¿La transparencia que prometés es de **precio de góndola** (entonces OCR manda) o **precio online/delivery** (entonces agregadores sirven)? Esto define TODO.

**Qué investigar después (según por dónde arranquemos):**
- Precisión real de OCR de recibos de supermercado RD (formatos, ITBIS, ítems abreviados).
- Si los precios VTEX de las cadenas RD marcan online-vs-tienda.
- Estado del arte 2025-2026 de cada pilar (pendiente, se hará al abrir cada hilo).
