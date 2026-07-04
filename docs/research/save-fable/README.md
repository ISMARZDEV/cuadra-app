# Save · Análisis con Fable — Documentación completa

> Carpeta dedicada a la documentación **exhaustiva** del diseño de Save (extracción, plataforma
> de datos, agentes de IA, y RAG + LangGraph para AISpace), producida en las sesiones con
> **Fable**. Brief de la sesión: [`../fable-brief-save.md`](../fable-brief-save.md). Contexto de
> fuentes: [`../save-ingesta-fuentes-rd.md`](../save-ingesta-fuentes-rd.md).

## Regla de esta carpeta (LEER)
- **Se documenta TODO. Sin resúmenes.** Razonamiento completo, opciones evaluadas, evidencia con
  links, decisiones tomadas Y descartadas, con el porqué.
- **Todo en `.md`**, un archivo por hilo/tema.
- **Append-only:** si una decisión evoluciona, se agrega una entrada FECHADA nueva; no se borra
  ni se reescribe el historial (mismo principio que el foso append-only de precios).
- Cada archivo sigue el **FORMATO DE PROPUESTA**: 🏆 mejor solución 2025-2026 → 🔀 alternativas →
  📎 evidencia (links) → ⚠️ riesgos → ✅ decisión.

## Convención de nombres
`NN-pilarX-tema.md` — `NN` = orden, `X` = pilar. Ejemplos:
- `01-pilar1-extraccion.md`
- `02-pilar2-plataforma-paneles.md`
- `03-pilar3-agentes-ia-matching.md`
- `04-pilar4-rag-langgraph.md`
- `90-transversal-multipais.md` · `91-transversal-legal-foso.md`
- `99-decisiones.md` — bitácora fechada de decisiones firmes (append-only).

## Índice (Fable actualiza esta tabla al crear/editar cada doc)
| # | Documento | Pilar | Estado | Última actualización |
|---|-----------|-------|--------|----------------------|
| 00 | [Lectura crítica inicial](00-lectura-critica-inicial.md) | Transversal | En progreso | 2026-07-03 |
| 01 | [OCR de recibos + validez del dato](01-transversal-ocr-validez-dato.md) | Transversal | Decidido | 2026-07-03 |
| 02 | [Extracción de fuentes oficiales](02-pilar1-extraccion.md) | 1 | Decidido | 2026-07-03 |
| 03 | [Teardown SupermercadosRD + taxonomía + diferenciación](03-referencia-supermercadosrd-teardown.md) | Transversal | En progreso | 2026-07-03 |
| 04 | [Catálogo COMPLETO de funcionalidades (paridad + foso)](04-save-funcionalidades.md) | Producto | Decidido (MVP+alertas+histórico) | 2026-07-03 |
| 05 | [Matching (el 70%) + agregadores Hero/Uber](05-pilar3-matching-agregadores.md) | 3 | Decidido | 2026-07-03 |
| 06 | [Plataforma de datos + paneles (orquestación/calidad/consola)](06-pilar2-plataforma-paneles.md) | 2 | Decidido | 2026-07-03 |
| 07 | [RAG + LangGraph para AISpace (subagente)](07-pilar4-rag-langgraph.md) | 4 | Decidido | 2026-07-03 |
| 08 | [Arquitectura integrada + Roadmap (consolidación)](08-arquitectura-integrada-roadmap.md) | Consolidación | Completo | 2026-07-03 |
| 09 | [Spike verificación de endpoints (en vivo)](09-spike-verificacion-endpoints.md) | Spike | Completo | 2026-07-03 |
| 10 | [Retención del histórico de precios (costo vs foso)](10-retencion-historico-precios.md) | 2/datos | En progreso | 2026-07-03 |
| 11 | [¿Adapter web→markdown→LLM? (análisis crítico)](11-web-to-markdown-agent-adapter.md) | 1/3 | En progreso | 2026-07-03 |
