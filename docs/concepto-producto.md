# 🚀 Concepto de producto — Copiloto financiero + fiscal para LatAm

> **Marca (confirmada):** **Cuadra** *(de "cuadrar las cuentas" — doble sentido dinero + fiscal,
> entendible en toda LatAm)*. **Chat IA:** **AISpace** (asistente conversacional, pestaña central).
> **Tarjeta (Fase 5):** **Cuadra Card**. *(§1.2 de [`arquitectura-mvp.md`](./arquitectura-mvp.md).)*
>
> **Una frase:** *El copiloto que entiende tu plata Y tus impuestos, y usa eso para conseguirte
> el mejor crédito, tarjeta y seguro — todo por chat y voz, sin que necesites un contador.*
>
> **Mercado:** RD primero → diáspora EE.UU. → Colombia → resto de LatAm.
> **Modelo:** B2C + micro/PYME. **Inspiración:** Cleo (capa de consumo) + el motor agéntico
> fiscal-contable del proyecto del cliente (capa de dominio). **Fecha:** 2026-06-17.
>
> ⚠️ **Relación con la arquitectura (LEER):** este documento es la **VISIÓN completa** (la ambición
> de techo). La **fuente de verdad del MVP y del orden de fases** es
> [`arquitectura-mvp.md`](./arquitectura-mvp.md) (§2 alcance, §14 roadmap). Reconciliaciones clave:
> **(a)** el MVP **no** arranca por lo fiscal sino por el **triángulo** (Insights × Save vía el Coach);
> lo **fiscal** (e-CF, Caja de Impuestos, ITBIS/606) es el diferenciador de **Fase 2**.
> **(b)** Naming confirmado: app **Cuadra**, Chat IA **AISpace**, tarjeta **Cuadra Card** (Fase 5).

---

