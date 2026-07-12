# Brief de Diseño UI — Rediseño Pantalla Proveedores (Cuadra Save Admin)

## Objetivo

Rediseñar la pantalla de **Proveedores** del panel administrativo interno de Cuadra (módulo Save), elevando la calidad visual y UX al mismo nivel que la pantalla de **Cola de Revisión** existente. El resultado debe verse como una aplicación web profesional de administración interna, no como un formulario MVP.

---

## Sistema de Diseño

### Paleta de Colores

| Token | Hex | Uso |
|-------|-----|-----|
| `brand-forest` | `#1A3A2A` | Textos principales, headers, botones primarios |
| `brand-lime` | `#C2FB7E` | Acentos, badges activos, botones secundarios, estados hover |
| `brand-green` | `#007E62` | Pills de datos, indicadores positivos |
| `bg-page` | `#F5F5F0` | Fondo general de la página |
| `bg-card-outer` | `rgba(237, 237, 232, 0.60)` | Fondo del contenedor principal |
| `bg-card-inner` | `#FFFFFF` | Fondo de tablas, modales, KPI cards |
| `border-subtle` | `rgba(0, 0, 0, 0.05)` | Bordes suaves entre secciones |
| `text-muted` | `#6B7280` | Labels, placeholders, metadatos |
| `text-body` | `#1E2129` | Texto de cuerpo |
| `danger` | `#E11D48` | Acciones destructivas |
| `warning` | `#F59E0B` | Estado "sin fuente" |

### Tipografía

- **Familia:** Inter (o system sans-serif equivalente)
- **Título página:** 24px / 700 / forest
- **Subtítulo:** 14px / 400 / muted
- **KPI valor:** 40px / 600 / forest / tabular-nums / tracking -0.04em
- **KPI label:** 11px / 600 / uppercase / tracking 0.05em / forest
- **Tabla header:** 13px / 600 / muted
- **Tabla body:** 14px / 400 / body
- **Badge:** 11-12px / 600

### Formas y Radios

| Elemento | Radio |
|----------|-------|
| Contenedor principal | 32px (squircle) |
| KPI cards | 50px (squircle) |
| Modal | 28px (squircle) |
| Tabla wrapper | 16px |
| Botones | 9999px (pill) |
| Search input | 9999px (pill) |
| Badges / pills | 9999px |
| Inputs / Selects | 12px |
| Thumbnails / avatars | 8-12px |

### Sombras

- **Card sutil:** `0 1px 3px rgba(0,0,0,0.06)`
- **Card hover:** `0 4px 12px rgba(0,0,0,0.08)`
- **Modal overlay:** `0 20px 60px rgba(0,0,0,0.15)`

---

## Estructura de la Página

### Layout General

