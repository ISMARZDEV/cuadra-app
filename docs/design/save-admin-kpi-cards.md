# Diseño de KPIs — Cola de Revisión (Save Admin)

## Contexto

Módulo de **Cola de Revisión** del sistema Save (comparador de precios de supermercados).
Los productos ingeridos pasan por una cascada de matching (EAN → léxico → semántico → LLM → humano).
El ~30% que no se resuelve automáticamente llega a esta cola para revisión humana.

**Problema actual:** Los 4 cards del dashboard muestran datos duplicados o poco accionables:
- Card 1: Productos Totales (221) ✅ útil
- Card 2: Nuevos Productos para revisión (12) ❌ duplicado
- Card 3: Nuevos Productos para revisión (12) ❌ duplicado
- Card 4: Nuevos Productos para revisión (12) ❌ duplicado

**Objetivo:** Reemplazar los 3 cards duplicados por métricas distintas y accionables, manteniendo el estilo visual existente.

---

## Sistema de diseño existente

### Paleta
- Fondo card: blanco con borde verde claro (`#d1fae5` aprox)
- Número principal: verde oscuro (`#064e3b` aprox)
- Badge: fondo verde claro (`#bbf7d0`), texto verde oscuro
- Texto secundario: gris oscuro
- Charts: barras verdes (`#10b981` / `#86efac`) y línea verde con punto destacado

### Tipografía
- Número grande: bold, ~48px
- Título card: semibold, ~14px
- Subtítulo/descripción: regular, ~12px, gris
- Badge: semibold, ~12px

### Layout card
```
┌──────────────────────────────────────┐
│  Título                      ··· (menú)│
│  [NÚMERO GRANDE]  [+badge]           │
│  Descripción / subtítulo             │
│  [mini chart]                        │
──────────────────────────────────────┘
```

### MethodBadge colors (ya definidos en el sistema)
| Método | Color | Hex aprox |
|--------|-------|-----------|
| EAN | Esmeralda | `#10b981` |
| Trgm | Teal | `#14b8a6` |
| Vector | Cyan | `#06b6d4` |
| Hybrid | Violeta | `#8b5cf6` |
| LLM | Ámbar | `#f59e0b` |
| Human | Rosa | `#f43f5e` |

---

## Card 1 — Cola Pendiente (SE MANTIENE)

Sin cambios. Ya funciona bien.

```
┌──────────────────────────────────────┐
│  Cola Pendiente                ···   │
│  221   [+12 productos]               │
│  Comparado con la semana pasada      │
│  ▃ ▅ ▃ ▆ ▅ ▇ ▃  (bar chart)         │
└──────────────────────────────────────┘
```

**Datos:**
- Número: `COUNT WHERE status = 'pending_review'`
- Badge: delta vs semana anterior
- Chart: barras diarias de los últimos 7 días

---

## Card 2 — Auto-link Rate (NUEVO)

Reemplaza el card "Nuevos Productos para revisión" #1.

```
┌──────────────────────────────────────┐
│  Auto-link Rate                ···   │
│  72%   [+5pp]                        │
│  Productos enlazados sin humano      │
│  ╭────╮                              │
│  │ ██ │  (donut: 72% verde,          │
│  │    │   28% gris pendiente)        │
│  ╰────╯                              │
└──────────────────────────────────────┘
```

**Datos:**
- Número: `auto_linked / (auto_linked + pending_review) * 100`
- Badge: delta en puntos porcentuales vs semana anterior (`+5pp`)
- Subtítulo: "Productos enlazados sin humano"
- Chart: **donut/ring** — segmento verde = auto-linked, segmento gris = pendiente

**Por qué importa:** Es el KPI rey de la cascada de matching. Objetivo: ~70%. Si baja, algo se rompió en los stages automáticos.

**Nota de diseño:** El donut debe ser compacto (mismo footprint que los bar/line charts de los otros cards). No necesita leyenda externa — los colores hablan por sí solos.

