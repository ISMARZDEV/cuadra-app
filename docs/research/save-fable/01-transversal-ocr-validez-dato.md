# 01 · Transversal — OCR de recibos + VALIDEZ del dato (precio real)

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** Transversal (base de todo)
> **Decisiones del usuario que enmarcan este doc:**
> - Precio = **AMBOS etiquetados** (online + góndola/recibo, cada uno con su `price_type` y fuente;
>   el usuario habilita uno o ambos). → el modelo DEBE separar tipos de precio, nunca mezclarlos.
> - Rumbo = **orden del brief** (no se difiere nada; este doc es el 1er hilo profundizado).
> Append-only. No resume: registra razonamiento, opciones, evidencia, descartes.

---

## 1. La pregunta que resuelve este doc
¿Cuál es la fuente de precio VÁLIDA y cómo la capturamos con la mejor tecnología 2025-2026,
respetando (a) que el precio online ≠ precio de góndola y (b) la regla sagrada (la IA estructura,
nunca calcula el precio)?

## 2. Riesgo #1 CONFIRMADO con evidencia: online ≠ góndola
No era una intuición; hay data:
- **Wegmans:** precios online ~**20% más altos** que en tienda. **Aldi:** ~**15% más altos**
  (incluye el costo de personal-shopper). Ambos lo divulgan en letra chica. (6abc, NBC NY.)
- **Instacart:** hasta **23% de diferencia** para el MISMO producto entre distintos shoppers
  (surveillance/variable pricing) — un estudio de Groundwork + Consumer Reports sobre ~200
  compradores en 4 ciudades. (ABC News.)
- Impacto estimado: hasta **US$1,200/año** extra para una familia de 4. (6abc.)
- **Matiz:** algunos retailers SÍ igualan online vs registro (investigación de NBC). O sea: el
  gap **varía por cadena** → hay que medirlo por fuente, no asumirlo.

**Consecuencia de diseño:** la decisión "ambos etiquetados" del usuario es la correcta y ahora
está fundamentada. El modelo de precio DEBE llevar `price_type` (online | delivery | shelf |
receipt) + `source`, y una comparación NUNCA mezcla tipos salvo que el usuario lo habilite
explícitamente. Comparar un precio de PedidosYa contra un precio de recibo es comparar peras con
manzanas y destruiría la confianza (el core del producto).

## 3. 🎯 HALLAZGO ESTRATÉGICO: la factura electrónica e-CF (Ley 32-23, DGII) puede DISOLVER el OCR
República Dominicana tiene **facturación electrónica obligatoria** (Ley 32-23), formato **XML**
con firma digital y **"Serie E"**, calendario escalonado por categoría DGII:
- Grandes contribuyentes nacionales: **desde mayo 2024**.
- Grandes locales + medianos: **desde 15-nov-2025**.
- Pequeñas/micro/no clasificados: **desde 15-nov-2026**.

**Los supermercados grandes (Sirena, Nacional, Jumbo, Bravo, etc.) YA están obligados** (caen en
grande/mediano → nov-2025). Implicación enorme:
- El recibo de supermercado se está convirtiendo en un **e-CF estructurado** (XML) con **ítems,
  precios e ITBIS ya digitales**, validado por la DGII, con **representación impresa que incluye
  un código QR**.
- Si ese **QR resuelve a los line-items estructurados**, entonces para comercios cumplidores el
  problema de "OCR del recibo" se convierte en **"leer el QR / ingerir el XML e-CF"** → dato
  **estructurado, legal y autoritativo** de precio de GÓNDONA REAL (lo que pagó el usuario). Es la
  fuente más veraz posible y alimenta el triángulo directamente.
- **⚠️ A VERIFICAR (no confirmado, no lo tomes como hecho):** exactamente **qué expone el QR** de
  la representación impresa del e-CF al consumidor (¿URL de validación DGII con el detalle? ¿solo
  hash/firma? ¿el XML completo?). Hay que leer la Guía del Contribuyente No.6 de la DGII y probar
  con recibos reales. Esto define si el QR reemplaza al OCR o solo lo complementa.

→ **Diseño resultante:** capturar el precio de recibo con una **cascada**: (1) e-CF/QR si está
disponible → (2) OCR-VLM del recibo impreso → (3) API especializada de recibos para los difíciles.

## 4. Estado del arte OCR/extracción de recibos (2025-2026)

**Enfoque A — VLM directo (imagen → JSON estructurado en una pasada):**
- Modelos frontera: **Gemini 2.5 Pro, GPT-4o/GPT-5, Claude Sonnet 4.5**. Accuracy line-items
  ~**90-94%** en recibos/facturas (Gemini 94%, GPT+OCR 91%, Claude 90% en facturas escaneadas).