```
┌──────────┬──────────────────────────────────────────────────────┐
│          │  Top bar: [🔔] [⚙️] Nombre Usuario [Avatar IP]       │
│ Sidebar  ├──────────────────────────────────────────────────────┤
│ 240px    │                                                      │
│          │  ┌────────────────────────────────────────────────┐ │
│          │  │  HEADER: Título + count + botón acción         │ │
│          │  │  KPIs: 4 cards en fila                         │ │
│          │  │  TOOLBAR: search + filtros + toggle + dropdowns│ │
│          │  │  CONTENT: Tabla o Cards (según toggle)         │ │
│          │  │  PAGINATION: footer de tabla                   │ │
│          │  └────────────────────────────────────────────────┘ │
│          │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

---

### 1. Header de Página

```
Proveedores                              (12)        [+ Añadir proveedor]
Gestión de cadenas de supermercados y sus fuentes de datos
```

- Título "Proveedores" en 24px bold forest
- Badge count `(12)` en pill pequeño lime/forest al lado del título
- Subtítulo en 14px muted
- Botón "+ Añadir proveedor" a la derecha: pill forest con texto lime, ícono `+`

---

### 2. Fila de KPIs (4 cards)

Grid responsive: 4 columnas en desktop, 2 en tablet, 1 en mobile.

#### Card 1 — Total Proveedores
```
┌──────────────────────────────┐
│  Total proveedores       [⋯] │
│                              │
│       12                     │
│  +2 este mes  [pill lime]   │
│                              │
│  ▁ ▃ ▂  ▄ ▇ ▆              │  ← mini bar chart
└──────────────────────────────┘
```

#### Card 2 — Por Mercado
```
┌──────────────────────────────
│  Por mercado             [] │
│                              │
│       DO  8                  │
│       US  3                  │
│       CO  1                  │
│                              │
│         ╭──                 │  ← mini donut chart
│        ╱    ╲                │
│        ╲    ╱                │
│         ──╯                 │
└──────────────────────────────┘
```

#### Card 3 — Con Fuente Activa
```
┌──────────────────────────────┐
│  Con fuente activa       [⋯] │
│                              │
│       10                     │
│  83% del total  [pill lime] │
│                              │
│      ╭────╮                  │  ← radial gauge semicircular
│    ╭─╯    ╰─╮                │     83% verde, 17% gris
│    ╰────────╯                │
──────────────────────────────┘
```

#### Card 4 — Por Plataforma
```
┌──────────────────────────────┐
│  Por plataforma          [⋯] │
│                              │
│  VTEX    ████████░░  45%     │
│  Magento █████░░░░░  30%     │
│  Shopify ████░░░░░░  25%     │
│                              │
└──────────────────────────────
```

**Estilo de cada KPI card:**
- Fondo blanco, borde 1.5px sutil, `rounded-[50px]` squircle
- Padding 16px
- Label arriba en 11px semibold uppercase forest
- Valor grande en 40px semibold forest tabular-nums
- Subtexto en 11px muted
- Badge de delta: pill lime con texto forest (ej: "+2 este mes")
- Chart debajo del valor
- Botón kebab (⋯) en esquina superior derecha: círculo lime pequeño (24px)

---

### 3. Toolbar

```
┌────────────────────────────────────────────────────────────────────┐
│ [🔍 Buscar proveedor... ⌘F]  [🔽]  [▦][☰]      [Mostrar todos ] [Acciones ▾] │
────────────────────────────────────────────────────────────────────
```

**Cluster izquierdo:**
- **Search pill:** rounded-full, 36px height, 272px width, borde `#8DAEAE/40`, fondo `#B0B0B0/15`, ícono Search izquierda, input transparente sin borde, badge `⌘F` forest a la derecha
- **Botón filtros:** círculo 36px, fondo lime, ícono funnel forest
- **View toggle:** pill blanco con padding 4px, dos chips redondos 26px (ícono grid `▦` e ícono lista `☰`), chip activo = fondo lime, inactivo = fondo `#D9D9D9`

**Cluster derecho:**
- **"Mostrar todos" dropdown:** pill lime, texto forest, ícono lista + chevron
- **"Acciones" dropdown:** pill forest, texto lime, ícono check-list + chevron

---

### 4. Vista Tabla (vista por defecto)

Wrapper: `rounded-2xl`, borde sutil, fondo blanco, sombra suave.

#### Headers de Columna

| ☐ | Logo | Nombre ▲ | Mercado | Tipo | Plataforma | Fuente | Estado | Acciones |
|---|------|----------|---------|------|------------|--------|--------|----------|

Headers: fondo gris muy claro `#F9FAFB`, 44px height, texto 13px semibold muted. Columna Nombre sortable con triángulo sólido verde.

#### Filas de Datos

| | 🍃 | Bravo | DO 🇴 | Supermarket | VTEX | www.bravo.do | 🟢 Activa |  |
|---|---|-------|--------|-------------|------|-------------|-----------|---|
| | 🏪 | Carrefour | DO 🇩🇴 | Supermarket | Magento | www.carrefour.do | 🟢 Activa | ⋯ |
| | 🔴 | Jumbo | DO 🇩🇴 | Supermarket | VTEX | www.jumbo.do | 🟢 Activa | ⋯ |
| | 🔴 | Merca Jumbo | DO 🇩🇴 | Supermarket | VTEX | — | 🟡 Sin fuente | ⋯ |
| | 🟢 | Nacional | DO 🇩🇴 | Supermarket | VTEX | www.nacional.do | 🟢 Activa | ⋯ |
| |  | Plaza Lama | DO 🇩🇴 | Supermarket | Shopify | www.plazalama.do |  Activa | ⋯ |
| | | Ritmo | DO 🇩🇴 | Supermarket | VTEX | www.ritmo.do |  Pausada | ⋯ |
| | 🔵 | Sirena | DO 🇩 | Supermarket | Magento | www.sirena.do | 🟢 Activa | ⋯ |
| | | Walmart | US 🇺 | Supermarket | VTEX | www.walmart.com | 🟢 Activa | ⋯ |
| | | Éxito | CO 🇨 | Supermarket | Magento | www.exito.com | 🟡 Sin fuente | ⋯ |

