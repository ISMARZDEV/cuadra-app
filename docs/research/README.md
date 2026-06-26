# 📚 Research — Análisis de productos y benchmarks

Directorio **exclusivo** para documentos de investigación: análisis de productos del
mercado, benchmarks competitivos y estudios de arquitectura de terceros que sirven de
referencia para nuestra app fiscal-contable agéntica.

> Estos documentos **no describen nuestro código** (eso vive en `docs/plans/`,
> `docs/integrations/`, etc.). Aquí solo entra investigación externa y sus aprendizajes.

---

## Índice

| Documento | Tema | Aprendizaje clave para nosotros |
|-----------|------|---------------------------------|
| [cleo-analisis.md](./cleo-analisis.md) | **Cleo** (meetcleo.com) — asistente financiero con IA conversacional | Arquitectura agéntica: LLM para intención, **tools determinísticas para los números**; LLM-as-judge; memoria persistente como diferenciador |
| [cleo-articulos-fuente.md](./cleo-articulos-fuente.md) | **Cleo** — 8 artículos fuente del blog de ingeniería (texto + **diagramas recreados en ASCII**) | Referencia consultable: dos planos (conversacional/background), router encoder propio, enriquecimiento de transacciones, Autopilot, voz on-device, modelado de dominio |
| [supermercadosrd-analisis.md](./supermercadosrd-analisis.md) | **SupermercadosRD** (supermercadosrd.com) — comparador de precios de supermercados en RD | El dato estructurado ES el activo (no la UI); el **histórico de precios** es lo incopiable; pipeline ETL (taxonomía + normalización de unidades + matching de productos); patrón de adaptadores por fuente; OCR del recibo → detección de sobrepago a nivel de ítem |

---

## Convención del directorio

- **Un archivo por producto/tema** investigado (`<producto>-analisis.md`).
- Cada documento debe incluir: qué es, cómo funciona, tecnología, modelo de negocio,
  riesgos/gobernanza, y una sección final de **paralelos con nuestra app**.
- Citar **fuentes verificables** al final (enlaces).
- Distinguir **dato firme** (auditado/oficial) de **estimación de terceros**.

## Cómo agregar un nuevo análisis

1. Crear `docs/research/<producto>-analisis.md` siguiendo la estructura de `cleo-analisis.md`.
2. Añadir una fila a la tabla **Índice** de este README.
3. Mantener el enfoque: investigación externa + aprendizajes aplicables, no documentación interna.