- **Mejor costo/rendimiento:** **Gemini 2.0-Flash / Flash-Lite** (alta accuracy, mucho más barato).
- **Ventaja para Cuadra:** la app YA usa **Anthropic (Claude)** → **Claude vision** hace
  recibo→JSON sin sumar un proveedor nuevo. La regla sagrada se respeta: el VLM **extrae el número
  impreso**, no lo calcula.

**Enfoque B — APIs especializadas de recibos:** **Veryfi, Mindee, Klippa, Taggun, Tabscanner**.
Purpose-built, ~**95%+** en recibos de supermercado estándar, **<20s**, item-level (nombre,
precio, VAT, comercio). Más caras y dependencia externa, pero robustas out-of-the-box.

**Enfoque C — Cloud IDP:** **Azure Document Intelligence** (el mejor para recibos/facturas en
tests) > **AWS Textract** > Google Invoice Parser (el más flojo).

**Enfoque D — Open source (self-host, privacidad):**
- **PaddleOCR (PP-StructureV3)** — el más fuerte OSS para tablas/line-items multilingüe, Apache
  2.0, corre en CPU. **docTR** (de Mindee) bueno para recibos/forms. **Surya** potente pero
  **~290s/img en CPU** = inservible para escaneo interactivo.
- **Ola oct-2025 de OCR-VLMs open:** Nanonets-OCR2-3B, PaddleOCR-VL-0.9B, DeepSeek-OCR-3B,
  Chandra-OCR-8B, OlmOCR-2-7B, LightOnOCR-1B — ya igualan o superan servicios propietarios.

## 5. 🏆/🔀/📎/⚠️/✅ — PROPUESTA: cómo capturar el precio de recibo/góndola

### 🏆 LA MEJOR SOLUCIÓN ACTUAL (2025-2026)
**Cascada e-CF-first con VLM-fallback, y validación determinística de los números:**
1. **e-CF / QR** cuando exista y exponga line-items → ingesta estructurada (mejor caso, legal, veraz).
2. **Claude vision** (ya en el stack) para recibo impreso → JSON de line-items + total + ITBIS.
3. **API especializada (Veryfi/Mindee)** como fallback SOLO para recibos que fallan validación.
4. **Validación determinística (clave):** `Σ(line_items) + ITBIS == total_impreso` en minor units.
   Si no cuadra → el recibo va a **confirmación del usuario** (no se ingiere un número dudoso).
   Esto ancla la regla sagrada: ningún precio entra sin cuadrar la aritmética.
5. Guardar con `price_type = receipt/shelf` + `source` + `captured_at` + `confidence` + `store/sucursal`.

**Por qué es la mejor HOY:** reusa tu LLM (cero proveedor nuevo, costo marginal), aprovecha la ola
regulatoria e-CF (dato estructurado gratis a futuro), y la validación determinística neutraliza el
único riesgo real del VLM (equivocar un dígito). Escala a otros países cambiando solo la fuente
estructurada (cada país con su esquema de factura electrónica).

### 🔀 ALTERNATIVAS
- **(A) Solo API especializada (Veryfi/Mindee):** out-of-the-box 95%+, menos ingeniería. ❌ Costo
  por recibo recurrente, dependencia externa, dato del usuario sale a un tercero (privacidad en un
  fintech), y no capitaliza que ya tenés Claude. Buena como *fallback*, no como base.
- **(B) Solo OSS self-host (PaddleOCR):** control total + privacidad + costo marginal ~0. ❌ Más
  trabajo de tuning, accuracy menor sin fine-tune, y todavía necesitás una capa LLM para
  estructurar/normalizar. Ideal si la privacidad de recibos se vuelve requisito duro.