#### Detalles de Fila

- **Checkbox:** cuadrado squircle 18px, se llena lime con check curvo al seleccionar
- **Logo:** thumbnail 32x32px, rounded-lg, logo real de la cadena
- **Nombre:** 14px medium body, sortable
- **Mercado:** badge pill con emoji bandera + código (DO 🇩)
- **Tipo:** badge pill `bg-lime/20 text-forest` → "Supermarket"
- **Plataforma:** badge pill con color por plataforma:
  - VTEX → fondo verde suave
  - Magento → fondo naranja suave
  - Shopify → fondo morado suave
  - REST → fondo azul suave
- **Fuente:** URL truncada con ellipsis, 13px muted, o "—" si no tiene
- **Estado:** pill con punto de color:
  - 🟢 `bg-green-100 text-green-700` → "Activa"
  - 🟡 `bg-amber-100 text-amber-700` → "Sin fuente"
  - 🔴 `bg-rose-100 text-rose-700` → "Pausada"
- **Acciones:** botón círculo lime 28px con ícono `⋯`, abre dropdown:
  - Ver detalle (ícono Eye verde)
  - Editar (ícono Pencil naranja)
  - Gestionar fuentes (ícono Database azul)
  - Eliminar (ícono Trash2 rojo, destructive)

**Fila seleccionada:** fondo `lime/10`

---

### 5. Paginación

```
┌────────────────────────────────────────────────────────────────────┐
│ Mostrar [10 ] por página          1-10 de 12          ‹ 1 2 ›    │
└────────────────────────────────────────────────────────────────────┘
```

- Borde superior sutil
- 3 secciones: page-size selector (5/10/20/50) | "X-Y de Z" | pagination buttons
- Texto 13px muted
- Botones de página: rounded-full, activo = lime

---

### 6. Vista Cards (toggle desde toolbar)

Grid responsive: 3 columnas desktop, 2 tablet, 1 mobile. Gap 16px.

```
┌─────────────────────────────┐
│  [⋯]                        │  ← kebab top-right
│                             │
│        [LOGO 64x64]         │  ← logo centrado, rounded-xl
│                             │
│          Bravo              │  ← nombre 16px bold, centrado
│                             │
│    [DO 🇩🇴]  [Supermarket]  │  ← badges centrados
│                             │
│   VTEX  ·  www.bravo.do    │  ← plataforma + URL, 12px muted
│                             │
│   ● Activa                  │  ← estado con punto de color
│                             │
│  [Editar]    [Fuentes]      │  ← 2 botones outline
└─────────────────────────────┘
```

- Card: fondo blanco, `rounded-2xl`, borde sutil, sombra suave, padding 20px
- Hover: elevación sutil + borde `lime/30`

---

### 7. Modal: Crear / Editar Proveedor

Overlay: fondo negro 40% opacidad, backdrop-blur-xs.

Modal: 512px max-width, `rounded-[28px]` squircle, fondo blanco, sombra grande.

```
┌──────────────────────────────────────────┐
│  []  Nuevo proveedor              [✕] │
│──────────────────────────────────────────│
│                                          │
│  Nombre                                  │
│  [________________________________]      │
│                                          │
│  Mercado                    Tipo         │
│  [DO 🇴 ▾]               [Supermarket ]│
│                                          │
│  Plataforma                              │
│  [VTEX ]                                │
│                                          │
│  Logo URL (opcional)                     │
│  [🔗 https://...                     ]   │
│                                          │
│──────────────────────────────────────────│
│  [🔄 Limpiar]          [Crear proveedor] │
└──────────────────────────────────────────┘
```

- **Header:** ícono Store en círculo `bg-lime/25` 40px, título "Nuevo proveedor" 20px bold forest, botón X ghost rounded-full
- **Body:** padding 24px, space-y 24px
- **Inputs:** rounded-xl, borde `#E5E7EB`, focus ring lime
- **Selects:** mismo estilo, con chevron
- **Footer:** borde superior sutil, padding 16px 24px, "Limpiar" outline con ícono RotateCcw izquierda, "Crear proveedor" primary pill forest/lime

