# Cobertura de cadenas de ingesta — Save (estado real)

> Estado **2026-07-06**. Prueba EN VIVO de los adaptadores existentes (`VtexAdapter`/`MagentoAdapter`)
> contra tiendas reales + detección de plataforma de las cadenas nuevas. Contexto: skill `cuadra-save`
> (estrategia de ingesta) · `cuadra-save-admin` (dónde se configuran las fuentes).

## Qué soporta el backend HOY

Dos adaptadores construidos (F1): **VTEX** y **Magento** (`contexts/save/infrastructure/catalog_sources/`).
El `CatalogSourceFactory` solo despacha esos dos; `SHOPIFY`/`AGGREGATOR`/`SPA` lanzan `ValueError` (limpio,
no crashea).

## Estado por cadena (verificado en vivo, query "arroz")

| Cadena | Plataforma | ¿Ingiere hoy? | Nota |
|---|---|---|---|
| **Sirena** | VTEX (`sirena.do`) | ✅ SÍ | Devuelve productos reales CON marca + precio (RD$169.00 arroz Wala). |
| **Nacional** | Magento CCN (`supermercadosnacional.com`) | ✅ SÍ | OK. Marca vacía (la API Magento no la expone). |
| **Jumbo** | Magento CCN (`jumbo.com.do`, header `Store: jumbo`) | ✅ SÍ | OK. El store-view via header funciona (productos distintos a Nacional). |
| **Merca (Merca Jumbo)** | Magento CCN (`supermercadosnacional.com`, header `Store: mercajumbo`) | ✅ SÍ (verificado) | **NO requiere adapter nuevo.** Es un store-view más de la MISMA Magento CCN. Verificado 2026-07-06: `Store: mercajumbo` → 303 productos "arroz" con precios PROPIOS (Selecto Líder 10Lb RD$327.00 vs RD$327.95 en Nacional). La app "Merca" (Flutter, `com.centrocuestanacional.merca`) es un callejón sin salida — ver [nota abajo](#merca-el-atajo-que-evitó-reverse-engineering). Falta solo registrar Provider+StoreRegistry. |
| **Plaza Lama** | **Custom Next.js** (`plazalama.com.do`) | ❌ NO | Tiene API REST propia (`/api`) + imágenes en S3 → **adaptador custom VIABLE**. |
| **Garrido** | **Custom Next.js** (`garrido.com.do`) | ❌ NO | MISMA plataforma que Plaza Lama (patrón `/ca/supermercado/{id}` idéntico) → **un adaptador cubre ambas**. |
| **Bravo** | **API propia "bravova"** (`bravova-api.superbravo.com.do`) | 🟡 API DESCUBIERTA | La app es Angular SPA, pero su **API pública REST SÍ es accesible** por HTTP simple (capturada con Proxyman). Endpoint de catálogo `/public/articulo/list` navegable por sección + paginación. **Adaptador `bravova` VIABLE** — ver detalle en [Integración Bravo Va](#integración-bravo-va-superbravo). Falta construir el adapter. |
| **Hipermercados Ole** | — | ❌ NO | Solo diste URL de agregador (PedidosYa). Sin sitio propio verificado. |
| **Carrefour** | — | ❌ NO | Solo URLs de agregador (PedidosYa/UberEats). |
| **PedidosYa** | Agregador | ❌ NO | `SourcePlatform.AGGREGATOR` — **adaptador NO construido** (roadmap: Apify). |
| **UberEats** | Agregador | ❌ NO | Ídem. |

## Adaptadores pendientes, por leverage (mayor→menor)

### 1. Agregadores (PedidosYa / UberEats) — MÁXIMO leverage
Desbloquea de UNA MUCHAS cadenas a la vez: Sirena-en-PedidosYa, Ole, Carrefour, y cualquier súper que
solo viva en el agregador. Enfoque previsto (memoria `save-ingesta-strategy`): **Apify** u otro scraping
resiliente. Es un `SourcePlatform.AGGREGATOR` nuevo con su adaptador. **Candidato #1 para un change SDD.**

### 2. Adaptador Next.js custom (Plaza Lama + Garrido) — 2 cadenas de una
Ambas comparten la MISMA plataforma white-label (Next.js + API REST `/api` + imágenes S3). Un solo
adaptador (reverse-engineer del endpoint de productos de `/api`) cubre las dos. Plataforma nueva
(`SourcePlatform` — ¿reusar un genérico "rest-json" o uno específico?). Feasibilidad ALTA (hay API JSON).

### 3. Bravo (API "bravova") — API DESCUBIERTA, adapter viable (ver detalle abajo)
~~No se pudo descubrir su API por HTTP simple.~~ **Actualizado 2026-07-06**: la API pública REST se
capturó con Proxyman y responde por HTTP directo (sin protección de bot para el catálogo). Feasibilidad
**ALTA**. Decisiones de diseño tomadas + plan de implementación en [Integración Bravo Va](#integración-bravo-va-superbravo).

---

## Integración Bravo Va (Superbravo)

> Descubierta **2026-07-06** vía Proxyman. Fuente en catalogación (Apidog) para pasar al panel de
> ingesta. Estado: **plan cerrado, adapter PENDIENTE de construir**.

### Endpoint

```
GET https://bravova-api.superbravo.com.do/public/articulo/list
  ?model.filterByIdSeccion={seccion}   # categoría (se itera)
  &model.filterByIdTienda=1000         # tienda/sucursal
  &paginationMaxItems=30
  &paginationOffset=0
  &showOrder=importerankingArticulo asc,...
```

- **Modelo de ingesta**: **browse por sección** (NO query-based como VTEX/Magento). El adapter recibe
  la lista de secciones desde `endpoints` e ingesta el catálogo COMPLETO de cada una.
- **Paginación**: iterar `paginationOffset` de `paginationMaxItems` en `paginationMaxItems` hasta
  `offset >= data.totalCount`. Determinista (la sección 3 = 466 productos).

### Shape de la respuesta

```jsonc
{ "data": {
    "totalCount": 466,
    "list": [{
      "idexternoArticulo": "13290",        // SKU externo
      "nombreArticulo": "AZUCAR CREMA",    // nombre (marca + tamaño EMBEBIDOS)
      "familiaArticulo": "GR",             // categoría (código)
      "subfamiliaArticulo": "GR-003",      // subcategoría (código)
      "impuestoArticulo": 16.000,          // ITBIS %
      "idArticulo": 29866,                 // id interno (para URL de imagen)
      "imageCatalogVersion": "94",         // versión CDN de imagen
      "associatedTienda": [{
        "pvpArticuloTienda": 124.000,      // PRECIO vigente (DOP)
        "disponibleArticuloTienda": true,
        "stockArticuloTienda": 5396.000,
        "associatedOferta": [{             // promo activa (si hay)
          "pvpArticuloTiendaOferta": 99.000,
          "finiArticuloTiendaOferta": 1780272000000,  // inicio (epoch ms)
          "ffinArticuloTiendaOferta": 1785542399000   // fin (epoch ms)
        }]
      }],
      "associatedEan": [],                 // EAN (VACÍO en la sección probada)
      "associatedPvp": 124.000,            // precio efectivo
      "originalPvp": 419.000               // precio antes de descuento
    }]
} }
```

### Mapeo → `RawCatalogEntry`

| Campo destino | Origen Bravo Va | Nota |
|---|---|---|
| `external_id` | `idexternoArticulo` | SKU estable |
| `name` | `nombreArticulo` | marca+tamaño pegados |
| `price` | `associatedPvp` → `Money.from_major(_, DOP)` | minor units, sin float (§12·B) |
| `price_type` | `PriceType.ONLINE` | catálogo e-commerce |
| `brand` | ⚠️ sin campo | vacío o heurístico desde el nombre |
| `size_text` | ⚠️ sin campo | reusar `extract_size(name)` (ya existe) |
| `category_path` | `(familiaArticulo, subfamiliaArticulo)` | códigos crudos de la tienda |
| `ean` | `associatedEan[0]` si existe | ⚠️ vacío en la sección probada |
| `image_url` | `idArticulo` + `imageCatalogVersion` | ⚠️ patrón CDN por capturar |
| `source` | `"bravova"` | |

### Decisiones de diseño (2026-07-06, confirmadas por el usuario)

1. **Plataforma**: adapter **genérico `SourcePlatform.REST_CATALOG` (`RestCatalogAdapter`)**, NO uno
   dedicado a Bravo. _(La decisión inicial de un `bravova` dedicado se REVIRTIÓ el mismo día por regla
   SAGRADA #4 "integra PLATAFORMAS, no cadenas": un nombre atado a un súper es el anti-patrón.)_ El
   adapter concentra la mecánica común (GET por sección + paginación por offset + extracción del
   envelope); lo específico de cada súper vive en un `CatalogProfile` (path, params, llaves del
   envelope, `map_item`, `extra_params`). **Bravo Va = el PRIMER profile** (`bravova_profile.py`).
   Un súper nuevo con API propia = otro `*_profile.py`, cero cambios en el adapter. NO es config
   externa (DSL) — es composición tipada en Python.
2. **Ingesta**: **browse full** — el adapter ignora el `query` de la canasta, itera las secciones
   configuradas y pagina por offset hasta `totalCount`. Refleja cómo funciona Bravo Va de verdad.
3. **`showOrder` obligatorio**: la API RECHAZA el request sin `showOrder`
   (`{"errors":[{"code":"required","field":"showOrder"}]}`, status 200). Va en `profile.extra_params`
   (`showOrder=importerankingArticulo asc`) — un solo campo de orden basta (verificado en vivo).

### Riesgos / hallazgos abiertos

- **Sin EAN**: 0/30 productos de la sección 3 traen `associatedEan`. Impacta el matching (F2.0 arranca
  por EAN → cae directo a trgm/pgvector, más carga a la cola de revisión). No bloquea el adapter.
- **URL de imagen**: no viene en la respuesta; hay `idArticulo` + `imageCatalogVersion`. Falta capturar
  el patrón del CDN con Proxyman (una request de imagen). Follow-up, no bloquea el MVP.
- **brand/size**: embebidos en `nombreArticulo`. MVP: `brand=""` + `extract_size(name)`; parser dedicado
  si no basta.

### Plan de implementación (TDD, por batches)

Rama: `feat/save-bravova-adapter` (stackeada sobre `feat/save-admin-review`, que trae la factory/TestSource).

- **A+B · adapter genérico + profile — ✅ HECHO** (11 tests, RED→GREEN, verificado en vivo contra el
  endpoint real). Archivos: `infrastructure/catalog_sources/rest_catalog_adapter.py`
  (`RestCatalogAdapter` + `CatalogProfile`) y `bravova_profile.py` (`map_bravova_item` + `BRAVOVA_PROFILE`).
  Tests: `tests/save/unit/test_rest_catalog_adapter.py` (genérico, profile sintético) +
  `test_bravova_profile.py` (mapeo con JSON real + composición con el adapter).
- **C · factory + dry-run — PENDIENTE**: añadir `SourcePlatform.REST_CATALOG` al enum + wiring en
  `CatalogSourceFactory`/`SourceBuilder` (leer secciones + `store_id` + profile desde `endpoints`) →
  habilita el botón "Probar" del panel para Bravo Va (hoy da 422 por plataforma sin adapter).
- **D · seed/registro — PENDIENTE**: registrar Bravo Va como `Provider` + `StoreRegistry`
  (`platform=REST_CATALOG`, `base_url`, secciones en `endpoints`) para que aparezca en el panel de fuentes.
- **Follow-up**: patrón de URL de imagen (capturar con Proxyman) + `extract_size` con fracciones
  ("CAFE 1/2 LB" → hoy parsea `"2 LB"`, limitación del helper COMPARTIDO, lo normaliza `parse_size`).

## Merca: el atajo que evitó reverse-engineering

> Registrado **2026-07-06**. Caso de estudio de método.

La app **Merca** (`com.centrocuestanacional.merca`, **Flutter**) parecía requerir reverse-engineering
pesado. Los intentos de captura con Proxyman solo mostraban tráfico de **Singular** (`safetrack.singular.net`,
SDK de atribución nativo iOS → sí respeta el proxy). El catálogo real NO aparecía porque **Flutter (Dart
`HttpClient`/Dio) ignora el proxy HTTP del sistema iOS por defecto** — los productos cargaban bien pero el
request salía por fuera de Proxyman. Callejón: habría necesitado captura transparente / Frida / bypass.

**El atajo**: Merca es **CCN**, la misma instancia Magento que Nacional y Jumbo (que ya se ingieren).
Probando store-views sobre `supermercadosnacional.com/graphql` con el header `Store`, apareció
**`Store: mercajumbo`** con 303 productos y **precios propios**. Cero adapter nuevo: reusa el
`MagentoAdapter` existente, igual que Jumbo.

**Regla de método**: antes de atacar la app de un súper (pinning/Flutter/Frida), verificá si pertenece a
un grupo cuya plataforma ya ingieres. CCN sirve Nacional/Jumbo/Merca desde UNA Magento, diferenciados por
el header `Store` (`default`/`jumbo`/`mercajumbo`). Descubrir store-views: `POST /graphql` con
`Store: <candidato>` — un store inexistente devuelve `"Requested store is not found"`.

### Los 3 store-views son listas de precios DISTINTAS (verificado 2026-07-06)
Mismo SKU, tres precios reales — hay que tratarlos como **providers separados** (NO deduplicar):

| SKU | Producto | Nacional | Jumbo | Merca |
|---|---|---|---|---|
| 2011095 | Aceite Soya Crisol 64 Onz | 289.95 | 289 | **413** |
| 2143821 | Aceite Canola Mazola 64 Onz | 396.95 | 396 | **474** |

Patrón: Nacional termina en `.95`, Jumbo ≈ Nacional redondeado a `.00`, Merca = lista aparte (a veces
+40%). La cascada de matching los unifica en un canónico y Save expone la diferencia de precio → el moat.

### Config para registrar Merca (trivial)
- `platform = MAGENTO`
- `base_url = https://supermercadosnacional.com`
- `headers = {"Store": "mercajumbo"}`  → la factory lo traduce a `store_code`, el `MagentoAdapter` ya lo usa.

## Notas de método (para quien retome)

- Prueba directa: instanciar el adaptador (`VtexAdapter`/`MagentoAdapter`) con `base_url` + `query` real y
  `list(islice(adapter.fetch(), N))`. Los adaptadores hacen red real vía httpx (timeout 30s).
- Detección de plataforma: `curl -sL -A "Mozilla/5.0" <url>` + grep de firmas (`vtex`/`vtexassets`,
  `Magento`/`mage/`, `cdn.shopify`, `__NEXT_DATA__`/`next`, `wp-content`). VTEX API pública:
  `/api/catalog_system/pub/products/search?ft=<q>`. Magento GraphQL: `POST /graphql`.
- El "Probar" del admin (`POST /admin/save/sources/{id}/test`) hace exactamente esto pero SSRF-guardado y
  sin persistir — es la vía de producto para validar una fuente antes de guardarla.

## Comparabilidad (por qué importa la cobertura)

Verificado: "Arroz Selecto Líder 5 Lb" salió en Nacional Y Jumbo al MISMO precio (RD$164.95) — la señal
cross-cadena que la cascada de matching (F2) unifica en un canónico. Más cadenas cubiertas = comparación
de precios más rica = el moat de Save.
