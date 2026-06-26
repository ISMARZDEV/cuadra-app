# 🏗️ Cuadra — Arquitectura de Solución (MVP + Fases)

> **Producto:** **Cuadra** *(app)* — copiloto financiero con IA para LatAm, RD primero.
> **Chat IA:** **AISpace** (el asistente conversacional). **Tarjeta (riel propio, fase 5):** **Cuadra Card**. *(§1.2.)*
>
> **Documento:** arquitectura de solución del **MVP** y plano de **fases posteriores**.
> **Fecha:** 2026-06-25 · **Base:** [`concepto-producto.md`](./concepto-producto.md),
> [`research/cleo-analisis.md`](../research/cleo-analisis.md),
> [`research/cleo-articulos-fuente.md`](../research/cleo-articulos-fuente.md) *(8 artículos + diagramas)*,
> [`research/supermercadosrd-analisis.md`](../research/supermercadosrd-analisis.md).
> · **UI:** [`ui-notas-cleo.md`](./ui-notas-cleo.md) *(patrones de UI de Cleo para el diseño del MVP)*.
>
> **Principio rector:** *el LLM razona la intención; las herramientas determinísticas hacen
> los números* (validado por Cleo). El moat no es la IA — es el **dato propietario**.
>
> 🧠 **¿Nuevo en esto o quieres entenderlo sin tecnicismos primero?** Lee
> [`arquitectura-explicada.md`](./arquitectura-explicada.md) — explica TODO con analogías y glosario.

---