**Modal Editar:** idéntico pero título "Editar [Nombre]" y campos pre-llenados.

---

### 8. Modal: Gestionar Fuentes

Modal más ancho: 672px max-width.

```
┌────────────────────────────────────────────────────┐
│  [📡]  Fuentes de Bravo                       [✕] │
│────────────────────────────────────────────────────│
│                                                    │
│  Fuente principal                                  │
│  ┌──────────────────────────────────────────────┐ │
│  │ Platform:   [VTEX ▾]                         │ │
│  │ Base URL:   [https://www.bravo.do/api/v1  ]  │ │
│  │ Headers:    [{"Store": "bravo-do"}        ]  │ │  ← textarea JSON
│  │ Endpoints:  [                              ] │ │  ← textarea JSON
│  │ Auth:       [                              ] │ │  ← textarea JSON
│  │                                              │ │
│  │  [⚡ Testear fuente]    [🗑 Eliminar fuente] │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  [+ Añadir otra fuente]                            │  ← botón outline dashed
│                                                    │
│────────────────────────────────────────────────────│
│  [Cancelar]                      [Guardar cambios] │
└────────────────────────────────────────────────────┘
```

---

## Sidebar de Navegación (contexto)

```
🟢 Cuadra  []

Menú
  📊 Dashboard  ˅
     Usuarios
     Noticias
     Save

Usuarios  ˅
  👥 Soporte a usuarios
  👥 Gestión de usuarios

Noticias  ˅
   Publicaciones

Save  ˅
   Supermercado  ˅
     Métricas
     Cola de revisión
     ▶ Proveedores     ← ACTIVO (fondo lime/30, texto forest, rounded-xl)
     Fuentes
     Canasta curada
  💲 Productos Financieros

💬 Feedback
 Ayuda
```

- Sidebar 240px, fondo blanco
- Item activo: fondo `lime/30`, texto forest, rounded-xl, padding 8px 12px
- Íconos Lucide outline 20px
- Secciones colapsables con chevron

---

## Top Bar (contexto)

```
                                              [🔔] [⚙️] Ismael Porfirio Martínez Encarnación [IP]
```

- Derecha: ícono notificación, ícono settings, nombre usuario, avatar círculo lime con iniciales "IP"

---

## Datos de Ejemplo

| # | Nombre | Mercado | Tipo | Plataforma | Base URL | Estado |
|---|--------|---------|------|------------|----------|--------|
| 1 | Bravo | DO | Supermarket | VTEX | https://www.bravo.do/api | Activa |
| 2 | Carrefour | DO | Supermarket | Magento | https://www.carrefour.do | Activa |
| 3 | Jumbo | DO | Supermarket | VTEX | https://www.jumbo.do | Activa |
| 4 | Merca Jumbo | DO | Supermarket | VTEX | — | Sin fuente |
| 5 | Nacional | DO | Supermarket | VTEX | https://www.nacional.do | Activa |
| 6 | Plaza Lama | DO | Supermarket | Shopify | https://www.plazalama.do | Activa |
| 7 | Ritmo | DO | Supermarket | VTEX | https://www.ritmo.do | Pausada |
| 8 | Sirena | DO | Supermarket | Magento | https://www.sirena.do | Activa |
| 9 | Walmart | US | Supermarket | VTEX | https://www.walmart.com | Activa |
| 10 | Éxito | CO | Supermarket | Magento | https://www.exito.com | Sin fuente |
| 11 | Bancolombia | CO | Bank | REST | https://api.bancolombia.com | Activa |
| 12 | Mapfre | DO | Insurer | REST | https://api.mapfre.do | Activa |

---

## Notas de Estilo

- **NO usar emojis** en la UI (solo banderas de mercado). Íconos de Lucide outline stroke-width 2.
- **Esquinas squircle** en todos los contenedores principales. Si no es posible, border-radius generoso.
- **Espaciado generoso** y respirable. No comprimir elementos.
- **Jerarquía visual clara:** título → KPIs → toolbar → tabla. Separado por espacio, no líneas.
- **Hover states:** filas con `bg-muted/30`, botones con transición suave.
- **Contenedor principal** centrado con padding de página, fondo `bg-muted/60` rounded-32px.
- **La tabla** dentro de su propia card blanca rounded-2xl.

---

