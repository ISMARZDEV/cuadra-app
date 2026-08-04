# 🛒 Save móvil — el hub de verticales y la home de Supermarket

> **Fecha:** 2026-08-03 · **Estado:** plan, implementación no iniciada
> **Rama:** `feat/save-hub-supermarket` (desde `developer` @ `9007f0c`)
> **Deriva de:** [`aispace-groceries-agent.md`](./aispace-groceries-agent.md) §1.1 (el triángulo) y su
> tabla de *puentes hacia Save* · [`arquitectura-mvp.md`](./arquitectura-mvp.md) §6 ·
> skill `cuadra-save` (doctrina y reglas sagradas)
>
> **Principio rector:** *la app no vende, compara.* Cada precio viaja de Postgres a la pantalla sin
> que nadie lo recalcule, y **una vertical que no tiene datos se dice, no se disimula.**

---

## Tabla de contenido

0. [**Rol del agente ejecutor y protocolo de trabajo**](#0-rol-del-agente-ejecutor-y-protocolo-de-trabajo) ← **empezar acá**
1. [Qué resuelve y por qué ahora](#1-qué-resuelve-y-por-qué-ahora)
2. [Estado real medido](#2-estado-real-medido)
3. [Los tres huecos de datos](#3-los-tres-huecos-de-datos)
4. [Decisiones cerradas (con el porqué)](#4-decisiones-cerradas-con-el-porqué)
5. [Arquitectura — routing y dónde vive cada cosa](#5-arquitectura--routing-y-dónde-vive-cada-cosa)
6. [El hub de verticales](#6-el-hub-de-verticales)
7. [La home de Supermarket](#7-la-home-de-supermarket)
8. [El componente de tarjeta y el basket](#8-el-componente-de-tarjeta-y-el-basket)
9. [Fases de implementación](#9-fases-de-implementación)
10. [Tests](#10-tests)
11. [Riesgos](#11-riesgos)
12. [Verificación end-to-end](#12-verificación-end-to-end)
13. [Abierto y futuro](#13-abierto-y-futuro)
- [Apéndice A — Entorno y comandos](#apéndice-a--entorno-y-comandos)
- [Apéndice B — Inventario de contratos disponibles](#apéndice-b--inventario-de-contratos-disponibles)
- [Apéndice C — Artefactos a crear](#apéndice-c--artefactos-a-crear)
- [Apéndice E — Specs medidas en Figma](#apéndice-e--specs-medidas-en-figma)
- [Apéndice D — Lo que esta fase NO toca](#apéndice-d--lo-que-esta-fase-no-toca)

---

## 0. Rol del agente ejecutor y protocolo de trabajo

> **Esta sección se lee ANTES que cualquier otra.**

### 0.1 Tu rol

Sos **arquitecto frontend con años construyendo apps React Native en producción**, y acá eso
significa concretamente:

- **Composición sobre configuración.** Un componente con siete banderas booleanas es un componente
  que no se decidió. Preferís *compound components* y slots antes que `variant="a" | "b" | "c"`.
- **Contenedor / presentacional.** La pantalla orquesta datos; el componente pinta. Una tarjeta que
  llama a `useRouter()` adentro es una tarjeta que solo sirve en un lugar.
- **La geometría se declara una vez.** Un ancho copiado en cuatro archivos ya rompió el scroll de
  tres carruseles en esta misma app (ver `basket-product-card.tsx`). Constantes derivadas, exportadas
  desde quien dibuja.
- **El modo manda sobre el chrome, el handler sobre el destino.** Atar la acción al `mode` obliga a
  inventar un modo nuevo por cada destino nuevo. Ya nos pasó; no lo repitas.
- **Listas grandes con `FlatList`,** `getItemLayout` que no miente, y `keyExtractor` estable.
- **Gestos y scroll conviven.** Un `Pressable` dentro de un carrusel horizontal necesita decidir
  explícitamente qué pasa cuando el toque se convierte en arrastre.

Y como ingeniero, no solo como usuario de React Native:

- **Dinero en minor units.** Nunca `float`, en ninguna capa. Se formatea **solo en el borde de UI**.
- **Tipado estricto** — `tsc` limpio, sin `any` de conveniencia.
- **Nombres que discriminan** — un nombre que aplica a dos cosas no identifica ninguna.
- **Degradación honesta** — una vertical sin datos se muestra como lo que es. Un card que promete
  algo que no existe es una mentira, no un placeholder.

### 0.2 Estándares no negociables

| Regla | Detalle |
|---|---|
| **TDD estricto** | RED → GREEN → REFACTOR. Un test que nunca falló no prueba nada |
| **NO tests de layout en vitest** | NativeWind ignora `className` bajo jsdom: una aserción de padding **siempre pasa**. Verificado en esta app revirtiendo el estilo. Se testea comportamiento y texto; la geometría se verifica **a ojo** |
| **Dinero** | Minor units enteros de punta a punta; `formatMoney` solo al pintar |
| **El cliente no recalcula precios** | El backend manda `price_minor` y `unit_price_minor`. La app **no** deriva descuentos ni promedios |
| **Contract-first** | Nada de `fetch` a mano: todo por `@cuadra/api-client`. Cambió un DTO → `make openapi` |
| **Verificación visual obligatoria** | Skill `cuadra-ui-verify`: screenshot del render real contra la referencia, **antes** de decir «listo» |
| **Construir para las 5 verticales** | Supermarket es la primera, no la única. Antes de cada archivo: *¿Credit Cards usaría esto?* Si sí, **no va dentro de `supermarket/`**. Ver [§5.4](#54-la-línea-de-corte-compartido-vs-vertical) |

### 0.3 ⛔ Protocolo de fases — PARAR Y PREGUNTAR

> **Regla dura: al terminar CADA fase, te detenés. No encadenás fases.**

1. **Correr la verificación de la fase** — sus tests, más `tsc` y los linters.
2. **Reportar en un párrafo**: qué se construyó, qué se midió, qué quedó fuera.
3. **PREGUNTAR EXPLÍCITAMENTE si commitear**, y **esperar la respuesta**.
4. **No avanzar** hasta que el usuario conteste.

```
✅ Fase N completa · <tests> verdes · tsc limpio · screenshot adjunto
   <un párrafo de qué se hizo y qué se verificó>

   ¿Commiteo esta fase y sigo con la Fase N+1?   ← PARAR ACÁ
```

Que los tests estén verdes **no es permiso para commitear**. Si en medio de una fase encontrás algo
que invalida el plan, **parás igual y lo decís**.

---

## 1. Qué resuelve y por qué ahora

### 1.1 Save en el móvil hoy no existe

El chat ya sabe hablar de supermercados: el `GroceriesAgent` compara precios, arma la canasta por
presupuesto y pinta tarjetas de producto dentro de la burbuja (PR #46). Y cuando el usuario toca una
de esas tarjetas, la app **lo manda a `/save`**.

`/save` es, hoy, **el feed de alertas de precio**. Una campana. El usuario que viene de una
conversación sobre arroz aterriza en una lista de notificaciones.

**El puente existe y va a un lugar equivocado.** Eso es lo que resuelve este plan.

### 1.2 Las cinco verticales

El documento del `GroceriesAgent` cierra con una tabla de los agentes que vienen. Esa tabla no era
solo del chat: **es el mapa de Save**.

| Vertical | Agente (futuro) | Qué responde | Datos hoy |
|---|---|---|---|
| **Supermarket** | `GroceriesAgent` ✅ | precios, dónde está más barato, canasta por presupuesto | **completo** |
| **Credit Cards** | `CardsAgent` | comparar tasas, cashback, anualidad | ninguno |
| **Loans & Insurance** | `LoansAgent` / `InsuranceAgent` | comparar productos, cuotas, coberturas | ninguno |
| **Promotions** | `PromotionsAgent` | ofertas activas, descuentos por banco/comercio | ninguno |
| **Investments** | `InvestmentsAgent` | dónde poner los ahorros, certificados, rendimientos | ninguno |

El hub de Save es **la contraparte visual de esa tabla**. Cada card es una vertical que algún día
tendrá su agente; hoy solo una tiene catálogo.

### 1.3 El objetivo en dos pantallas

1. **El hub** — entrar a Save y ver los cinco pilares (mockup oficial).
2. **La home de Supermarket** — desde ahí, la pantalla de inicio del súper: buscador, categorías,
   «Mejores ofertas de hoy», «Productos» (mockup oficial). *Como un Uber Eats, pero para comparar.*

---

## 2. Estado real medido

> Todo lo de esta sección se verificó leyendo el código, no la documentación.

### 2.1 Móvil: Save es una sola pantalla de alertas

```
apps/mobile/src/features/save/
├── save-screen.tsx          ← feed de alertas + suscripciones. Nada más
├── api.ts                   ← 4 hooks, todos de alertas
├── interfaces.ts
└── components/{notification-card,subscription-row}.tsx
```

Ruta: `app/(tabs)/save.tsx` — **una pantalla suelta, sin stack**. No hay sub-rutas posibles hoy.

### 2.2 Web: el marketplace ya está construido

```
apps/web/src/features/save/
├── screens/     13 pantallas  (search · category · product · collection · store ·
│                               supermarkets · list · alerts · categories · login…)
└── components/  14 componentes (product-card · product-rail · section-rail ·
                                 category-listing · category-overview · category-filters ·
                                 compare-table · price-history-chart · breadcrumbs · pagination…)
```

**Esto cambia la naturaleza del trabajo.** No es construir Save: es **portarlo**, y la skill
`cuadra-web` dice explícitamente que la estructura de web espeja la de mobile *para que los
componentes porteen con reescritura mínima*. Esa promesa se cobra acá.

### 2.3 Backend: 20 endpoints públicos, ninguno nuevo hace falta (con dos asteriscos)

`apps/api/src/api/v1/controllers/save.py` — todos bajo `/v1/save/*`, **sin auth** (catálogo público):

| Lo que necesita el móvil | Endpoint | Devuelve |
|---|---|---|
| Buscador | `GET /search?q&market` | `ProductSearchDto[]` |
| Categorías (círculos) | `GET /categories?market` | `CategoryTreeDto` |
| Mejores ofertas de hoy | `GET /deals?market&days&limit` | `ProductCardDto[]` |
| Productos | `GET /featured?market&sort&limit` | `ProductCardDto[]` |
| Listado por categoría | `GET /category/{slug}/products` | `CategoryListingDto` |
| Detalle / comparación | `GET /compare?slug&market` | `PriceComparisonDto` |
| Supermercados | `GET /providers?market` | `ProviderRefDto[]` |

Los dos asteriscos son los huecos de §3.

### 2.4 Lo que ya construimos y se reusa

`BasketProductCard` (chat) ya resolvió, medido y a ojo: la cáscara con guirnalda, la escala única
(`SCALE` + `s()`), el alto FIT, el precio con centavos en superíndice, el precio por unidad, la barra
inferior, el rebote de tecla y la háptica. **Nada de eso se rehace.**

---

## 3. Los tres huecos de datos

> Ordenados por lo que cuesta descubrirlos tarde. **Ninguno se resuelve dibujando.**

### 3.1 🔴 El descuento no viaja en el contrato

El mockup de Supermarket muestra, en la tarjeta de oferta: un badge rojo **`-15`**, el precio anterior
**tachado** (`$520.00`) y el vigente (`$442.00`).

`ProductCardDto` —lo que devuelven `/deals` y `/featured`— **no tiene ninguno de los tres**:

```python
class ProductCardDto(BaseModel):
    id, slug, name, brand, quality, display_size, image_url
    price_minor          # el MÁS BARATO entre tiendas
    currency
    unit_price_minor     # precio por unidad base
    unit_measure
    store_count
```

El dato existe, pero en **otro** DTO y en **otro** endpoint: `/drops` → `PriceDropDto` trae
`previous_minor`, `drop_minor` y `drop_bps`… y **no** trae `slug`, `image_url` ni `unit_price_minor`,
o sea que no alcanza para pintar la tarjeta.

**Las dos salidas, y por qué no da lo mismo:**

| Opción | Qué implica | Veredicto |
|---|---|---|
| **A. Extender `ProductCardDto`** con `previous_price_minor` + `drop_bps` opcionales | Toca dominio, DTO, use-case, `make openapi` | ✅ **Recomendada** |
| B. Que la app pida `/deals` **y** `/drops` y cruce por `canonical_product_id` | El cliente **calcula** el descuento y hace dos viajes | ❌ Viola la regla de que el cliente no recalcula precios, y el cruce falla en cuanto los dos endpoints difieren de ventana (`days`) |

> ⚠️ **Medir antes de construir:** el badge solo tiene sentido si hay bajadas de precio en la base.
> Si `/drops` devuelve 0 filas en el mercado DO, el badge **no se implementa todavía** — se construye
> la tarjeta sin él y se anota. Dibujar un `-15%` fijo «para que se vea como el mockup» es exactamente
> la clase de mentira que este producto no se puede permitir.

**El diseño ya piensa así.** En Figma, el badge (`Group 40097`) está **`hidden` en dos de las tres
tarjetas** del rail y visible solo en la del medio — la única que además lleva el precio anterior
tachado. El descuento es **por producto**, no decoración del rail. Lo que falta no es el diseño: es
el campo en el DTO.

### 3.2 🟠 Las categorías no tienen imagen

El mockup muestra círculos con **fotos** (frutas, panadería, carnes, despensa). La API devuelve
`CategoryNodeDto{name, slug, key, children}` — **sin `image_url`**.

La web lo resolvió con **íconos Lucide por slug** (`category-icons.tsx`), con esta nota textual:
*«repetir íconos entre subcategorías es aceptable hasta que haya un ícono propio por categoría
administrable desde el panel»*.

Decisión para el móvil en §4.3.

### 3.3 🟠 La lista de compras no tiene backend

El dominio tiene `shopping_list(user_id)` + `list_item` (D1). **La web no los usa**: su lista es
`localStorage`, cliente puro, sin auth — está escrito en el encabezado de `list-screen.tsx`.

No hay endpoints `/save/list*`. Entonces el carrito del mockup (el badge con `4`, los `+`/`−` en las
tarjetas) hoy **no tiene dónde persistir del lado del servidor**. Decisión en §4.4.

---

## 4. Decisiones cerradas (con el porqué)

### 4.1 El hub muestra las cinco verticales desde el día uno, con degradación honesta

Cuatro de las cinco no tienen datos. Las opciones eran mostrar solo Supermarket, o mostrar las cinco.

**Se muestran las cinco**, porque el hub *es* la promesa del producto: Save no es un comparador de
supermercados, es un comparador financiero que **empieza** por el súper. Un hub con un solo card no
comunica eso.

Pero **una vertical sin datos no se comporta como una que sí los tiene**: no navega a una pantalla
vacía. Va a un estado explícito de «en construcción», con la misma dignidad visual que el resto. El
card se ve completo; lo que cambia es a dónde lleva.

### 4.2 Supermarket se PORTEA desde la web, no se reinventa

`product-card`, `product-rail`, `section-rail`, `category-*` ya existen y ya pasaron por diseño. La
skill `cuadra-web` promete que la estructura espeja la de mobile para que porteen. Se porta la
**estructura y la lógica**; el **pintado** se rehace con las primitivas que ya validamos en el chat.

### 4.3 Los círculos usan las ilustraciones de Figma, no íconos

> **Corregido tras abrir el archivo de Figma.** El plan decía «arrancamos con íconos Lucide como la
> web, las fotos son deuda». **Las ilustraciones existen y están en el archivo** (§E.3): son imágenes
> de 61×61 dentro de cada círculo, exportables.

Entonces se exportan y se versionan como assets locales, con un mapa `slug → asset` **igual en forma
al `category-icons.tsx` de la web** (que mapea `slug → ícono Lucide`). Misma estructura, mejor
contenido.

Lo que sigue siendo cierto: **la API no manda `image_url` de categoría**, así que el mapa vive en la
app. El día que exista `category.image_url` administrable desde el OFV, se cambia **en un solo
lugar** — y el fallback para una categoría sin asset es el ícono Lucide, no un hueco.

### 4.4 El carrito es LOCAL en esta fase

Paridad con la web (que ya decidió `localStorage`), cero backend nuevo, y **funciona sin login** —
que es lo correcto para un catálogo público. El estado vive en un store `zustand` con persistencia.

> Consecuencia aceptada y explícita: la lista **no** se sincroniza entre web y móvil todavía. El día
> que se quiera, `shopping_list`/`list_item` ya están en el modelo esperando su API.

### 4.5 La tarjeta de Save y la del chat comparten cáscara, no comportamiento

La del chat tiene ojo/cantidad y vive dentro de una burbuja; la de Save tiene bookmark, badge de
descuento y vive en un rail o en una grilla. **La geometría es la misma; los slots no.** El corte
exacto en §8.

---

## 5. Arquitectura — routing y dónde vive cada cosa

### 5.1 El routing: de pantalla suelta a stack

Hoy `app/(tabs)/save.tsx` es un archivo. Para tener sub-secciones, la tab pasa a ser un **directorio
con su propio stack** (patrón de expo-router que la app ya usa en `config/`):

```
app/(tabs)/save/
├── _layout.tsx                    Stack de Save
├── index.tsx                      → el HUB (5 verticales)
├── alerts.tsx                     → el feed de alertas de HOY (se mueve, no se borra)
└── supermarket/
    ├── _layout.tsx                Stack de la vertical
    ├── index.tsx                  → la HOME de Supermarket
    ├── search.tsx                 → resultados de búsqueda
    ├── category/[slug].tsx        → listado por categoría
    ├── product/[slug].tsx         → detalle + comparación
    └── list.tsx                   → el carrito / lista de compras
```

**Por qué anidado y no plano:** `supermarket/` es una de cinco. Cuando entre `cards/`, su stack va al
lado sin tocar nada de lo anterior. Una ruta plana `save-supermarket-product.tsx` obliga a renombrar
todo el día que aparezca la segunda vertical.

> ⚠️ El deep-link `router.push("/save")` que ya dispara el chat (PR #46) tiene que seguir andando:
> `save/index.tsx` responde a la misma URL. **Esto es un test de regresión, no una suposición.**

### 5.2 La estructura de la feature

```
apps/mobile/src/features/save/
├── hub/
│   ├── hub-screen.tsx
│   ├── components/vertical-card.tsx        ← el card de pilar (los 5)
│   └── verticals.ts                        ← el registro: id, título, estado, ruta
├── supermarket/
│   ├── home-screen.tsx
│   ├── components/
│   │   ├── save-product-card.tsx           ← la tarjeta (§8)
│   │   ├── product-rail.tsx                ← carrusel horizontal + "Ver todas"
│   │   ├── category-circles.tsx            ← los círculos del header
│   │   ├── search-bar.tsx
│   │   └── cart-button.tsx                 ← el badge con el contador
│   ├── api.ts                              ← hooks de deals/featured/categories/search
│   └── store/cart-store.ts                 ← zustand + persistencia (§4.4)
├── alerts/                                 ← lo de HOY, movido acá tal cual
└── shared/                                 ← lo que sirve a las 5 verticales
```

### 5.3 El registro de verticales

El hub **no** hardcodea cinco JSX. Renderiza un array:

```ts
type VerticalStatus = "live" | "soon";

interface Vertical {
  id: "supermarket" | "cards" | "loans" | "promotions" | "investments";
  titleKey: string;        // i18n es/en/pt — NUNCA texto literal
  status: VerticalStatus;
  href?: Href;             // solo cuando status === "live"
  art: ImageSourcePropType;
}
```

Agregar una vertical el día que tenga datos = **una fila y un asset**. Y `status` no es decoración:
es lo que decide si el card navega o abre el estado de «en construcción» (§4.1).

### 5.4 La línea de corte: compartido vs vertical

> La misma pregunta que gobernó el `GroceriesAgent`: *¿un agente de tarjetas usaría esto?*

| Va en `shared/` | Va en `supermarket/` |
|---|---|
| El card de vertical del hub | La tarjeta de producto |
| El header con buscador + carrito (si Cards también busca) | Los círculos de categoría de súper |
| El formato de dinero | El precio por unidad base (es de catálogo de súper) |
| El estado «en construcción» | El store del carrito |

Ante la duda: **empieza en la vertical**. Subir algo a `shared/` cuando aparece el segundo consumidor
es barato; bajarlo cuando ya lo usan tres es un refactor.

---

## 6. El hub de verticales

**Referencia oficial:** mockup del hub (fondo claro, header con menú · logo «Save» · campana con
punto rojo, y cards apilados de borde a borde).

### 6.0 ⚠️ El diseño tiene CUATRO cards, no cinco

Medido en Figma: el hub trae **Supermarket · Credit Cards · Loans & Insurance · Investments**.
**`Promotions` no está**, aunque sí figura en la tabla de agentes de §1.2.

No lo resuelvo por mi cuenta, porque las dos lecturas son razonables: o Promotions es una vertical que
todavía no se dibujó, o se decidió que las promociones **no** son una vertical sino una capa
transversal (ofertas del súper, cashback de la tarjeta…) y por eso no tiene card.

**Mientras tanto el registro (§5.3) es data**, así que Promotions es *una fila* el día que se decida.
El hub renderiza lo que haya en el array; no hay JSX que tocar.

### 6.1 Anatomía del card

**Medidas de Figma:** card de **364×153**, márgenes laterales de **19**, y **172 de paso vertical**
entre cards (o sea **19 de aire**). Los botones del header (menú y campana) son el componente
**`Button - Liquid Glass - Symbol` de 48×48** — que en el código **ya existe**: es
`components/ui/glass-button.tsx`, el mismo de la barra del chat. No se rehace.

```
┌──────────────────────────────────────────────┐
│ ★                       ╭──────────────────╮ │   ★ badge: destacado (relleno) / normal
│                         │                  │ │   arte: ilustración de la vertical,
│  Super                  │   ilustración    │ │         sangrada al borde derecho
│  market                 │                  │ │
│ ⊘                       ╰──────────────────╯ │   ⊘ sello inferior izquierdo
└──────────────────────────────────────────────┘
```

- **Título en dos líneas**, lima sobre blanco, tipografía de la app (Kantumruy).
- **Arte a la derecha**, verde profundo, sangrando el borde del card.
- **Esquinas continuas** (`borderCurve: "continuous"`) — como el resto de la app.
- **Rebote de tecla + háptica** al tocar: mismos resortes que `glass-button` y la tarjeta del chat.
  El tacto de la app es UNO.

### 6.2 Estados

| `status` | Toque | Señal visual |
|---|---|---|
| `live` | navega a su stack | card a color completo |
| `soon` | abre una hoja «en construcción» con lo que va a responder esa vertical | mismo card + una marca discreta de estado |

La hoja de `soon` **usa la columna «preguntas que responde» de la tabla de §1.2**. No es un «próximamente»
vacío: le dice al usuario qué va a poder preguntar. Eso convierte una ausencia en una promesa concreta.

### 6.3 Lo que NO hace el hub

No trae datos. Ninguna llamada a la API. Es navegación pura — y por eso puede ser la primera fase
después del esqueleto: no depende de ningún hueco de §3.

---

## 7. La home de Supermarket

**Referencia oficial:** mockup de la home (header verde profundo con buscador y carrito, círculos de
categoría montados sobre el borde curvo, «Mejores ofertas de hoy», «Productos»).

### 7.1 Anatomía

| Zona | Contenido | Fuente |
|---|---|---|
| **Header** (verde, borde inferior curvo) | menú · buscador «Buscar por un producto…» · carrito con contador | local (el contador sale del store) |
| **Ubicación** | «Current location · Santo Domingo, RD» | `market` — hoy fijo `DO` |
| **Círculos de categoría** | 4-5 categorías tope, montadas sobre la curva | `GET /categories` |
| **Mejores ofertas de hoy** + «Ver todas» | carrusel horizontal de tarjetas | `GET /deals` |
| **Productos** + «Ver todas» | carrusel/grilla | `GET /featured` |

### 7.2 El header curvo — es una ELIPSE, no un path

> **Medido en Figma (§E.2).** El header es un frame de **402×286** con una **elipse de 441×426
> posicionada en (−20, −190)** y recortada por el frame. La panza que baja al centro es el borde
> inferior de esa elipse.

Eso simplifica el trabajo: **no hay que dibujar una curva Bézier a mano**. Una `<Ellipse>` de
`react-native-svg` con esas medidas, dentro de un contenedor con `overflow: hidden`, reproduce el
header exacto — y escala solo si el ancho de pantalla cambia (402 es el iPhone 17 Pro; un SE es 375).

> Lección ya pagada, aplica igual acá: **el borde curvo no es simétrico** respecto de la caja. Los
> círculos de categoría **montan la curva** (mitad dentro, mitad fuera) y por eso sus centros no se
> alinean entre sí — en el diseño están en `y` = 139, 191, 194 y 134, siguiendo la panza. Se
> posicionan contra la **curva**, no contra el rectángulo; es la misma trampa que `BAR_ICON_DY` en la
> tarjeta del chat.

### 7.3 Estados vacíos, uno por uno

Cada rail tiene su propio vacío, y **son hechos distintos**:

| Situación | Qué se muestra |
|---|---|
| No hay ofertas hoy | el rail entero se **omite** (no un carrusel vacío) |
| No hay productos | mensaje explícito: el catálogo del mercado no está poblado |
| Sin red | reintento, y lo cacheado por TanStack si existe |

Colapsar los dos primeros en «no hay nada» borra información: *«hoy no bajó ningún precio»* y *«no
tenemos catálogo»* se arreglan de formas opuestas.

---

## 8. El componente de tarjeta y el basket

### 8.0 La tarjeta de Save es MÁS CHICA que la del chat

Medido en Figma: la tarjeta del rail de Supermarket mide **124.2 de ancho**. La del chat, hoy, mide
**148** (`SCALE = 0.9` sobre un diseño de 164).

```
124.2 / 164 ≈ 0.757        ← la escala que le toca a la tarjeta de Save
148   / 164  = 0.9         ← la que ya tiene la del chat
```

**Esto valida la decisión de que la escala sea una perilla y no un número incrustado.** Las dos
tarjetas son el mismo diseño a dos tamaños: la de Save vive en un rail de una pantalla llena, la del
chat dentro de una burbuja. `scalloped-shell` recibe su `scale`; nada más cambia.

> Y confirma por qué el ancho tenía que salir de quien dibuja: en el rail de Save, `getItemLayout`
> necesita **124**, no **148**. Con el número copiado a mano, ese carrusel habría nacido descalibrado.

### 8.1 Qué se hereda y qué cambia

`BasketProductCard` (chat) y la tarjeta de Save comparten **la cáscara y la escala**; difieren en el
**contenido de tres slots**.

| | Chat | Save |
|---|---|---|
| Esquina superior derecha | ojo → tienda | **bookmark** → guardar |
| Badge superior izquierdo | índice del rubro | índice / **`-15` de descuento** |
| Precio | vigente | vigente + **anterior tachado** (si §3.1 lo habilita) |
| Barra inferior | `+` / `− n +` | **igual** |
| Toque en el card | elige (picker) o va a Save (canasta) | va al detalle |

### 8.2 Cómo se comparte, sin fabricar un monstruo

> ⚠️ **La tentación es agregarle props a `BasketProductCard` hasta que sirva para los dos.** Eso
> produce el componente de siete banderas que §0.1 prohíbe. Y hay una razón concreta además de la
> estética: esa tarjeta vive en el **chat**, y el chat no puede romperse por un cambio pedido por
> Save.

Se extrae lo que **ya está probado y no tiene opinión de producto**:

```
shared/product-shell/
├── scalloped-shell.tsx     la cáscara SVG + su geometría (SCALE, s(), CARD_WIDTH)
├── price-block.tsx         precio con centavos en superíndice + precio por unidad
└── action-bar.tsx          la barra con guirnalda + el offset óptico de sus iconos
```

Y cada tarjeta compone esas piezas con **sus** slots. `BasketProductCard` se refactoriza para
consumirlas: mismo render, mismos tests verdes. **Si algún test del chat cambia de resultado, el
refactor está mal** — es la red que hace seguro tocar esto.

### 8.3 El basket

Store `zustand` con persistencia (`AsyncStorage`), clave por `canonical_product_id`:

```ts
interface CartLine { canonicalProductId: string; qty: number; }
```

**Guarda cantidades, NO precios.** El precio se lee del catálogo cada vez que se pinta. Guardar el
precio en el carrito es guardar una foto que envejece: mañana el súper cambia el precio y el carrito
muestra el de ayer con toda confianza. **Un precio viejo con cara de vigente es peor que no tenerlo.**

El total, cuando exista una pantalla de lista, se calcula sobre los precios **frescos** del catálogo.

---

## 9. Fases de implementación

> Ordenadas por **riesgo**: los huecos de datos primero, porque pueden cambiar el diseño.
>
> ⛔ **TODAS las fases terminan igual:** verificación → reporte → **preguntar si commitear** → esperar.

### Fase 0 — Medir los tres huecos ⚠️ BLOQUEANTE

Contra la base real, y **antes de escribir UI**:

1. `GET /drops?market=DO&days=7` → ¿cuántas bajadas hay? **Si es 0, el badge de descuento no se
   construye en esta fase** (§3.1) y se anota acá el número medido.
2. `GET /categories?market=DO` → cuántas categorías tope hay y cuáles, para saber si los círculos son
   4, 5 o 12.
3. `GET /deals` y `GET /featured` → ¿devuelven productos con `image_url`? Una grilla de productos sin
   foto es una pantalla distinta a la del mockup.

**✅ Éxito:** los tres números escritos en este documento. Sin ellos, las fases 3-5 son adivinanza.

#### Medido (2026-08-03)

**1. Bajadas de precio: 0 — y la causa no era «no bajaron los precios».**

```
save.price:  778 filas · 778 store_products · 1.00 filas por producto
```

Una bajada la detecta un `LAG` sobre `save.price` particionado por `store_product`. Con **exactamente
una observación por producto**, el `LAG` devuelve `NULL` en todas las filas y la query las descarta
todas. El catálogo se ingestó una sola vez (2-3 de agosto) y el histórico es *change-only*: la
segunda fila aparece cuando el precio **cambia** en una corrida posterior. Nunca hubo una segunda
corrida.

**Sembrado a pedido del usuario:** 30 filas **históricas** (más caras, con `captured_at` anterior) en
productos con imagen, marcadas `source='seed-dev-drops'`. **No se tocó ningún precio vigente** — el
`current_price_minor` sigue siendo el ingestado, así que el catálogo no miente; lo que se agregó es
el pasado que la ingesta habría registrado. Resultado:

| | Antes | Después |
|---|---|---|
| `/drops?days=7` | 0 | **30** (del 5% al 25%, en Sirena · Nacional · Bravo) |
| `/deals?days=7` | 0 productos | **12 productos, 12/12 con imagen** |

→ **La Fase 3 (el DTO del descuento) SÍ va.** El badge tiene con qué pintarse.

**2. Categorías: 17 raíces, no 4.**

`Alcohol · Bebés · Bebidas · Carnes & Pescados · Comidas Preparadas · Congelados · Cuidado Del Hogar ·
Cuidado Personal · Despensa & Abarrotes · Embutidos & Delicatessen · Escolares & Oficina ·
Frutas & Verduras · Lácteos & Huevos · Mascotas · Panadería & Tortillería · Salud & Farmacia ·
Snacks & Dulces` (entre 3 y 17 hijos cada una).

El diseño muestra **4 círculos**, y las cuatro que dibuja existen en la API. O sea: **los círculos son
un subconjunto curado, no «las categorías»**. Hace falta decidir cuáles y en qué orden — y el
carrusel necesita un «ver todas» que lleve a las 17.

**3. 🟠 Imágenes: el rail «Productos» sale casi vacío de fotos.**

```
canónicos DO: 287 · con imagen: 133 (46.3%)

/featured sort=unit_price →  0/12 con imagen
/featured sort=popular    →  0/12 con imagen
/featured sort=price      →  2/12 con imagen
/deals                    → 12/12 con imagen  ← tras el sembrado
```

La cobertura global es del 46%, pero **el orden de `featured` levanta sistemáticamente los que no
tienen foto** (servilletas, algodón, cuadernos: artículos raros que ganan por precio por unidad). No
es un bug del endpoint: es que «lo más barato por unidad» y «lo que tiene foto» son conjuntos casi
disjuntos en este catálogo.

**Esto NO se arregla sembrando imágenes** — inventar la foto de un producto es exactamente lo que
este producto no puede hacer. Las salidas reales son tres, y hay que elegir en la Fase 5:
1. la tarjeta degrada con su placeholder (ya existe) y el rail se ve pobre pero honesto;
2. `featured` prioriza los que tienen foto — sesga la vitrina, no el precio;
3. ese rail sale de una **colección curada** (`/collections`) en vez de `featured`.

---

### Fase 1 — El esqueleto de routing

`app/(tabs)/save.tsx` → `app/(tabs)/save/{_layout,index,alerts}.tsx`. El feed de alertas se **mueve**
a `save/alerts.tsx` sin tocarle una línea.

**✅ Éxito:** `/save` sigue abriendo (test de regresión del deep-link del chat), el feed de alertas
sigue funcionando, y existe el stack anidado vacío de `supermarket/`.

---

### Fase 2 — El hub

Registro de verticales + `VerticalCard` + la hoja de «en construcción». Sin datos, sin API.

**✅ Éxito:** los 5 cards renderizan; Supermarket navega; los otros 4 abren su hoja con las preguntas
que van a responder. Screenshot contra el mockup, **claro y oscuro**.

---

### Fase 3 — El contrato del descuento *(solo si la Fase 0 lo justificó)*

Extender `ProductCardDto` con `previous_price_minor` y `drop_bps` opcionales, con **TDD del lado del
backend**, y `make openapi`.

**✅ Éxito:** el DTO nuevo tipa en web y móvil sin romper nada; test que prueba que un producto sin
bajada trae los campos en `None` (no en `0` — cero es un descuento de cero, `None` es «no hay dato»;
confundirlos pinta un `-0%`).

---

### Fase 4 — Las primitivas compartidas

El refactor de §8.2: extraer `scalloped-shell`, `price-block` y `action-bar`; hacer que
`BasketProductCard` las consuma.

**✅ Éxito:** los tests del chat siguen verdes **sin tocarlos**. Screenshot del chat idéntico al de
antes: es un refactor, no un rediseño.

---

### Fase 5 — La home de Supermarket

Header curvo + círculos + los dos rails + `SaveProductCard`.

**✅ Éxito:** la pantalla contra el mockup, screenshot en ambos temas. Los estados vacíos de §7.3
verificados **forzándolos**, no imaginándolos.

---

### Fase 6 — El carrito

Store persistente + contador en el header + `+`/`−` en las tarjetas + pantalla de lista.

**✅ Éxito:** cerrar y reabrir la app conserva el carrito; el total se recalcula con precios frescos.

---

### Fase 7 — Búsqueda y categoría

`search.tsx` y `category/[slug].tsx` sobre `/search` y `/category/{slug}/products`.

**✅ Éxito:** buscar desde el header lleva a resultados; tocar un círculo lleva a su listado.

---

### Fase 8 — Detalle de producto

`product/[slug].tsx` sobre `/compare`: la comparación entre tiendas, el histórico y el enlace a la
tienda. **La referencia es la web** (`product-screen.tsx`), que ya lo resolvió.

**✅ Éxito:** el precio de cada tienda cita `captured_at` y `price_type` (regla sagrada #3).

---

## 10. Tests

| Qué | Dónde | Cómo |
|---|---|---|
| El hub renderiza 5 verticales | `hub-screen.test.tsx` | vitest + testing-library |
| Una vertical `soon` **no navega** | `vertical-card.test.tsx` | spy del router |
| El deep-link `/save` del chat sigue vivo | regresión | render de la ruta |
| El carrito persiste y suma cantidades | `cart-store.test.ts` | store puro, sin UI |
| La tarjeta muestra `-15` **solo** si hay `drop_bps` | `save-product-card.test.tsx` | props sin descuento → sin badge |
| Los rails vacíos se omiten | `home-screen.test.tsx` | mock de la API con `[]` |

> **Lo que NO se testea en vitest:** posiciones, paddings, tamaños. NativeWind ignora `className` bajo
> jsdom y una aserción de layout **siempre pasa** — ya se comprobó en esta app. La geometría se
> verifica con screenshot (`cuadra-ui-verify`).

---

## 11. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **El catálogo DO está vacío o sin fotos** → la home se ve rota aunque el código esté bien | Fase 0 lo mide antes de construir |
| 2 | **No hay bajadas de precio** → el badge del mockup no se puede pintar con datos reales | Fase 3 es condicional; jamás un `-15%` decorativo |
| 3 | **El refactor de la tarjeta rompe el chat** | Los tests del chat son la red; si cambian de resultado, el refactor está mal |
| 4 | **El deep-link `/save` se rompe al pasar a stack** | Test de regresión en la Fase 1 |
| 5 | **Las 4 verticales sin datos se sienten a relleno** | La hoja de `soon` dice qué va a responder cada una: promesa concreta, no «próximamente» |
| 6 | **El carrito local no sincroniza con la web** | Decisión consciente (§4.4); el modelo ya tiene dónde persistir el día que se quiera |
| 7 | **Los círculos con íconos no se ven como el mockup con fotos** | Decisión explícita (§4.3) + deuda de diseño anotada |

---

## 12. Verificación end-to-end

Al cerrar la Fase 5, en un dispositivo real:

1. Abrir la app → tab **Save** → se ven los 5 cards.
2. Tocar **Credit Cards** → hoja de «en construcción» con sus preguntas. **No** una pantalla vacía.
3. Tocar **Supermarket** → home: buscador, círculos, ofertas, productos.
4. Tocar una tarjeta → detalle con precios por tienda, cada uno con su fecha de captura.
5. Agregar dos productos → el contador del carrito marca 2 → matar la app → sigue en 2.
6. **Desde el chat**: preguntar por un producto, tocar la barra lima → cae en Save y **el chat sigue
   donde estaba** al volver.
7. Todo lo anterior en **claro y oscuro**, y en **es / en / pt**.

---

## 13. Abierto y futuro

- **Sincronizar la lista** entre web y móvil (`shopping_list` ya existe en el modelo).
- **`category.image_url`** administrable desde el OFV → los círculos con foto del mockup.
- **Las otras cuatro verticales**: cada una necesita su modelo de datos antes que su pantalla.
  `provider.type` ya contempla `bank|insurer`.
- **El puente de vuelta**: desde un producto de Save, preguntarle al `GroceriesAgent` sobre él.
  Hoy el puente es de una sola dirección.
- **Ubicación real** en el header (hoy `Santo Domingo, RD` es fijo, igual que `market=DO`).

---

## Apéndice A — Entorno y comandos

```bash
# Puertos FIJOS: web :3006 · api :8005 · metro :8087 · postgres :5433
./scripts/dev-up.sh

# Móvil
cd apps/mobile
npx vitest run                      # tests
npx tsc --noEmit                    # tipos

# Backend (solo si la Fase 3 se activa)
cd apps/api && uv run pytest tests/save
make openapi                        # tras cambiar un DTO → regenera el api-client

# Verificación visual
xcrun simctl openurl booted cuadra://ui-preview
xcrun simctl ui booted appearance light|dark
```

---

## Apéndice B — Inventario de contratos disponibles

| Endpoint | DTO | Sirve para |
|---|---|---|
| `GET /save/search?q&market` | `ProductSearchDto[]` | buscador |
| `GET /save/categories?market` | `CategoryTreeDto` | círculos + navegación |
| `GET /save/category/{slug}` | `CategoryPageDto` | cabecera de categoría |
| `GET /save/category/{slug}/products` | `CategoryListingDto` | listado + facetas |
| `GET /save/deals?market&days&limit` | `ProductCardDto[]` | «Mejores ofertas de hoy» |
| `GET /save/featured?market&sort&limit` | `ProductCardDto[]` | «Productos» |
| `GET /save/drops?market&days` | `PriceDropDto[]` | el dato del descuento (§3.1) |
| `GET /save/compare?slug&market` | `PriceComparisonDto` | detalle y comparación |
| `GET /save/history?…` | `PriceHistoryDto` | chart del histórico |
| `GET /save/providers?market` | `ProviderRefDto[]` | logos de supermercados |
| `GET /save/collections` · `/collection/{slug}` | `CollectionDto` | rails curados |
| `GET /save/alerts*` | `AlertDto` · `AlertNotificationDto` | lo que ya existe hoy |

---

## Apéndice C — Artefactos a crear

```
app/(tabs)/save/_layout.tsx · index.tsx · alerts.tsx
app/(tabs)/save/supermarket/_layout.tsx · index.tsx · search.tsx
                            category/[slug].tsx · product/[slug].tsx · list.tsx

src/features/save/hub/{hub-screen.tsx, verticals.ts, components/vertical-card.tsx}
src/features/save/supermarket/{home-screen.tsx, api.ts, store/cart-store.ts}
src/features/save/supermarket/components/{save-product-card, product-rail,
                                          category-circles, search-bar, cart-button}.tsx
src/features/save/shared/product-shell/{scalloped-shell, price-block, action-bar}.tsx
src/assets/save/verticals/*.png            ← las 5 ilustraciones
src/i18n/{es,en,pt}.json                   ← claves nuevas de Save
```

---

## Apéndice E — Specs medidas en Figma

> Archivo `MJlNTbiNLuUl4ythDuAPDX` (Cuadra App). **Todo lo de acá está medido, no estimado.**
> Antes de implementar cada pantalla se corre `get_design_context` sobre su nodo (la guía de
> design-to-code lo exige) — esto es el mapa, no el reemplazo.

### E.1 El hub — nodo `879:17183`

| Elemento | Nodo | Medida |
|---|---|---|
| Frame | `879:17183` | 402 × 874 |
| Logotipo «Save» | `879:18025` | 134 × 67 en (134, 75) — «S» + glifo + «ve», tres capas |
| Fila de botones | `879:18043` | 364 × 48 en (19, 86); menú en x=0, campana en x=316 |
| Botón de vidrio | `879:18044` · `879:18050` | 48 × 48 · **`Button - Liquid Glass - Symbol`** → ya existe como `GlassButton` |
| Card Supermarket | `879:17917` | **364 × 153** en (19, **314**) |
| Card Credit Cards | `879:17890` | 364 × 153 en (19, **486**) |
| Card Loans & Insurance | `879:18076` | 364 × 153 en (19, **658**) |
| Card Investments | `879:18100` | 364 × 153 en (19, **830**) |
| Paso vertical | — | **172** (153 de card + **19 de aire**) |
| Arte del card | `Ellipse 995` + `Capa 1/Vector` | elipse de fondo + el trazo verde, sangrando a la derecha |
| Sello inferior izq. | `Frame 40369` | 75 × 113 — **`hidden` en Investments** |
| Badge superior | `Frame` 27.5 × 27.5 | la estrella |

> `Promotions` **no tiene nodo**: ver §6.0.

### E.2 La home de Supermarket — nodo `508:12125`

| Elemento | Nodo | Medida |
|---|---|---|
| Header curvo | `508:15079` | frame **402 × 286** |
| **La curva** | `508:15081` (`Ellipse 995`) | **elipse 441 × 426 en (−20, −190)**, recortada por el frame |
| Buscador | `509:18323` | 255 × 45 en (73, 68) — pastilla con ícono + placeholder |
| Botón menú | `508:13164` | 48 × 48 en (10, 65) — glass |
| Botón carrito | `508:15083` | 48 × 48 en (347, 65) — glass + badge `4` (elipse 11 × 11) |
| «Current location» | `508:18301` · `508:18299` | dos líneas centradas, y=128 y y=144 |
| Círculos de categoría | `508:15100` · `508:18263` · `508:18270` · `508:18276` | **61 × 61** la foto, ~87 con la etiqueta; centros en y = 139 / 191 / 194 / 134 (siguen la panza) |
| Rail «Mejores ofertas» | `877:13220` | 385 × 286 en (17, 287); título + subtítulo + botón «Ver todas» (80.5 × 25.7) |
| Rail «Productos» | `877:13503` | 385 × 281 en (15, 582) |
| **Tarjeta de producto** | `877:13234` | **124.2 × 231** |
| Cáscara de la tarjeta | `Vector` dentro de `Group 40095` | la guirnalda — misma silueta que la del chat |
| Badge de descuento | `Group 40097` | 24.3 × 24.3 · **`hidden` en 2 de 3 tarjetas** |
| Precio anterior tachado | `Frame 40289` + `Vector 28` | solo en la tarjeta con descuento |
| Barra de acción | `Group 40099` | 113 × 33 — `+` o `− n +` |

### E.3 Assets a exportar de Figma

- **4 ilustraciones de categoría** (61 × 61) — los `ChatGPT Image …-Photoroom` dentro de cada círculo.
- **4 artes de vertical** del hub — el par `Ellipse 995` + `Capa 1` de cada card.
- El **logotipo «Save»** (`879:18025`), que es texto + glifo, no una fuente suelta.

> Regla de la guía de design-to-code que aplica acá: **los assets se exportan, no se redibujan**, y
> se preservan las dos cajas —contenedor y contenido— por separado. Nada de estirar un PNG con un
> `resizeMode` genérico para «que entre».

---

## Apéndice D — Lo que esta fase NO toca

- **El `GroceriesAgent`** y nada de `contexts/aispace`. El chat queda como está.
- **La ingesta** (Dagster, adapters, matching). El catálogo es el que hay.
- **La consola admin / OFV.**
- **Las otras cuatro verticales** más allá de su card y su hoja de estado.
- **La web.** Se lee como referencia; no se modifica.
- **Auth.** El catálogo de Save es público y así se queda.