### 📎 EVIDENCIA
- OCR/VLM 2025-2026: [MarkTechPost — Top 6 OCR 2025](https://www.marktechpost.com/2025/11/02/comparing-the-top-6-ocr-optical-character-recognition-models-systems-in-2025/) · [Businessware — Textract vs GPT-4o invoice benchmark](https://www.businesswaretech.com/blog/research-best-ai-services-for-automatic-invoice-processing) · [Parsli — LLM OCR vs traditional (2026)](https://parsli.co/blog/llm-ocr-vs-traditional-ocr) · [Koncile — Claude/GPT/Gemini invoice](https://www.koncile.ai/en/ressources/claude-gpt-or-gemini-which-is-the-best-llm-for-invoice-extraction).
- OSS: [Unstract — best OSS OCR 2026](https://unstract.com/blog/best-opensource-ocr-tools-in-2025/) · [E2E — 7 best OSS OCR 2025](https://www.e2enetworks.com/blog/complete-guide-open-source-ocr-models-2025).
- Recibos de supermercado con OCR: [Klippa — scanning supermarket receipts](https://www.klippa.com/en/blog/information/scanning-supermarket-receipts-with-ocr/).
- Online vs góndola: [6abc](https://6abc.com/post/online-shopping-price-difference-delivery-fees-why-service-charges-curbside-pickup-charge/13208920/) · [ABC News — Instacart variable pricing](https://abcnews.com/GMA/Food/instacart-responds-new-report-grocery-store-price-experiments/story?id=128272415) · [NBC NY — online vs in-store](https://www.nbcnewyork.com/your-money/is-buying-online-or-in-store-cheaper-comparing-grocery-prices/6475235/).
- e-CF RD: [Alanube — guía técnica e-CF Ley 32-23](https://blog.alanube.co/rd/e-cf-en-republica-dominicana/) · [Alegra — obligatoriedad y fechas](https://blog.alegra.com/republica-dominicana/obligatoriedad-de-factura-electronica/) · [DGII — Guía Contribuyente No.6 Facturación Electrónica (PDF)](https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/facturacion/Documents/Facturaci%C3%B3n%20Electr%C3%B3nica/6%20Guia%20Facturacion%20Electronica.pdf).

### ⚠️ RIESGOS + mitigación
- **VLM equivoca un dígito de precio** → validación determinística `Σ items + ITBIS == total` +
  confirmación del usuario cuando no cuadra. Nunca se ingiere sin cuadrar.
- **Nombres de ítem abreviados en el recibo** ("LCHE RICA 1L") → problema que empuja al MATCHING
  (pilar 3); el recibo alimenta el matcher, no lo resuelve solo.
- **Privacidad del recibo** (PII, hábitos de compra en un fintech) → minimizar, consentimiento
  explícito, y evaluar el enfoque OSS self-host si se vuelve requisito. No mandar recibos a
  terceros por default.
- **Disponibilidad real del QR e-CF** → NO confirmado; validar con la Guía DGII No.6 y recibos reales.
- **Cobertura:** el OCR de recibos solo cubre lo que el usuario COMPRA (no todo el catálogo) →
  por eso convive con las fuentes online del pilar 1, cada una con su `price_type`.

### ✅ DECISIÓN que deberías tomar ahora
1. ¿Confirmás **Claude-vision como motor primario de OCR de recibo** (reusa stack) con Veryfi/Mindee
   solo de fallback? ¿O querés privacidad-first (OSS self-host) desde ya?
2. ¿Autorizás **invertir en el spike de e-CF/QR** (leer Guía DGII No.6 + probar recibos reales) como
   sub-tarea, dado que puede volver el dato estructurado y legal?
3. ¿El OCR de recibo entra al **MVP** (habilita el triángulo desde el día 1) o va en fase posterior?

## 6. Modelo de datos para "ambos etiquetados" (borrador)
```
price(
  id, store_product_id, value_minor BIGINT, currency CHAR(3),
  captured_at TIMESTAMPTZ,
  price_type   ENUM(online, delivery, shelf, receipt),   -- NUNCA se mezclan en una comparación
  source       ENUM(vtex, shopify, magento, pedidosya, ubereats, receipt_ocr, ecf, manual),
  confidence   NUMERIC,          -- del OCR/matching
  store_branch TEXT NULL         -- sucursal, si el recibo/e-CF la trae (góndola varía por sucursal)
)  -- append-only (time-series). El histórico por price_type es el foso.
```
Regla de comparación: por default se compara **dentro del mismo `price_type`**; cruzar tipos exige
opt-in explícito del usuario y se muestra etiquetado.

---

**Decisiones que deberías tomar ahora:** las 3 de §5·✅.
**Qué investigar después:**
- **Spike e-CF/QR:** Guía DGII No.6 + recibos reales → ¿el QR da line-items? (define el pilar).
- Precisión de Claude-vision sobre recibos RD reales (abreviaturas, ITBIS, NCF, térmico borroso).
- Al pasar al pilar 1: marcar por cadena si el precio VTEX/Shopify es online-vs-tienda (medir el gap).

---

## ✅ RESOLUCIÓN (2026-07-03) — decisiones del usuario
1. **OCR primario = Claude vision** (reusa el stack Anthropic; cero proveedor nuevo). Veryfi/Mindee
   quedan como *fallback* futuro; OSS self-host solo si privacidad se vuelve requisito duro.
2. **Spike e-CF/QR = AUTORIZADO.** Sub-tarea: leer Guía DGII No.6 + probar recibos reales para
   confirmar si el QR expone line-items estructurados. Puede volver el dato legal + autoritativo.
3. **OCR de recibo = FASE POSTERIOR.** Se arranca por las **fuentes oficiales de supermercados**
   (Pilar 1). El triángulo vía recibo espera; primero el catálogo online.

Estado del doc: **decidido** (los 3 puntos). El spike e-CF queda como tarea abierta separada, no
bloquea el Pilar 1. Sigue en [`02-pilar1-extraccion.md`](02-pilar1-extraccion.md).
