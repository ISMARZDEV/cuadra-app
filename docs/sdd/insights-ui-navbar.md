# 🎡 Insights — La rueda y el navbar de 7 botones

> **Contexto:** `insights` (pestaña central-izquierda del tab bar) · **Deriva de**
> [`arquitectura-mvp.md`](../arquitectura-mvp.md) §5 + [`ui-notas-cleo.md`](../ui-notas-cleo.md).
> **Estado:** spec de UI aprobado por el usuario sobre los mockups reales.
> **Implementación mobile:** ver [`insights-home-mvp.md`](./insights-home-mvp.md) — Fase 1 (la
> rueda + carrusel de 3 cards) hecha, el resto pendiente.
> **Fecha:** 2026-06-26.
>
> Define la interacción de la pantalla principal de Insights: una **rueda persistente**
> (presupuesto + tendencia) rodeada de **7 botones** que controlan lo que se muestra debajo.

---

## 1. La rueda (header persistente)

Siempre visible, no cambia con los botones. Muestra:
- **Total Expense vs Budget** (número grande central + presupuesto debajo).
- **Línea de tendencia** del gasto del período + **pill de %** (ej. `+75%` = consumo del budget).
- **Marcadores de categoría sobre el arco de color** (🍔 🚗 🐶 ⛽ 🎵): las categorías de mayor
  gasto, posicionadas sobre un arco **verde → amarillo → naranja → rojo** (heatmap de consumo).
- En estado vacío: *"Your financial activity will appear here 😉!"* + botón Add central.

> El arco doble-propósito (progreso de budget + marcadores de categoría) es propio de Cuadra;
> Cleo no lo tiene. Las categorías que se ven aquí salen del **enrichment** (§5.6).

---

## 2. Los 7 botones — 5 navbar + 2 modales

Posición alrededor de la rueda: `⊕`(izq) · `🗂️ 🥧 [↗↘] $ 🔔`(arco inferior) · `☆`(der).

| # | Icono | Tipo | Acción |
|---|-------|------|--------|
| 1 | **↗↘ pill** (centro, default activo) | navbar | **Home carrusel** (ver §3) |
| 2 | **🗂️ bandeja** | navbar | **Movimientos / Histórico** completo |
| 3 | **🥧 pie** | navbar | **Reportes** |
| 4 | **$ dólar** | navbar | **Presupuestos** |
| 5 | **🔔 campana** | navbar | **Alertas & Recordatorios** |
| 6 | **⊕** (izquierda) | **modal** | **Nueva categoría** |
| 7 | **☆ estrella** (derecha) | **modal** | **Metas & Net worth** |

> **Regla:** los 5 navbar **reemplazan la sección bajo la rueda**; los 2 modales (`⊕`, `☆`)
> abren un **bottom-sheet** por encima, sin cambiar la sección.

---

## 3. Botón 1 — Home carrusel (card con swipe horizontal)

La sección default NO es una sola vista: es un **carrusel de 3 cards** que se navega con
**swipe horizontal** (indicador de dots + `+` para añadir al final).

```
   ← swipe →            ← swipe →
┌──────────────┐   ┌──────────────┐   ┌──────────────────┐
│ ① ACCOUNTS   │   │ ② SPACES     │   │ ③ DAILY DIARY    │
│              │   │              │   │                  │
│ 4 métricas:  │   │ ver / crear  │   │ stack de wallets │
│  Total Income│   │ spaces       │   │ Total balance    │
│  Total Bills │   │ + asignar    │   │  por moneda      │
│  Savings     │   │   wallets    │   │  (DOP / USD)     │
│  Balance     │   │   existentes │   │ selector Hoy·    │
│ + Recent tx  │   │   a un space │   │  Semana·Mes·     │
│ + (add tx)   │   │              │   │  Trimestre·📅    │
│ + ✨ edit IA │   │              │   │ Daily Target /   │
│              │   │              │   │  You spent today │
└──────────────┘   └──────────────┘   └──────────────────┘
   [mockups 1/9/10]   [mockup 3/11]      [mockups 4/5/12/13]
```

