# SupermercadosRD — Dossier técnico

> Análisis de investigación sobre **SupermercadosRD** (supermercadosrd.com): comparador
> de precios de supermercados en República Dominicana. Qué es, cómo funciona por dentro,
> el pipeline de datos real, su tecnología, modelo de negocio, gobernanza y aprendizajes
> aplicables a nuestra app fiscal-contable agéntica.
>
> **Fecha:** 2026-06-25 · **Fuentes:** sitio oficial (indexado), espejo en Vercel,
> `robots.txt`, testimonio público del creador, tiendas online de las cadenas (ver §13).
>
> **Nota de confianza del dato:** marcamos **[firme]** lo verificable (robots.txt, rutas,
> stack visible) y **[creador]** lo declarado por su autor (volumen, tráfico) y
> **[inferencia]** lo deducido por arquitectura (fuente de scraping, uso de VTEX, pipeline).

---

## Tabla de contenido
1. [Qué es](#1-qué-es)
2. [Cómo funciona — el flujo visible](#2-cómo-funciona--el-flujo-visible)
3. [El pipeline de datos real (lo que el creador NO detalla)](#3-el-pipeline-de-datos-real-lo-que-el-creador-no-detalla)
4. [Los 5 retos de ingeniería (en palabras del creador)](#4-los-5-retos-de-ingeniería-en-palabras-del-creador)
5. [Tecnología (stack inferido)](#5-tecnología-stack-inferido)
6. [El activo oculto: el histórico de precios](#6-el-activo-oculto-el-histórico-de-precios)
7. [Modelo de negocio](#7-modelo-de-negocio)
8. [Riesgos y gobernanza (legal + scraping)](#8-riesgos-y-gobernanza-legal--scraping)
9. [Competencia y alternativas](#9-competencia-y-alternativas)
10. [Debilidades y qué le falta](#10-debilidades-y-qué-le-falta)
11. [Blueprint para construir algo igual](#11-blueprint-para-construir-algo-igual)
12. [Lectura como arquitecto — paralelos con nuestra app](#12-lectura-como-arquitecto--paralelos-con-nuestra-app)
13. [Fuentes](#13-fuentes)

---

## 1. Qué es

Plataforma web **gratuita e independiente** que **compara precios de productos de
supermercado en República Dominicana** para que el consumidor sepa dónde comprar más
barato antes de salir de casa. Lanzada oficialmente ~mayo 2026, desarrollada por **un solo
developer** apoyado en herramientas de IA (Codex, Claude). **[creador]**

| Dato | Valor |
|------|-------|
| Cadenas comparadas | Sirena, Nacional, Bravo, Plaza Lama, PriceSmart, Carrefour, Jumbo, Merca Jumbo, Garrido, Ritmo **[firme]** |
| Productos | **40,000+** **[creador]** |
| Tracción SEO | **+235,000 impresiones** y **+3,000 clics** en Google en pocas semanas **[creador]** |
| Equipo | Solo founder + IA **[creador]** |
| Posicionamiento | *"La base de datos de precios de supermercados más grande de RD"* **[creador]** |

---

## 2. Cómo funciona — el flujo visible

1. **Buscar** un producto (buscador con comprensión de intención, no solo keywords).
2. **Comparar** precios del mismo producto entre cadenas; ordenar por precio.
3. **Lista de compras** para planificar el presupuesto del hogar.
4. **Ofertas** actualizadas a diario, filtrables por tienda (`/ofertas?shop_id=6` = Bravo).
5. **Páginas por grupo/categoría** con análisis y guías (`/grupos/arroz`, `/grupos/cerveza`,
   `/grupos/jugo`, `/grupos/granos`…) — son landings SEO programáticas.

---

## 3. El pipeline de datos real (lo que el creador NO detalla)

El creador admite: *"He pasado más tiempo limpiando y estructurando datos que diseñando
nuevas funciones. Un motor de comparación no es solo código; es arquitectura de
información."* Ese trabajo invisible es un **ETL clásico de agregación**: **[inferencia]**

```
1. INGESTA      Adapter por cadena  → catálogo crudo (nombre, precio, categoría, imagen)
2. NORMALIZAR   Parsear unidades (LB/OZ/ML/und) → precio por unidad base (RD$/kg, RD$/L)
3. MATCHING     "Leche Rica 1L" (Nacional) == "Leche Rica Entera 1Lt" (Sirena)  ← lo brutal
4. TAXONOMÍA    Mapear categorías de cada tienda → una taxonomía canónica única
5. INDEXAR      Buscador con intención (typos, sinónimos dominicanos, semántica)
6. SERVIR       Páginas SEO programáticas + ISR + Schema.org
```

**La fuente de los datos:** las **tiendas online de las propias cadenas** (Sirena Go,
`supermercadosnacional.com`, `jumbo.com.do`, `superbravo.com`, `carrefour.do`,
PriceSmart…). No inventa precios: los **cosecha del catálogo e-commerce de cada cadena**.
**[inferencia]**

---

## 4. Los 5 retos de ingeniería (en palabras del creador)

> *"Pensé que construir un comparador de precios sería fácil. Estaba equivocado. La realidad
> de los datos del mundo real me dio una lección de ingeniería."* **[creador]**

| Reto declarado | Qué es en realidad | Solución de ingeniería |
|----------------|--------------------|------------------------|
| **Taxonomía y clasificación** | Cada tienda categoriza distinto; hay que unificar para comparar justo | Taxonomía canónica propia + mapeo `categoría_tienda → canónica`; curaduría humana asistida (de ahí el `/admin/`) |
| **Normalización de unidades** | "Arroz RD$120" no dice nada sin el tamaño | Parser de unidades (LB/OZ/ML/und/multipack) → **precio por unidad base** (RD$/kg, RD$/L). Única comparación honesta |
| **Search Engine con intención** | El dominicano busca "habichuela", no "frijol"; con typos | Full-text + tolerancia a errores (`pg_trgm`/Typesense) + **diccionario de sinónimos dominicanos** + opcional capa semántica |
| **Modelado para escala/SEO** | Miles de páginas que rankeen solas | SEO programático: `/grupos/{cat}` autogeneradas + ISR + Schema.org (`Product`/`Offer`/`AggregateOffer`) |
| *(implícito)* **Matching de productos** | "El mismo producto en tienda A y B" — entity resolution | EAN/código de barras → fuzzy (marca+nombre+tamaño) → embeddings → revisión humana. **Es el 70% del trabajo oculto** |

> **Su mayor aliado declarado:** *"Herramientas de IA como Codex y Claude. No reemplazan el
> criterio técnico, pero aceleran la iteración como solo developer."* **[creador]**

---

## 5. Tecnología (stack inferido)

| Capa | Evidencia | Inferencia |
|------|-----------|------------|
| Frontend/SSR | Espejo en `supermercado-app.vercel.app`; rutas tipo Next | **Next.js en Vercel** con **ISR** **[firme/inferencia]** |
| API interna | `robots.txt`: `Disallow: /api/` | API routes de Next **[firme]** |
| Admin/curaduría | `robots.txt`: `Disallow: /admin/` | Panel para curar taxonomía y matches dudosos **[firme]** |
| Búsqueda | Buscador con intención | Postgres `pg_trgm` o Typesense/Meilisearch **[inferencia]** |
| Datos | 40k productos comparables | Postgres relacional + posible `pgvector` para matching **[inferencia]** |
| Fuente | Catálogos online de las cadenas | Scraping; **muchos retailers LatAm usan VTEX** con API JSON (`/api/catalog_system/pub/products/search`) → consumir API en vez de scrapear HTML **[inferencia]** |

---

## 6. El activo oculto: el histórico de precios

> *"Estoy construyendo la base de datos de precios de supermercados más grande de RD."*

El verdadero foso **no es la app, es el histórico**. Guardar el precio de 40k productos
**cada día** construye una **serie temporal** que vale oro: inflación real de la canasta,
estacionalidad, y detectar **ofertas falsas** (*"subió el precio antes de 'bajarlo'"*). Un
competidor nuevo arranca con **cero histórico** → ahí está lo incopiable. Mismo principio
que nuestro foso de datos (ver §12).

---

## 7. Modelo de negocio

- **Gratis para el usuario.** **[firme]**
- No declara monetización pública. Patrón típico del segmento **[inferencia]**:
  - **SEO → tráfico → afiliación/publicidad** (las 235k impresiones son el motor).
  - Potencial **B2B/dato**: vender análisis de precios/inteligencia de mercado a marcas o
    medios; licenciar el dataset (lo blinda en robots.txt — ver §8).
  - Potencial **lead-gen** hacia las propias tiendas online.

---

## 8. Riesgos y gobernanza (legal + scraping)

- **Scraping en zona gris:** cosechar precios públicos no está claramente regulado en RD,
  pero los **ToS** de cada cadena pueden prohibirlo; bloqueos por IP/anti-bot son comunes.
- **La ironía del `robots.txt`:** SupermercadosRD **bloquea** a los bots de IA
  (`ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`, `Bytespider`, `Applebot-Extended`,
  `meta-externalagent`…) y **cita la Directiva Europea 2019/790 de copyright** para proteger
  SU base de datos — mientras agrega la de otros. **[firme]** Señal clara de que **considera
  el dato estructurado como propiedad intelectual**.
- **Fragilidad operativa:** los catálogos cambian de formato → los scrapers se rompen;
  mantenerlos es costo recurrente.
- **Implicación para nosotros:** un producto **fiscal regulado** (donde *la confianza es el
  producto*) no puede arriesgar una demanda de una cadena. Alternativas limpias: acuerdos/
  APIs oficiales, o capturar precios **vía OCR del recibo del propio usuario** (100% legal:
  es su dato).

---

## 9. Competencia y alternativas

SupermercadosRD **no está solo** en el nicho de transparencia de precios en RD:

| Alternativa | Qué es | Diferencia / amenaza |
|-------------|--------|----------------------|
| **MICM "Precios Justos"** (preciosjustos.micm.gob.do) | Comparador **del propio gobierno** (Ministerio de Industria y Comercio): canasta básica, actualización semanal | **Competidor estatal con autoridad oficial y gratuito.** Limitado a canasta básica (no 40k productos), UX pobre, pero respaldo institucional. **[firme]** |
| **Otras apps de comparación** | Apps citadas en redes (TikTok) para comparar canasta entre cadenas | Nicho activo y de moda; baja barrera de entrada en la capa UI (no en la de datos) **[inferencia]** |
| **Las propias tiendas online** | Sirena Go, Nacional, Jumbo, Bravo, Carrefour | Tienen el dato de primera mano; si una decidiera publicar comparativa, parte con ventaja (pero no tienen incentivo de mostrar al competidor más barato) |
| **Carrito Listo / agregadores de compra** | Compra online consolidada | Resuelven la compra, no la **comparación transparente**; modelo distinto |

> **Lectura:** la competencia en la **capa UI es baja barrera** (cualquiera monta un
> frontend). La defensa real está en la **capa de datos** (taxonomía + matching + histórico).
> El riesgo institucional es **Precios Justos**: si el Estado lo moderniza, ofrece autoridad
> gratis. SupermercadosRD compite con **cobertura** (40k productos vs. canasta básica) y **UX**.

---

## 10. Debilidades y qué le falta

Crítica honesta del producto en su estado actual (~1 mes de lanzado):

- **Frescura del dato incierta:** dice "actualizadas diariamente", pero un scraper de 10
  cadenas × 40k productos es frágil; precios desactualizados destruyen la confianza (el core
  del producto). **No hay garantía visible de SLA de frescura.** **[inferencia]**
- **El histórico no se le muestra al usuario:** acumula serie temporal (su mayor activo) pero
  no expone gráficas de evolución de precio — desperdicia su diferenciador frente al usuario.
- **Sin app móvil nativa visible:** es web; la compra de supermercado es un momento móvil
  (en la tienda, decidiendo). Una PWA/app cerraría el caso de uso. **[inferencia]**
- **Sin alertas de precio:** no parece ofrecer "avísame cuando baje el arroz" — el gancho de
  retención más obvio del segmento.
- **Cobertura geográfica:** los precios pueden variar por sucursal; no está claro si
  distingue tienda física vs. precio online ni por región. **[inferencia]**
- **Dependencia de un solo founder:** bus factor alto; el mantenimiento de scrapers es
  trabajo perpetuo que no escala solo.
- **Monetización no resuelta:** tráfico SEO temprano (3k clics) sin modelo de ingreso claro
  todavía — riesgo de sostenibilidad. **[inferencia]**

> Estas debilidades **no invalidan** el proyecto; son el mapa de **dónde un competidor (o
> nosotros, como feature) agregaría valor**: frescura garantizada, histórico visible,
> alertas, móvil.

---

## 11. Blueprint para construir algo igual

Arquitectura hexagonal — aislar lo que cambia (cada tienda) detrás de un puerto:

```
   FuenteDeCatalogo (PUERTO)
    ├── VtexAdapter        (cadenas sobre VTEX → API JSON, sin scrapear HTML)
    ├── ShopifyAdapter     (las que apliquen)
    └── HtmlScraperAdapter (custom / Carrefour / etc.)
          ↓ ProductoCrudo { nombre, precio, categoría, img, tienda }
   PIPELINE (jobs diarios):
     Normalizador de unidades → Matcher (EAN→fuzzy→embeddings) → Taxonomía canónica → Enriquecedor
          ↓
   Postgres:  producto_canonico · tienda_producto · precio (time-series, append-only)
              + pg_trgm (búsqueda) + pgvector (matching/semántica)
          ↓
   Next.js (ISR) en Vercel + Schema.org + /admin para curar taxonomía y matches dudosos
```

**Atajo técnico clave:** auditar tienda por tienda qué plataforma usa **antes** de escribir
scrapers. Si es **VTEX** (común en retail LatAm), se consume su API de catálogo en JSON →
ahorra meses frente a scrapear HTML frágil.

**MVP en el orden correcto:**
1. **2 tiendas, 1 categoría** (ej. Bravo + Nacional, solo "arroz") — valida el pipeline end-to-end.
2. Resolver **normalización + matching** en ese subconjunto (donde está el dolor real).
3. Solo con matching confiable → escalar tiendas y categorías.
4. Buscador y SEO programático **al final** (son la cosecha, no la siembra).

---

## 12. Lectura como arquitecto — paralelos con nuestra app

1. **El dato estructurado ES el activo, no la UI.** El creador protege su DB en robots.txt y
   se autodefine por su dataset, no por su frontend. Idéntico a nuestra tesis del **foso de
   datos** (concepto §3, §9): el moat no es la IA ni la app, es el grafo propietario.
2. **El histórico temporal es lo incopiable.** Precios diarios acumulados = serie que un
   nuevo entrante no puede recrear. Mismo principio que nuestro grafo financiero-fiscal.
3. **Patrón de adaptadores por fuente.** Su `FuenteDeCatalogo` por cadena es el mismo
   patrón hexagonal que nuestro puerto `ProveedorDeDatos`/`FuenteDeMovimientos` por país
   (concepto §10·C) y los conectores Odoo/CODISA.
4. **Normalización de unidades = normalización fiscal.** Parsear LB/OZ/ML es el mismo
   músculo que normalizar ITBIS/cantidades en facturas.
5. **IA como acelerador, no reemplazo del criterio.** Coincide con nuestra filosofía:
   *la IA es una herramienta; el humano dirige.*
6. **Aplicación directa a Cuadra:** cruzar el **OCR del recibo**
   del usuario contra un catálogo de precios habilita **detección de sobrepago a nivel de
   ítem** (*"esto te costó RD$450 más caro que en Bravo"*) — coaching prescriptivo que
   GastaBien/Novia no hacen. **Pero** es un producto/pipeline completo: respetar §16 del
   concepto (**NO meter todo en el MVP**); el wedge sigue siendo lo fiscal.
7. **Lección de gobernanza:** el scraping es zona gris; un producto fiscal regulado debe
   preferir **datos limpios** (acuerdos/API oficiales u OCR del propio usuario).

---

## 13. Fuentes

- [SupermercadosRD — sitio oficial](https://supermercadosrd.com/)
- [SupermercadosRD — Ofertas diarias](https://supermercadosrd.com/ofertas)
- [SupermercadosRD — Privacidad](https://supermercadosrd.com/privacidad)
- [Ejemplos de grupos/categoría (SEO programático)](https://supermercadosrd.com/grupos/arroz) · [cerveza](https://supermercadosrd.com/grupos/cerveza) · [jugo](https://supermercadosrd.com/grupos/jugo)
- [Espejo en Vercel (stack)](https://supermercado-app.vercel.app/)
- Testimonio público del creador (LinkedIn/post) — citado en §1, §4, §6 **[creador]**
- Tiendas online fuente: [Sirena](https://sirena.do/) · [Nacional](https://supermercadosnacional.com/) · [Jumbo](https://jumbo.com.do/) · [Bravo](https://superbravo.com.do/) · [Carrefour RD](https://www.carrefour.do/)
- [Supermercados online RD — Conectate](https://www.conectate.com.do/articulo/supermercados-online-republica-dominicana/)
- [MICM Precios Justos (referencia oficial de canasta)](https://preciosjustos.micm.gob.do/)
- [¿Dónde sale más barata la canasta básica? — Diario Financiero](https://diariofinanciero.do/economia/canasta-basica-supermercados-republica-dominicana/)