## Prompt para Generación de Imagen (DALL-E / ChatGPT)

> Genera un mockup de UI de alta fidelidad estilo Figma para una pantalla de administración web llamada "Proveedores" dentro del módulo "Save" de una app llamada "Cuadra". La UI está en español, light mode.
>
> **Layout completo:** Sidebar izquierdo de navegación de 240px con fondo blanco. Contiene secciones colapsables: Dashboard, Usuarios, Noticias, Save (expandido, mostrando Supermercado con sub-items: Métricas, Cola de revisión, **Proveedores** resaltado en verde lima, Fuentes, Canasta curada), Productos Financieros, Feedback, Ayuda. Top bar superior derecha con ícono de campana, engranaje, nombre "Ismael Porfirio Martínez Encarnación" y avatar circular verde lima con iniciales "IP".
>
> **Área principal** con fondo crema muy claro (#F5F5F0). Todo el contenido vive dentro de un gran contenedor con esquinas muy redondeadas (32px) y fondo gris-verdoso claro translúcido.
>
> **1. Header:** Título "Proveedores" en 24px bold verde oscuro (#1A3A2A), seguido de un badge pequeño "(12)" en verde lima, subtítulo "Gestión de cadenas de supermercados y sus fuentes de datos" en gris. A la derecha un botón pill verde oscuro con texto verde lima "+ Añadir proveedor".
>
> **2. Cuatro KPI cards** en fila horizontal, cada una con esquinas muy redondeadas (50px), fondo blanco, borde sutil. De izquierda a derecha:
>    - Card 1: Label "TOTAL PROVEEDORES" en 11px uppercase, valor "12" en 40px, badge "+2 este mes" en pill verde lima, mini bar chart con 7 barras verdes de distintas alturas abajo. Botón ⋯ verde lima arriba a la derecha.
>    - Card 2: Label "POR MERCADO", valores "DO 8, US 3, CO 1", mini donut chart con 3 segmentos verdes. Botón ⋯.
>    - Card 3: Label "CON FUENTE ACTIVA", valor "10", subtítulo "83% del total" en pill lime, radial gauge semicircular mostrando 83% en verde. Botón ⋯.
>    - Card 4: Label "POR PLATAFORMA", tres barras horizontales: "VTEX 45%" (barra verde larga), "Magento 30%" (barra naranja media), "Shopify 25%" (barra morada corta). Botón ⋯.
>
> **3. Toolbar** debajo de los KPIs: input de búsqueda pill redondeado "Buscar proveedor..." con ícono lupa y badge "⌘F" verde, botón de filtro círculo verde lima con ícono embudo, toggle de vista (dos chips redondos: grid y lista, el de lista activo en verde lima), y a la derecha dos dropdowns pill: "Mostrar todos" en verde lima y "Acciones" en verde oscuro.
>
> **4. Tabla** con esquinas redondeadas (16px), fondo blanco, borde sutil. Headers en gris claro: checkbox, Logo, Nombre (con triángulo de ordenamiento verde), Mercado, Tipo, Plataforma, Fuente, Estado, Acciones. 10 filas de datos con supermercados: Bravo, Carrefour, Jumbo, Merca Jumbo, Nacional, Plaza Lama, Ritmo, Sirena, Walmart, Éxito. Cada fila tiene: checkbox, thumbnail de logo 32px, nombre en texto oscuro, badge de mercado con bandera (DO🇩🇴, US🇸, CO🇨🇴), badge "Supermarket" en verde lima suave, badge de plataforma con color (VTEX verde, Magento naranja, Shopify morado), URL truncada en gris, badge de estado con punto de color (verde=Activa, amarillo=Sin fuente, rojo=Pausada), y botón de acciones círculo verde lima con tres puntos.
>
> **5. Paginación** en el footer de la tabla: "Mostrar [10] por página" a la izquierda, "1-10 de 12" al centro, botones de página "‹ 1 2 ›" a la derecha.
>
> **Paleta de colores:** Verde oscuro forest #1A3A2A para textos principales y botones primarios, verde lima #C2FB7E para acentos y estados activos, verde medio #007E62 para pills de datos, fondo crema #F5F5F0, cards blancas. Esquinas muy redondeadas en todo (squircle). Tipografía Inter sans-serif moderna. Estilo limpio, profesional, con mucho espacio en blanco. Light mode. Alta fidelidad tipo Figma.
