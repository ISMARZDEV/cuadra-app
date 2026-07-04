# 04 · Save — Catálogo COMPLETO de funcionalidades (paridad + foso Cuadra)

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** Producto (alcance funcional)
> **Encuadre (corrección del usuario):** NO es "copiar". El feature-set de un comparador de precios
> es **table-stakes** (estándar esperado). Cuadra Save debe tener **TODO** lo que tiene
> SupermercadosRD **+** la capa que ellos no pueden (triángulo, góndola real, agente, financiero).
> Deriva del teardown [`03`](03-referencia-supermercadosrd-teardown.md). Append-only, sin resúmenes.

---

## 1. Principio
Save = **paridad total** con el líder (SupermercadosRD) **+ foso Cuadra encima**. El objetivo NO es
diferenciarse QUITANDO features; es tenerlas todas y AGREGAR lo que un comparador puro no puede.
La visión es el catálogo completo de abajo; el MVP es un corte **simple** de él (columna "Fase").

## 2. Catálogo de funcionalidades

### A. Búsqueda y descubrimiento (PARIDAD)
| # | Funcionalidad | Dato/Pilar que necesita | Fase |
|---|---------------|-------------------------|------|
| A1 | Buscador global "¿Qué quieres comprar hoy?" (con intención, typos, sinónimos dominicanos) | pg_trgm + retrieval (P4) | MVP |
| A2 | Navegación por 15 categorías tope (con ícono) | taxonomía jerárquica (P2/P3) | MVP |
| A3 | Páginas de listado por categoría (breadcrumb 4 niveles, "N productos") | taxonomía + catálogo | MVP |
| A4 | Filtros: **Precio** (histograma+rangos), **Supermercado** (con conteos), **Marca** (con conteos+buscador), **Calidad** (Premium/Selecto) | catálogo estructurado | MVP |
| A5 | Orden: Popularidad, Precio, Precio/unidad | métricas + popularidad | MVP |
| A6 | Carruseles temáticos curados ("Protector solar", "Limpieza") | curaduría/tags | F1 |
| A7 | "Mejores ofertas de hoy" (por % descuento) | `offer` (P1 data) | F1 |
| A8 | "Productos populares ahora" | popularidad/analytics | F1 |
| A9 | "Ofertas por supermercado" (logos, filtro por tienda) | `offer` por provider | F1 |
| A10 | "Mejor valor por tu dinero" (ranking por precio/unidad) | unit-price (P1) | F1 |

### B. Card de producto (PARIDAD)
| # | Funcionalidad | Dato/Pilar | Fase |
|---|---------------|-----------|------|
| B1 | Tag de tamaño, nombre, marca | catálogo | MVP |
| B2 | Precio + **precio por unidad base** ($/LB, /100ML, /UND) | normalización (P1) | MVP |
| B3 | Badge de descuento (−28%…) | `offer` | F1 |
| B4 | Contador **"N tiendas"** | matching (P3) | MVP |
| B5 | Botón rápido "+" agregar a lista | lista (P... dominio) | MVP |

### C. Detalle de producto (PARIDAD)
| # | Funcionalidad | Dato/Pilar | Fase |
|---|---------------|-----------|------|
| C1 | Galería de imágenes | catálogo | MVP |
| C2 | "Compara desde RD$X hasta RD$Y" | comparación (P3) | MVP |
| C3 | Ranking "#N más popular en {categoría}" | popularidad | F1 |
| C4 | **Tabla de comparación por tienda** ordenada, "Mejor precio" / "+RD$X más caro", precio tachado en oferta, precio/unidad por tienda, botón "Buscar"→tienda | matching + comparación (P3) | MVP |
| C5 | Frescura + disclaimer ("Actualizado hace 1h · online, puede variar en tienda") | metadata `captured_at` + `price_type` | MVP |
| C6 | "Alternativas del supermercado" (sustitutos) | matching semántico (P4) | F1 |
| C7 | "Productos relacionados" | embeddings (P4) | F1 |
| C8 | "Más de {marca}" (variantes de tamaño) | agrupación por línea de producto | F1 |
| C9 | **Historial de precios** (chart 1M/3M/Todos, por supermercado) | `price` append-only (P2) | F1 |
| C10 | Propiedades (Tipo, Marca, Calidad) | atributos canónicos | MVP |
| C11 | **Feedback: Reportar problema / Sugerir categoría** | cola de revisión HITL (P2) | F1 |

### D. Listas y canasta (PARIDAD)
| # | Funcionalidad | Dato/Pilar | Fase |
|---|---------------|-----------|------|
| D1 | Agregar a lista / gestionar lista | dominio ShoppingList | MVP |
| D2 | **"Compra semanal básica": en qué supermercado cuesta menos** (comparación de CANASTA entera) | optimización sobre canasta × providers (P3) | F1 |
| D3 | Lista recomendada / sugerida | curaduría + (luego) triángulo | F1 |