## Tabla de contenido
1. [Visión / North Star](#1-visión--north-star)
2. [El problema](#2-el-problema)
3. [El insight y la tesis incopiable](#3-el-insight-y-la-tesis-incopiable)
4. [Por qué AHORA (timing)](#4-por-qué-ahora-timing)
5. [El momento mágico](#5-el-momento-mágico)
6. [El producto — 5 capas](#6-el-producto--5-capas)
   - [6·B. Actores del producto](#6b-actores-del-producto)
   - [6·C. Capa de conocimiento: inversiones + red de creadores](#6c-capa-de-conocimiento-inversiones--red-de-creadores)
7. [Agéntico de verdad: la app ACTÚA](#7-agéntico-de-verdad-la-app-actúa)
8. [Personalidad](#8-personalidad)
9. [El foso de datos y el flywheel](#9-el-foso-de-datos-y-el-flywheel)
10. [Estrategia de datos por país](#10-estrategia-de-datos-por-país)
    - [10·B. El canal de correo (método dominante en RD)](#10b--el-canal-de-correo-es-el-método-de-captura-dominante-en-rd)
    - [10·C. La mejor captura: on-device + riel propio](#10c--la-mejor-captura-de-scraper-a-dueño-del-riel)
    - [10·D. ¿Es lograble el on-device? Diseño técnico](#10d--es-lograble-el-on-device-diseño-técnico)
    - [10·E. Cómo se emite la tarjeta (stack de issuing)](#10e--cómo-se-emite-la-tarjeta-stack-de-issuing)
11. [Monetización por fases](#11-monetización-por-fases)
12. [El corredor de remesas como cuña](#12-el-corredor-de-remesas-como-cuña)
    - [12·B. Cómo funcionan las remesas + el modelo Pana (técnico)](#12b--cómo-funcionan-las-remesas--el-modelo-pana-técnico)
13. [Go-to-market y nombre](#13-go-to-market-y-nombre)
14. [Competencia y por qué ganamos](#14-competencia-y-por-qué-ganamos)
15. [Riesgos y regulación](#15-riesgos-y-regulación)
16. [MVP — primeros 90 días](#16-mvp--primeros-90-días)
17. [Roadmap y KPIs](#17-roadmap-y-kpis)
18. [Reutilización del proyecto del cliente](#18-reutilización-del-proyecto-del-cliente)
- [Apéndice — Backlog de ideación *(opcional)*](#apéndice--backlog-de-ideación-opcional--para-leer-y-decidir-después)
19. [Fuentes](#19-fuentes)

---

## 1. Visión / North Star

**Que cualquier persona o micro-negocio en LatAm tenga el copiloto financiero que hoy solo
tienen los ricos: alguien que entiende su dinero, le cuida los impuestos y le consigue los
mejores productos — por chat, en su idioma y su moneda.**

North Star Metric: **% del ingreso del usuario que pasa "visible y gestionado" por la app**
(no MAU vanidoso). Si Cuadra ve y orquesta tu plata, todo lo demás (suscripción, fees,
marketplace, crédito) se monetiza solo.

---

## 2. El problema

En LatAm **~70% de la población es unbanked o underbanked**, y la **economía informal es la
mayor oportunidad fintech sin explotar**. El trabajador informal/freelancer/micro-negocio:

- **No sabe cuánto gana de verdad** (ingreso irregular, sin nómina).
- **Le teme a la DGII** y no entiende ITBIS/606/e-CF. No puede pagar un contador (RD$3,000–8,000/mes).
- **No tiene historial crediticio** (thin-file) → la banca tradicional no lo puede evaluar → sin crédito.
- **Le venden productos financieros a ciegas** (tarjetas caras, seguros que no necesita).
- **Recibe/envía remesas** caras y desconectadas de su vida financiera.

Hoy resuelve todo esto con **WhatsApp, libretas, Excel y miedo.** Nadie le habla en su idioma.

---

## 3. El insight y la tesis incopiable

**Insight:** para el informal, *su dinero personal y sus impuestos son la misma cosa.* No
hay frontera entre "persona" y "negocio". Por eso ninguna app que separe finanzas personales
(Cleo) de impuestos (FlyFin/SnapTax) lo resuelve. **Hay que fusionarlas.**

**Tesis del foso (lo incopiable):**

> El moat **no es la IA** — está comoditizada (cualquiera usa o3/Claude/Gemini).
> El moat es el **grafo de datos financiero-fiscal del informal**, construido **donde NO llega
> ningún agregador** (RD no tiene Plaid ni Belvo), vía **OCR + registro conversacional + el
> mandato e-CF**. Ese dato propietario alimenta TODO el negocio.

```
            ┌──────────── FLYWHEEL DE DATOS ────────────┐
            │                                            │
   más uso ──► mejor grafo financiero-fiscal ──► mejor coaching
      ▲              │            │            │      + mejor credit score (thin-file)
      │              │            │            │      + mejor matching de marketplace
      └────── más valor para el usuario ◄──────┴──────────┘
```

Quien quiera copiarnos en RD tiene que **reconstruir el grafo persona-por-persona sin
agregadores** — años de fricción. Ese es el foso.

---

## 4. Por qué AHORA (timing)

Tres olas convergen en 2026 — esto no se pudo construir antes:

| Ola | Hecho | Qué nos da |
|-----|-------|------------|
| **🇩🇴 Mandato e-CF** | Ley 32-23: **micro/pequeños obligados a e-CF el 15-nov-2026** (grandes ya, medianos nov-2025). Multas 5–50 salarios mínimos. | **Autopista de adquisición**: millones de micro-negocios *obligados*, sin herramienta accesible. Demanda forzada por el Estado. |
| **🤖 IA agéntica madura** | o3/Claude con tool-calling, chain-of-thought, voz en tiempo real; protocolos de pago para agentes (MCP, ACP, AP2, MPP de Stripe/Tempo, mar-2026). | El agente puede **razonar y ACTUAR** (emitir e-CF, apartar plata, contratar productos), no solo chatear. |
| **🌎 Open finance LatAm** | Colombia **Open Finance obligatorio** (Decreto 368, abr-2026); rails instantáneos (Pix, SPEI, Breve, billetera interoperable RD); alt-credit scoring 23% CAGR. | **Expansión multipaís** con datos cada vez más accesibles + base para el **credit score alternativo**. |

> Si entras en RD **antes de nov-2026** con la herramienta de e-CF más simple del mercado,
> capturas la ola del mandato y conviertes "cumplir con la DGII" en la puerta de entrada a
> todo lo demás.

---

## 5. El momento mágico

> **Nota de secuenciación (la arquitectura es el padre):** el momento mágico **del MVP** es el
> **coaching prescriptivo del triángulo** (*"esa compra en Bravo costaba RD$450 menos, ¿te armo la
> lista?"* — `arquitectura-mvp.md` §1.1). El momento mágico fiscal de abajo (**Caja de Impuestos /
> "¿cuánto es mío?"**) es la **joya de Fase 2**, no del MVP.

Toda gran app tiene UNA cosa que la gente le cuenta a su pana. La nuestra:

### 💰 La Caja de Impuestos + *"¿Cuánto es MÍO de verdad?"*

Cada vez que te entra dinero (foto del depósito, voz, o e-CF), el agente responde al instante:

> *"Te entraron RD$25,000. De verdad tuyos son **RD$21,300**. Aparté **RD$3,700** para la DGII
> (ITBIS + adelanto) en tu Caja de Impuestos. En noviembre no te va a agarrar el toro. 😌"*

Para alguien que **nunca** supo cuánto debía y vivía con miedo, esto es revelador. Cleo tiene
"Swear Jar"; nosotros tenemos algo **10x más significativo** porque elimina un **miedo
existencial** (que la DGII te caiga encima), no un capricho.

### 🔮 El gemelo financiero proactivo
El agente **simula tu futuro** y se adelanta:

> *"Si sigues a este ritmo, en noviembre vas a deber RD$48,000 a la DGII y solo vas a tener
> RD$30,000. Si guardas RD$1,500/semana desde hoy, llegas cubierto. ¿Lo activo?"*

Proactivo, no reactivo. Cleo responde cuando preguntas; **Cuadra te avisa antes de que sea tarde.**

---

## 6. El producto — 5 capas

Una sola app conversacional (chat + voz), cinco cerebros bajo el capó:

### Capa 1 — 🧠 Coach de finanzas personales *(la magia de Cleo)*
- Conecta/ingiere tu dinero (OCR, voz, banco donde se pueda).
- Presupuesto vivo, "¿cuánto puedo gastar?", metas, ahorro automático.
- **Gamificación con propósito**: misiones, rachas, "Caja de Impuestos" como meta. *(La gamificación
  sube el ahorro ~22% y la retención ~35%.)*
- Personalidad dominicana/local (§8).

### Capa 2 — 🧾 Copiloto fiscal *(el motor del proyecto del cliente)*
- **e-CF en un toque**: emite factura electrónica válida desde el móvil (mandato 2026).
- **ITBIS/606/IT-1 automáticos**: clasifica, calcula, recuerda fechas, te dice cuánto pagar.
- **Caja de Impuestos**: aparta la plata del Estado sola.
- "Tradúceme esta carta de la DGII", "¿este gasto lo puedo deducir?".

### Capa 3 — 🛒 Marketplace financiero *(tu diferenciador propio)*
- Con tu **dato real**, te dice **qué producto te conviene de verdad**: la tarjeta con mejor
  cashback para TU consumo, el préstamo a mejor tasa, el seguro que necesitas, la cuenta que
  te cobra menos. Todo en un solo lugar, comparado y explicado.
- Monetiza por **comisión de referido** (banca/fintech/aseguradoras), no por engaño.
- *Antídoto al caso FTC de Cleo: recomendamos por dato, con transparencia, no por dark patterns.*

### Capa 4 — 📈 Coach de inversiones *(educación, NO asesoría — ver compliance §15)*
- Te **educa** para invertir: qué es un fondo, riesgo vs retorno, cómo empezar con poco, dónde
  abrir cuenta de inversión en tu país. Responde *"¿cómo empiezo a invertir RD$5,000?"* en
  cristiano.
- Simula escenarios ("si guardas X al mes al Y%..."), pero **no da órdenes de compra ni recomienda
  un instrumento específico** sin habilitación regulatoria (SIMV/SEC). Educación primero.

### Capa 5 — 🎙️ Red de creadores / educación financiera *(el efecto de red)*
- **Canales** (estilo canal de WhatsApp: sigues si quieres, no obligatorio) donde creadores de
  educación financiera publican **posts, artículos, podcasts y video**.
- El **agente está nutrido con su contenido** y, al responderte, **te recomienda y cita** el
  artículo/episodio del creador (con enlace → le manda tráfico). El conocimiento vive en el
  agente **y** conecta al usuario con quien lo creó.
- **Por país**: creadores RD para RD, colombianos para Colombia, etc. → contenido localizado.
- Detalle completo en §6·C.

---

## 6·B. Actores del producto

Mapa de actores pensado para una arquitectura hexagonal: cada **actor primario** es un
*driving actor* (entra a la app), y cada **sistema externo** es un *driven port* con adaptador
por país. En un sistema agéntico, **el propio agente IA es un actor** (decide y ejecuta).

### A) Actores primarios — reciben el valor

| Actor | Quién es | Qué hace | Rol estratégico |
|-------|----------|----------|-----------------|
| **Trabajador informal / freelancer** | Chiripero, delivery, creador, profesional independiente | Registra ingresos (OCR/voz), "¿cuánto es mío?", emite e-CF, ahorra impuestos | 🎯 **La cuña / el foso** |
| **Micro / pequeño negocio** | Colmado, salón, taller | e-CF (mandato nov-2026), ITBIS/606, flujo | 🎯 Cuña fiscal |
| **Empleado formal (coach puro)** | Asalariado **sin negocio** que solo quiere presupuestar, ahorrar y un coach (B2C tipo Cleo) | **Registra GASTOS por OCR** (recibos/copias que recibe) + voz, presupuesto, metas, ahorro, marketplace | 📈 **Escala + marketplace** (NO el foso — ver nota) |
| **Prosumer híbrido** | Empleado formal **con** side-business | Separa nómina de ingresos por cuenta propia | Puente entre ambos mundos |
| **Emisor de remesa (diáspora)** | Dominicano en EE.UU. | Envía dinero a RD desde la app *(Fase 5)* | Adquisición de 2 usuarios a la vez |
| **Receptor de remesa (RD)** | Familia / negocio que recibe | Recibe → el dinero entra al grafo financiero *(Fase 5)* | Dato + gancho |

> **⚠️ Nota estratégica sobre el empleado formal:** expande el TAM (es el segmento más
> grande), pero **NO es la cuña ni el foso**. En RD al asalariado el empleador le retiene el
> ISR → la capa fiscal le aporta poco, y ahí **competimos de frente con Cleo/Fintonic/Mobills**
> sin diferenciador. Su valor real es ser **el mejor cliente del marketplace** (ingreso estable
> = mejor matching de crédito/tarjetas/seguros) y **adquisición barata**. Estrategia: **arrancar
> por el informal-fiscal** (diferenciado) y **sumar al asalariado después**, no al revés —
> empezar por él nos diluye en un océano rojo.

> **🔎 El OCR es transversal a TODOS los actores** (no solo del informal). Como en RD no hay
> Plaid, la foto del comprobante es el mecanismo universal de ingesta sin open banking; solo
> cambia *qué* captura cada actor: el **informal** captura sobre todo **ingresos** (facturas,
> depósitos); el **asalariado** captura **gastos** (recibos/copias que recibe) para alimentar
> al coach. Mismo motor, dos lados de la ecuación.

### B) Actores de soporte / negocio (humanos)

| Actor | Rol |
|-------|-----|
| **Contador / despacho** | *Opcional* — handoff de casos complejos, revisión, modo "supervisión" (puente con el proyecto del cliente) |
| **Agente de soporte** | Atención real al usuario (lección FTC: soporte y cancelación reales, no solo bot) |
| **Admin / Ops de Cuadra** | Cuentas, fraude, cumplimiento, observabilidad |
| **Súper-administrador (curador del muro)** | Destaca/fija contenido en el feed (global o por país); aprueba creadores; supervisa las noticias oficiales que publica la IA *(ver §6·C)* |
| **Partner del marketplace** | Banco / fintech / aseguradora que publica ofertas *(fase 3)* |
| **Creador de contenido / influencer financiero** | Publica en su **canal** (posts/artículos/podcast/video); el agente cita y recomienda su contenido. Trae su audiencia → **motor de adquisición** *(ver §6·C)* |

### C) El Agente IA — actor autónomo

No es solo la UI: **decide y ejecuta** (emite e-CF, aparta plata, presenta declaración,
contrata productos) bajo **consentimiento explícito, override y log de auditoría**. Se modela
como actor con permisos y guardrails propios.

### D) Sistemas externos (actores máquina → futuros puertos/adaptadores)

- **Fiscal:** DGII (Oficina Virtual, certificación e-CF, 606/IT-1) · proveedor e-CF certificado · *multipaís:* DIAN (CO), SAT (MX), IRS/1099 (US).
- **Datos bancarios:** API Portal Banco Popular y bancos RD · Belvo (CO/MX) · Plaid (US).
- **Pagos y remesas** *(Fase 5)*: billetera interoperable RD, Pix/SPEI/Breve, ACH · red stablecoin/remesa (USDC/Stellar).
- **Marketplace, tarjeta y crédito:** marketplace financiero *(Fase 3)* · emisores de tarjeta *(Fase 5)* · buró de crédito / scoring alternativo (thin-file), prestamistas, aseguradoras *(Fase 6)*.
- **IA / identidad:** LLM providers (Claude / o3 / Gemini) · KYC / verificación de identidad · canales de notificación (WhatsApp, push, SMS, voz).

### E) Actores de gobernanza (stakeholders regulatorios)

Superintendencia de Bancos (RD), reguladores de cada país, equivalentes a la FTC (transparencia,
anti-dark-patterns), autoridades de protección de datos.

### Quién entra en qué fase

```
MVP (Fase 0):    Usuario Normal · Agente IA (AISpace) · LLM · OCR (recibo) · catálogo Save (tiendas)
Fase 1:          + Captura por correo bancario · KYC
Fase 2:          + Informal/negocio (rol Accountant) · DGII/e-CF · ITBIS/606
Fase 3:          + Partners marketplace · Buró/scoring · Bancos (datos) · rol Commercial
Fase 4:          + Creadores/Influencer
Fase 5:          + Emisor/receptor remesa · Rails de pago · tarjeta Cuadra
Fase 6:          + Prestamistas (crédito) · Multipaís (Belvo/Plaid · DIAN/SAT/IRS)
```

---

## 6·C. Capa de conocimiento: inversiones + red de creadores

Esta capa convierte Cuadra de **herramienta** en **plataforma con efecto de red** — y es lo que
ningún competidor (Cleo, Pana, GastaBien, Novia) tiene.

### La idea

Un **super agente educador** que sabe de finanzas e inversiones **+ una red de creadores de
contenido financiero** que publican en la app. El agente responde con conocimiento **y te conecta
con quien lo creó**. Doble valor: el usuario aprende del agente Y descubre a creadores que sigue.

### Cómo funciona

- **Canales (estilo canal de WhatsApp):** cada creador tiene un canal; el usuario **sigue si
  quiere** (no obligatorio). El creador publica **posts, artículos, podcasts y video**.
- **El agente está nutrido (RAG con atribución) del contenido de los creadores** que dieron
  permiso. Cuando respondes *"¿cómo invierto en RD?"*, el agente explica **y cita**: *"Como
  explica **@planifestord** en este post → [enlace]"*. **Le manda tráfico al creador.**
- **Recomendación inteligente:** según tu perfil y tu pregunta, el agente sugiere el creador, el
  artículo o el episodio más útil para ti, **por país** (RD ve creadores RD; Colombia, colombianos).
- **Abierto a podcasters / video:** quien hace contenido en audio/video tiene su espacio.

### Por qué es un foso (efecto de red de dos lados)

```
Creadores (oferta de contenido)  ⇄  Usuarios (demanda de educación)
   traen su audiencia →  más usuarios  →  más atractivo publicar  →  más creadores
```
- **Motor de adquisición barato:** los creadores ya tienen seguidores; al traer su canal, **traen
  su audiencia** a Cuadra. CAC bajísimo.
- **Moat de contenido por país:** la biblioteca localizada de educación financiera es difícil de
  replicar — se construye relación por relación con creadores locales.
- **Retención:** contenido fresco diario = razón para volver, más allá de la tarea fiscal.

### Semilla de lanzamiento (RD)

Creadores RD de referencia para arrancar la red (con acuerdo de por medio): **@eldinerodo**,
**@numerosverdes**, **@backupfinanciero.rd**, **@planifestord**, **@economicsdata**, **@aurarod**.
Cada país tendrá su propia camada de creadores semilla.

### El muro de contenido (feed de noticias)

El feed es un **mosaico (*masonry*) de 2 columnas con scroll vertical** (swipe hacia arriba),
tarjetas de altura variable con hora/fecha, ítems **fijados (pin)**, filtro, búsqueda y crear —
estética **Apple Notes / Apple Intelligence (iOS 26)**. Mezcla **3 fuentes** en un solo muro,
cada una con su **distintivo de procedencia**:

| Fuente | Qué es | Distintivo |
|--------|--------|-----------|
| 🎙️ **Creadores** | Posts/artículos/podcasts/video de los canales que sigues + descubrimiento | `@creador` |
| 📰 **Noticias oficiales (IA)** | La IA **encuentra y verifica** novedades oficiales por país (DGII, BCRD, SIMV, cambios fiscales, mercado) | `Oficial` + enlace a la fuente |
| 📌 **Curaduría del súper-admin** | Lo que TÚ decides destacar/fijar globalmente o por país | `Cuadra` / pin |

> **🎯 Joya estratégica — el radar fiscal-financiero por país:** la fuente de **noticias
> oficiales** convierte el muro en un radar que avisa *"la DGII movió la fecha del e-CF"* o *"el
> BCRD cambió la tasa"* **antes que nadie**. Refuerza el wedge fiscal **y** es contenido
> **compliance-safe** (hecho oficial + citado, sin opinión de inversión). División de roles:
> los **creadores** ponen opinión/educación, la **IA** pone el hecho oficial, el **admin** cura.

**Curaduría y ranking:** el agente personaliza el muro **por país y por perfil** (un negociante
ve novedades de ITBIS; un asalariado, tips de ahorro), mezclando las 3 fuentes con su distintivo
visible. Modelo de dato: `FeedItem { fuente ∈ {creador, oficial, admin}, país, perfil_objetivo,
procedencia, fijado }`.

### Dirección de UI (referencia visual del usuario)

Estética limpia tipo Apple Intelligence / iOS 26, **chat-first**:
1. **Chat con respuesta enriquecida** — el agente responde con una **tarjeta de artículo** (título,
   imagen, cuerpo) y **chips de fuente** citando al creador/fuente oficial; entrada con voz. *(pantalla 1)*
2. **Muro de contenido** — mosaico *masonry* de 2 columnas, scroll vertical, las 3 fuentes con su
   distintivo (ver arriba). *(pantalla 2/4)*
3. **OCR a pantalla completa** — cámara que captura el recibo/factura y abre un *bottom sheet* de
   acción (registrar gasto / dividir cuenta / clasificar ITBIS). *(pantalla 3)*

### Monetización de esta capa

- **Suscripción premium de contenido** (acceso a canales/series premium de creadores).
- **Revenue-share con creadores** (suscripción de su canal, propinas/tips, patrocinios).
- **Sinergia con el marketplace (§Capa 3):** el contenido educa → el usuario actúa → convierte en
  el producto financiero recomendado. La educación es el *top of funnel* del marketplace.

### ⚠️ Compliance (crítico — ver §15)

- **Inversiones = educación, NO asesoría personalizada.** Recomendar un instrumento específico
  sin licencia infringe la regulación de valores (**SIMV** en RD, **SEC/FINRA** en EE.UU.).
  El agente y los creadores se mueven en **educación + información general + disclaimers**.
- **Derechos de contenido:** acuerdos con creadores para usar y citar su material; el agente
  **atribuye y enlaza**, no clona ni se hace pasar por ellos.
- **Calidad/responsabilidad:** moderación y curaduría; el agente cita fuentes, no inventa consejos
  "al estilo de" un creador sin respaldo.

---

## 7. Agéntico de verdad: la app ACTÚA

La diferencia 2026 vs un chatbot: el agente **ejecuta**, no solo conversa. Arquitectura
agéntica con biblioteca de herramientas (mismo patrón que Cleo 3.0 y el proyecto del cliente:
**el LLM razona la intención; las tools determinísticas hacen los números**).

Acciones que el agente puede ejecutar (con consentimiento explícito y log de auditoría):
- ✅ Emitir un e-CF y enviarlo al cliente.
- ✅ Apartar plata a la Caja de Impuestos (transfer a sub-cuenta/objetivo).
- ✅ Preparar y presentar el 606 / declaración.
- ✅ Pre-aprobar y contratar un producto del marketplace.
- ✅ Iniciar/recibir una remesa (§12).

> **Guardrail (lección FTC + estándares 2026):** consentimiento granular, autorización de pago
> explícita, mecanismo de override y log de acciones del agente. La confianza es el producto.

---

## 8. Personalidad

La personalidad es **ingeniería, no decoración** (lección de Cleo: flujos escritos por
guionistas + LLM-as-judge para controlar el tono). Cuadra habla **dominicano de verdad**, con
modos:

- 🤝 **Modo Pana** — cálido, te explica sin tecnicismos.
- 🔥 **Modo Bukú** — directo, sin pena, te dice la verdad de tus gastos.
- 🎉 **Modo Jevi** — celebra tus logros y rachas.

**Multipaís = personalidad localizada**: el mismo cerebro, distinto acento y modismos
(colombiano, mexicano, el español del dominicano en NY). La voz local es parte del foso cultural.

---

## 9. El foso de datos y el flywheel

Cada interacción enriquece un **perfil financiero-fiscal propietario** que ningún competidor
tiene, porque en RD **no se puede comprar a un agregador**. Ese perfil:

1. **Mejora el coaching** (más contexto → mejor consejo).
2. Se convierte en un **credit score alternativo** basado en cash-flow real (resuelve el
   thin-file que FICO/buró no puede; alt-credit crece 23% CAGR) → habilita la **fase de crédito**.
3. **Targetea el marketplace** (el producto correcto a la persona correcta).
4. Conecta el **corredor de remesas** (§12).

**El dato es el negocio.** El coaching y la fiscalidad son el *anzuelo* que hace que el usuario
entregue, voluntariamente y con gusto, el dato que vale oro.

**Profundidad del foso por etapa (ver §10·C):** empezamos capturando dato **de terceros**
(SMS/notificación/correo parseados **on-device**, privado) y migramos al usuario a **dato de
primera mano** (tarjeta/wallet Cuadra, donde cada swipe es nativo y auto-fiscal). Cuanto más
abajo en esta escalera, **más profundo e incopiable** el foso: nadie puede replicar el flujo de
transacciones de tu propia tarjeta.

---

## 10. Estrategia de datos por país

No hay "Plaid universal" en LatAm. Diseñamos una **interfaz `ProveedorDeDatos` con adaptadores
por país** (mismo patrón que los conectores Odoo/CODISA del proyecto del cliente):

| País | Open banking | Estrategia de datos | Fiscal |
|------|--------------|---------------------|--------|
| 🇩🇴 **RD** | Embrionario (SB 003-2023, sandbox Fintech RD jun-2025, **API Portal Banco Popular**, billetera interoperable) | **Parsing de correos bancarios + factura por correo + OCR + conversacional + e-CF** | DGII: e-CF, 606, ITBIS |
| 🇨🇴 **Colombia** | **Obligatorio** (Decreto 368, abr-2026) + **Belvo** | Open Finance vía agregador | DIAN, factura electrónica |
| 🇲🇽🇧🇷 **México/Brasil** | Maduro + **Belvo** (60+ instituciones) | Agregador | SAT / Receita |
| 🇺🇸 **EE.UU.** | **Plaid** (CFPB 1033 en revisión) | Agregador | IRS, 1099 (diáspora) |

> Empezamos por el caso **más difícil (RD sin agregador)** a propósito: si dominamos construir
> el grafo sin Plaid, los demás países son "fáciles" y el moat ya está hecho.

### 10·B — El canal de correo es el método de captura dominante en RD

Como en RD **no hay open banking**, las apps locales que ya funcionan capturan el gasto leyendo
los **correos de notificación que el banco manda en cada transacción**. Validado por dos
players dominicanos:

- **GastaBien** — *"solo lee los correos que te envía tu banco"* (Banreservas, Popular, BHD,
  Qik, Cibao…). Gmail vía OAuth restringido a remitentes bancarios; **Google audita anualmente**
  (requisito CASA de *restricted scopes*); extrae monto/comercio/fecha y clasifica. 15+ bancos,
  **US$4.99/mes**.
- **Novia** (*"tu relación financiera"*, ángulo parejas) — *"extraídas y categorizadas
  automáticamente con **AI**"* desde las entidades autorizadas en RD.

**Implicación 1 — reuso directo:** este es **exactamente** el canal de ingesta por correo que ya
existe en el proyecto del cliente (`correo-ingesta-facturas`: IMAP/Gmail + checkpoint UID +
extracción por LLM). Mismo motor; cambia la **fuente** y el **destino según el actor**:

| Actor | Fuente de correo | Qué se extrae | Destino |
|-------|------------------|---------------|---------|
| **Asalariado** | Notificación del banco | Monto, comercio, fecha | Gasto (coach) |
| **Informal / negocio** | Factura del proveedor | Monto, RNC, ITBIS, NCF | Gasto **+ fiscal** (deducible, 606) |
| **Negocio (ingreso)** | e-CF / factura emitida | Ingreso, ITBIS por pagar | Ingreso **+ Caja de Impuestos** |

**Implicación 2 — table-stakes, no foso:** leer el correo bancario **ya lo hacen GastaBien y
Novia**. Por sí solo no es defensible y nos pondría a competir en precio ($4.99). El **foso es
lo que ellos NO hacen**: la **capa fiscal** (e-CF, ITBIS, 606, *"¿cuánto es mío?"*), el **lado
del ingreso/proveedores**, y el **marketplace** sobre ese dato. El correo es la **puerta de
entrada al dato**, no el diferenciador.

### 10·C — La mejor captura: de "scraper" a "dueño del riel"

El correo es la solución de ayer. Ranking de métodos para RD (sin open banking):

| Método | Cobertura | Privacidad | Referentes | Veredicto |
|--------|-----------|------------|------------|-----------|
| Correo bancario (server-side) | Media | ⚠️ Leen tu Gmail en su servidor | GastaBien, Novia, proyecto cliente | Table-stakes |
| **SMS parsing** | **Alta** (todo dominicano recibe SMS del banco) | Mejor si on-device | Walnut/Axio (India, 40+ bancos), libs OSS | Más alcance que el correo |
| Notification Listener | Media | ⚠️ Frágil (Android 15 lo restringe, iOS no) | FinArt | No apostar el producto a esto |
| **IA on-device (SLM local)** | — | ✅✅ el dato **no sale del teléfono** | PennyWise (90+ bancos, 18 países) | **Cuña de confianza** |
| **Tarjeta/wallet propia (BaaS)** | Total y nativa | ✅ tuyo desde el origen | Nubank, Cleo, **Pana** 🇩🇴 | **Foso estructural** |

**Jugada 1 — Captura multi-fuente ON-DEVICE (la cuña de confianza, Fase 5).**
> **Padre (arquitectura §11):** la captura del **MVP** es **voz (STT on-device) + chat + OCR de
> recibo (manual)**; el **correo bancario** entra en **Fase 1**; la captura on-device por **SMS +
> notificaciones + SLM local** es **Fase 5**. La jugada de abajo describe ese destino, no el MVP.
Capturar de **SMS + notificaciones + correo + OCR** y **extraer con un modelo pequeño LOCAL en
el teléfono**. En 2026 es real: modelos de 1–2B corren en teléfonos de 6GB RAM a 5–10 tok/s,
suficiente para sacar *monto/comercio/fecha* (PennyWise lo prueba, 100% on-device). El mensaje
*"tus datos financieros NUNCA salen de tu teléfono"* es decisivo para un público que **le teme a
la DGII y desconfía de compartir su plata** — GastaBien/Novia **leen tu Gmail en sus
servidores**; nosotros no. Y el **SMS da más cobertura** (llega al informal sin correo).
*Honestidad técnica:* SMS-read es **Android-only** (iOS lo bloquea) y Notification Listener es
frágil → **multi-fuente con fallback por plataforma** (iOS se apoya en correo + OCR + cámara).
El SLM local hace el *parsing*; el razonamiento fiscal pesado sigue en la nube (**híbrido**).

**Jugada 2 — Sé el RIEL, no el scraper: tarjeta/wallet Cuadra (foso estructural, Fase 5).**
El endgame de Nubank/Cleo: si el usuario transa con **TU tarjeta**, eres dueño de cada
transacción — nativa, en tiempo real, con MCC/comercio, **sin parsear** y sin zona gris de
privacidad. Magia fiscal: **en el momento del swipe, apartas el ITBIS/ISR a la Caja de Impuestos
solo.** No requiere licencia bancaria: **Pomelo** (card-issuing-as-a-service de LatAm, Serie C
US$55M ene-2026, Kaszek + Insight) permite emitir tarjeta propia sobre infraestructura regulada.
El **corredor de remesas** (§12) alimenta el wallet de forma natural → dato de primera mano.

**Flywheel de captura:** *scrapear barato y privado hoy (on-device multi-fuente) → migrar al
usuario a la tarjeta/wallet → dato de PRIMERA MANO + auto-fiscal → underwriting de crédito +
marketplace.* **Incopiable:** GastaBien/Novia se quedan en correo server-side sin fiscal ni
tarjeta; Cleo tiene tarjeta pero es US/UK sin el cerebro fiscal de LatAm. La combinación
**captura on-device privada + tarjeta first-party + ITBIS automático al swipe** no la tiene
nadie en RD/LatAm.

> **Decisión de arquitectura:** modelar la ingesta como un puerto `FuenteDeMovimientos` con
> estrategias intercambiables (`SMS`, `Notificacion`, `Correo`, `OCR`, `Tarjeta`, `Agregador`)
> y un **parser on-device** por defecto. Diseñar el modelo de datos **first-party-ready** desde
> el día 1, aunque la tarjeta llegue en **Fase 5**, para no migrar el esquema después.

### 10·D — ¿Es lograble el on-device? Diseño técnico

**Sí, y ya existe en producción** (PennyWise, open source en F-Droid, lo hace con IA on-device
para 90+ bancos). *"On-device"* **no** significa un LLM gigante en el teléfono; significa que el
**dato crudo y privado se limpia en el dispositivo** y a la nube solo sube el dato ya
estructurado.

**El reparto: qué corre dónde**

```
EN EL TELÉFONO (on-device)              EN LA NUBE
─────────────────────────               ──────────────────────
1. Captura del mensaje                   4. Razonamiento fiscal pesado
   (SMS/notificación/correo/OCR)            (clasificar ITBIS, lógica 606,
2. Parsing → dato estructurado               "¿cuánto es mío?")
   (monto, comercio, fecha)              5. Sync cifrado del dato YA limpio
3. Clasificación rápida                  6. Coach conversacional complejo
   (categoría, ¿es deducible?)
```

**Paso 1 — El 80% NO necesita IA (parser determinístico).** Los mensajes del banco son
plantillas fijas. Ejemplo real:

```
"BANRESERVAS: Consumo RD$1,250.00 en SUPERMERCADO NACIONAL el 15/06/2026"
   → { monto: 1250.00, moneda: "DOP", comercio: "Supermercado Nacional",
       fecha: "2026-06-15", tipo: "débito", banco: "Banreservas" }
```

Un **grammar/regex por banco** lo resuelve en microsegundos, sin modelo, sin batería, sin error.
Hay libs OSS que ya lo hacen (`transaction-sms-parser`). Se mantiene un catálogo de plantillas
por banco (Banreservas, Popular, BHD…).

**Paso 2 — El 20% raro: SLM local como fallback.** Cuando un mensaje no matchea ninguna
plantilla (banco nuevo, formato cambiado), un **modelo pequeño local** extrae el dato:

- **Modelos:** Gemini Nano (ya en Pixel/Samsung vía AICore), Qwen2.5-0.5B/1.5B, Llama 3.2 1B,
  SmolLM2 — cuantizados Q4 pesan **0.5–2 GB**.
- **Hardware:** teléfonos de **6GB+ RAM** de los últimos 4-5 años, **5–15 tok/s** → extraer ~50
  tokens de un SMS toma **<1–3 s**.
- **Runtimes:** MediaPipe LLM Inference / Google AI Edge / ONNX Runtime / llama.cpp (Android);
  Apple Foundation Models (~3B on-device) / Core ML (iOS).
- Cada caso fallido **genera una nueva plantilla** → con el tiempo el modelo se usa menos.

**⚠️ La dificultad real NO es la IA — es la plataforma (permisos):**

| Capacidad | Android | iOS |
|-----------|---------|-----|
| Leer SMS | Posible, pero **Google Play restringe `READ_SMS`** (excepción o ser app SMS por defecto) | ❌ **Imposible** |
| Leer notificaciones | NotificationListener, pero **Android 15 bloquea las sensibles** | ❌ No permitido |
| Correo (Gmail API) | ✅ OAuth + auditoría CASA | ✅ |
| OCR / cámara | ✅ | ✅ |
| Tarjeta propia (first-party) | ✅ | ✅ |

> **Conclusión técnica:** la captura automática funciona **bien en Android**; en **iOS está muy
> limitada** (Apple no deja leer SMS ni notificaciones) → en iOS se depende de **correo + OCR +
> reenvío manual + tarjeta propia**. Por eso: **(a)** multi-fuente con *fallback por plataforma*,
> y **(b)** la **tarjeta first-party** es el endgame — es el único método que funciona igual en
> iOS y Android **sin pelear con políticas de permisos**.

**El puerto (hexagonal):**

```
FuenteDeMovimientos (puerto)
 ├── SmsStrategy            (Android; parser determinístico → SLM fallback)
 ├── NotificacionStrategy   (Android; idem)
 ├── CorreoStrategy         (iOS+Android; Gmail API + extracción)
 ├── OcrStrategy            (iOS+Android; cámara/recibo)
 ├── TarjetaStrategy        (Fase 5; first-party, sin parsing)
 └── AgregadorStrategy      (CO/MX/US; Belvo/Plaid)
        ↓ todas devuelven el mismo →  Movimiento { monto, moneda, comercio, fecha, tipo, fuente }
```

**Veredicto:** lograble con arquitectura híbrida — parser determinístico on-device (80%) + SLM
local de fallback (20%, 1–2 GB) + nube solo para el cerebro fiscal. Lo difícil es el laberinto de
permisos, que se gana con **diseño multi-fuente**, no con un modelo más grande.

### 10·E — Cómo se emite la tarjeta (stack de issuing)

**Pana no es un banco.** En su letra chica: *"Banking services provided by **Community Federal
Savings Bank (CFSB), Member FDIC**, pursuant to a license by Mastercard."* Es decir, se montó
sobre un **banco patrocinador (sponsor bank)**: Pana hace la app; el banco pone la licencia, el
FDIC y el **BIN**.

**La cadena detrás de UNA tarjeta:**

```
Tú (Cuadra)             → app, UX, cliente, y la CAPA FISCAL (tuya)
  │ construyes encima de…
Program Manager / BaaS   → orquesta el flujo de tarjeta
Issuer Processor         → autoriza/procesa cada transacción (Lithic, Marqeta, Galileo, Pomelo)
Sponsor Bank (BIN)       → banco con licencia + FDIC que "presta" su BIN   ← CFSB en Pana
Red (Mastercard / Visa)  → los rieles globales
```

El **BIN** (primeros 6-8 dígitos) es del banco, no tuyo: las fintech no pueden tener BIN propio,
por eso necesitan que un banco se los **patrocine** (*BIN sponsorship*). La "tarjeta virtual
instantánea" es el procesador emitiendo la credencial digital al toque y tokenizándola en
Apple/Google Pay.

**Las 3 rutas (y cuál tomó Pana):**

| Ruta | Implica | Quién |
|------|---------|-------|
| **1. Program Manager / BaaS** | Te apoyas en quien YA tiene los bancos integrados. **La más fácil.** | **Pana (CFSB)** |
| **2. Relación directa con banco** | Eres tu propio program manager. Más control, más trabajo. | Fintechs maduras |
| **3. Volverte banco** | Adquieres charter. Máximo control, brutal en capital/tiempo. | Nubank (eventual) |

**El camino de Cuadra (mismo patrón, dos frentes):**
- **🇺🇸 EE.UU. (diáspora):** sponsor bank tipo **CFSB / Lead Bank / Patriot** + procesador
  (**Lithic / Marqeta / Galileo**). Igual que Pana.
- **🇩🇴 RD (doméstico):** **Pomelo** (issuer-processor de LatAm) o alianza con banco local bajo
  la Superintendencia de Bancos.

> **🎯 Tu ventaja sobre Pana:** la magia fiscal (**apartar el ITBIS al swipe**) **NO la pone el
> procesador** — la pones tú, escuchando el *webhook* de cada transacción y moviendo plata a un
> **sub-ledger "Caja de Impuestos"**. **No necesitas ser banco para el diferenciador:** stack de
> tarjeta estándar (alquilado, como Pana) **+ tu capa fiscal encima** (que Pana no tiene). El
> riel es commodity; el cerebro fiscal es el foso.

---

## 11. Monetización por fases

Secuencia deliberada — cada fase financia y habilita la siguiente con el dato acumulado:

| Fase | Cuándo | Motor | Por qué en este orden |
|------|--------|-------|-----------------------|
| **1. Suscripción freemium** | Lanzamiento | Tiers en DOP: Free + Plus + Pro (negocio) | Ingreso predecible, estilo Cleo. Free = adquisición. |
| **2. Fees por servicios fiscales** | **Fase 2** (no en MVP) | Por e-CF emitido, por 606/declaración presentada | Ligado a valor tangible + ola del mandato. Pagan con gusto. |
| **3. Marketplace financiero** | +Escala/dato | Comisión por referido (crédito, tarjetas, seguros, cuentas) | Necesita dato y base de usuarios. Tu diferenciador. |
| **4. Economía de creadores** | +Comunidad | Premium de contenido + revenue-share con creadores (suscripción de canal, tips, patrocinios) | Adquisición barata + retención; alimenta el funnel del marketplace (§6·C). |
| **5. Anticipos / crédito embebido** | A futuro | Fee por adelanto de ingreso / microcrédito | Necesita **capital + licencia + el credit score del foso**. El dato lo desbloquea. |

> Orden confirmado contigo: **crédito al final**, cuando el dato y la base ya existan. La
> **economía de creadores** entra cuando hay comunidad — es *top of funnel*, no el ingreso core.

---

## 12. El corredor de remesas como cuña

Veta enorme y subestimada: **EE.UU.→RD mueve ~US$12,200M/año (2026), el 79.4% desde EE.UU.**,
pero solo el **29% de los dominicanos tiene cuenta**. Stablecoins (USDC en Stellar) ya entregan
en ~6 min con fees <5%.

**La jugada:** Cuadra se sienta en **AMBOS extremos del corredor**:
- El dominicano en NY (diáspora, segundo mercado) **envía**.
- La familia/negocio en RD **recibe** dentro de la app → ese dinero entra directo al grafo,
  al presupuesto y a la Caja de Impuestos.

La remesa deja de ser una transacción aislada y cara, y se vuelve **el primer dato y el primer
gancho de adquisición de dos usuarios a la vez** (emisor + receptor). Pocos conectan remesa +
finanzas personales + fiscal.

> **⚠️ Realidad — este corredor NO está vacío:** **Pana** (joinpana.com, YC, fundadores
> dominicanos, +US$100M/año) **ya domina cuenta USD + tarjeta + remesa + stablecoins** para la
> diáspora. **No competir de frente aquí.** La remesa es para Cuadra un **feature de captura de
> dato**, no el producto. Entramos por el **wedge fiscal** (que Pana NO toca) y usamos la remesa
> solo como gancho secundario — o exploramos a Pana como **riel aliado**, manteniendo nuestra la
> relación tributaria con el usuario.

### 12·B — Cómo funcionan las remesas + el modelo Pana (técnico)

**El mercado:** RD recibe **~US$12,200M/año (2026)**, el **79.4% desde EE.UU.** El mercado
global de remesas que Pana quiere digitalizar son **~US$150B/año**.

**Cómo funciona una remesa tradicional (lo viejo, caro y lento):**

```
Emisor → MTO/banco → bancos corresponsales (cada salto cobra fee) → payout
                                                                     ├ depósito en cuenta
                                                                     ├ billetera móvil
                                                                     ├ retiro en efectivo
                                                                     └ tarjeta
```
Western Union/MoneyGram montaron **redes propias**; otros usan corresponsalía/SWIFT (días, fees
altos). En RD el payout lo hacen **Caribe Express** (100+ sucursales, retiro en ~30 min, entrega
a domicilio gratis), **Banreservas**, **BHD**, **Remesas Dominicanas (ReD)**.

**Cómo funciona con stablecoins (lo nuevo, el modelo de Pana):**

```
1. ON-RAMP   fiat (USD) → USDC          (acepta efectivo/tarjeta/nómina, convierte a stablecoin)
2. TRANSFER  USDC on-chain               (segundos, costo ~US$0.01, sin corresponsales)
3. OFF-RAMP  USDC → moneda local         (paga a cuenta/billetera/efectivo en destino)
```
Enviar US$200 a LatAm cuesta **~US$12 por la vía tradicional vs <US$0.01 de fee on-chain**
(reduce comisiones **>75%**). El **71% de las instituciones LatAm** ya usan stablecoins
cross-border (la mayor adopción del mundo).

**La arquitectura exacta de Pana** (según Privy, su infra de wallets):
- **Wallets embebidas no-custodiales** (Privy): llaves generadas *client-side*, secure enclaves +
  key sharding. El usuario **nunca sabe que hay cripto**.
- **Ledger único** que sincroniza **USDC (cross-border) + rieles bancarios de EE.UU.
  (doméstico)** → una sola "cuenta global en dólares".
- **Firmantes server-side con políticas** (*policy-gated signers*) para autorización/settlement de
  tarjeta, acotados a mover fondos entre smart contracts y cubrir el colateral de la tarjeta — no
  wallets ómnibus con el saldo del cliente.
- **Off-ramp:** 5,000+ bancos y 200,000+ endpoints en 27-35 países, 300k puntos de efectivo.

**El reframe que hace a Pana peligroso — "la tarjeta que REEMPLAZA la remesa":**
en vez de *enviar* dinero (transferencia + pickup), la familia **comparte un saldo en dólares** y
lo **gasta directo con la Pana Global Card**. *"Western Union fue el SMS del dinero; Pana es el
WhatsApp."* No hay evento de transferencia, no hay fricción. Depositas en Walgreens o recibes tu
nómina → segundos después tu familia en RD gasta ese saldo localmente.

**La economía (por qué cuidado con este negocio):**
- Ingresos = **fee por transacción + spread de FX** (markup sobre la tasa interbancaria) +
  premium/suscripción.
- **Márgenes bajos**, juego de **volumen**; costos pesados de **licencias, compliance, liquidez,
  fraude**. Western Union cayó de ~5% a <4% de margen por la competencia digital. El FX spread
  **tiende a cero**.
- **Regulación EE.UU.:** eres **MSB** (registro FinCEN + AML/KYC) y necesitas **Money Transmitter
  Licenses estado por estado** (bonos, capital mínimo) — caro y lento. Por eso Pana **se monta
  sobre infra licenciada** (sponsor bank + wallet provider), no saca 50 licencias.

> **🧭 Decisión para el super-proyecto:** **NO** construir Cuadra como app de remesas (Pana ganó
> ese corredor y el margen de FX se evapora). Adoptar el **modelo "saldo en dólares compartido"**
> de Pana como **feature** que alimenta la super-app fiscal, montándonos en **infra de stablecoin
> + sponsor bank licenciados** (estilo Bridge/Privy + CFSB/Pomelo), **sin** sacar MTLs propias al
> inicio. **El margen defendible de Cuadra NO está en el FX, está en el SaaS fiscal + el
> marketplace.** La remesa trae el dato y el usuario; el dinero serio lo hace el cerebro fiscal.

---

## 13. Go-to-market y nombre

**Secuencia de mercados:**
1. 🇩🇴 **RD** — montar el foso de datos sobre la ola e-CF (micro/pequeños obligados nov-2026).
2. 🇺🇸 **Diáspora dominicana en EE.UU.** — vía el corredor de remesas (mismo usuario cultural).
3. 🇨🇴 **Colombia** — open finance obligatorio = datos fáciles, mercado grande.
4. 🌎 Resto de LatAm.

**Canal de adquisición — por capa:**
- **MVP (triángulo):** el gancho es el **ahorro prescriptivo** (*"te ahorro RD$450 en esta compra"*)
  + registro por voz, sin formularios. Es el wedge del MVP (aún no hay e-CF).
- **Fase 2 (fiscal):** se activa el **mandato e-CF** como canal masivo. Mensaje: *"La DGII te obliga
  a facturar electrónico. Hazlo gratis en 1 minuto con Cuadra — y de paso te cuido la plata."* La
  obligación fiscal es el caballo de Troya del coach. *(Timing: el mandato a micro/pequeños es
  nov-2026 → Fase 2 debe llegar antes de esa ola; ver riesgo en la nota de §17.)*

**Nombre (confirmado):** **Cuadra** *(naming definido — ver `arquitectura-mvp.md` §16)*. Cumplió los
criterios: corto, pronunciable en RD/US/CO, sin connotación negativa de "impuesto". Marcas de
producto: **AISpace** (Chat IA) y **Cuadra Card** (tarjeta, Fase 5).

---

## 14. Competencia y por qué ganamos

| Competidor | Qué hace | Por qué no nos tapa |
|------------|----------|---------------------|
| **Pana (joinpana.com)** 🇩🇴🇺🇸 | **El más cercano y serio.** Fundadores dominicanos, **YC**. Cuenta USD sin SSN + **tarjeta Mastercard** + remesas P2P + **stablecoins**. +50k cuentas, **+US$100M/año**, RD su 3er mercado | **Es movimiento de dinero cross-border, no fiscal.** ❌ Sin e-CF/ITBIS/606/Caja de Impuestos, sin coach, sin el informal RD, sin marketplace. **Ya ocupa el corredor de remesas y el "riel propio"** → no competir ahí de frente. **Amenaza real:** que le pongan capa fiscal encima (tienen distribución). |
| **GastaBien** 🇩🇴 | Lee correos bancarios → gastos + clasificación (US$4.99/mes) | **Solo gastos.** Sin fiscal (e-CF/ITBIS/606), sin ingreso/proveedores, sin marketplace, sin crédito. Nos valida el método de captura y el precio. |
| **Novia** 🇩🇴 | Consolida débito/crédito con IA (ángulo parejas) | **Solo agregación/coach.** Sin capa fiscal ni marketplace. Mismo límite que GastaBien. |
| **Cleo** | Personal finance + personalidad (US/UK) | Sin capa fiscal, sin LatAm, sin marketplace. No entra a RD/informal. |
| **FlyFin / SnapTax / TaxGPT** | AI tax autopilot | **US-only, para CPAs/1099**, sin finanzas personales ni marketplace ni LatAm. |
| **Belvo / Prometeo** | Infraestructura de datos | Son *plumbing*, no producto de consumo. **Podemos usarlos** en CO/MX. |
| **Alegra / Alanube / ef2 (e-CF RD)** | Software de facturación | Herramienta fría B2B, sin coach, sin personalidad, sin finanzas personales. |
| **Nubank / RappiBank** | Banco digital + gig | Banca, no copiloto fiscal-financiero; no resuelven la DGII del informal. |

**Por qué ganamos:** somos el **único** que fusiona las tres capas para el informal de LatAm,
con el **foso de datos en RD** y el **timing del mandato e-CF**. La combinación
*finanzas + fiscal + marketplace + personalidad local + dato propietario* es la barrera.

> **🎯 La amenaza #1 no es Cleo ni GastaBien — es Pana (o un banco) añadiendo capa fiscal.**
> Tienen distribución, cuenta y tarjeta; si suman *"te calculo el ITBIS"*, parten con ventaja.
> **Nuestra defensa: profundidad fiscal real** (certificación e-CF, integración DGII, el grafo
> de dato tributario que tardan en construir) **+ velocidad** — clavar el wedge fiscal antes de
> que volteen a verlo. El foso debe ser **fiscal-first**, no "otra app con tarjeta".

---

## 15. Riesgos y regulación

- **⚖️ Lección FTC (Cleo pagó US$17M):** prohibido el engaño en montos/fees y los *subscription
  traps*. **Transparencia radical** en precio y **cancelación de 1 toque** desde el día uno.
- **🔐 Datos financieros + fiscales:** seguridad bank-grade, consentimiento granular, read-only por
  defecto, cumplimiento SB (RD) y de cada país.
- **🏛️ Habilitación fiscal:** ser/integrarse con un **proveedor e-CF certificado por la DGII**.
- **💳 Crédito (Fase 6):** requiere licencia y capital — por eso va al final.
- **📈 Inversiones = educación, NO asesoría:** recomendar un instrumento específico sin licencia
  infringe la regulación de valores (**SIMV** en RD, **SEC/FINRA** en EE.UU.). El agente y los
  creadores se mueven en **educación + información general + disclaimers** (§6·C).
- **🎙️ Contenido de creadores:** acuerdos de derechos para citar/usar su material; el agente
  **atribuye y enlaza**, no clona ni se hace pasar por nadie; moderación y curaduría de calidad.
- **🤝 Confianza:** en un público que **le teme a la DGII**, la app debe sentirse de su lado, no
  del fisco. Mensaje y tono son críticos.

---

## 16. MVP — primeros 90 días

> **Alcance canónico del MVP: [`arquitectura-mvp.md`](./arquitectura-mvp.md) §2 (fuente de verdad).**
> Lo de abajo se alinea a ese corte: el MVP es la **primera capa de la super-app** (el triángulo),
> **no** la capa fiscal. La ambición fiscal completa de este documento se entrega desde **Fase 2**.

**Hipótesis a validar:** *el dominicano adoptará un coach financiero por voz que, cruzando sus gastos
con un catálogo de precios local (el triángulo), le AHORRA plata real — coaching prescriptivo que
ninguna app de RD ofrece hoy.*

Alcance mínimo (RD · monedas **DOP/USD** · un solo idioma · solo rol **Usuario Normal**):
1. **Onboarding conversacional con insight inmediato** (chat/voz) — sin pantalla vacía.
2. **Insights** — wallets DOP/USD, transacciones, presupuesto + anillo, **safe-to-spend**. Captura
   **voz (STT on-device) + chat + OCR de recibo (manual)**. Offline-first.
3. **Save** — catálogo de **supermercados** (scraping → normalización → matching) + comparación +
   lista de compra.
4. **AISpace (Chat IA)** — agente con tools de **Finanzas · Compras · Coach · Soporte** (el triángulo);
   acciones con confirmación (HITL).
5. **News** curado (admin + IA) + **suscripción freemium** (Free + Plus) con cancelación de 1 toque.

> *Fuera del MVP pero el esquema nace first-party-ready:* lo **fiscal** (rol Accountant: e-CF, ITBIS,
> 606, **Caja de Impuestos**) llega en **Fase 2**; la **tarjeta/wallet Cuadra** (vía Pomelo) en
> **Fase 5**. El modelo de datos y de roles se diseña **COMPLETO** desde ya para no migrar el esquema.

Fuera del MVP: **fiscal**, marketplace, remesas, crédito, parejas, multipaís. (Vienen por fases — §17.)

**Reutiliza del proyecto del cliente:** motor OCR, agente LangGraph + router de intención,
clasificación 606/ITBIS *(para Fase 2)*, formateo de mensajes de bot, memoria pgvector. (Ver §18 —
*cuidar la separación de IP: es app propia, no del cliente*.)

---

## 17. Roadmap y KPIs

> **Roadmap canónico por fases: [`arquitectura-mvp.md`](./arquitectura-mvp.md) §14.** Aquí se replica
> alineado (antes este bloque iba por trimestres y ponía lo fiscal en el MVP — corregido al padre).

| Fase | Hito |
|------|------|
| **0 / MVP** | Triángulo RD: Insights (voz/OCR/manual) + Save (supermercados) + AISpace + News curado + freemium DOP/USD. |
| **1** | Retención: captura por **correo bancario** + **Agente Proactivo + push** + Daily Plan/Roadmap + gamificación. |
| **2** | **Rol Accountant (fiscal):** e-CF (proveedor certificado DGII) + ITBIS/606 + **Caja de Impuestos**. |
| **3** | **Save proveedores + rol Commercial:** marketplace financiero de dos lados (tarjetas/seguros/cuentas). |
| **4** | **Rol Influencer + News completo:** canales, RAG con atribución, revenue-share. |
| **5** | **Riel propio:** tarjeta Cuadra (Pomelo) + corredor de remesas EE.UU.↔RD + diáspora. |
| **6** | **Crédito embebido + Multipaís:** credit score alternativo + Colombia (Belvo). |

> ⚠️ **Tensión de timing a vigilar:** el mandato e-CF a micro/pequeños es **nov-2026** (§4). Con lo
> fiscal en **Fase 2**, hay que llegar a esa fase **antes** de la ola para capturarla como canal de
> adquisición (§13). Es la consecuencia de secuenciar por el triángulo primero — decisión del padre.

**KPIs guía:**
- **North Star:** % del ingreso del usuario gestionado por la app.
- **MVP:** retención D30/D90 · tx/usuario/semana · % que usa voz · conversión free→pago.
- **Fases:** e-CF emitidos/usuario/mes · % que activa Caja de Impuestos · take-rate marketplace · CAC.

---

## 18. Reutilización del proyecto del cliente

⚠️ **Nota de IP (importante):** la plataforma del cliente **no es tuya**, aunque la desarrolles.
Lo reutilizable son **patrones, arquitectura y conocimiento de dominio** (cómo se modela el 606,
cómo se hace OCR de facturas, cómo se enruta la intención), **no su código propietario ni sus
datos**. Construir Cuadra como **codebase propio limpio**, reusando aprendizaje, no copiando IP.

Aprendizajes 1:1 que valen oro:
- Router de intención agéntico (LangGraph) + tools determinísticas para números.
- **Canal de ingesta por correo** (`correo-ingesta-facturas`: IMAP/Gmail + checkpoint UID +
  extracción por LLM) → reusable casi tal cual como **`CanalDeCorreo` enrutado por actor**
  (notificación bancaria → gasto; factura de proveedor → gasto+fiscal; e-CF → ingreso). Es el
  método de captura dominante en RD (ver §10·B). Maestro de **proveedores/comercios** incluido.
- OCR y clasificación de facturas / 606 / ITBIS / NCF.
- Patrón de adaptadores de integración (Odoo/CODISA → `ProveedorDeDatos` por país).
- Formateo y entrega de mensajes de bot multicanal.
- Memoria vectorial (pgvector) + RAG empresarial.
- LLM-as-judge para controlar el tono de la personalidad.

---

## Apéndice — Backlog de ideación *(OPCIONAL — para leer y decidir después)*

> Ideas exploradas en modo ideación. **No es un build list.** Es un **menú para priorizar**: lee,
> descarta o promueve. Clasificadas por palanca y por prioridad sugerida. Los datos que las
> respaldan están entre paréntesis.

### Lentes para decidir (filtra cada idea con esto)
1. **Distribución > features** — *¿esto me consigue usuarios baratos?*
2. **Cultura local = foso** — lo nativo de RD no se copia rápido.
3. **El miedo es el insight** — lo que quite el miedo a la DGII, gana.
4. **Misión de inclusión = dinero + puertas** — inversores de impacto + alianzas estatales.

### 🟢 Prioridad alta (se potencian entre sí)
- **Asistente de formalización ("saca tu RNC")** — *el **90.8%** de micro/pequeñas empresas RD no
  tienen RNC; 85% de +400 mil MiPymes. El Estado + OIT quieren formalizarlas; formalizar desbloquea
  crédito (hasta RD$5MM+) y facturar.* Convierte a la **DGII de amenaza en aliado de distribución**.
  Wedge + distribución + misión fundable.
- **El "San" digital** *(sociedad / susu / ROSCA)* — *masivo en LatAm (~30% en México); en RD es
  institución.* Da **ahorro + viralidad social + dato de crédito alternativo** (quién paga a tiempo).
  Trae grupos completos de usuarios de golpe.
- **WhatsApp-first** — RD vive en WhatsApp; el agente debe vivir ahí, no solo en la app. Mínima
  fricción + **reusa el motor multicanal del proyecto del cliente**. Distribución pura.
- **Gig B2B2C (PedidosYa, Uber, Rappi, Glovo)** — embeber Cuadra como copiloto fiscal de
  repartidores/conductores. El **usuario exacto** (informal con ingreso digital) + distribución
  masiva en un solo deal.

### 🔵 Fuertes (sumar después del MVP)
- **Defensa ante la DGII** — "te llegó una notificación", ponerse al día, amnistías. **El producto
  que mata el miedo**; engancha emocionalmente.
- **Multi-obligación fiscal** — además de 606/e-CF: ISR, **TSS (seguridad social)**, IT-1. *(El
  sistema fiscal RD está entre los más complejos del mundo, 100+ normas → esa complejidad es la
  oportunidad de IA.)*
- **El "fiao" digital** *(crédito del colmado)* — grafo de crédito informal que nadie tiene +
  relación con el comercio local (que también es usuario-negocio).
- **Benchmark anónimo** — *"gente como tú en tu sector gasta/ahorra X"*. Nudge conductual que solo
  tú puedes hacer por el foso de datos.
- **Finanzas familiares / compartidas** — hogar + diáspora (shared balance estilo Pana, pero
  fiscal-aware). *(Novia valida el ángulo "en pareja".)*
- **División de cuentas (bill split)** — el "Pay Your Share" de la pantalla 3; social y viral.
- **B2B2C con despachos contables y bancos** — white-label del cerebro fiscal; el que ya tiene
  audiencia te la presta.

### 🟣 Misión / fundraising
- **Inclusión financiera como tesis** → inversores de impacto (IFC, BID, FOMIN) y **alianzas
  DGII/OIT/gobierno**. La narrativa *"formalizamos e incluimos al informal"* es fundable y abre
  **distribución estatal**.

### 🔴 Trampas (NO hacer)
- **NO ser app de remesas** (Pana ya ganó ese corredor; el FX se evapora).
- **NO dar asesoría de inversión** (SIMV — educación sí, "compra esto" no).
- **NO meter todo esto en el MVP** — priorizar, no acumular. Intentar todo = no lograr nada.

---

## 19. Fuentes

**Cleo y producto base** → ver [`docs/research/cleo-analisis.md`](../research/cleo-analisis.md).

**Innovación y mercado (esta investigación):**
- [Agentic commerce in 2026 — FintechFutures](https://www.fintechfutures.com/ai-in-fintech/agentic-commerce-in-2026-where-we-stand-and-what-lies-ahead)
- [Top Fintech Trends 2026: AI & Embedded Finance — Innowise](https://innowise.com/blog/fintech-trends/)
- [Gamification in Financial Services 2026 — Startup House](https://startup-house.com/blog/gamification-in-financial-services-benefits)
- [Behavioral Finance Apps 2026 — Whistl](https://www.whistl.app/blog-behavioral-finance-apps-complete-guide-2026.html)
- [LatAm's Informal Economy Becomes FinTech's Biggest Opening — PYMNTS](https://www.pymnts.com/news/international/latin-america/2026/latin-americas-informal-economy-becomes-fintechs-biggest-opening/)
- [Financial inclusion in Latin America with fintech and AI — Microsoft](https://news.microsoft.com/source/features/ai/fintech-ai-financial-inclusion-latin-america/)
- [LatAm banking 2026 — Galileo](https://www.galileo-ft.com/blog/latam-banking-2026-digital-payments-inclusion-convergence/)

**Fiscal RD (e-CF / Ley 32-23):**
- [Obligatoriedad facturación electrónica RD 2025-2026 — Alegra](https://blog.alegra.com/republica-dominicana/obligatoriedad-de-factura-electronica/)
- [Ley 32-23 (PDF oficial) — DGII](https://dgii.gov.do/legislacion/leyesTributarias/Documents/Otras%20Leyes%20de%20Inter%C3%A9s/32-23.pdf)
- [Facturación electrónica DGII 2026 API — Dynasoft](https://dynasoftsolutions.com/2026/02/20/facturacion-electronica-dgii-republica-dominicana-2026-api/)

**Open banking / open finance:**
- [Superintendencia de Bancos, Adofintech y Hub de Innovación — finanzas abiertas (RD)](https://presidencia.gob.do/noticias/superintendencia-de-bancos-adofintech-y-el-hub-de-innovacion-financiera-promueven-las)
- [API Portal Banco Popular (open banking RD) — Infotur](https://infoturdominicano.com/rd/banco-popular-dominicano-anuncia-el-lanzamiento-de-api-portal-plataforma-pionera-de-open-banking-en-el-pais/)
- [Belvo — open finance LatAm](https://belvo.com/)
- [Colombia Open Finance obligatorio (Decreto 368) — Brigard Urrutia](https://www.bu.com.co/en/insights/noticias/colombia-launches-its-mandatory-open-finance-system)
- [CFPB Section 1033 status — Congress.gov](https://www.congress.gov/crs-product/IF13117)

**Backlog de ideación (formalización, San/ROSCA, informalidad RD):**
- [Economía informal dominicana — El Nuevo Diario](https://elnuevodiario.com.do/los-desafios-de-la-economia-informal-dominicana/)
- [Formalidad e informalidad en RD (90.8% sin RNC) — El Dinero](https://eldinero.com.do/235742/que-tanto-depende-la-formalidad-de-la-informalidad-en-republica-dominicana/)
- [Estudio sobre informalidad en RD — OIT/ILO](https://www.ilo.org/sites/default/files/2024-09/OIT_Estudio%20sobre%20informalidad%20Rep%20Dom%20final.pdf)
- [Cómo iniciar un negocio / RNC — DGII](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/registrados/otros/Documents/ComoIniciarunNegocio.pdf)
- [Tanda / ROSCA (informal loan club) — Wikipedia](https://en.wikipedia.org/wiki/Tanda_(informal_loan_club))
- [Rotating savings and credit association (ROSCA) — Wikipedia](https://en.wikipedia.org/wiki/Rotating_savings_and_credit_association)

**Competidores RD (apps de finanzas / cuenta / tarjeta):**
- [Pana — paga, envía y recibe dinero (joinpana.com)](https://joinpana.com/)
- [Pana, competidor sistémico: banca + pagos + cripto — Acento](https://acento.com.do/economia/pana-el-nuevo-competidor-sistemico-para-los-bancos-dominicanos-una-fintech-que-une-banca-pagos-y-cripto-en-un-solo-modelo-9611385.html)
- [Dominicano crea fintech Pana en EEUU para remesas — Diario Libre](https://www.diariolibre.com/usa/actualidad/2025/08/04/dominicano-crea-fintech-pana-en-eeuu-para-envios-de-remesas/3201958)
- [GastaBien — conecta tus bancos por correo](https://gastabien.com/)
- [GastaBien — Preguntas Frecuentes](https://gastabien.com/faq)
- [Novia — tu relación financiera](https://novia.com.do/)

**Captura de datos / ingesta (SMS, on-device, tarjeta propia):**
- [PennyWise AI — expense tracker on-device (F-Droid)](https://f-droid.org/en/packages/com.pennywiseai.tracker/)
- [transaction-sms-parser (lib OSS)](https://github.com/saurabhgupta050890/transaction-sms-parser)
- [Auto-Expense-Tracker por SMS (GitHub)](https://github.com/praslnx8/Expense-Tracker)
- [Walnut/Axio — SMS expense tracking (India) — Finny](https://getfinny.app/blog/sms-expense-tracking-app)
- [On-Device LLMs: State of the Union 2026 — Vikas Chandra (Meta)](https://v-chandra.github.io/on-device-llms/)
- [Cómo correr LLMs locales en Android 2026 — DEV](https://dev.to/alichherawalla/how-to-run-llms-locally-on-your-android-phone-in-2026-no-cloud-no-account-2cd1)
- [NotificationListenerService — Android Developers](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [Pomelo — card issuing as a service LatAm](https://www.pomelo.la/en)
- [Pomelo Serie C US$55M (ene-2026) — Insight Partners](https://www.insightpartners.com/ideas/pomelo-raises-55-million-series-c-to-accelerate-the-modernization-of-payments-infrastructure/)

**AI tax / freelancer:**
- [FlyFin — AI tax for self-employed](https://flyfin.tax/)
- [SnapTax — forward-looking tax for 1099 (Yahoo Finance)](https://finance.yahoo.com/sectors/technology/articles/snaptax-launches-ai-powered-tax-175600242.html)
- [TaxGPT — AI tax assistant for freelancers](https://www.taxgpt.com/ai-tax-assistant-for-freelancers-and-gig-workers)

**Remesas, stablecoins y crédito alternativo:**
- [Fintech Landscape of the Dominican Republic 2026 — The Fintech Times](https://thefintechtimes.com/fintech-landscape-of-the-dominican-republic-in-2026/)
- [DR remittance inflows 2026 — DR1](https://dr1.com/news/2026/02/16/dominican-republic-remittance-inflows-up-again/)
- [Marketplace for money transfers to DR — Inter-American Dialogue](https://thedialogue.org/blogs/2025/08/the-marketplace-for-money-transfers-to-the-dominican-republic-an-assessment)
- [Caribe Express — entrega de remesas en RD](https://caribeexpress.com.do/)
- [What are remittances / cómo funcionan — Mastercard](https://www.mastercard.com/us/en/news-and-trends/stories/2026/remittances-explained.html)
- [Cómo funcionan las remesas con stablecoins — Stripe](https://stripe.com/resources/more/stablecoin-remittances-explained)
- [On-ramp / off-ramp de stablecoins — Modern Treasury](https://www.moderntreasury.com/learn/stablecoin-on-ramp-and-off-ramp)
- [Redefiniendo el corredor US-LatAm con Pana — Privy (arquitectura técnica)](https://privy.io/blog/redefining-us-latam-cross-border-money-movement-with-pana)
- [Pana lanza la Pana Global Card "que reemplaza las remesas"](https://investor.wedbush.com/wedbush/article/abnewswire-2025-12-16-pana-launches-pana-global-card-the-card-that-replaces-remittances)
- [Cómo gana dinero Remitly (modelo de negocio) — The Strategy Story](https://thestrategystory.com/2023/02/01/how-does-remitly-work-make-money-business-model-competitors/)
- [Money Transmitter License: requisitos 2026 — InnReg](https://www.innreg.com/blog/money-transmitter-license-steps-and-requirements)
- [Cracking the Credit Code: alternative data & AI — IFC](https://www.ifc.org/en/insights-reports/2026/cracking-the-credit-code-alternative-data-and-ai-for-financial-inclusion)

**Emisión de tarjeta (issuing / BIN sponsorship):**
- [Fintech guide to bank partners & sponsors — Lithic](https://www.lithic.com/blog/bank-partners)
- [BIN Sponsorship: clave para emitir tarjetas — SDK.finance](https://sdk.finance/blog/bin-sponsorship-a-key-to-unlocking-card-issuance-in-fintech/)
- [Pana — perfil Y Combinator (S22)](https://www.ycombinator.com/companies/pana)


Funcionalidad para empleados que viajan al exterior, necesitan documentar y registrar facturas para enviarselas luego a su empleador y le reembolse... 

La idea seria poder crear algo que permita a ese empleado poder guardar en un lugar seguro las facturas y luego pasarselas y compartirselas al equipo contable sin ningun inconveniente... Incluso para aquellos que viajan y deben de reportar sus gastos...