- **Card ① Accounts:** las 4 tarjetas métricas (§5.3) + Recent Transactions (con merchant+logo).
  El **`+`** de esta card agrega **transacciones** (income/expense/transfer) → NO es el `⊕` de la
  rueda. El **✨** es edición asistida por IA (captura voz/OCR, §5.4). "See All" → botón 2.
- **Card ② Spaces:** ver/crear Spaces (sobres/proyectos: Hogar, Negocio). Permite **asignar
  wallets ya creadas** a un space.
- **Card ③ Daily Diary:** stack de wallets, **Total balance por moneda en líneas separadas**
  (DOP/USD, nunca sumadas — §12·B), selector temporal, Daily Target Spending / You spent today
  + gamificación (% + ⭐).

---

## 4. Detalle de los demás botones

- **② 🗂️ Movimientos / Histórico:** lista COMPLETA de transacciones (la card ① solo muestra
  recientes). Búsqueda (semántica, §5.5) + filtros, incl. **suscripciones / recurrentes**.
  Destino del "See All →".
- **③ 🥧 Reportes:** gasto por categoría (donut), Ingresos vs Gastos, breakdown mensual,
  % esenciales/recurrentes, reportes IA (§5.5, ui-notas §2).
- **④ $ Presupuestos:** budgets por **categoría O comercio** + **umbrales de alerta 70/85/100**
  + detalle del anillo. *(Gap aprobado al MVP — ver `sdd/insights-scope`.)*
- **⑤ 🔔 Alertas & Recordatorios:** insights proactivos del agente (§7.9), alertas de
  presupuesto, **bill reminders / próximos pagos**. *(Gaps aprobados al MVP.)*
- **⑥ ⊕ Nueva categoría (modal):** crea una categoría con **ícono/emoji**; aparece como
  marcador en el arco de la rueda. Cada categoría = una cuenta `income`/`expense` del ledger
  (ver [`insights-ledger.md`](./insights-ledger.md) §1).
- **⑦ ☆ Metas & Net worth (modal):** savings goals (progreso/alcancía), **patrimonio neto**
  (activos − pasivos), logros/gamificación ⭐. *(Net worth = gap aprobado al MVP.)*

---

## 5. Implicaciones de dominio (afinan §5.2)

| Hallazgo de UI | Refinamiento del modelo |
|----------------|--------------------------|
| Un Space agrupa categorías, transacciones **y wallets** | `space` membership incluye `account_id` (no solo categorías/tx). |
| Las categorías se crean desde la app (⊕) con ícono/emoji | `Category` es creable por el usuario; tiene `icon`; mapea a cuenta `income`/`expense` del ledger. |
| Las transacciones se agregan desde el `+` de la card ① | El alta de tx es una acción de la sección Home, no de la rueda. |
| Total balance por moneda en líneas separadas | Confirma `balance` derivado del ledger, **por moneda** (§12·B, ADR 14). |
| Daily Target / You spent today + ⭐ | Métricas derivadas (tools determinísticas, §7.3) + gamificación de presupuesto. |

---

## 6. Mapeo botón → datos (para el contrato de API)

| Botón / card | Endpoints/queries que alimenta |
|--------------|--------------------------------|
| ① Accounts | `GET /v1/insights/metrics` (income/expenses/savings/balance) · `GET /v1/insights/transactions?recent` |
| ② Spaces | `GET/POST /v1/insights/spaces` · `POST /v1/insights/spaces/{id}/accounts` |
| ③ Daily Diary | `GET /v1/insights/accounts` · `GET /v1/insights/balance?by=currency` · `GET /v1/insights/daily-target` |
| 🗂️ Movimientos | `GET /v1/insights/transactions` (filtros, búsqueda, recurrentes) |
| 🥧 Reportes | `GET /v1/insights/reports/by-category` · `/income-vs-expense` |
| $ Presupuestos | `GET/POST /v1/insights/budgets` (category/merchant + thresholds) |
| 🔔 Alertas | `GET /v1/insights/alerts` · `GET /v1/insights/reminders` |
| ⊕ Categoría | `POST /v1/insights/categories` |
| ☆ Metas/Net worth | `GET/POST /v1/insights/goals` · `GET /v1/insights/net-worth` |

> Endpoints con prefijo de contexto `/v1/insights/...` (convención del proyecto). Contrato
> versionado + OpenAPI → `@cuadra/api-client` (ADR 24).
