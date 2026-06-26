# Cleo — Dossier completo

> Análisis de investigación sobre **Cleo** (meetcleo.com): qué es, cómo funciona, su
> tecnología, modelo de negocio, caso regulatorio y aprendizajes aplicables a nuestra
> app fiscal-contable agéntica.
>
> **Fecha:** 2026-06-17 · **Fuentes:** sitio oficial, blogs de ingeniería de Cleo,
> prensa especializada, FTC, portales de reseñas y datos de financiamiento (ver §11).

---

## Tabla de contenido
1. [Qué es](#1-qué-es)
2. [Historia financiera y valoración](#2-historia-financiera-y-valoración)
3. [Cómo funciona — el flujo](#3-cómo-funciona--el-flujo)
4. [Tecnología (arquitectura agéntica)](#4-tecnología-arquitectura-agéntica)
5. [Productos / Features](#5-productos--features)
6. [La personalidad como producto](#6-la-personalidad-como-producto)
7. [Modelo de negocio](#7-modelo-de-negocio)
8. [El caso FTC (gobernanza)](#8-el-caso-ftc-gobernanza)
9. [Reseñas reales de usuarios](#9-reseñas-reales-de-usuarios)
10. [Competidores](#10-competidores)
11. [Lectura como arquitecto — paralelos con nuestra app](#11-lectura-como-arquitecto--paralelos-con-nuestra-app)
12. [Fuentes](#12-fuentes)

---

## 1. Qué es

Cleo es un **asistente financiero personal basado en IA conversacional con
"personalidad"**. No es un dashboard de presupuesto tradicional: es un **chatbot
(texto y voz)** que se conecta a tu banco, analiza tu dinero y te habla en lenguaje
coloquial — incluso con sarcasmo. Se posiciona como *"the world's first AI Money Pro"*.
Lema: **"Cleo makes money better."**

| Dato | Valor |
|------|-------|
| Fundada | Londres, **2016** |
| Fundador / CEO | **Barney Hussey-Yeo** (graduado en Machine Learning, ex data scientist en fintech) |
| Pivote clave | **2020**: foco exclusivo en el mercado de **EE.UU.** |
| Escala | Decenas de millones de usuarios registrados; **+1M suscriptores de pago** |
| Engagement | **+49 mil millones** de mensajes intercambiados usuario ↔ IA |

---

## 2. Historia financiera y valoración

- **Total levantado:** ~**$124–175M** (las fuentes varían) en ~9 rondas, ~55 inversionistas.
- **Inversionistas clave:** Balderton Capital, EQT Ventures, Sofina, LocalGlobe.
- **Última valoración pública:** **$500M** en la **Serie C ($80M, junio 2022)**.
- **ARR (crecimiento explosivo):**
  - Fin de 2024: **~$185M**
  - Mediados de 2025: **~$250–280M**
  - El CEO afirma que **$500M ARR está "a la vuelta de la esquina"**; la prensa especula con una **IPO**.

> **Observación:** Cleo pasó de ser un *tracker* de gastos a una **máquina de ingresos por
> suscripción + fees**, con márgenes de fintech de consumo. Es un caso de monetización
> agresiva, no solo de producto atractivo.

---

## 3. Cómo funciona — el flujo

1. **Conexión bancaria vía Plaid en modo solo-lectura.** Agrega todas tus cuentas en un
   solo lugar. No mueve tu dinero, solo lo lee.
2. **Análisis de patrones.** Ingreso, gastos, hábitos y metas.
3. **Conversación.** Preguntas en lenguaje natural ("¿cuánto puedo gastar este finde?") y
   responde al instante, en *plain English*, con su tono característico.
4. **Memoria.** Recuerda metas, hábitos e historial financiero → consejos más relevantes
   con el tiempo.
5. **Voz bidireccional.** Conversación por voz en tiempo real (TTS + IA conversacional);
   *"el primer money coach con IA que habla, piensa y recuerda"*.

---

## 4. Tecnología (arquitectura agéntica)

Cleo es uno de los ejemplos más maduros de **arquitectura agéntica en producción** dentro
del fintech.

### 4.1 Separación de responsabilidades (principio de diseño central)

- **La capa LLM interpreta intención y genera la respuesta.**
- **Los cálculos NO los hace el LLM.** Se delegan a **herramientas determinísticas, bien
  testeadas y específicas del dominio** (filtrar transacciones, categorizar, sumar). Esto
  evita el problema clásico: *un LLM no debe hacer aritmética sobre tu dinero.*

> Este es **exactamente el principio que aplicamos** en la app fiscal: cuentas, reglas e
> ITBIS = *tools / cálculo determinístico*, no embeddings ni "que el modelo razone el
> número". Cleo lo valida a escala.

### 4.2 Cleo 3.0 (2025) — totalmente agéntico

1. **Arquitectura agéntica.** La IA elige qué herramientas usar y en qué orden; completa
   tareas multi-paso de forma autónoma, con mínimo ida y vuelta.
2. **Biblioteca de ~40 herramientas.** Cada una con instrucciones estructuradas: *cuándo
   usarla, qué inputs proveer, cómo interpretar el resultado* (patrón de tool-calling con
   structured output).
3. **Razonamiento proactivo con OpenAI o3.** Analiza el historial de transacciones con
   **chain-of-thought** para insights más profundos.
4. **Voz bidireccional** en tiempo real (escucha, responde con tono adaptado al momento).
5. **Memoria persistente.** Recuerda metas, hábitos e historial → personalización creciente.

### 4.3 Estrategia multi-modelo y evaluación

- Construyen LLMs propios **desde hace ~7 años**; con ChatGPT (2022) empezaron a
  experimentar con modelos de terceros.
- **Arquitectura multi-LLM:** distintos modelos para distintas partes del pipeline
  (enriquecimiento de transacciones, scoring, generación de respuesta).
- **Evaluación con LLM-as-judge:** entrenan LLMs para **evaluar las salidas de otros LLMs**;
  simulan interacciones Cleo ↔ usuario a escala para detectar problemas de estilo o **tono
  demasiado intenso**.
- **Benchmark:** compararon Cleo contra modelos de OpenAI, Anthropic y Google usando
  **129 transacciones reales** (~$29.5K de entradas / ~$29.9K de salidas).

### 4.4 MLOps — framework "Espresso"

| Capa | Herramientas |
|------|--------------|
| CI/CD | CircleCI, Terraform |
| Serving | s2i, **FastAPI**, Istio, Docker |
| Observabilidad | Rollbar, New Relic, Prometheus, CloudWatch |

### 4.5 La personalidad es ingeniería, no improvisación

El ML detecta intención y enruta a **flujos de chat escritos por un guionista de comedia
real**. La "voz graciosa" es un activo controlado y evaluado, no un prompt suelto.

### 4.6 Detalles de Cleo 3.0 (blog de ingeniería, 2025-2026)

Hallazgos nuevos de *"Building a financial agent on top of commodified LLMs"*, *"How we taught
Cleo to talk back"* y el anuncio de Cleo 3.0 — directamente aplicables a Cuadra:

- **Tesis "LLMs comoditizados como sustrato":** Cleo trata al LLM como *substrate* y construye
  encima **razonamiento agéntico + memoria + tools + multimodal**. Idéntico a nuestra tesis del
  foso (*el moat no es la IA, es el dato + la capa propietaria*).
- **Smart Insights Agent (proactivo, background):** un agente que NO espera a que preguntes —
  corre sobre **~6 meses** de historial **enriquecido** (comercio, categoría, **señales de
  comparación social**), hace **razonamiento multi-paso (varias pasadas)** y emite insights
  **etiquetados por categoría y nivel de confianza**. Detecta patrones sutiles (carga de pagos
  creciente, caída del ahorro). → patrón del **gemelo financiero proactivo** + benchmark anónimo.
- **Voz (implementación):** Cleo **NO construyó STT propio** — usó **dictado nativo on-device**
  para shipear rápido. Pipeline en **streaming**: transcripción parcial → modelo → en cuanto hay
  tokens se **espejan a ElevenLabs v2** (TTS) y se reproducen. Fine-tunearon un **modelo pequeño**
  para latencia de respuestas rápidas.
- **Memoria como monitor de background:** vigila transacciones + chats previos para detectar
  cambios y **disparar follow-ups automáticos**.

Hallazgos profundos de *"Inside Cleo's multi-agent architecture"*, *"Introducing Cleo's custom
router"*, *"Fine-tuning a smaller model for quick replies"*, *"Introducing Autopilot"* y *"Service
objects… you probably should not use them"*:

- **Arquitectura de DOS PLANOS conectados por stores compartidos** (lo más fuerte):
  **conversacional** (real-time, modelos livianos, contexto corto, tools acotadas) que **LEE** un
  **Perfil Financiero precomputado**, y **background** (async, modelos pesados, LLM encadenado)
  que lo **ESCRIBE**. El chat no recalcula meses de transacciones — consulta el perfil. Decopla
  velocidad de profundidad; se itera cada plano sin romper el otro.
- **Tres mecanismos de conexión entre agentes:** router (clasifica), **handoff** (`select_new_agent`
  reenruta si la clasificación falló) y **sub-agentes como tools**. Creación **bottom-up** (un
  dominio se vuelve agente cuando está bien definido) → evita abstracción prematura.
- **Router propio (encoder-only) entrenado con data propia:** **16× más rápido** (800→50ms), mejor
  que GPT-nano. MLOps: **traffic mirroring** (sombra en paralelo), optimización de prompts
  automatizada, evals offline+online, **rollouts A/A→A/B**. Futuro: routing por complejidad.
- **Capa de enriquecimiento de transacciones (fundacional):** convierte cruda→estructurada
  (comercio normalizado, categoría, esencial/discrecional, recurrente/único, stream de ingreso).
  Semi-supervisado: **modelo rápido fine-tuneado + fallback a frontera + loop de labels**. **Todo
  downstream consume el dato enriquecido.**
- **Autopilot (análisis→ACCIÓN):** Roadmap (plan 3-6 meses), Daily Plan + **safe-to-spend**,
  Actions (mover a ahorro, evitar sobregiro, límite/bloqueo de comercio — con consentimiento).
  **Aprende de RESULTADOS reales (RL), no de engagement** (alinea con lección FTC).
- **Fine-tuning de modelo pequeño para tareas estrechas:** entrenar con **trazas de producción**
  (señal: QR clickeado) + LLM-judge; +13.5% engagement, −53% latencia. **Riesgo:** un cambio de
  schema rompe el modelo fine-tuneado (constrained decoding) → re-fine-tunear al cambiar schema.
- **Lección de modelado (service objects):** un "service" lleno de cosas suele señalar una
  **abstracción de dominio faltante**; Cleo mató 4 services al introducir el modelo
  `ConversationSession`. Valida nuestra arquitectura screaming + ledger (modelar, no parchear).
- **Voz: heurísticas de TTS** (bufferear numerales para montos, degradar `!` a `.`, fallback a
  texto, manejar interrupción) y **voz = flag sobre el mismo pipeline**, no superficie aparte.

> **Aplicado a Cuadra** en [`startup/arquitectura-mvp.md`](../startup/arquitectura-mvp.md): §5.6
> (enriquecimiento), §7.1 (handoff + maduración router), §7.7 (voz on-device + heurísticas), §7.9
> (dos planos + Perfil Financiero + Autopilot + optimizar por resultado), §10 (stores), §4
> (diagrama), ADRs 8, 18-22.
>
> **Texto completo de los 8 artículos + diagramas recreados:**
> [`cleo-articulos-fuente.md`](./cleo-articulos-fuente.md) (referencia consultable).

---

## 5. Productos / Features

| Producto | Qué hace |
|----------|----------|
| **Chat (texto + voz)** | Interfaz principal; preguntas en lenguaje natural |
| **Budgeting / Smart Save** | Calcula cuánto puedes ahorrar *esta semana* según el flujo real |
| **Ahorro automático** | Round-ups, "Swear Jar", cuenta high-yield ~2.75% APY |
| **Cash Advances** | Adelantos hasta **$250** sin credit check (fee $3.99–$14.99) |
| **Credit Builder Card** | Construir crédito sin chequeo tradicional |
| **Debt Reset** | Consolida deudas y prioriza pagos |
| **Early Income Access** | Cobra hasta 10 días antes |
| **Haggle It** | Negocia rent, tasas de tarjeta, seguro de auto |
| **Autopilot** | Roadmap financiero automático |
| **Money IQ** | Educación financiera tipo quiz (premio top $4,000) |

---

## 6. La personalidad como producto

Es el principal diferenciador frente a la competencia:

- 🔥 **Roast Mode** — critica con humor/sarcasmo tus gastos absurdos. **1.4M usuarios "roasteados".**
- 🎉 **Hype Mode** — modo motivacional/positivo cuando vas bien. **+841K usuarios animados.**

Lenguaje **memero, casual, dirigido a Gen Z / millennials**. Esa voz es el gancho de
adquisición y retención: convierte una tarea aburrida (finanzas) en algo entretenido.

---

## 7. Modelo de negocio

**Freemium + fees**, dos motores:

1. **Suscripción:**
   - **Plus** — $5.99/mes (monitoreo de crédito, herramientas de deuda, cash advances)
   - **Pro** — $8.99/mes (ahorro high-yield, IA avanzada)
   - **Builder** — $14.99/mes (Cleo Card, cobro anticipado)
2. **Fees transaccionales:** cash advance, servicios de tarjeta, *spread* de interés del ahorro.

---

## 8. El caso FTC (gobernanza)

En **marzo de 2025**, Cleo aceptó **pagar $17M** (de los cuales **$10M para reembolsos**)
para cerrar una demanda de la **FTC (Federal Trade Commission)** de EE.UU.

**Hallazgos del regulador:**
- **Publicidad engañosa:** prometía "cientos de dólares"; **muchos usuarios recibían solo
  $20–$70** en vez de los $250 anunciados.
- **Subscription traps / dark patterns:** enrolaba en suscripciones de **$14.99/mes** y
  dificultaba la cancelación.
- **Consent order a 10 años:** obliga a divulgar términos *clara y visiblemente*, obtener
  **consentimiento informado** antes de cobrar, y ofrecer **cancelación simple**.

> **Lección:** cuando construyes IA persuasiva sobre dinero, **la transparencia de precio y
> la cancelación fácil no son opcionales**. Un gran UX de adquisición no compensa la
> fricción engañosa en la retención.

---

## 9. Reseñas reales de usuarios

- **Ratings altos en stores:** **4.7/5** App Store (+223K reseñas), **4.3/5** Google Play.
- **Más críticos:** Trustpilot y BBB.
- **Quejas recurrentes:**
  - Los **caps de adelanto** se sienten menores a lo anunciado; difícil verificar
    banco/ingresos para montos altos.
  - Cobran el **fee mensual y luego informan que no calificas** al adelanto.
  - **Soporte difícil de contactar** (solo respuesta virtual).
  - **"El humor cansa"** con el tiempo.

---

## 10. Competidores

| App | Su fuerte |
|-----|-----------|
| **Cleo** | Insights con IA conversacional + adelantos on-demand; principiantes que evitan sus finanzas |
| **Rocket Money** | Cancela suscripciones y negocia facturas |
| **YNAB** | Presupuesto base-cero (asigna cada dólar) |
| **Copilot** | Categorización IA profunda (solo iOS) |
| **Monarch** | Parejas y reporting detallado |
| **Dave / Earnin / Brigit / Bright Money** | Cash advances (Bright ofrece hasta $750) |

Diferenciador de Cleo: **chatbot-first + bundle de productos financieros**, no solo presupuesto.

---

## 11. Lectura como arquitecto — paralelos con nuestra app

1. **LLM para intención, tools determinísticas para los números.** Cleo valida nuestra
   separación (cuentas/reglas/ITBIS = cálculo, no embeddings). Idéntico a la nota interna
   *"NO todo es RAG"*.
2. **~40 tools con instrucciones estructuradas + router de intención.** Mismo patrón de
   nuestro skill `agent-prompt-engineering` (structured output, routing short-circuit-first).
3. **Memoria persistente como diferenciador compuesto.** Nuestro pgvector + TTL apunta al
   mismo valor: el consejo mejora con el historial.
4. **Integración read-only (Plaid).** Espejo de nuestros conectores Odoo/CODISA: leer del
   sistema de registro sin asumir el riesgo de escritura/movimiento de dinero.
5. **LLM-as-judge para evaluar tono/calidad a escala.** Directamente aplicable a nuestro
   protocolo `judgment-day` y a evaluar respuestas del bot.
6. **MLOps real (FastAPI + observabilidad).** Coincide con nuestro stack.
7. **Gobernanza FTC.** Recordatorio de transparencia para cualquier producto financiero con IA.

---

## 12. Fuentes

- [Cleo — sitio oficial](https://web.meetcleo.com/)
- [Introducing Cleo 3.0](https://web.meetcleo.com/blog/Introducing-cleo-3-0)
- [Building a financial agent on top of commodified LLMs](https://web.meetcleo.com/blog/building-a-financial-agent-on-top-of-commodified-llms)
- [How we taught Cleo to talk back (voz)](https://web.meetcleo.com/blog/how-we-taught-cleo-to-talk-back)
- [How we built Cleo's visual world](https://web.meetcleo.com/blog/how-we-built-cleos-visual-world)
- [My path to machine learning at Cleo](https://web.meetcleo.com/blog/my-path-to-machine-learning-at-cleo)
- [Inside Cleo's multi-agent architecture](https://web.meetcleo.com/blog/inside-cleos-multi-agent-architecture)
- [Introducing Cleo's custom router, trained on our own data](https://web.meetcleo.com/blog/introducing-cleos-custom-router)
- [Fine-tuning a smaller model for quick replies](https://web.meetcleo.com/blog/fine-tuning-a-smaller-model-for-quick-replies)
- [Introducing Autopilot](https://web.meetcleo.com/blog/introducing-autopilot)
- [How Cleo learns what your transactions actually mean](https://web.meetcleo.com/blog/how-cleo-learns-what-your-transactions-actually-mean)
- [What do people really want from an AI financial assistant?](https://web.meetcleo.com/blog/what-users-want-ai-financial-assistant)
- [Memory as a step toward more human AI](https://web.meetcleo.com/blog/memory-as-a-step-toward-more-human-ai)
- [Service objects are useful and you probably should not use them](https://web.meetcleo.com/blog/service-objects-are-useful-and-you-probably-should-not-use-them)
- [Cleo Learn (artículos + video)](https://web.meetcleo.com/learn)
- [How Cleo Uses AI](https://web.meetcleo.com/blog/how-cleo-uses-ai)
- [A Year of LLM Developments at Cleo](https://web.meetcleo.com/blog/a-year-of-llm-developments-at-cleo)
- [Cleo vs the rest — evaluating AI models on real-world money questions](https://web.meetcleo.com/blog/cleo-vs-the-rest-evaluating-ai-models-on-real-world-money-questions)
- [Espresso — MLOps at Cleo](https://web.meetcleo.com/blog/lets-have-an-espresso-mlops-at-cleo)
- [Cleo revenue & growth — Sacra](https://sacra.com/c/cleo/)
- [Cleo raises $80M at $500M valuation — FintechFutures](https://www.fintechfutures.com/fintech-innovation/gen-z-financial-assistant-app-cleo-raises-80m-at-500m-valuation)
- [Cleo AI Review — NeuronFeed](https://neuronfeed.com/startups/cleo-ai)
- [FTC — Cleo AI $17M settlement (press release)](https://www.ftc.gov/news-events/news/press-releases/2025/03/cash-advance-company-cleo-ai-agrees-pay-17-million-result-ftc-lawsuit-charging-it-deceives-consumers)
- [Hunton — FTC $17M settlement analysis](https://www.hunton.com/privacy-and-cybersecurity-law-blog/ftc-reaches-17-million-settlement-with-cash-advance-company-cleo-ai)
- [Cleo App Review — The Penny Hoarder](https://www.thepennyhoarder.com/budgeting/cleo-app-review/)
- [Cleo Reviews — Trustpilot](https://www.trustpilot.com/review/meetcleo.com)
- [Cleo BBB Complaints](https://www.bbb.org/us/ca/oakland/profile/financial-services/cleo-ai-inc-1116-972661/complaints)
- [7 Apps Like Cleo — Finny](https://getfinny.app/blog/apps-like-cleo)
- [Best AI Budgeting Apps 2026 — BestMoney](https://www.bestmoney.com/financial-advisor/learn-more/best-ai-budgeting-apps)
- [Cleo — canal de YouTube](https://www.youtube.com/@meetcleo)