## Tabla de contenido
1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Alcance del MVP (qué entra / qué NO)](#2-alcance-del-mvp-qué-entra--qué-no)
3. [Modelo de roles y capabilities](#3-modelo-de-roles-y-capabilities)
   - [3·B. Arquitectura multi-país (jurisdicción + ubicación dinámica)](#3b-arquitectura-multi-país-jurisdicción--ubicación-dinámica)
4. [Arquitectura de alto nivel](#4-arquitectura-de-alto-nivel)
5. [Pieza 1 — Insights](#5-pieza-1--insights)
6. [Pieza 2 — Save](#6-pieza-2--save)
7. [Pieza 3 — AISpace: Chat IA Orquestador (LangGraph)](#7-pieza-3--aispace-chat-ia-orquestador-langgraph)
8. [News (feed de contenido)](#8-news-feed-de-contenido)
9. [Stack tecnológico](#9-stack-tecnológico)
10. [Modelo de datos consolidado](#10-modelo-de-datos-consolidado)
11. [Captura de datos (ingesta)](#11-captura-de-datos-ingesta)
12. [Seguridad, privacidad y compliance](#12-seguridad-privacidad-y-compliance)
    - [12·B. Modelo de dinero y ledger](#12b-modelo-de-dinero-y-ledger)
    - [12·C. Offline-first (sync, conflictos, idempotencia)](#12c-offline-first-sync-conflictos-idempotencia)
    - [12·D. Patrón del agente y unit economics de IA](#12d-patrón-del-agente-y-unit-economics-de-ia)
    - [12·E. Entrega y operación (delivery plane)](#12e-entrega-y-operación-delivery-plane)
13. [Riesgos y mitigaciones](#13-riesgos-y-mitigaciones)
14. [Roadmap por fases (post-MVP)](#14-roadmap-por-fases-post-mvp)
15. [Decisiones de arquitectura (ADRs)](#15-decisiones-de-arquitectura-adrs)
16. [Próximos pasos](#16-próximos-pasos)
17. [Lecciones del proyecto de reuso (adoptar / evitar)](#17-lecciones-del-proyecto-de-reuso-adoptar--evitar)

---

## 1. Resumen ejecutivo

### 1.1 La tesis del MVP — el triángulo
Cuadra **no compite** como "otro gestor de gastos" (Cleo, MonAi, GastaBien, Novia) ni como "otro
comparador de precios" (SupermercadosRD). El diferenciador **no es ninguna pieza por separado**,
sino el **triángulo** que **AISpace** (el Chat IA) forma al cruzarlas:

```
            AISpace · Chat IA (Orquestador)
               /              \
        INSIGHTS  ←─────────→  SAVE
       (tu dinero)           (el catálogo de precios)
```

- Cleo/MonAi tienen tu dato, **no** el catálogo local de RD.
- SupermercadosRD tiene el catálogo, **no** sabe nada de tu plata.
- **Nadie en RD tiene ambos + un agente que los conecta.**

Eso habilita **coaching prescriptivo** (no descriptivo):
> *"Gastaste RD$3,200 en el súper. Esa misma compra en Bravo costaba RD$2,750 — te ahorro
> RD$450. ¿Te armo la lista? "* — y todo por **voz**, sin formularios.

### 1.2 Marca
- **App / producto:** **Cuadra** (logo verde) — *nombre confirmado*.
- **Chat IA (asistente conversacional, pestaña central):** **AISpace** — la marca del cerebro
  agéntico dentro de Cuadra.
- **Tarjeta (fase 5):** **Cuadra Card** (tarjeta first-party de la app).

### 1.3 Visión de superioridad — Cuadra = el SUPERCONJUNTO

Cuadra **no busca igualar; busca absorber lo mejor de cada competidor Y añadir lo que ninguno
tiene.** No es "otra app de finanzas" — es la **central** que unifica finanzas + precios + fiscal
+ productos financieros + comunidad en un solo cerebro agéntico. El objetivo es **la app más
completa del mercado LatAm**.

| Capacidad | Cleo | MonAi | GastaBien | Novia | SúperRD | **Cuadra** |
|-----------|:----:|:-----:|:---------:|:-----:|:-------:|:-------:|
| Registro por voz + IA | ✅ | ✅✅ | — | — | — | **✅✅** |
| OCR de recibos | — | ✅ | — | — | — | **✅** |
| Captura por correo bancario | — | ✅ | ✅ | ✅ | — | **✅** |
| Coach con personalidad | ✅✅ | — | — | — | — | **✅✅** |
| Memoria persistente | ✅ | — | — | — | — | **✅** |
| Presupuesto + gamificación | ✅ | ✅ | ~ | ~ | — | **✅✅** |
| Parejas / compartido | — | ✅ | — | ✅ | — | **✅** |
| Multi-moneda DOP/USD | ~ | ✅ | — | — | — | **✅** |
| Catálogo de precios + comparación | — | — | — | — | ✅ | **✅** |
| Histórico de precios | — | — | — | — | ✅ | **✅** |
| **Coaching prescriptivo de compras (triángulo)** | — | — | — | — | — | **★** |
| **Fiscal: e-CF / ITBIS / 606** | — | — | — | — | — | **★** |
| **Caja de Impuestos (apartar al fisco)** | — | — | — | — | — | **★** |
| **Marketplace financiero (bancos/seguros)** | ~ | — | — | — | — | **★** |
| **News / red de creadores** | — | — | — | — | — | **★** |
| **Tarjeta first-party + ITBIS al swipe (RD)** | ✅(US) | — | — | — | — | **★** |
| **Remesas integradas** | — | — | — | — | — | **★** |
| **Crédito alternativo (thin-file)** | ✅(US) | — | — | — | — | **★** |
| **Multi-rol (persona/contador/comercio/influencer)** | — | — | — | — | — | **★** |
| **Multipaís LatAm** | — | — | — | — | — | **★** |

> **★ = lo que NADIE tiene = el foso.** Cuadra = la unión de TODO lo bueno de la competencia **+ 10
> capacidades que ningún competidor ofrece**. Esa es "la mejor y más completa".

### 1.4 Cómo se construye la app más completa SIN morir en el intento

La regla no es "hacer menos" — es **secuenciar**. La ambición va completa en el **techo** (esta
visión y el roadmap de §14); la disciplina va en el **orden de construcción** (piso por piso,
sobre cimientos que soportan los 50 pisos). Por eso:

1. **El modelo de datos y de roles nace COMPLETO** (multi-rol, multi-moneda, first-party-ready) —
   los cimientos soportan toda la visión desde el día 1.
2. **La implementación es por capas** — el MVP entrega la primera capa funcionando de punta a
   punta, no media docena de capas a medias.
3. **Cada función no solo se iguala, se SUPERA** — el listón es "lo mejor de la competencia + el
   triángulo", no "presente". Centralizar es el diferenciador: lo que en otros está disperso, en
   Cuadra conversa entre sí.

---

## 2. Alcance del MVP — la primera capa de la super-app

> **El MVP es la PRIMERA CAPA de la super-app (§1.3), no una versión recortada de la ambición.**
> Entrega un rol (Usuario Normal) y las 3 piezas core **funcionando de punta a punta y mejor que
> la competencia**, sobre cimientos (datos + roles) que ya soportan TODA la visión. La ambición no
> se reduce: se **secuencia** (§1.4). Lo demás llega por fases (§14), no se elimina.

### ✅ DENTRO del MVP

| Pieza | Alcance MVP |
|-------|-------------|
| **Identidad** | Auth + modelo de roles/capabilities **multi-rol ready**, pero solo el rol **Usuario Normal** activo |
| **Insights** | Wallets multi-moneda **DOP/USD**, transacciones (ingreso/gasto/transferencia), categorías, presupuesto + anillo, Spaces, balance, Daily Diary. Captura: **voz + chat + OCR** (manual) |
| **Save** | Catálogo de **supermercados** (replicar SupermercadosRD): pipeline scraping → normalización → matching → taxonomía; búsqueda; comparación; **lista de compra** |
| **AISpace** (Chat IA) | Router LangGraph (router-a-nodos) + subagentes: **Finance, Purchases, Coach, Support**. Entrada por **voz (STT)** y texto. Acciones con confirmación (human-in-the-loop) |
| **News** | Feed *masonry* curado por **Super Admin + agente IA** (noticias oficiales DGII/BCRD + contenido financiero). Sin rol Influencer aún |
| **Config** | Perfil, monedas, suscripción freemium con **cancelación de 1 toque** |

### ❌ FUERA del MVP (fases posteriores)
- Roles Accountant (lo fiscal: e-CF, ITBIS, 606, Caja de Impuestos), Commercial, Influencer.
- Captura automática (correo bancario, SMS, on-device).
- Tarjeta **Cuadra**, remesas, parejas, QR, crédito.
- Save: que los proveedores carguen su data + cobro por promoción.
- Multipaís.

> El **modelo de datos y de roles se diseña COMPLETO desde ya** (multi-rol y first-party-ready)
> para no migrar el esquema después — se **implementa** por fases.

---

## 3. Modelo de roles y capabilities

### 3.1 Principio: capabilities ADITIVAS, no roles excluyentes
Una **identidad** acumula **roles**; cada rol aporta **capabilities** (funcionalidades). Un mismo
usuario puede ser, a la vez, Usuario Normal + Accountant + Influencer. Esto refleja el insight
del concepto (*"para el informal, persona y negocio son la misma cosa"*).

```
Identidad ──< UsuarioRol >── Rol ──< RolCapability >── Capability
   │                                                        │
   └────────── capabilities efectivas (unión) ─────────────┘
                         ↓
        UI compuesta dinámicamente (tabs + "ruletas")
```

La **"ruleta"** (menú radial) muestra las capabilities **extra** del rol; el **tab bar**
(News · Insights · AISpace · Save · Config) son las **core** que todos tienen.

### 3.2 Catálogo de roles

| Rol | Quién | Capabilities (ruleta) | Fase |
|-----|-------|------------------------|------|
| **Usuario Normal** | Empleado, gig worker, persona | wallet, ahorros, parejas, conectar QR, **tarjeta Cuadra**, remesas | **MVP** (extras → fase 5) |
| **Accountant** | Contador, micro/pequeña empresa | negocio, **e-CF/scan**, ITBIS/606, Caja de Impuestos, exportar al equipo contable | Fase 2 |
| **Commercial** | Banco Popular, Grupo Humano, La Sirena, vendedor | cargar productos a Save, KYB, comprar promoción/destacado | Fase 3 |
| **Influencer** | Creador de contenido financiero | publicar en News, canales, revenue-share | Fase 4 |
| **Super Admin** | Solo el fundador | gestión DB, tablero, sistema, analítica, **publicar News** | MVP (uso interno) |

### 3.3 Implicación de arquitectura
Cada rol nuevo **es un producto** (onboarding, data y compliance propios). Por eso se aíslan como
**capabilities** detrás de *feature flags* por rol; el MVP enciende solo las del Usuario Normal y
las de Super Admin (para curar News). Migrar permisos en producción es carísimo → **el modelo
nace completo, la implementación es incremental.**

---

## 3·B. Arquitectura multi-país (jurisdicción + ubicación dinámica)

> **Principio: país ≠ traducción. País = lógica de negocio.** El multi-país es un **cimiento**, no
> una fase tardía — mismo trato que los roles: **se diseña completo desde el día 1, se activa un
> solo mercado (RD) en el MVP.** Junto con los roles, son los **dos ejes que gobiernan qué ve y
> qué puede hacer cada usuario.**

### 3·B.1 El concepto central: Mercado (Market / Jurisdiction)
Objeto de **primera clase** que encapsula TODA la lógica de un país. La app no tiene "ifs por
país" regados: tiene un `Market` que resuelve políticas vía puertos (patrón Strategy/Adapter por
jurisdicción).

| Qué define el Market | RD (MVP) | US (fase) | CO (fase) |
|----------------------|----------|-----------|-----------|
| Moneda base + soportadas | DOP + USD | USD | COP + USD |
| Idioma / acento (personalidad) | es-DO ("Pana") | en-US / es-US (diáspora) | es-CO |
| **Fiscal** | e-CF, ITBIS, 606, DGII | IRS, 1099/Schedule C | DIAN, factura electrónica |
| **Captura de datos** | correo/SMS/OCR (sin Plaid) | **Plaid** | **Belvo** |
| **Catálogo Save** | tiendas RD | tiendas US | tiendas CO |
| **Marketplace financiero** | bancos/seguros RD | productos US | productos CO |
| **Roles habilitados** | Accountant=e-CF | Accountant=1099 | Accountant=DIAN |
| **News / influencers** | creadores RD | creadores US | creadores CO |
| **Issuing / pagos** | Pomelo / banco local | CFSB/Lithic (§concepto 10·E) | local |
| **Compliance / datos** | SB RD | leyes estatales US | SFC / habeas data CO |

### 3·B.2 Home vs. ubicación actual (la gente que viaja)
```
Usuario.home_market     = residencia (identidad fiscal, moneda base, obligaciones)  ← estable
Usuario.current_market  = ubicación actual detectada (GPS/IP/SIM/timezone)          ← dinámico
```
- **`home_market`** define quién ERES fiscalmente (un dominicano sigue debiendo e-CF aunque viaje).
- **`current_market`** define tu CONTEXTO ahora (catálogo, moneda de gasto, feed, funciones).
- Detección con **consentimiento**; el usuario puede fijar el mercado manualmente.

### 3·B.3 Resolución de capabilities
```
capabilities_efectivas = f( roles_del_usuario, home_market, current_market )
```
**Ejemplo — dominicano (home=RD) de viaje en USA (current=US):**
- ✅ e-CF / Caja de Impuestos RD **siguen** (obligación home).
- 🔄 **Save** → tiendas US; **moneda sugerida** → USD con **FX** a su DOP base.
- 🔄 **News** → creadores US + los RD que ya sigue.
- 🔄 Funciones US-relevantes **se habilitan**; las que no aplican, se ocultan.
- 🔗 Alimenta el **corredor de remesas** US↔RD (concepto §12): el viajero/diáspora es el puente.

### 3·B.4 Orden de expansión
**RD (MVP) → 🇺🇸 USA (diáspora/remesas) → 🇨🇴 Colombia (open finance) → 🌎 global.** Cada nuevo
mercado = un `Market` nuevo con sus adaptadores; el núcleo (Insights, Save, AISpace) no cambia.

### 3·B.5 Implicación técnica
- **Todo lo que varía por país vive detrás de un puerto resuelto por `Market`**: `FiscalProvider`,
  `MovementSource`, `CatalogSource`, `DataProvider`, `MarketplaceProvider`,
  `Personality`, `IssuingProvider`. (Hexagonal a escala de jurisdicción.)
- **i18n/L10n**: idioma, formato de moneda/fecha/número, acento de la personalidad.
- **Residencia de datos / compliance** por jurisdicción desde el modelo (no parche posterior).
- **MVP:** un solo `Market` (RD) activo; la **abstracción existe completa** para no migrar.

---

## 4. Arquitectura de alto nivel

Estilo **hexagonal + screaming architecture**: las carpetas gritan el dominio, no el framework.
Cada *bounded context* expone **puertos**; los **adaptadores** implementan infraestructura
intercambiable por país/proveedor (mismo patrón que los conectores del proyecto fiscal-contable).

> 🗂️ **La estructura concreta de directorios del monorepo** (carpetas, capas por contexto, ingesta,
> delivery plane, mobile) vive en [`estructura-monorepo.md`](./estructura-monorepo.md), con la
> trazabilidad carpeta → ADR/sección.

```
┌───────────────────────────── APP MÓVIL (React Native + Expo) ─────────────────────────────┐
│  News  │  Insights  │  AISpace (Chat IA)  │  Save  │  Config         UI compuesta por rol  │
└───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                             │  REST + WebSocket/SSE (streaming de chat)
┌────────────────────────────── BACKEND (Python · FastAPI) ─────────────────────────────────┐
│                                                                                            │
│  ┌── Identity & Access ──┐  ┌──── Insights ────┐  ┌────── Save ──────┐  ┌──── News ─────┐   │
│  │ roles / capabilities  │  │ cuentas, tx,     │  │ catálogo, precios │  │ feed, fuentes │   │
│  │ auth, suscripción     │  │ presupuesto,     │  │ matching, listas  │  │ noticias IA   │   │
│  └───────────────────────┘  │ spaces, metas    │  └──────────────────┘  └───────────────┘   │
│                             └──────────────────┘                                            │
│  ┌──── DOS PLANOS (LangGraph, §7.9) ───────────────────────────────────────────────────┐   │
│  │  CONVERSACIONAL (real-time): router+handoff → {Finance·Purchases·Coach·Support} LEE ──┼─┐ │
│  │  BACKGROUND (async, batch): Agente Insights + enriquecimiento (§5.6)  ESCRIBE ────────┼┐│ │
│  │  Tools determinísticas · interrupt() · Postgres checkpointer                          │││ │
│  └──────────────────────────────────────────────────────────────────────────────────────┘││ │
│   STORES COMPARTIDOS: Perfil Financiero · Insights  ◄──────────────────────────────────────┘│ │
│                                                                                            │
│  Market/Jurisdiction (resuelve políticas por país — §3·B)   ·   Ledger doble entrada (§12·B)│
│  PUERTOS (hexagonal):  MovementSource · CatalogSource · DataProvider · OCRPort ·             │
│   STTPort · LLMPort · MarketplaceProvider · IssuingProvider · NotificationPort ·            │
│   FiscalProvider(fase 2) · SyncPort(offline §12·C)                                          │
└──────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                            │
   PostgreSQL (minor units + ledger) + pgvector  │  Object Storage (recibos/imágenes)         │
   STT (voz)  │  OCR (visión)  │  LLM (Claude)  │  Scrapers/Jobs (Save)  │  LangSmith · Sentry
   App móvil: DB local (PowerSync/WatermelonDB) → sync con cola + idempotencia (§12·C)
```

---

## 5. Pieza 1 — Insights

### 5.1 Qué es
Gestor de finanzas personales con IA: el usuario ve y controla **ingresos, gastos, ahorros y
balance**, con presupuesto, gamificación y multi-moneda.

**Benchmark — MonAi (get-monai.app), el competidor más cercano de Insights:** app de
seguimiento de gastos con IA (iOS+Android, 4.8★ / 8,500+ reseñas). YA tiene: **entrada por voz**
("gasté $40 en comestibles") que detecta monto/categoría/fecha, **OCR de recibos**,
**automatización por correo**, **captura vía Apple Pay** (te pide registrar tras pagar), **Apple
Shortcuts**, **listas compartidas/parejas** en tiempo real, multi-moneda y multi-idioma. Filosofía
**deliberadamente minimalista** ("sin dashboards abrumadores, sin *feature creep*"). Prueba gratis
7 días + suscripción.

> **⚠️ Lectura competitiva (crítica):**
> 1. **La captura inteligente (voz + OCR + correo + Apple Pay) es TABLE-STAKES, no
>    diferenciador** — MonAi y GastaBien ya la tienen. Cuadra debe igualarla para no perder, pero
>    no gana ahí.
> 2. **El feature "parejas" no es novedad** — MonAi ya lo tiene en core (Cuadra lo tenía en ruleta
>    futura).
> 3. **Cuadra gana SOLO por el triángulo** (Insights × **Save** vía Coach): MonAi **no tiene
>    catálogo de precios local de RD** ni coaching prescriptivo de compras. Ese es el foso.
> 4. **Tensión estratégica:** MonAi gana siendo minimalista; Cuadra es una super-app (5 roles,
>    ruletas). Es exactamente el riesgo de *feature creep* del concepto §16 → la disciplina de
>    recortar el MVP es vital para no perder foco frente a una herramienta enfocada.

Otro benchmark: **Cleo** (coach con personalidad, arquitectura agéntica madura).

### 5.2 Modelo de dominio (de las pantallas)
- **Wallet/Cuenta**: efectivo, débito, crédito · moneda (**ISO 4217**: DOP, USD, …) · saldo
  **derivado del ledger** (§12·B), no almacenado mutable. "Total balance" agrega por moneda.
- **Transacción**: tipo (ingreso · gasto · transferencia) · monto (**entero en *minor units***, §12·B)
  · moneda · categoría · comercio · fecha · cuenta · adjunto (recibo) · fuente (manual/voz/OCR)
  · `idempotency_key` (anti-duplicado en sync, §12·C).
- **Categoría**: con ícono; clasificación asistida por IA (alimentos, transporte, suscripciones…).
- **Presupuesto**: límite por categoría/periodo + anillo de progreso + "Daily Target Spending" y
  "You spent today" (gamificación: % y estrellas).
- **Space**: agrupa categorías/transacciones (sobres/proyectos: Hogar, Negocio…).
- **Meta de ahorro / Savings**: objetivo + progreso (alcancía).
- **Daily Diary**: vista temporal (Hoy/Semana/Mes/Trimestre).

### 5.3 Métricas core (las 4 tarjetas)
`Total Income` · `Total Bills/Expenses` · `Savings` · `Balance` — derivadas, **calculadas por
tools determinísticas**, nunca por el LLM.

### 5.4 Captura en el MVP
Manual + **voz** (STT → IA categoriza, estilo MonAi) + **OCR** de recibo (foto → ítems +
ITBIS + total). **Offline-first** (cola local + sync, §5.5 #5). Captura **automática** (correo
bancario) → fase 1 (table-stakes, §13).

### 5.5 Superset de Insights — funciones validadas por demanda

Lista derivada del *feature request board de MonAi* (votos reales = **demanda validada por el
mercado**). Cuadra las absorbe **y las supera** (la columna "Edge Cuadra" es lo que el especialista no
puede dar porque no tiene el triángulo ni lo local-RD):

| Función (votos MonAi) | Cuadra | Edge Cuadra (cómo SUPERA) | Fase |
|-----------------------|-----|------------------------|------|
| Reportes con IA (2,136) | núcleo | Cruza gastos × **Save (precios)** × fiscal → respuestas que MonAi no puede | MVP |
| Presupuestos (1,807) | ✅ | + anillo + Daily Target + alertas proactivas del agente | MVP |
| Rango de fechas custom (1,547) | ➕ | + comparar periodos + **proyección futura** (gemelo financiero) | MVP |
| Múltiples divisas (1,229) | ✅ | DOP/USD + **conversión FX** + remesas (F5) | MVP / F1 |
| **Offline para más tarde (988)** | ➕ | **offline-first** (cola local + sync) + **SLM local** parsea sin red | **MVP** |
| Iconos/emojis categoría (939) | ➕ | + sugeridos por IA | MVP-light |
| Búsqueda avanzada (877) | ➕ | + **semántica (pgvector)** + lenguaje natural vía agente | MVP / F1 |
| **Ubicaciones en transacción (762)** | ➕ | **puente Insights→Save**: autocompletar comercio desde el catálogo + sobrepago en sitio | MVP-light / F1 |
| **Import/Export CSV (581)** | ➕ | **adquisición**: importar de MonAi/Cleo/GastaBien ("cámbiate sin perder data") + export (FTC) | F1 |
| Transcripción voz híbrida (378) | ✅ | **local primero** (offline) + Whisper con red → gana en conexión mala | MVP |

> **3 decisiones que esto dispara** (ver ADRs §15):
> 1. **Offline-first es estructural en RD** (conexión irregular), no un feature tardío.
> 2. **Geolocalización = puente Insights→Save** (autocompletar comercio + sobrepago en sitio) →
>    refuerza el foso; MonAi no puede replicarlo.
> 3. **CSV import = canal de adquisición barato** (migrar usuarios de la competencia).

### 5.6 Capa de enriquecimiento de transacciones (fundacional — patrón Autopilot de Cleo)

Cleo enseña una lección clave: **una transacción cruda no sirve; hay que enriquecerla.** No basta
saber que es "un pago"; hay que saber que es *electricidad → utilidades → gasto esencial
recurrente*. **Todo lo demás (insights, presupuesto, safe-to-spend, planning, el triángulo)
consume el dato ENRIQUECIDO, no el crudo.**

```
Transacción cruda                     →  Transacción enriquecida
"CECONY XX4508 ... $45.21"               comercio: Con Edison (normalizado, logo)
                                         categoría: Utilidades > Energía > Electricidad
                                         esencial: sí · recurrente: sí · stream: gasto fijo
                                         ubicación: RD > ...   (geo, §5.5 #8)
```

- **Qué infiere (cada atributo con un `confidence_score`):** comercio **normalizado** (+logo),
  **categoría jerárquica** (Cleo: 2 niveles, ~19 top-level / ~175 ítems), **esencial vs. discrecional**,
  **recurrente vs. único** (requiere analizar **secuencias**, no registros sueltos), **stream de
  ingreso**, ubicación. El confidence permite a los agentes elegir el de mayor confianza y marcar
  ambigüedad en vez de adivinar.
- **Cómo — modelo "Swiss cheese" (capas, patrón Cleo):** cada capa atrapa lo que la anterior falla.
  ```
  1. Modelos tree-based (rápidos, baratos)         → patrones comunes
        │ baja confianza ↓
  2. SLMs fine-tuneados                            → casos ambiguos (descripciones, comercios)
        │ sin respuesta confiable ↓
  3. Fallback a modelo frontera (Claude)           → ~1 de cada 10,000 tx; máx capacidad solo si hace falta
  ```
  Corre sobre **cada** transacción en tiempo real, barato. (MVP: empezar con Claude clasificando;
  añadir las capas baratas cuando haya volumen, §7.8.)
- **Cómo se entrena (golden → oracle → silver → producción):**
  ```
  GOLDEN SET ──► ORACLE ──► SILVER SET ──► MODELOS DE PRODUCCIÓN ──┐
  (hand-label,   (mejor      (oracle        (tree + SLM,           │
   usuario +      posible:    etiqueta        entrenados en silver) │
   experto)       frontera+   gran volumen)                         │
  └──── evaluación ◄────────── web)            LLM-AS-JUDGE (drift) ─┘
  ```
  El oracle (caro) corre **una vez** generando data; se amortiza en producción. El **LLM-as-judge**
  da señal de drift sin anotación manual.
- **Por qué es el cimiento:** sin enriquecimiento, el coaching es ruido. Con él, *"apartá el ITBIS
  de este ingreso"*, *"este gasto recurrente esencial no lo toques"*, *"safe-to-spend = ingresos −
  esenciales − metas"* se vuelven posibles. Alimenta directamente el **Perfil Financiero** (§7.9).

---

## 6. Pieza 2 — Save

### 6.1 Qué es
Catálogo de proveedores y productos estilo Uber Eats / Pedidos Ya. **MVP = supermercados**,
replicando SupermercadosRD. Futuro: bancos (tarjetas, préstamos, inversión), aseguradoras,
agricultores, tiendas, vendedores independientes.

### 6.2 Pipeline de datos (del análisis de SupermercadosRD)
```
INGESTA → NORMALIZAR unidades → MATCHING de productos → TAXONOMÍA canónica → INDEXAR → SERVIR
```
- **Ingesta:** puerto `CatalogSource` con adaptadores por cadena. **Auditar primero si la
  tienda usa VTEX** (API JSON `/api/catalog_system/pub/products/search`) → evita scrapear HTML.
- **Normalización de unidades:** parsear `LB/OZ/ML/und/multipack` → **precio por unidad base**
  (RD$/kg, RD$/L). Única comparación justa.
- **Matching (entity resolution):** EAN → fuzzy (marca+nombre+tamaño, `pg_trgm`) → embeddings
  (`pgvector`) → revisión humana (admin). **Es el 70% del trabajo.**
- **Taxonomía:** mapeo `categoría_tienda → canónica`, curada en el panel admin.
- **Histórico de precios:** tabla `precio` **append-only** (time-series) = el activo incopiable.

### 6.3 Modelo de dominio
`Proveedor` (tienda) · `ProductoCanonico` · `TiendaProducto` (precio actual por tienda) ·
`Precio` (histórico) · `Oferta` · `ListaCompra` + `ItemLista`.

### 6.4 Estrategia de cold-start
Scraping = **bootstrap**. Endgame (fase 3): los proveedores (rol Commercial) cargan su data y
**pagan por promoción** → marketplace de dos lados. Resuelve el huevo-gallina.

---

## 7. Pieza 3 — AISpace: Chat IA Orquestador (LangGraph)

> **AISpace** es el nombre de marca del **Chat IA** de Cuadra — el cerebro agéntico conversacional
> (pestaña central del tab bar). En este documento, "AISpace" = "el orquestador del chat".

### 7.1 Patrón: router-a-nodos multi-agente (MVP) → handoff/Supervisor (escala)
> **Decisión (gap #4, §12·D):** multi-agente **desde el día 1**, pero por **router-a-nodos**, NO por
> el patrón `langgraph-supervisor` (que mete una llamada LLM completa POR TURNO solo para rutear =
> **~3× tokens**). El MVP es el grafo de abajo con un **router barato** (clasificación + cortocircuitos,
> §7.8) que enruta a **nodos especializados** (Finance · Purchases · Coach · Support), cada uno un agente
> con sus tools. **Validado por el proyecto de reuso** (`backend/orchestrator/graph.py`: `classify_intent`
> → conditional edges a nodos) **y por Cleo** (router clasificador + handoff, incluso encoder-only a
> 50 ms). Se **gradúa** añadiendo el protocolo de handoff (`select_new_agent`, abajo) y, solo si la
> complejidad lo exige, el Supervisor LLM (rango sano 3-8 agentes).
>
> **Referencia oficial — patrón "Router" de LangChain:**
> [docs.langchain.com/.../multi-agent/router-knowledge-base](https://docs.langchain.com/oss/python/langchain/multi-agent/router-knowledge-base)
> documenta exactamente esto (router con *structured output* → nodos `create_agent` especializados,
> **sin** `langgraph-supervisor`). Tiene **dos variantes**:
> - **Ruta única** (`conditional_edges` → UN nodo por turno) → **es el MVP** (igual que el reuso).
> - **Fan-out paralelo** (`Send` a varios agentes en paralelo → nodo de **síntesis** con reducer
>   `operator.add`) → **candidato para el TRIÁNGULO**: cuando el Coach cruza **Insights × Save** en una
>   sola respuesta (*"esa compra costaba RD$450 menos en Bravo"*), ese fan-out + síntesis es el patrón.
>
> El **handoff** (`select_new_agent`) es un patrón aparte (estilo *Swarm*) que se monta **encima** del
> Router — esa página no lo incluye; nosotros sí (lección de Cleo).

Usamos **LangGraph Graph API** (declarativa, ideal para routing condicional y orquestación
multi-agente), no Functional API. El proyecto fiscal-contable validó este patrón.

```
                          ┌──────────────────────────────┐
   voz/texto ──STT──────► │  ROUTER  (clasificador)       │  cortocircuitos → LLM rápido
                          │  structured output (Literal)   │  (Haiku/encoder · §7.8)
                          └───────────────┬───────────────┘
             ┌──────────────────┬─────────┴────────┬──────────────────┐
             ▼                  ▼                   ▼                  ▼
     ┌──────────────┐  ┌──────────────┐   ┌───────────────┐   ┌────────────┐
     │ FinanceAgent │  │PurchasesAgent│   │  CoachAgent   │   │SupportAgent│
     │ (Insights)   │  │ (Save)       │   │ (Insights ×   │   │ (RAG/FAQ)  │
     │              │  │              │   │  Save)◄fan-out│   │            │
     └──────┬───────┘  └──────┬───────┘   └──────┬────────┘   └─────┬──────┘
            │ tools           │ tools            │ tools            │ tools
            ▼                 ▼                  ▼                  ▼
  register_transaction   search_product     analyze_overspending  search_help
  get_balance            compare_prices     suggest_savings       create_ticket
  get_expenses           add_to_list        budget_plan
  monthly_summary        list_offers
            └──────────────────┴─────────┬────────┴──────────────────┘
                                         ▼
                          ┌──────────────────────────────┐
                          │  format_response (síntesis)    │  + ui_actions (§7.6) → UI
                          └──────────────────────────────┘

  ↔ handoff (patrón Handoffs/Swarm): cualquier agente puede `select_new_agent` si no le toca.
  CoachAgent = punto de FAN-OUT del triángulo (cruza Insights × Save en una sola respuesta).
```

**Protocolo de handoff (aprendizaje de Cleo):** todo clasificador se equivoca. Cada subagente
tiene un tool **`select_new_agent`** que **reenruta** la conversación al especialista correcto si
el mensaje no le corresponde → una mala clasificación inicial no obliga al usuario a reempezar.
Diseñarlo desde el MVP (aunque haya un solo agente) evita rediseño al escalar.

**Maduración del router (escala, patrón Cleo):** el router del MVP es una **llamada LLM** (Haiku).
Al escalar, Cleo lo reemplazó por un **clasificador encoder-only entrenado con su propia data**:
**16× más rápido** (800ms→50ms) y más preciso que un modelo general. Lo sostienen 4 piezas de
MLOps que adoptamos como destino: **traffic mirroring** (modelo sombra en paralelo; los
desacuerdos entrenan la próxima versión), **optimización de prompts automatizada**, **pipeline de
evals** (offline + online, humano + LLM-judge) y **rollouts por fases** (A/A para aislar
infraestructura, luego A/B). Futuro: **routing por complejidad** (modelo liviano para lo simple,
de razonamiento para lo complejo).

### 7.2 Estado (extender `MessagesState`)
```python
class IAMState(MessagesState):           # messages: Annotated[list, add_messages]
    user_id: str
    capabilities: list[str]              # gobierna qué tools puede usar el router/agente
    intent: str
    pending_action: dict | None          # acción a confirmar (human-in-the-loop)
    ui_actions: Annotated[list, add]     # p.ej. botón "agregar a lista" en el chat
```
> `ui_actions` usa **reducer `add`** (acumula); de lo contrario se pierde entre nodos (bug #1).

### 7.3 Tools determinísticas (principio Cleo)
**El LLM nunca hace aritmética sobre el dinero.** Cada tool valida, calcula y devuelve
*structured output*. Ej.: `get_balance(user_id, period)` consulta Postgres y suma; el LLM
solo redacta la respuesta y propone la acción.

### 7.4 Human-in-the-loop (`interrupt()`)
Acciones que **escriben o mueven** (registrar gasto, agregar a lista; fase 2: emitir e-CF, apartar
plata) pasan por `interrupt()` → el chat muestra confirmación → `Command(resume=...)`. Requiere
**checkpointer** (Postgres). Es la lección FTC y el guardrail agéntico del concepto §7.

### 7.5 Persistencia y memoria
- **Checkpointer Postgres** con `thread_id` por conversación de usuario (estado + interrupts).
- **Memoria de largo plazo = semantic insight retrieval** (enfoque elegido por Cleo sobre knowledge
  graphs / agent-centric stateful, por liviano y de integración limpia): tras un intercambio
  significativo, un servicio **resume** la interacción + extrae **metadata** (topics, sentiment) →
  **embedding en pgvector** + texto + metadata. En el chat, el agente **decide cuándo** recuperar
  (search semántico filtrando por recencia/topic) e inyecta al prompt.
- **Gotchas (aprendidos por Cleo):** (a) **NO recuperar memoria en queries transaccionales** ("¿mi
  saldo?") — solo en conversaciones abiertas; (b) filtrar para **no exponer info desactualizada** que
  choque con el dato en tiempo real (saldo); (c) filtrar memorias **sensibles**. Objetivo p95 < 500ms.
- **UI de memoria editable (genera confianza):** el usuario puede ver/corregir lo que Cuadra recuerda →
  loop de feedback + alineación. *(Fase 1.)*
- **Retrieval proactivo (fase 1):** ligar memoria a **push + mensaje de entrada a la app** → contexto
  presente antes de que el usuario inicie (alimenta el Agente Proactivo §7.9).

### 7.6 Streaming a la UI
`stream_mode="messages"` → tokens en tiempo real al chat de RN vía WebSocket/SSE. Las
`ui_actions` se emiten para renderizar botones/tarjetas dentro del chat.

### 7.7 Voz
**Aprendizaje de Cleo (blog de ingeniería):** Cleo **no construyó un pipeline de STT propio** —
usó **dictado nativo on-device** (iOS/Android) para shipear Voice Mode rápido. Adoptamos lo mismo:

- **STT MVP = dictado nativo on-device** (iOS `Speech` / Android `SpeechRecognizer`) → barato,
  baja latencia, funciona sin servidor (apoya offline-first §12·C y unit economics §12·D).
  **Whisper/Deepgram = fallback en la nube** (idiomas/calidad donde el nativo falle).
- **Pipeline de voz en streaming (patrón Cleo):** *transcripción parcial* del usuario → entra al
  grafo; en cuanto el modelo emite tokens, se **espejan a TTS** (ElevenLabs v2 o similar) y se
  reproducen en tiempo real → conversación natural de baja latencia. TTS = fase posterior.
- Cleo además **fine-tuneó un modelo pequeño** para que las respuestas rápidas lleguen antes de
  que el usuario empiece a teclear (optimización de latencia futura, no MVP).
- **Heurísticas de TTS que Cleo aprendió a golpes (al construir voz):** clasificar tokens y
  **bufferear numerales adyacentes** para leer montos bien (*"$40.60"* → "cuarenta dólares con
  sesenta centavos", no "cuarenta, sesenta" — crítico en finanzas); no leer símbolos Markdown;
  **degradar `!` a `.`** (el TTS los hace sonar enojados); suavizar groserías en voz; **fallback a
  texto** si el audio no sintetiza; manejar **interrupción** del usuario a media respuesta.
- **Voz NO es una superficie aparte:** es un *flag* sobre el mismo pipeline de chat → evita
  fragmentar producto y arquitectura (lección explícita de Cleo).

### 7.8 Multi-modelo (Claude) — precios al 2026-06
> **Corrección (gap #4):** **routing barato** (Haiku/encoder, §7.1) + **modelo capaz solo donde hay
> que razonar** (Coach, casos difíciles) + **workers/tools simples en Haiku** → recorta 60-70% sin
> perder fiabilidad. El ruteo del router-a-nodos suele bastar con Haiku; valida el corte con evals (ADR 23).

| Rol | Modelo | Precio (in/out por 1M tok) |
|-----|--------|----------------------------|
| Workers / tools simples / clasificación trivial | `claude-haiku-4-5` | $1 / $5 |
| Coach / routing con razonamiento | `claude-sonnet-4-6` | $3 / $15 |
| Razonamiento profundo / casos difíciles | `claude-opus-4-8` | $5 / $25 |
| **Visión (OCR de recibos)** | `claude-sonnet-4-6` (multimodal) + parser determinístico | ~1.5-4.8K tok/recibo |

> Usar **prompt caching** (system prompt + tools estables) → lecturas a ~0.1× del precio base.
> Detalle de unit economics en §12·D.

### 7.9 Arquitectura de DOS PLANOS — patrón validado por Cleo 3.0 / Autopilot

El hallazgo más fuerte del blog de Cleo: **separar el sistema en dos planos** que corren en
escalas de tiempo distintas y se comunican por **stores de datos compartidos**. Lo adoptamos:

```
   ┌── PLANO CONVERSACIONAL (tiempo real) ──┐     ┌── PLANO BACKGROUND (asíncrono) ──┐
   │ agentes rápidos · modelos livianos     │     │ agentes pesados · razonamiento   │
   │ contexto corto · tools acotadas        │     │ multi-paso · corridas largas     │
   │ responde en segundos                   │     │ (miles de tokens, LLM encadenado)│
   └───────────────┬────────────────────────┘     └──────────────┬───────────────────┘
            LEE (precomputado)                              ESCRIBE
                   └──────────────►  STORES COMPARTIDOS  ◄────────┘
                        Perfil Financiero  ·  Insights (retrieval)
```

- **Plano conversacional** = el orquestador del chat (§7.1). NO parsea meses de transacciones al
  vuelo: **lee el Perfil Financiero precomputado** → rápido y barato. (Si preguntas *"¿por qué
  gasté tanto en marzo?"*, consulta el perfil, no recalcula.)
- **Plano background = Agente Proactivo de Insights** (el *"gemelo financiero"* del concepto). No
  espera a que preguntes: corre sobre el historial (~año), **multi-paso (varias pasadas)**, detecta
  patrones sutiles (carga de pagos creciente, caída del ahorro, sobregasto vs. meta), y produce
  insights con **esquema estructurado** (Cleo lo documenta así):
  `{ fact, category, confidence, suggested_action, reasoning_trace, supporting_data }` → se filtran
  por `confidence` antes de molestar, y se cargan en un **insight pool** (pgvector) para recuperación.
  Entrega por **push** (motor de retención). Disparo: scheduler/jobs + eventos (tx nueva, cierre de
  mes) + **onboarding** (al conectar cuentas, analiza y abre la primera conversación con algo que
  decir). Corre en **batch (–50%)** → respeta unit economics (§12·D).
- **Por qué decoplado:** se puede iterar cada plano sin romper el otro; el chat se mantiene veloz y
  barato mientras el análisis profundo toma el tiempo que necesite.

**Autopilot (Cleo) = nuestra capa agéntica proactiva, por fases** — realiza el *"agéntico de
verdad: la app ACTÚA"* del concepto:
- **Roadmap:** plan de 3-6 meses hacia una meta grande; recalcula al cambiar ingresos/gastos.
- **Daily Plan + "safe-to-spend":** snapshot diario (actividad reciente + cuánto puedes gastar hoy
  + pasos correctivos). *El "safe-to-spend" es un feature de Insights MVP de altísimo valor.*
- **Actions (fase 2+):** mover a ahorro, evitar sobregiro, fijar límite/ bloquear comercio,
  apartar ITBIS — **siempre con confirmación** (HITL §7.4).
- **Optimizar por RESULTADO, no por engagement:** el sistema aprende de outcomes reales (¿la acción
  mejoró la meta?), no de métricas de vanidad. **Alinea con la lección FTC** (§12) — clave para la
  confianza.

> Combinado con el triángulo, da coaching **prescriptivo y proactivo** que ningún competidor local
> tiene: la app te busca a ti, fundada en un perfil financiero precomputado y enriquecido (§5.6).

### 7.10 Validación de demanda (survey de Cleo, 10,000 adultos US+UK)
La investigación de Cleo respalda con datos por qué **el wedge es la ejecución y la volatilidad, NO
la educación** — exactamente la tesis del concepto (el miedo, no el saber):
- **Paradoja confianza-ansiedad:** 88% se siente seguro manejando su dinero, pero **~23% se siente
  seguro Y pierde el sueño** por dinero. *Saber no es lo mismo que estar tranquilo.*
- **No es problema de conocimiento:** *"no sé cuánto ahorrar"* quedó **último (13%)**. Los retos
  reales: **ejecución** (38% balancear hoy vs mañana, 37% disciplina, 18% no monitorea) y
  **volatilidad** (43% gastos imprevistos, 27% mantener familia/amigos, 21% ingreso impredecible).
- **El informal RD tiene MÁS volatilidad** (ingreso irregular, "san", apoyo familiar, imprevistos) →
  el agente proactivo + acciones + absorber shocks es el producto, no más tutoriales.
- **Confianza = "empezar pequeño y ver resultados" (22%)**, no track-record/regulación → diséñalo en
  el **onboarding** (un primer insight/ahorro chico que demuestre valor rápido).

---

## 8. News (feed de contenido)

### 8.1 MVP
Feed **masonry** de 2 columnas (estética Apple Notes/Intelligence) curado por **Super Admin +
agente IA**. Mezcla 3 fuentes con distintivo de procedencia (concepto §6·C):

| Fuente | Qué | Distintivo |
|--------|-----|-----------|
| 📰 **Noticias oficiales (IA)** | Agente que encuentra/verifica novedades DGII, BCRD, reforma fiscal | `@noticiasminuto` / `Oficial` + enlace |
| 💡 **Contenido financiero** | Plantillas, guías (50-30-20, presupuesto de pareja, inversión) | autor + ✔ verificado |
| 📌 **Curaduría admin** | Lo que el fundador fija/destaca | `pin` |

`FeedItem { fuente, autor, titulo, cuerpo, imagen?, likes, bookmark, fijado, fecha }`.

### 8.2 Fase 4
Se abre el rol **Influencer**: creadores publican sus canales; el CoachAgent cita su contenido
(RAG con atribución) y les manda tráfico; revenue-share.

---

## 9. Stack tecnológico

| Capa | Elección | Por qué |
|------|----------|---------|
| **Móvil** | **React Native + Expo (TS)**, Expo Router | Cross-platform iOS+Android, OTA para iterar el MVP rápido |
| UI/animación | **Reanimated** + **Skia** (anillos, ruletas, gráficas) | Los diseños son muy custom (anillo de gasto, ruleta radial) |
| Estado | **Zustand** + **TanStack Query** | Cliente liviano + caché de estado de servidor |
| Audio/cámara | `expo-av` (grabar voz), `expo-camera`/`image-picker` (OCR) | Captura por voz y recibo |
| **Backend** | **Python + FastAPI** (REST + WebSocket/SSE) | Streaming de chat; ecosistema IA |
| **Orquestador** | **LangGraph 1.0+** (Graph API) | Multi-agente, checkpointer, interrupts |
| **DB** | **PostgreSQL + pgvector** (Supabase/Neon) | Relacional + búsqueda/matching/RAG/memoria |
| **ORM / migraciones** | **SQLAlchemy 2.0 + Alembic** | Dominio puro; ORM solo en infra; Core/SQL crudo en hot-paths (ADR 31) |
| **Auth** | Supabase Auth / Clerk | JWT con claims de roles/capabilities |
| **Storage** | S3 / Supabase Storage | Recibos, imágenes de producto |
| **STT (voz)** | **Dictado nativo on-device** (iOS/Android) + Whisper/Deepgram fallback | Patrón Cleo: sin pipeline propio, barato, baja latencia, offline-friendly (§7.7) |
| **Push** | Expo Notifications / FCM-APNs | Entrega del Agente Proactivo de Insights (§7.9) — motor de retención |
| **OCR** | **Claude visión** (+ parser determinístico) | Entiende estructura de factura/ITBIS RD |
| **LLM** | **Claude** (Haiku/Sonnet/Opus por tarea) | Razonamiento + visión + multi-modelo |
| **Save jobs** | Scrapers Python + scheduler (Inngest/Temporal/cron) | Ingesta diaria de catálogos |
| **Observabilidad** | **LangSmith** (agentes) + **Sentry** (móvil/back) | Trazas + **monitoreo** (dashboards/alertas/online-evals) de agente + errores |
| **CI/CD móvil** | **EAS Build/Submit** | Builds y stores |

---

## 10. Modelo de datos consolidado

> **Boundaries (ADR 33 — microservices-ready):** cada grupo de abajo vive en su **propio schema
> Postgres** — `identity` · `insights` (Insights + Ledger + Financial Profile) · `save` · `aispace`
> (Orchestrator) · `news` · `platform` (Delivery) — con un **rol de DB** acotado. **Las referencias
> cross-context son por ID (UUID), NO FK** (un FK no cruza schemas limpio; `user_id` se confía del
> JWT). FKs **solo dentro** del mismo contexto. Así las costuras de microservicios son enforceables.

```
IDENTITY & ACCESS
  user(id, email, name, locale, plan,
       home_market_id, current_market_id)               role(id, name)
  capability(id, key)                                    user_role(user_id, role_id)
  role_capability(role_id, capability_id)
  capability_market(capability_id, market_id, enabled)   -- gating por jurisdicción

MARKET / JURISDICTION
  market(id, country, base_currency, locale, active)     -- RD activo en MVP; modelo completo
  market_currency(market_id, currency)                   market_capability(market_id, capability_id)
  -- políticas (fiscal, captura, issuing, compliance) resueltas por adaptadores, no en tabla

INSIGHTS
  account(id, user_id, type, currency[ISO4217])          -- saldo DERIVADO del ledger, no columna
  transaction(id, user_id, type, amount_minor BIGINT, currency[ISO4217], category_id,
              merchant_raw, merchant_id, date, source[manual|voice|ocr], attachment_url,
              idempotency_key UNIQUE, geo_lat, geo_lng,
              essential bool, recurring bool, income_stream)  -- enriquecida (§5.6); monto en minor units
  merchant(id, name, logo_url)                           -- merchant normalization (§5.6)
  category(id, name, icon)                               budget(id, user_id, category_id, limit_minor, period)
  space(id, user_id, name)                               savings_goal(id, user_id, target_minor, progress_minor)

LEDGER (doble entrada — fuente de verdad de saldos; §12·B)
  journal_entry(id, transaction_id, date, description)   -- agrupa los postings balanceados
  posting(id, journal_entry_id, account_id, currency[ISO4217], amount_minor BIGINT)  -- +/- ; Σ por moneda = 0
  fx_rate(id, from_currency, to_currency, rate, date)    -- conversión fechada para reporting
  -- balance(account) = Σ posting.amount_minor WHERE account_id  (derivado; cachear opcional)

FINANCIAL PROFILE / INSIGHTS (stores compartidos: background escribe, chat lee — §7.9)
  financial_profile(user_id, cashflow, income_cadence, recurring_expenses,
                    safe_to_spend_minor, updated_at)      -- precomputado por agentes background
  insight(id, user_id, fact, category, confidence, suggested_action,
          reasoning_trace, supporting_data, delivered_at)  -- esquema patrón Cleo; embed en pgvector
  roadmap(id, user_id, goal, milestones[], recomputed_at)  -- Autopilot, fase 2+

SAVE
  provider(id, name, type[super|bank|...], platform[vtex|shopify|html])
  canonical_product(id, name, brand, base_unit, canonical_category_id)
  store_product(id, provider_id, canonical_product_id, current_price, url)
  price(id, store_product_id, value, date)               -- append-only (time-series)
  offer(id, provider_id, product_id, offer_price, valid_until)
  shopping_list(id, user_id, name)                       list_item(id, list_id, product_id, qty)

ORCHESTRATOR   (estado gestionado por LangGraph)
  conversation(thread_id, user_id)                       checkpoints(*)   memory_store(*)

NEWS
  feed_item(id, source, author, title, body, image_url, pinned, date)
  like(user_id, feed_item_id)                            bookmark(user_id, feed_item_id)

DELIVERY / OPERATION (§12·E)   -- delivery plane: billing, notifications, outcomes
  subscription(id, user_id, plan, store[apple|google|stripe], entitlement_id,
               status[active|grace|canceled|expired], period, renews_at)
               -- fuente de verdad del plan; sincroniza user.plan vía webhook (E.3, ADR 25)
  notification_preference(user_id, channel, type, enabled, quiet_hours_start, quiet_hours_end)  -- (E.4, ADR 26)
  notification_log(id, user_id, type, payload, sent_at, opened_at, dedupe_key UNIQUE)
               -- la apertura alimenta outcome (motor de retención)
  outcome(id, user_id, insight_id, suggested_action, suggested_at,
          result[adopted|ignored|partial], metric, delta_minor BIGINT, measured_at)
          -- substrato "suggested_action → resultado real" que EXIGE el ADR 22 (E.6, ADR 28)
  -- Sesión/refresh tokens: gestionados por el proveedor de auth (Supabase/Clerk), no tabla propia (E.2)
```

---

## 11. Captura de datos (ingesta)

Puerto **`MovementSource`** con estrategias intercambiables (concepto §10·C). El esquema
nace **first-party-ready** aunque solo implementemos las primeras:

| Estrategia | MVP | Fase | Notas |
|-----------|-----|------|-------|
| Manual (chat/formulario) | ✅ | MVP | Base |
| **Voz (STT)** | ✅ | MVP | Estilo MonAi: IA divide y categoriza |
| **OCR de recibo** | ✅ | MVP | Claude visión + parser; caso reembolso |
| Correo bancario (Gmail OAuth) | — | Fase 1 | **Table-stakes** (MonAi/GastaBien ya lo tienen) — igualar, no es el foso (§13) |
| SMS / notificación on-device | — | Fase 5 | Android; SLM local; privacidad |
| **Tarjeta Cuadra (first-party)** | — | Fase 5 | Dato nativo, sin parsear |
| Agregador (Belvo/Plaid) | — | Multipaís | CO/MX/US |

---

## 12. Seguridad, privacidad y compliance

- **Datos financieros:** cifrado en tránsito (TLS) y reposo; principio **read-only por defecto**;
  consentimiento granular para cualquier acción del agente.
- **Lección FTC (Cleo pagó US$17M):** transparencia radical de precio + **cancelación de 1
  toque** + sin *dark patterns*. No opcional.
- **Privacidad del dato del usuario:** no se usa para entrenar modelos de terceros; el robots.txt
  del propio producto debe reflejarlo.
- **Guardrails del agente:** `interrupt()` antes de escribir/mover; log de auditoría de acciones.
- **Save / scraping:** zona gris legal → preferir VTEX/API o acuerdos; el OCR del recibo del
  usuario es 100% limpio (es su dato).
- **Fase 2 (fiscal):** integración con **proveedor e-CF certificado por la DGII**; cumplimiento
  SB (RD). **Inversiones = educación, NO asesoría** (SIMV/SEC).

### 12.1 Prompt injection (gap #2 — crítico en un agente con tools financieras)
El agente ejecuta tools que **escriben/mueven** e ingiere **OCR de recibos y voz** — canales NO
confiables. Un recibo o audio puede llevar instrucciones ocultas (caso real: una wallet engañada
con código Morse para transferir US$150K). Mitigaciones obligatorias:
- **Todo input no confiable (OCR, voz, correo) se trata como DATA, no como instrucciones** — en
  canal separado, **nunca concatenado al system prompt**.
- **Zero-trust multimodal**: validar la transcripción de voz y el texto de OCR antes de que lleguen
  al LLM; sanitizar antes de razonar.
- **Human-in-the-loop (`interrupt()`)** para toda acción que escribe/paga → ✅ ya está (§7.4); es
  la última línea, no la única.
- **RBAC de mínimo privilegio en las tools**: cada tool solo accede a los datos del `user_id`
  actual (nunca de otro usuario), aunque el LLM lo pida.
- **Logging/observabilidad** de prompts y tool-calls (LangSmith) para detectar abusos.

---

## 12·B. Modelo de dinero y ledger

> **Gap #1 — el error más caro de fintech.** Resuelto así, y diseñado completo desde el día 1.

- **Nunca `float`/`double` para dinero** (errores de redondeo). Guardar **enteros en *minor units***
  (RD$5.00 → `500`), como Stripe. `BIGINT` en Postgres.
- **Multi-moneda: no se mezclan monedas en un balance.** Cada moneda tiene su propio balance; se
  convierte a la moneda base SOLO para mostrar, con la **tasa FX fechada** (`tasa_fx`) del momento.
- **Saldo = derivado de un ledger de doble entrada**, no una columna mutable. Cada transacción
  genera un `asiento` con ≥2 `movimiento` que **suman 0 por moneda**. El ledger es la fuente de
  verdad; el saldo se calcula (y se puede cachear). Esto sobrevive a transfers, remesas, tarjeta y
  crédito (fases 4-6) sin re-modelar.
- **MVP:** el ledger nace en el esquema aunque el coach lo use simple — **migrar el modelo de
  dinero con usuarios en producción es de los infiernos más caros que existen.**
- **FX:** definir fuente de tasas (BCRD / proveedor) y frecuencia; almacenar la tasa usada en cada
  conversión para reporting consistente.

---

## 12·C. Offline-first (sync, conflictos, idempotencia)

> **Gap #3 — estructural en RD por conectividad irregular, no un feature tardío (§5.5 #5).**

- **DB local como fuente de verdad de escritura.** La captura (voz/manual/OCR) escribe en una
  **cola local** y sincroniza al recuperar red. La UI nunca bloquea esperando al backend.
- **Tecnología:** **WatermelonDB** (producción RN: SQLite + protocolo de sync + observables) o
  **PowerSync** (motor de sync sobre Postgres/Supabase — encaja con nuestro stack y reduce trabajo
  de backend). Decisión a confirmar en el spike; recomendación: **PowerSync** por integración
  directa con Postgres.
- **Resolución de conflictos:** *last-write-wins* con `updated_at` por fila (suficiente para
  finanzas personales de un usuario en varios dispositivos); CRDT solo si aparece edición colaborativa.
- **Idempotencia (innegociable):** cada transacción lleva un `idempotency_key` (UUID generado en
  cliente). El backend ignora reenvíos con la misma llave → el sync que reintenta **no duplica**
  movimientos en el ledger.
- **SLM on-device (fase 5):** el parser de captura corre sin internet; sube a la nube solo el dato
  ya estructurado (concepto §10·D).

---

## 12·D. Patrón del agente y unit economics de IA

> **Gap #4 — evitar sobre-ingeniería y vigilar el margen del freemium.**

- **Patrón:** MVP **multi-agente por router-a-nodos** (router barato → nodos especializados con tools);
  **NO `langgraph-supervisor`** — su llamada LLM por turno cuesta **~3× tokens** y no se paga hasta que
  el handoff lo justifique (§7.1).
- **Ruteo por costo:** modelo fuerte solo donde hace falta razonar; **Haiku para workers** (§7.8).
- **Unit economics (marco, validar con números reales):** por interacción del agente se paga
  **LLM** (in/out tokens, §7.8) **+ STT** (**≈US$0 con dictado nativo on-device** —patrón Cleo,
  §7.7—; la nube Deepgram ~US$0.0043/min o GPT-4o-mini ~US$0.003/min solo de fallback) **+ OCR**
  (Claude visión: ~1.5-4.8K tokens/recibo). Con miles de usuarios free, **el costo de IA puede
  destruir el margen** — el STT on-device y el batch del agente proactivo (§7.9) lo contienen.
- **Palancas:** **prompt caching** (system+tools estables → lecturas ~0.1×), límites en el tier
  gratis (estilo MonAi: trial/cupos), Haiku para rutas de alto volumen, *batch* donde no haya
  latencia crítica (50% de descuento).
- **Acción:** estimar **costo de IA por usuario activo/mes** y diseñar el freemium alrededor de ese
  número antes de lanzar (ver pricing en §11 del concepto).

---

## 12·E. Entrega y operación (delivery plane)

> **Gaps #5-#11 — el plano que falta para SHIPPEAR.** El plano de dominio (arriba) es el
> diferenciador; este es el **piso de fábrica**: sin él, la mejor arquitectura no llega a la tienda.
> Todo *first-party-ready* y barato, mismo principio que el resto del MVP. Las decisiones de este
> plano están registradas como **ADRs 24-28**; la disciplina de testing que lo sostiene es el **ADR 23**.

### E.1 — Contrato de API (móvil ↔ backend)
- **REST `/v1`** para CRUD y queries; **WebSocket/SSE** para el streaming del chat
  (`stream_mode="messages"`, §7.6) y las `ui_actions`. Contrato **versionado** + **OpenAPI** generado;
  tipos compartidos (Pydantic → TS) para no desincronizar cliente y server.
- **`Idempotency-Key`** obligatorio en escrituras (liga con §12·C). **JWT** con claims de
  capabilities/market en cada request (gating, §12.1).
- Endpoints núcleo MVP: `auth`, `wallets`, `tx`, `budget`, `save/search`, `save/compare`, `lista`,
  `chat` (WS), `news`, `me`, `subscription`.

### E.2 — Identidad y sesión (auth flow)
- **Supabase Auth / Clerk**; **JWT** con claims `{user_id, roles, capabilities, home_market,
  current_market, plan}` poblados desde Identity&Access. **Refresh con rotación**, multi-dispositivo,
  revocación.
- **Onboarding:** signup → **consentimientos granulares** (datos + captura, §12) → **primer insight**
  inmediato (§7.9; "empezar pequeño y ver resultados", §7.10). Nunca pantalla vacía.
- El **capability gating** se valida en **cada tool** (RBAC de mínimo privilegio), no solo en la UI.

### E.3 — Suscripción, billing y entitlements
- **Freemium (Free + Plus)** vía **IAP de App Store / Play** (obligatorio en apps móviles para bienes
  digitales) orquestado con **RevenueCat** (entitlements cross-platform, webhooks, *restore*). Stripe
  solo para web/futuro.
- El **entitlement es la fuente de verdad del plan** → `usuario.plan` se sincroniza **desde webhooks**
  (server-side), **nunca** se confía en el cliente. El plan habilita las capabilities premium.
- **Cancelación de 1 toque + transparencia de precio** (lección FTC §12): deep-link directo a la
  gestión de suscripción del store. Sin *dark patterns*.
- Datos: `subscription(user_id, plan, store, entitlement_id, status, period, renews_at)`.

### E.4 — Notificaciones (orquestación, no solo transporte)
- **Expo Notifications / FCM-APNs** es el transporte; encima va un **orquestador**: scheduling (jobs
  §7.9), **preferencias por usuario**, **quiet-hours**, **dedupe + rate-limit** por usuario, y
  **deep-link** a la acción. Es el motor de retención — se diseña, no se improvisa.
- Disparadores: Agente Proactivo (push de insight), recordatorios, eventos. Respeta el consentimiento.
- Datos: `notification_preference(user_id, …)`, `notification_log(user_id, type, sent_at, opened_at)` →
  la apertura alimenta los **outcomes** (E.6).

### E.5 — Despliegue, entornos e infraestructura
- **Backend FastAPI** en contenedor (Docker) sobre Fly.io / Railway / Render / Cloud Run *(decidir en
  spike)*. **Postgres + pgvector** (Supabase/Neon), **object storage** (S3/Supabase).
- **Entornos aislados dev / staging / prod** (DB y secrets por entorno; secrets en gestor, **nunca** en
  el repo). **Migraciones versionadas** (Alembic).
- **CI/CD backend** (GitHub Actions): lint + typecheck + **tests + evals** (ADR 23) + migraciones +
  deploy. El móvil ya está cubierto por **EAS** (§9). **Scheduler/jobs** (Inngest/Temporal/cron) para
  los scrapers de Save y el Agente Proactivo.

### E.6 — Observabilidad, analítica y outcomes
- **Errores:** Sentry (móvil + backend). **Trazas + monitoreo del agente:** LangSmith — cada
  tool-call (tokens, latencia, **costo**, base de los unit economics §12·D) + **dashboards y alertas**
  (latencia/costo/tasa de error por agente) + **online-evals** (muestreo en prod, drift; ADR 23).
- **Analítica de producto** (PostHog / Amplitude): eventos de funnel (onboarding, captura, %voz,
  conversión free→pago) → los **KPIs de §14** (D30/D90, tx/semana).
- **Substrato de OUTCOMES — lo EXIGE el ADR 22:** registrar `acción sugerida → resultado real`
  (adherencia a meta, ahorro logrado) en la tabla **`outcome`** (§10). **Sin esto, "optimizar por
  resultado" es aspiracional**, no arquitectura.
- **SLOs MVP:** objetivo de p95 del chat, **memoria p95 < 500 ms** (§7.5), disponibilidad; alertas en
  **LangSmith** (métricas del agente: latencia/costo/drift) y **Sentry** (errores/infra).

### E.7 — Control de costo y abuso en runtime (proteger el margen del freemium)
- **Cuotas por tier en runtime** (mensajes/voz/OCR del Free, estilo MonAi), con **enforcement
  server-side**, nunca en cliente. **Rate-limiting** por usuario/IP.
- **Circuit breaker** a fallback barato (Haiku / texto) bajo presión de costo o degradación. Hace
  **exigibles** las palancas ya decididas (prompt caching §7.8, batch §7.9).

### E.8 — Pipelines de contenido y datos (operación)
- **News "noticias oficiales IA" (§8):** job que **descubre → verifica contra fuente oficial**
  (DGII/BCRD) **→ dedupe → cola de revisión admin → publica**, con atribución + enlace (compliance §8).
- **Scrapers de Save (§6.2):** **monitoreo de ruptura** (alerta cuando un adaptador cae), **VTEX-API
  primero**, reintentos, y **panel admin** para curar taxonomía y matches dudosos.
- **Seed inicial:** taxonomía canónica de Save + categorías de Insights.

---

## 13. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| **Retención baja** (apps de finanzas mueren a las 2 semanas por fricción de captura) | 🔴 Alto | Captura inteligente (voz/OCR/correo) es **table-stakes**; el borde real es el **triángulo** + el **Agente Proactivo de Insights** (§7.9): la app te busca por push, no esperas a abrirla |
| **Sin diferenciador** (océano rojo vs Cleo/MonAi) | 🔴 Alto | El **triángulo** Insights×Save vía Coach (coaching prescriptivo) |
| **Alcance del MVP infla** (5 roles, 3 productos) | 🔴 Alto | Solo rol Usuario Normal; modelo completo pero implementación incremental |
| **Cold-start de Save** | 🟠 Medio | Scraping bootstrap → proveedores (fase 3) |
| **Scraping frágil/legal** | 🟠 Medio | VTEX/API primero; acuerdos; OCR del usuario |
| **El LLM "inventa" números** | 🟠 Medio | Tools determinísticas para TODO cálculo |
| **Modelo de dinero mal hecho** (float, saldo mutable) | 🔴 Alto | ✅ Resuelto §12·B: minor units + ledger doble entrada + FX fechado |
| **Prompt injection** (OCR/voz/correo mueven plata) | 🔴 Alto | ✅ Resuelto §12.1: input como data, zero-trust, HITL, RBAC tools |
| **Pérdida de datos / app inútil sin red** | 🔴 Alto | ✅ Resuelto §12·C: offline-first + cola local + idempotencia |
| **Unit economics de IA destruyen el margen** | 🟠 Medio | §12·D: ruteo a Haiku, prompt caching, límites del tier free |
| **Bus factor** | 🟡 | Observabilidad (LangSmith/Sentry); documentación viva |

---

## 14. Roadmap por fases (post-MVP)

| Fase | Nombre | Qué entra | KPIs guía |
|------|--------|-----------|-----------|
| **0 / MVP** | Usuario Normal | Insights (manual/voz/OCR) · **enriquecimiento básico de tx (§5.6)** · **safe-to-spend** · Save (supermercados) · AISpace/Chat (Finance/Purchases/Coach/Support) · News curado · freemium DOP/USD | Retención D30/D90 · tx/usuario/semana · % que usa voz |
| **1** | Retención + proactividad | **Captura por correo bancario** · **Agente Proactivo de Insights + push (§7.9)** · **Daily Plan/Roadmap (Autopilot read-only)** · gamificación · metas/ahorro | D30 ↑ · % con push accionado · captura automática vs manual |
| **2** | **Rol Accountant (fiscal)** | e-CF (proveedor certificado DGII) · ITBIS/606 · **Caja de Impuestos** · FiscalAgent · export al contador (reembolso) | e-CF emitidos · % activa Caja de Impuestos |
| **3** | **Save proveedores + Rol Commercial** | Proveedores cargan data · KYB · **cobro por promoción** · más categorías (bancos, seguros) · marketplace 2 lados | Proveedores activos · take-rate |
| **4** | **Rol Influencer + News completo** | CMS creadores · canales · RAG con atribución · revenue-share | Creadores · CAC vía creadores · engagement News |
| **5** | **Riel propio** | **Tarjeta Cuadra** (Pomelo/sponsor bank) · remesas (saldo USD compartido) · ITBIS al swipe · parejas · QR · captura on-device | % ingreso gestionado (North Star) · transacciones first-party |
| **6** | **Crédito embebido + Multipaís** | Credit score alternativo · anticipos/microcrédito · Colombia (Belvo) · diáspora US | Crédito originado · mora · usuarios por país |

> **North Star (concepto §1):** % del ingreso del usuario que pasa "visible y gestionado" por Cuadra.

---

## 15. Decisiones de arquitectura (ADRs)

1. **Móvil: React Native + Expo.** Cross-platform + OTA; el peso vive en el backend Python.
2. **Orquestador: LangGraph Graph API, patrón Router (router-a-nodos).** Routing condicional multi-agente +
   checkpointer + interrupts. (No Functional API.)
3. **DB: PostgreSQL + pgvector.** Relacional para finanzas/catálogo + vectorial para
   matching/memoria/RAG — un solo motor.
4. **Roles: capabilities aditivas, multi-rol ready.** Modelo completo desde el día 1, implementa
   solo Usuario Normal. Evita migración de permisos en producción.
5. **LLM razona / tools calculan.** Ningún cálculo de dinero en el LLM (principio Cleo).
6. **Captura: scraping bootstrap (Save) + voz/OCR manual (Insights MVP).** Correo bancario en
   fase 1; tarjeta first-party en fase 5.
7. **Human-in-the-loop con `interrupt()`** para toda acción que escribe/mueve.
8. **OCR: Claude visión; STT vía dictado nativo on-device + Whisper/Deepgram fallback.**
   Validado por Cleo (no construir pipeline STT propio); local primero gana en conexión mala y en
   costo (§7.7, §5.5 #10). Voz en streaming: transcripción parcial → tokens → TTS.
9. **Esquema first-party-ready** (ingesta y tarjeta) para no migrar al llegar la fase 5.
10. **Offline-first (estructural en RD).** Captura (voz/manual/OCR) escribe en **cola local** y
    sincroniza al recuperar red; el SLM local parsea sin internet. No es un feature tardío.
11. **Geolocalización como puente Insights→Save.** La ubicación de la transacción autocompleta el
    comercio desde el catálogo Save y habilita detección de sobrepago en sitio (refuerza el foso).
12. **Import/Export CSV.** Importadores de MonAi/Cleo/GastaBien como canal de adquisición
    ("cámbiate sin perder tu data") + export por portabilidad (lección FTC).
13. **Multi-país: `Market` de primera clase + `home_market` vs `current_market`** (§3·B). País =
    lógica de negocio, no traducción. Toda política que varía por país (fiscal, captura, catálogo,
    marketplace, roles, contenido, issuing, compliance) vive detrás de un puerto resuelto por
    `Market`. Modelo completo desde el día 1; RD único mercado activo en el MVP. Expansión
    RD→US→CO→global.
14. **Dinero: minor units + ledger de doble entrada** (§12·B). Enteros (BIGINT), nunca float;
    saldo derivado del ledger; multi-moneda con FX fechado. Esquema completo desde el día 1.
15. **Seguridad del agente: zero-trust multimodal contra prompt injection** (§12.1). Input no
    confiable como data; RBAC de mínimo privilegio en tools; HITL para escrituras; logging.
16. **Offline-first: PowerSync (o WatermelonDB) + last-write-wins + idempotency keys** (§12·C).
    DB local fuente de verdad de escritura; sync al recuperar red; sin duplicados.
17. **Orquestación: router-a-nodos multi-agente en el MVP → handoff/Supervisor al escalar; workers en
    Haiku** (§7.1, §7.8, §12·D). Multi-agente desde el día 1 vía **router barato** (clasificación +
    cortocircuitos) a **nodos especializados** con tools — **NO `langgraph-supervisor`** (≈3× tokens por
    la llamada LLM por turno). Validado por el reuso y Cleo. El handoff (`select_new_agent`) y, solo si
    hace falta, el Supervisor LLM, se añaden al escalar. Unit economics por usuario antes de lanzar.
18. **Agente Proactivo de Insights (background) + push** (§7.9, patrón Cleo 3.0 "Smart Insights").
    Corre en lote sobre el historial enriquecido (multi-paso, salida con categoría+confianza),
    entrega por push. Realiza el "gemelo financiero" del concepto y es el motor de retención.
19. **Arquitectura de dos planos + stores compartidos** (§7.9, patrón Cleo). Conversacional (rápido,
    lee Perfil Financiero precomputado) ↔ Background (pesado, lo escribe). Decopla velocidad de chat
    de análisis profundo; se itera cada plano sin romper el otro.
20. **Capa de enriquecimiento de transacciones, fundacional** (§5.6, patrón Autopilot). Todo consume
    el dato enriquecido (esencial/recurrente/stream/comercio normalizado), no el crudo. Semi-supervisado:
    modelo rápido + fallback frontera + loop de labels.
21. **Protocolo de handoff (`select_new_agent`) + maduración del router** (§7.1, patrón Cleo).
    Handoff desde el MVP; al escalar, router encoder-only propio + traffic mirroring + rollouts A/A→A/B.
22. **Optimizar por resultado financiero, no por engagement** (§7.9, Autopilot + lección FTC §12).
    El aprendizaje continuo se ata a outcomes reales (adherencia a metas), no a métricas de vanidad.
23. **Testing y evaluación: TDD estricto + eval harness del agente** (§12·E; lección
    "evaluation-first" de Cleo). **TDD estricto (RED → GREEN → REFACTOR)** para TODO el código
    determinístico — tools del orquestador, ledger, enriquecimiento, parsers de captura, pipeline de
    Save: **ningún cálculo de dinero se escribe sin un test que lo cubra primero** (refuerza ADRs 5 y
    14). **Pirámide:** unit (tools, ledger, normalización/matching) → integración (API, checkpointer,
    sync/idempotencia §12·C) → e2e de flujos clave (gasto por voz, comparar precios, HITL). **Un LLM
    no se testea con asserts → eval harness:** golden-set de queries/conversaciones reales +
    **LLM-as-judge** para tono/calidad (patrón Cleo) + evals **offline (en CI)** y **online (muestreo
    en prod)**; mide routing, tool-selection y exactitud numérica. **Gate de release:** tests y evals
    en verde antes de merge/deploy; un cambio de schema **re-dispara** evaluación (lección fine-tuning
    de Cleo). **Por qué ahora:** sin evals, una app de plata agéntica shippea alucinaciones con
    confianza — el harness es **cimiento, no fase futura**.
24. **Contrato de API + identidad/sesión** (§12·E E.1-E.2). **REST `/v1`** (CRUD/queries) +
    **WebSocket/SSE** (streaming de chat y `ui_actions`, §7.6); contrato **versionado** con **OpenAPI**
    y tipos compartidos (Pydantic → TS). **JWT** con claims `{roles, capabilities, home_market,
    current_market, plan}` poblados por Identity&Access, **refresh con rotación**; **gating de
    capabilities en cada tool** (RBAC, §12.1), no solo en UI. `Idempotency-Key` en toda escritura
    (liga §12·C).
25. **Billing & entitlements: IAP + RevenueCat, server-side** (§12·E E.3). Freemium (Free + Plus) vía
    **IAP de App Store/Play** orquestado con **RevenueCat**; el **entitlement es la fuente de verdad
    del plan** (`usuario.plan` se sincroniza desde webhooks, **nunca** se confía en el cliente).
    **Cancelación de 1 toque + transparencia de precio** (lección FTC §12), sin dark patterns.
26. **Notificaciones orquestadas, no solo transporte** (§12·E E.4). Sobre Expo/FCM-APNs va un
    **orquestador**: scheduling (§7.9), preferencias por usuario, quiet-hours, dedupe + rate-limit,
    deep-link a la acción. Es el motor de retención → se diseña; la apertura alimenta los outcomes
    (ADR 28). Respeta el consentimiento.
27. **Despliegue, entornos, infra y CI/CD backend** (§12·E E.5). FastAPI en contenedor
    (Fly.io/Railway/Render/Cloud Run, decidir en spike) + Postgres+pgvector + object storage;
    **entornos aislados dev/staging/prod** con secrets por entorno (**nunca** en repo) y **migraciones
    versionadas (Alembic)**. **CI/CD** (GitHub Actions): lint + typecheck + tests + evals (ADR 23) +
    migraciones + deploy; móvil vía EAS (§9). Scheduler/jobs (Inngest/Temporal/cron) para los scrapers
    de Save y el Agente Proactivo.
28. **Observabilidad, analítica, outcomes y guardrails de costo** (§12·E E.6-E.7). Sentry (errores) +
    LangSmith (trazas + **monitoreo/alertas + online-evals** del agente; tokens/costo) +
    PostHog/Amplitude (funnel → KPIs §14). **Substrato de
    OUTCOMES que el ADR 22 exige** (`acción → resultado real`): sin él, "optimizar por resultado" es
    aspiracional. **Guardrails de runtime:** cuotas por tier server-side, rate-limiting y **circuit
    breaker** a fallback barato (Haiku/texto) para proteger el margen del freemium (§12·D). SLO:
    memoria p95 < 500 ms (§7.5).
29. **Ingesta modular tras puertos + clasificación rule-based-first detrás de interfaz** (§17). La
    captura/enriquecimiento se descompone en módulos pequeños tras puertos (`OCRPort`, extracción,
    validación/QR, clasificación, wizard), **nunca un agente monolítico**. La clasificación (§5.6) vive
    tras una interfaz `Clasificador` para que las capas ML (tree→SLM→frontier) entren sin reescritura;
    el MVP arranca rule-based/catálogo + confidence. **Aprendizaje del reuso:**
    `backend/sub_agents/ocr/agent.py` (~1.4K líneas, monolito) y `backend/extraction/classification/`
    (rule-only) — replicar `extraction/confidence_scorer.py` y el clasificador, evitar el monolito.
30. **HITL unificado en un solo mecanismo** (§7.4, §17). Un único patrón: `interrupt()` del grafo +
    `pending_action` estructurado en el state (qué se ejecuta, args, scope). Evita los DOS caminos
    paralelos del reuso (`backend/orchestrator/approval.py` con `interrupt()` a nivel grafo +
    `backend/orchestrator/invoice_flow/node.py` con `staging` a nivel tool). El prompt prohíbe afirmar
    éxito sin confirmación de la tool (regla anti-alucinación de estado, validada en el reuso).
31. **Persistencia: SQLAlchemy 2.0 (Core + ORM) + Alembic; dominio puro** (§17.2; decisión tomada).
    El modelo relacional usa **SQLAlchemy 2.0** con **Alembic** para migraciones versionadas
    (`autogenerate` requiere modelos SQLAlchemy; con raw SQL, Alembic queda como runner de `ALTER` a
    mano = el anti-patrón de §17.2). Disciplina hexagonal: las **entidades de dominio son PURAS**
    (dataclasses/Pydantic, cero SQLAlchemy); los **modelos ORM + mapeo viven SOLO en infraestructura**,
    detrás de los puertos de repositorio (no se filtran al dominio — refuerza ADR 1). Se **baja a Core
    / `text()` SQL crudo** en hot-paths medidos (comparación de precios Save, time-series, reportes).
    pgvector vía `pgvector.sqlalchemy`. **Descartados:** raw SQL puro (boilerplate, sin migraciones
    integradas, sin type-safety — el costo visto en el reuso) y SQLModel (mezcla persistencia y dominio
    en una clase, rompe la separación hexagonal).
32. **Naming: identificadores de código en inglés; narrativa en español** (convención). TODO
    identificador de código va en **inglés**: carpetas, archivos, variables, funciones, clases,
    **tablas y columnas de DB**, enums, puertos/adaptadores, nombres de tools y de agentes. La
    **prosa de los documentos** va en **español**. Motivo: ecosistema, librerías y convenciones son
    en inglés; el *spanglish* en identificadores genera fricción y errores. **Glosario canónico** —
    dominio: `user · account · transaction · merchant · category · budget · savings_goal · space`;
    ledger: `journal_entry · posting · fx_rate`; profile: `financial_profile · insight · roadmap`;
    Save: `provider · canonical_product · store_product · price · offer · shopping_list`; delivery:
    `subscription · notification_preference · notification_log · outcome`; ports: `MovementSource ·
    CatalogSource · DataProvider · FiscalProvider · OCRPort · STTPort · LLMPort`; agents:
    `FinanceAgent · PurchasesAgent · CoachAgent · SupportAgent`.
33. **Monolito modular microservices-ready: schema y rol de DB por contexto + referencia por ID**
    (estructura-monorepo §6). Es un **modular monolith** (lo correcto para el MVP — "monolith first";
    Shopify/Notion volvieron a esto en 2025); los bounded contexts son las **costuras** de extracción.
    Para que sean **enforceables, no aspiracionales**: cada contexto vive en su **propio schema
    Postgres** con un **rol de DB** acotado a su schema (la DB impone el límite, no solo el código).
    **Cross-context = referencia por ID (UUID), NUNCA FK** (FKs solo dentro del mismo contexto); sin
    JOINs cross-context — se lee por el `application` service del otro o por una **vista read-only**
    publicada. **`import-linter`** prohíbe imports entre contextos salvo por puertos. **`shared/`
    mínimo y estable** (futuro paquete publicado). **Contrato OpenAPI** = única frontera front↔back →
    split de repos = publicar `api-client`. Extraer un servicio solo con presión real (escala/equipo/
    deploy); candidatos: `ingestion`, `save/jobs`, `billing`, `notifications`.

---

## 16. Próximos pasos

1. **Confirmar** el corte del MVP de §2. *(Naming ya definido: app **Cuadra**, tarjeta **Cuadra**.)*
2. **Diseño detallado** por bounded context (contratos de puertos, esquema SQL, tools del
   orquestador) — sobre la estructura de [`estructura-monorepo.md`](./estructura-monorepo.md);
   candidato a flujo **SDD** (`sdd-spec` → `sdd-design` → `sdd-tasks`).
3. **Spike técnico de Save**: auditar qué cadenas son VTEX (API) vs HTML; validar pipeline con
   **2 tiendas, 1 categoría** end-to-end (normalización + matching).
4. **Spike del orquestador**: router + 1 subagente (Finance) con checkpointer Postgres y
   registro de gasto por voz, end-to-end. → plan desglosado en
   [`spike-orquestador.md`](./spike-orquestador.md) (tareas T0-T7 + criterio go/no-go).
5. **Esqueleto móvil Expo**: tab bar + Insights (estado vacío → con datos) + chat con streaming.

---

## 17. Lecciones del proyecto de reuso (adoptar / evitar)

> Destiladas de la revisión del **proyecto fiscal-contable del cliente** (el ancestro de esta
> arquitectura). **Se reusan PATRONES y conocimiento, NO código ni datos** (separación de IP, §18 del
> concepto). Rutas relativas a la raíz del proyecto de reuso:
> `/Users/ismartz/Desktop/DEV/fiscal-contable.agentic-ai-app/`.

### 17.1 Patrones validados en producción — ADOPTAR

| Patrón | Dónde vive (reuso) | En Cuadra |
|---|---|---|
| Router **short-circuit-first** → embeddings → LLM `with_structured_output(Literal)` | `backend/orchestrator/intent/classifier.py` · `intent/triggers.py` | §7.1, §7.8 |
| Grafo: memoria → clasifica → sub-agente → HITL → formato → extrae-memoria → poda | `backend/orchestrator/graph.py` | §7.9 |
| Tools ligadas a scope por **closure** (anti-IDOR), no del input del LLM | `backend/orchestrator/runner.py` · `backend/sub_agents/purchases/agent.py` | §12.1 |
| **País = estrategia en prompt** + catálogos por registry; agente neutral | `backend/sub_agents/purchases/agent.py` · `backend/extraction/classification/registry.py` | §3·B, ADR 13 |
| **Middleware** anti-race (`parallel_tool_calls=False`) + cap del loop ReAct | `backend/sub_agents/purchases/agent.py` | §12·D, ADR 28 |
| **Split determinista/LLM** (cifras de tools, prosa del LLM, degradación elegante) | `backend/orchestrator/sub_agent_nodes.py` | §7.3, §7.6 |
| **Confidence scorer** puro + explicable, pesos por país, offline→neutro | `backend/extraction/confidence_scorer.py` · `docs/CONFIDENCE_SCORING_SPEC.md` | §5.6 |
| **Clasificación Swiss-cheese** + invariante contable + catálogo aprendido > seed | `backend/extraction/classification/classifier.py` | §5.6 |
| **Fuente autoritativa > parseo** (timbre DGII sobreescribe OCR) | `backend/sub_agents/ocr/agent.py` (`_enrich_with_qr`) · `backend/extraction/qr_extractor.py` · `dgii_validator.py` | §10·C |
| **base64/imagen NUNCA en el contexto del LLM** principal | `backend/sub_agents/ocr/agent.py` | §12.1 |
| **HITL para CALIDAD de dato** (wizard pregunta huecos; `next_state` puro; el constraint de DB dirige el orden) | `backend/orchestrator/invoice_flow/transitions.py` · `wizard.py` · `node.py` | §7.4, §12·B |
| **HITL de mutación** con `interrupt()` (defensivo si nadie pidió aprobación) | `backend/orchestrator/approval.py` | §7.4 |
| **Memoria**: dedup memoria-vs-knowledge + ventana corta al sub-agente | `backend/orchestrator/runner.py` | §7.5, §7.1 |
| **Reducers custom** (no congelar campos con checkpoints viejos) | `backend/orchestrator/state.py` | §7.2 |
| **Resiliencia**: backoff ante 429, degradación por capa | `backend/extraction/document_extractor.py` | §12·C, §12·E |

### 17.2 Anti-patrones observados — EVITAR (y cómo resolverlos)

| Deuda observada | Dónde se ve (reuso) | Resolución en Cuadra |
|---|---|---|
| **Clean Architecture a medias** (legacy junto a `src/`) | `backend/src/` (clean) vs `backend/{orchestrator,sub_agents,extraction,core,channels,memory}/` (legacy) | **100% hexagonal desde el día 1**; la capa agéntica DENTRO de la arquitectura (§4, ADR 1) |
| **Migraciones a mano** (sin framework) | `backend/tools/migrate_*.py` · `backend/db_init_pg.py` · `backend/scripts/migrate_tenants_003_*` | **Alembic desde el commit 1** (ADR 27); ningún `ALTER` fuera de migración versionada |
| **OCR agent monolítico (~1.4K líneas)** | `backend/sub_agents/ocr/agent.py` | **Ingesta descompuesta tras puertos** (extracción · QR · enriquecimiento · clasificación · wizard), testeable (ADR 29) |
| **Acople a un proveedor OCR** (Azure DI: 429, mapeo de campos) | `backend/extraction/document_extractor.py` | **`OCRPort` con Claude visión**, proveedor intercambiable (ADR 8) |
| **Clasificación 100% rule-based** (sin capas ML) | `backend/extraction/classification/` | Swiss-cheese **detrás de interfaz** para sumar capas ML sin reescribir; rule-based primero (ADR 29) |
| **Dos mecanismos de HITL** (interrupt + staging) | `backend/orchestrator/approval.py` + `backend/orchestrator/invoice_flow/node.py` | **Un solo HITL**: `interrupt()` + `pending_action` estructurado (ADR 30) |
| **Router por keywords con orden frágil** (cicatrices de misroute) | `backend/orchestrator/intent/classifier.py` · `intent/triggers.py` | **Evals del router desde el día 1** (ADR 23) + plan a encoder-only (§7.1); los cortocircuitos se testean |
| **`langgraph-supervisor` en deps pero sin usar** | `backend/requirements.txt` vs `backend/orchestrator/graph.py` | MVP = **router-a-nodos multi-agente** (NO `langgraph-supervisor`, ≈3× tokens); handoff/Supervisor solo al escalar (§7.1, ADR 17) |
| **Raw SQL psycopg sin ORM** (boilerplate por repo) | `backend/src/infrastructure/persistance/repositories/sql_*.py` | **Decidido (ADR 31): SQLAlchemy 2.0 + Alembic** — dominio puro, ORM solo en infra, Core/`text()` en hot-paths medidos. SQLModel descartado (mezcla dominio/persistencia) |

---

> *Documento vivo. Actualizar al cerrar cada fase. La IA es la herramienta; el dato propietario
> (finanzas + precios + fiscal) es el foso.*
