# 11 · ¿Adapter "web→markdown→LLM" (Firecrawl/Jina)? — análisis crítico

> **Fecha:** 2026-07-03 · **Estado:** en progreso · **Pilar:** 1/3 (extracción / agentes)
> Duda del usuario: sumar un agregador que convierta la página a `.md` y de ahí extraer los datos.
> Análisis crítico + evidencia externa 2025-2026. Append-only.

---

## 1. Cómo funciona el enfoque
Herramientas (**Firecrawl**, **Jina Reader/ReaderLM**, ScrapeGraphAI, Crawl4AI): cargan la página
(renderizando el JS con un browser headless), convierten el DOM a **markdown/JSON limpio**, y luego
un LLM extrae los campos con un prompt/esquema ("nombre, marca, tamaño, precio"). Es exactamente el
**AgentAdapter** que ya está en el diseño (doc 05, bucket F2+) para SPAs sin API (Plaza Lama, Bravo,
Garrido).

## 2. ¿Es factible? SÍ. ¿Es buena solución PRIMARIA? NO. (crítico)

### ✅ A favor
- **Funciona donde no hay API** descubrible (SPAs custom, sitios raros). Firecrawl usa Playwright
  completo → renderiza SPAs; Jina es más liviano (falla en JS pesado).
- **Resiliente a cambios de layout:** el LLM entiende semántica, un cambio de DOM no rompe el
  pipeline (a diferencia de selectores CSS/XPath fijos). Es su mayor ventaja.

### ❌ En contra (los que pesan para NOSOTROS)
1. **Costo escala MAL.** La evidencia 2025-2026 es unánime: *"el costo de tokens del LLM se dispara
   a escala; mejor para extracción DIRIGIDA que para crawls muy grandes."* Un catálogo de super son
   miles de productos × muchas páginas × a diario → tokens por página × todo eso = caro vs una API JSON.
   Como fuente PRIMARIA de catálogo completo es prohibitivo.
2. **Menos preciso para el PRECIO — y choca con la regla sagrada.** Nuestra arquitectura (doc 07) dice
   que el LLM NUNCA produce el número del precio. Pero markdown→LLM hace justo eso: el LLM LEE el
   precio de la página y lo emite. Reintroduce riesgo de transcripción/alucinación en la cifra. Dato
   duro: **JSON plano da la MEJOR precisión de extracción (F1 0.9567)** vs HTML/markdown → si podés
   obtener el JSON estructurado, extraés mucho mejor que desde markdown.
3. **La API DEBAJO del SPA casi siempre es mejor.** Un SPA (Plaza Lama = Next.js) RENDERIZA desde su
   propia API JSON interna. Encontrar ESA API (inspección de red) y llamarla directo da JSON exacto,
   barato y confiable — superior a render→markdown→LLM. El enfoque web→md IGNORA que el dato
   estructurado ya existe detrás del SPA.
4. **Anti-bot:** los agregadores (PedidosYa/UberEats) son Cloudflare (doc 09) → un fetch→md ingenuo no
   pasa; necesitás el modo managed (proxies), que es el bucket de costo.

## 3. 🏆 Recomendación
**SÍ sumarlo, pero como `AgentAdapter` de ÚLTIMO RECURSO y DIRIGIDO — no como fuente primaria.** Ubicación
en la doctrina de acceso (doc 02), de mayor a menor preferencia:
```
1. API oficial pública (VTEX/Magento) .............. ✅ ya lo tenemos (Sirena/Nacional)
2. API interna del SPA (inspección de red) ......... ← PARA PLAZA LAMA: buscar esto PRIMERO
3. API de app móvil (reverse-eng) .................. Bravo (BravoVa)
4. Agente-IA web→md (Firecrawl/ScrapeGraphAI) ...... ← el de la pregunta: ÚLTIMO recurso, dirigido
5. Browser managed (anti-bot) ...................... agregadores Cloudflare
```
Reglas para cuando lo usemos:
- **Dirigido, no full-catalog:** solo la **canasta curada** (pocos productos) o el long-tail de tiendas
  chicas donde no vale la pena un adapter propio. No para barrer 40k productos a diario.
- **Guard determinístico del precio (obligatorio):** el precio extraído por el LLM se **valida contra
  un regex/campo de la página**; si no coincide, va a revisión. NUNCA se confía el número a ciegas
  (regla sagrada §12·B).
- **Detrás del MISMO puerto `CatalogSource`** → es solo otro adapter que devuelve `RawCatalogEntry`.
  Encaja sin rearquitectura (ventaja del diseño hexagonal que ya construimos).

**Para Plaza Lama en concreto:** el próximo paso NO es Firecrawl — es **inspeccionar la red del Next.js**
(pestaña Network / `/_next/data/…` / su `/api/…`) para hallar la API interna que su propio front llama.
Firecrawl queda de fallback si esa API está ofuscada o es inestable.

## 4. Herramienta, si se adopta (F2+)
- **Firecrawl** (Playwright completo, crawl de sitio entero, `/extract` con esquema) — mejor para SPAs;
  AGPL-3.0 (core). Standard 100k créditos/US$83.
- **Jina Reader / ReaderLM** (Apache-2.0, permisivo, ~US$0.05/M tokens, 10M gratis) — bueno para URLs
  sueltas; flojo en JS pesado.
- **ScrapeGraphAI** (OSS, extracción estructurada por prompt).
→ Elegir por workflow, no por marca. Para SPA pesado + esquema fijo: Firecrawl. Para pocas URLs: Jina.

## 5. 📎 Evidencia
- [Apify — Jina AI vs Firecrawl](https://blog.apify.com/jina-ai-vs-firecrawl/) · [Firecrawl vs Jina Reader 2026](https://use-apify.com/blog/firecrawl-vs-jina-reader-2026) · [Firecrawl pricing 2026](https://www.eesel.ai/blog/firecrawl-pricing).
- [ScrapeGraphAI — best web scraping APIs (F1 0.9567 flat JSON)](https://scrapegraphai.com/blog/3-best-web-scraping-api) · [ZenRows — AI web scraping tools 2026](https://www.zenrows.com/blog/ai-web-scraping-tools) · [Scrapfly — best AI webscraping 2026](https://scrapfly.io/blog/posts/best-tools-for-ai-webscraping) · [BrightData — best LLM scrapers 2026](https://brightdata.com/blog/ai/best-llm-scrapers).

## 6. ✅ Decisión
- **Adoptar `AgentAdapter` (Firecrawl/Jina) como tier de último recurso, dirigido, con guard de precio
  determinístico** — confirmado, va en **F2+** (no toca el MVP F0/F1, que corre sobre API limpia).
- **Plaza Lama:** primero inspección de red (API interna del Next.js); Firecrawl solo si falla.

---

**Qué investigar después:** hacer el spike de red de Plaza Lama (hallar su API interna) antes de asumir
Firecrawl; y cuando toque F2, un PoC de Firecrawl `/extract` sobre 1 tienda con el guard de precio.