### E. Ofertas y contenido/SEO (PARIDAD)
| # | Funcionalidad | Dato/Pilar | Fase |
|---|---------------|-----------|------|
| E1 | Página de Ofertas (global + por tienda) | `offer` | F1 |
| E2 | Blogs / "Inspiración" (recetas, guías de compra) | contenido | F2 |
| E3 | **Análisis de precios** ("cafés subieron 29.42%") — generado del histórico | `price` histórico + IA (foso) | F2 |
| E4 | Landing pages programáticas por categoría (SEO) | taxonomía + SSR | F2 |

### F. Cuenta / institucional (PARIDAD)
Carrito, login, Sobre Nosotros, FAQ, Términos, Contacto, Privacidad. | plataforma | MVP/F1

### G. 🥇 FOSO CUADRA (lo que SupermercadosRD NO puede)
| # | Funcionalidad | Dato/Pilar | Fase |
|---|---------------|-----------|------|
| G1 | **Triángulo Insights × Save**: alerta de sobrepago a nivel de ítem ("compraste esto 12% más caro que en Bravo") | transacciones del usuario × catálogo | F2 |
| G2 | **Precio de góndola REAL** (recibo OCR / e-CF) con sucursal+fecha | OCR/e-CF (doc 01) | F2 |
| G3 | **Subagente AISpace** (conversacional): "armá la compra más barata del mes según lo que sueles comprar" | LangGraph + tools (P4) | F2 |
| G4 | **Alertas de precio** ("avísame cuando baje el arroz") — SupermercadosRD NO lo tiene | histórico + notif | F1/F2 |
| G5 | **Canasta personalizada desde tus compras** (no genérica) | triángulo | F2 |
| G6 | **Save financiero**: bancos, seguros, préstamos (ampliación del marketplace) | `Provider.type=bank\|insurer` | F3 |
| G7 | Geolocalización: autocompletar comercio + sobrepago en sitio (puente Insights→Save) | ubicación tx | F3 |

## 3. Reconciliación "todo" vs "simple al inicio"
El usuario pidió (a) "tener todo lo que tiene" y (b) antes, "algo sencillo al inicio". No se
contradicen si el catálogo completo es la **visión** y el MVP es un **corte vertical simple** que ya
se ve y se usa, con la arquitectura lista para el resto. Corte MVP propuesto (columna "MVP" arriba):
> **Buscar (A1) → listar por categoría con filtros (A2-A5) → card con precio/unidad y "N tiendas"
> (B1-B5) → detalle con tabla de comparación + disclaimer + propiedades (C1,C2,C4,C5,C10) → lista
> (D1).** Eso es SupermercadosRD en su esencia comparativa, simple, para supermercados. F1 suma
> ofertas/histórico/canasta/alternativas/feedback; F2 el foso Cuadra; F3 el vertical financiero.

**Clave de arquitecto:** agregar TODAS estas features **NO cambia la arquitectura** de los 4
pilares — todas se alimentan del mismo dominio (canonical_product · store_product · price · offer ·
shopping_list) + matching + agente. "Tenerlas todas" es alcance de producto, no rediseño. Por eso el
modelo de dominio debe nacer completo aunque el MVP muestre poco.

---

**Decisiones que deberías tomar ahora:**
- ¿Validás el **corte MVP** de §3 (el vertical simple) como primer entregable visible, con el resto
  como F1/F2/F3? ¿O querés más/menos en el MVP?
- ¿Alguna feature que quieras SUBIR de fase (ej. alertas de precio G4, o el histórico C9)?

**Qué investigar después:** cómo el modelo de dominio + matching (P3) + agente (P4) soportan este
catálogo; arrancamos por el **Pilar 3 (matching + agregadores Hero/Uber)**, el 70% del trabajo.

---

## ✅ RESOLUCIÓN (2026-07-03) — decisiones del usuario
- **Corte MVP VALIDADO** (el vertical simple de §3).
- **Promovidas al MVP:** **G4 alertas de precio** (era F1/F2) y **C9 historial de precios** (era F1).
  Racional: el histórico ya es table-stakes (SupermercadosRD lo muestra) y las alertas son el gancho
  de retención más obvio que ELLOS NO tienen → entra temprano como diferenciador barato (se apoya en
  el `price` append-only que ya existe desde el día 1). Implica: `price` append-only + un job de
  detección de bajada + notificaciones desde el MVP.
- Siguiente pilar: **P3 matching + agregadores** → [`05-pilar3-matching-agregadores.md`](05-pilar3-matching-agregadores.md).