---

## Card 3 — Tiempo Mediano en Cola (NUEVO)

Reemplaza el card "Nuevos Productos para revisión" #2.

```
┌──────────────────────────────────────┐
│  Tiempo en Cola               ···    │
│  1.2d   [-0.3d]                      │
│  Mediana de resolución               │
│  ╱╲  ╱╲___╱   (line chart)          │
│          · +30%                      │
└──────────────────────────────────────┘
```

**Datos:**
- Número: mediana de `(decided_at - created_at)` en días, solo para items ya resueltos
- Badge: delta vs semana anterior (negativo = mejoró, positivo = empeoró)
- Subtítulo: "Mediana de resolución"
- Chart: **line chart** con tendencia de los últimos 7 días, punto destacado si hay cambio significativo

**Por qué importa:** Detecta acumulación antes de que explote. La mediana (no el promedio) porque un item viejo no debe distorsionar la métrica.

**Nota de diseño:** Si el badge es negativo (mejoró), usar verde. Si es positivo (empeoró), usar ámbar/rojo suave para alertar.

---

## Card 4 — Método de Match (NUEVO)

Reemplaza el card "Nuevos Productos para revisión" #3.

```
┌──────────────────────────────────────┐
│  Método de Match              ···    │
│  6 canales activos                   │
│  Última semana                       │
│  ████████ EAN     35%               │
│  ██████   Hybrid  28%               │
│  ████     LLM     18%               │
│  ███      Vector  12%               │
│  ██       Human    7%               │
└──────────────────────────────────────┘
```

**Datos:**
- Título secundario: "6 canales activos" (count de métodos distintos con datos)
- Subtítulo: "Última semana"
- Chart: **stacked horizontal bars** — cada método con su color de `MethodBadge`:
  - EAN → esmeralda `#10b981`
  - Hybrid → violeta `#8b5cf6`
  - LLM → ámbar `#f59e0b`
  - Vector → cyan `#06b6d4`
  - Human → rosa `#f43f5e`
  - Trgm → teal `#14b8a6`

**Por qué importa:** Si "Human" crece, la cascada está fallando. Si "LLM" crece mucho, el costo operativo sube. Si "EAN" domina, el catálogo está bien etiquetado.

**Nota de diseño:** Las barras deben ser proporcionales al porcentaje. Ordenar de mayor a menor. Los colores deben coincidir exactamente con los `MethodBadge` que ya existen en la tabla de abajo.

---

## Resumen de cambios

| # | Antes | Después | Chart |
|---|-------|---------|-------|
| 1 | Productos Totales (221) | ✅ Se mantiene | Bar chart |
| 2 | Nuevos Productos (12) | **Auto-link Rate (72%)** | Donut |
| 3 | Nuevos Productos (12) | **Tiempo en Cola (1.2d)** | Line chart |
| 4 | Nuevos Productos (12) | **Método de Match (6 canales)** | Stacked bars |

---

## Restricciones de diseño

1. **Mantener el mismo alto** de los 4 cards (uniformidad visual)
2. **Mismo padding** y border-radius que los cards existentes
3. **Los mini charts** deben caber en el espacio que hoy ocupan los bar/line charts (~60px de alto)
4. **No agregar leyendas externas** — los colores y labels inline son suficientes
5. **El donut del Card 2** debe ser compacto, no dominar el card
6. **Las barras del Card 4** deben ser horizontales (no verticales) para leer los labels de método

---

## Datos de ejemplo para el diseño

Usar estos valores para el mockup:

| Métrica | Valor | Badge |
|---------|-------|-------|
| Cola Pendiente | 221 | +12 productos |
| Auto-link Rate | 72% | +5pp |
| Tiempo en Cola | 1.2d | -0.3d |
| Método: EAN | 35% | — |
| Método: Hybrid | 28% | — |
| Método: LLM | 18% | — |
| Método: Vector | 12% | — |
| Método: Human | 7% | — |
