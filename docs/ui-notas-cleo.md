# 🎨 Notas de UI — patrones de la app de Cleo para el diseño del MVP de Cuadra

> **Propósito:** análisis de las **capturas de pantalla de la app de Cleo** (de su blog) para extraer
> **patrones de UI concretos** que sirven al diseño del MVP de Cuadra. No es copiar su marca (Cleo = crema
> cálido; Cuadra = verde); es robar las **decisiones de interacción** que funcionan.
> **Fuente de imágenes:** artículos en [`../research/cleo-articulos-fuente.md`](../research/cleo-articulos-fuente.md).
> **Mapeo:** a las 5 pestañas de Cuadra — News · **Insights** · **AISpace** (Chat IA) · **Save** · Config.

---

## 0. Lenguaje visual de Cleo (qué adaptar, no copiar)

| Cleo | Cuadra (adaptar) |
|------|---------------|
| Fondo **crema cálido** (#F4F1EA), texto **marrón oscuro**, acentos terracota/verde **escasos** | Cuadra ya usa **verde**; mantener la **calidez** (off-white verdoso, no blanco frío fintech) |
| **Tono y personalidad en el microcopy** ("Solid work this month", "You're cruising", roast suave) | Tus modos **Pana / Bukú / Jevi** (concepto §8) — el microcopy ES el producto |
| Tipografía display **grande y bold** para titulares | Titulares conversacionales grandes (lo que ya muestran tus mockups) |
| Imágenes de marca = **personas y outcomes**, no dashboards (artículo "visual world") | Liderar con resultado/persona, no con gráficos fríos |

---

## 1. El patrón maestro: **conversational-first / insight-led**

La pantalla de Cleo **no abre con un dashboard** — abre con **una frase** y luego **chips de respuesta
rápida**. Ej.: *"Hey you 👋 You spent a total of $257 across 9 transactions in the last 7 days. Want to
dig into groceries or takeout first?"* → botones `groceries` `takeout`.

```
┌─────────────────────────────────┐
│  Hey you 👋                      │   ← titular con personalidad
│                                  │
│  You spent $257 across 9         │   ← UN insight en lenguaje natural
│  transactions in the last 7 days.│
│  Want to dig into groceries or   │
│  takeout first?                  │
│                                  │
│             [ groceries ][ takeout ] │  ← QUICK-REPLY CHIPS (sin teclear)
└─────────────────────────────────┘
```

**Para Cuadra — AISpace (Chat IA, pantalla central):** el chat debe **abrir con un insight proactivo** (del Agente de
Insights §7.9) + **chips de respuesta rápida**, no con un input vacío. **Los chips de respuesta rápida
son el patrón #1 a adoptar** — reducen fricción, suben engagement (Cleo midió **+13.5%**) y enganchan
con tu registro por voz. Aplica en Chat, Insights y Save.

---

## 2. Insights — componentes a adoptar (de las pantallas de Cleo/Autopilot)

| Componente Cleo | Qué es | Cuadra |
|-----------------|--------|-----|
| **Gauge circular "Left to spend"** | Anillo con número grande (`$263.48`), centavos en superíndice, **pill de estado** ("On track" verde / "Slow down" ámbar) y rango de fechas | Cuadra ya tiene anillo → añadir **pill de estado** + el **"safe-to-spend"** (§7.9) como número central |
| **Donut earning vs spending** | "The fruits of your labor $52,120" vs "The crushing burden of living $58,600" — con copy con personalidad | Donut Ingresos vs Gastos con microcopy Pana |
| **Tabla "Monthly breakdown"** | Money in / Money out / Left, **negativo en rojo, positivo en verde** | Tabla mensual en Insights |
| **Filas de comercio con logo** | `Spotify · Today · −$350`, `Shell · 10 Jun · −$500` con ícono de marca | Recent Transactions con **logo del comercio** (sale del enriquecimiento §5.6 — merchant normalization) |
| **Pills de estado** | "On track" / "Slow down" con color | Estado del presupuesto/meta en lenguaje plano |
| **Categorías "Essential & recurring" con %** | Bills 53%, Bank Charges, Expenses | Vista de esenciales/recurrentes (alimentada por enriquecimiento) |
| **Tarjetas expandibles** | chevron `⌄` para "ver más" | Cards colapsables |

> **Joya:** Cleo etiqueta el estado en **lenguaje humano** ("On track", "You're cruising"), no solo
> con un número. Eso baja la ansiedad financiera — exactamente tu insight del concepto (el miedo).

---

## 3. AISpace (Chat IA) — componentes a adoptar

- **Titular-saludo personalizado** ("Hey Kyle, Solid work this month") + 1 insight + chips.
- **Quick-reply chips** ("but of course", "enlighten me", "Block Doordash") — siempre que haya un
  siguiente paso plausible. *(Patrón #1.)*
- **Generative UI / tarjetas ricas en el chat:** Cleo mete **gráficos (donut, líneas, barras) dentro
  del chat**, no solo texto. Cuadra debe renderizar tarjetas (gráfico, tarjeta de artículo de News,
  **botón "agregar a lista" de Save**) en la conversación → esto es tu `ui_actions` (§7.6).
- **Input con voz:** campo "Type to reply…" + **micrófono** (tu STT on-device §7.7).
- **Respuestas progresivas** ("Analizing, one minute…") mientras procesa (lo viste en tus mockups).

---

## 4. Acciones agénticas — el patrón de CONSENTIMIENTO (clave para confianza)

La pantalla "Actions" de Cleo es un **modelo a copiar tal cual** para cualquier acción que mueva plata
(tu HITL §7.4 + lección FTC §12). Flujo: insight → propuesta → chip → **bottom sheet de confirmación
con checkboxes + botón primario**.

```
  Your highest category spend was Eating Out... biggest culprit: Doordash $127.67
  Want a $100 reminder, or go further and block Doordash?      [ Block Doordash ]
                              │ (tap)
                              ▼
  ┌──── Confirm merchant block ────────────────────────────┐
  │ By continuing you're authorizing us to restrict        │
  │ payments to Doordash, from your Cleo Card ending 1234. │
  │  ☐ I understand any monies owed are my responsibility  │
  │  ☐ I understand this blocks based on last-30-day visits│
  │             [   Confirm block   ]                       │  ← botón primario
  └────────────────────────────────────────────────────────┘
```

**Para Cuadra:** toda acción del agente (apartar ITBIS, mover a ahorro, emitir e-CF en fase 2) usa este
**bottom sheet de confirmación**: explicación clara + checkboxes de consentimiento + un botón. **Sin
dark patterns** (FTC). Cancelación/entendimiento explícito.

---

## 5. Roadmap / Daily Plan (Autopilot) — para fases 1-2, diseñar ya

- **Goal card** ("Spend smarter — Goal: spend less than you earn for 4 of the next 6 months") con
  **chips de meses** marcados `✓`/`✗` y "2 months to go". → tu Roadmap.
- **Daily Plan** = gauge "Left to spend" + "You spent today" + pasos correctivos + calendario.
- **Onboarding con insight inmediato** (§7.9): al conectar/cargar datos, la primera pantalla ya dice
  algo personal ("income grew while savings stayed flat"). **No pantalla vacía** — abre con valor.

---

## 6. Tab bar (comparación)

```
 Cleo:   Spend  Plan   [Ask Cleo]   Save   Request    (center = chat)
 Cuadra: News   Insights [AISpace]  Save   Config     (center = chat IA "AISpace") ✅ mismo patrón
```
Cuadra ya acertó con el **chat al centro** (la pestaña central es **AISpace**, el Chat IA). De Cleo:
el botón central es el corazón conversacional y todo lo demás orbita alrededor. Mantenerlo.

---

## 7. Checklist de UI para el MVP (qué diseñar)

**Adoptar de Cleo (alto valor, bajo costo):**
- [ ] **Quick-reply chips** en Chat, Insights y Save *(patrón #1)*.
- [ ] **Pills de estado** en lenguaje humano ("Vas bien" / "Ojo, frena") con color.
- [ ] **Gauge "safe-to-spend"** central (número grande + centavos superíndice + rango de fechas).
- [ ] **Donut Ingresos vs Gastos** con microcopy de personalidad.
- [ ] **Tabla mensual** (entra/sale/queda) con rojo/verde.
- [ ] **Filas de comercio con logo** (merchant normalization §5.6).
- [ ] **Bottom sheet de consentimiento** (checkboxes + botón) para acciones agénticas *(FTC/HITL)*.
- [ ] **Tarjetas ricas dentro del chat** (gráfico / artículo News / botón "agregar a lista" Save).
- [ ] **Onboarding con insight inmediato** (sin pantalla vacía).
- [ ] **Microcopy con personalidad** (modos Pana/Bukú/Jevi) en titulares y estados.

**Mantener lo PROPIO de Cuadra (no copiar a Cleo):**
- Paleta **verde cálida** (no crema).
- La **"ruleta"** (menú radial de capabilities por rol) — Cleo no la tiene.
- **News** (feed *masonry* estilo Apple Notes) — Cleo no lo tiene.
- **Save** (marketplace/comparador) — Cleo no lo tiene; es tu diferenciador.

> **Regla:** roba las **interacciones** de Cleo (chips, gauge+pill, consentimiento, generative UI),
> conserva tu **identidad** (verde, ruleta, News, Save) y tu **voz dominicana**.
