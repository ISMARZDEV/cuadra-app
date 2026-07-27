---
name: Cuadra Save — Web
description: Comparador de precios de supermercados y consola de curación OFV, en verde Cuadra.
colors:
  brand: "#16a34a"
  lime: "#7eb427"
  brand-forest: "#015442"
  brand-lime: "#bbec6c"
  brand-green: "#93d454"
  background: "#ffffff"
  foreground: "#111827"
  card: "#ffffff"
  secondary: "#e3f0de"
  secondary-foreground: "#052e16"
  muted: "#e8ede7"
  muted-foreground: "#6b7280"
  border: "#dbead9"
  destructive: "#ef4444"
  ring: "#16a34a"
  sidebar: "#ffffff"
  sidebar-foreground: "#1c614e"
  sidebar-accent: "#daff9f"
  sidebar-accent-foreground: "#015442"
  sidebar-accent-border: "#b7e36f"
  sidebar-border: "#e2efce"
  sidebar-muted: "#718b8b"
  dark-background: "#000406"
  dark-muted: "#161616"
  dark-card: "#0e0e0e"
  dark-border: "#002523"
  dark-foreground: "#f7faf7"
typography:
  display:
    fontFamily: "'Kantumruy Pro Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
  headline:
    fontFamily: "'Kantumruy Pro Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  title:
    fontFamily: "'Kantumruy Pro Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
  body:
    fontFamily: "'Kantumruy Pro Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "'Kantumruy Pro Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-lime}"
    textColor: "{colors.brand-forest}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "#aee05c"
  button-primary-public:
    backgroundColor: "{colors.brand}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
  button-destructive:
    backgroundColor: "#fdecec"
    textColor: "{colors.destructive}"
    rounded: "{rounded.md}"
    height: "36px"
  badge-category:
    backgroundColor: "#edfff2"
    textColor: "#034842"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 12px"
  sidebar-item-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
    rounded: "{rounded.full}"
    padding: "0 12px"
---

# Design System: Cuadra Save — Web

## Overview

**Creative North Star: "La Mesa del Curador"**

Esta no es una vitrina: es una superficie de trabajo. El operador de Save pasa horas mirando datos
crudos de tres cadenas a la vez, decidiendo si dos filas son el mismo producto. El sistema visual
existe para que esa decisión sea rápida cuando el dato es claro, y **deliberadamente lenta cuando no
lo es**. Densidad alta, jerarquía por peso y tono antes que por tamaño, y las herramientas al alcance
sin taparse entre sí.

El verde Cuadra (#16a34a) es la única voz de color de la interfaz, y se gasta poco. Todo lo demás
—superficies, bordes, texto secundario— vive en una neutral verdosa fría (#e8ede7, #dbead9) que
mantiene la marca presente sin gritarla. El color saturado que sí aparece en volumen no pertenece a
la marca sino al **dato**: los catorce colores de categoría, que codifican qué es un producto.
Cuando el verde de marca aparece, significa acción o estado del sistema; nunca decoración.

La misma app viste dos superficies con temperaturas distintas. El **admin/OFV** es denso y tabular:
información por pulgada. El **Save público** es respirado y móvil-primero. Comparten paleta, radios
y tipografía (Kantumruy Pro); lo que NO comparten es el ritmo — densidad, escala y aire.

**Key Characteristics:**
- Densidad tabular: `0.875rem` es el cuerpo, `0.75rem` los metadatos; casi nada más
- Plano por defecto, con bordes hairline; la sombra solo pertenece a lo que flota
- Radios generosos (12–16px) y píldoras completas para todo lo que clasifica
- El verde de marca es raro y significa algo; el color en volumen es dato, no decoración
- Toda cifra en `tabular-nums`, siempre
- Tema claro y oscuro con la misma marca: el oscuro es casi negro (#000406), no gris azulado

## Colors

Una neutral verdosa fría sostiene toda la interfaz, para que el único verde saturado que aparezca
sea el que quiere decir algo.

### Primary

**Las dos superficies tienen voces de acción DISTINTAS, y es deliberado.** Verificado por conteo:
`bg-brand`/`text-brand` (#16a34a) tienen **cero usos en todo `features/admin`**; la consola corre
sobre el par lima+bosque del Figma (107 usos). El verde Cuadra es la voz del Save público.

- **Lima de Marca** (`#bbec6c` fondo / `#015442` texto): **la voz de acción de la consola admin.**
  Botón primario, chips de acción, filtros activos, aceptar sugerencia. Es el par del Figma del
  admin y tiene 83 + 24 usos — no es una desviación, es el sistema.
- **Verde Bosque** (`#015442`): el par de texto del lima, y el color de las etiquetas de sección del
  sidebar. Nunca fondo de superficie grande.
- **Verde Cuadra** (`#16a34a`): la voz de acción del **Save público**, y en el admin queda para el
  anillo de foco (`--ring`) y las series positivas del chart. Constante en ambos temas — una marca
  es una marca.
- **Lima de Acento** (`#daff9f` fondo / `#b7e36f` borde): exclusivo del ítem activo del sidebar. Es
  un lima más pálido que el de los botones, y esa diferencia es lo que evita que el sidebar compita
  con las acciones de la página.

### Secondary
- **Verde Pálido** (`#e3f0de`): fondos de superficie secundaria y chips en reposo. Su par de texto
  (`#052e16`) es casi negro verdoso, no gris.

### Tertiary
- **Lima Cuadra** (`#7eb427`) y **Verde Gráfico** (`#93d454`): reservados para barras y líneas de
  los KPI charts. Están fuera del vocabulario de UI — si aparecen en un botón, algo se rompió.

### Neutral
- **Blanco** (`#ffffff`): fondo de página y de card en tema claro. La card no se distingue del fondo
  por color, sino por borde y radio.
- **Tinta** (`#111827`): texto principal. Azulado-oscuro, nunca negro puro.
- **Neutral Verdosa** (`#e8ede7`): superficie apagada, fondo de fila en hover, relleno de skeleton.
- **Gris Medio** (`#6b7280`): texto secundario, unidades, timestamps, estados vacíos.
- **Borde Verdoso** (`#dbead9`): el hairline que separa TODO. Aplicado globalmente a `*` en
  `globals.css` — es el separador por defecto de este sistema, no una excepción.
- **Rojo Alerta** (`#ef4444`): destructivo y error. Nunca en volumen: el botón destructivo lo usa
  como texto sobre un lavado del mismo tono al 10%.

### Neutral (tema oscuro)
- **Casi Negro** (`#000406`) → **Apagado** (`#161616`) → **Card** (`#0e0e0e`) → **Borde**
  (`#002523`). Una rampa por elevación, no por gris. El oscuro de este sistema tiene temperatura
  verde-azulada, jamás gris neutro.

### Named Rules

**La Regla de la Voz Única.** Cada superficie tiene UN verde de acción, y no se mezclan. En el
**admin** ese verde es el lima `#bbec6c` sobre texto bosque `#015442`; en el **Save público** es el
verde Cuadra `#16a34a`. El verde no decora: aparece en la acción y en nada más. Si una pantalla
tiene tres verdes compitiendo por significar "esto es accionable", dos son incorrectos.

**La Regla de la Frontera.** El admin no usa `bg-brand`/`text-brand`, y el Save público no usa
`brand-lime`/`brand-forest`. La verificación es un grep, no una opinión: si un token cruza la
frontera, es un error, no una variante.

**La Regla del Color como Dato.** El color saturado en volumen pertenece a la categoría del producto,
no a la marca ni al estado. Los catorce pares `bg`/`text` son **normativos y cerrados**, y su fuente
de verdad es `src/features/admin/components/category-colors.ts` (Figma nodo `502:6713`). Nunca se
reinterpretan, se re-derivan ni se aproximan; un slug desconocido cae al neutro `#f1f5f4`/`#64748b`,
jamás a un hueco vacío.

**La Regla de la Marca Constante.** `--primary`, `--brand-forest`, `--brand-lime` y `--brand-green`
tienen el MISMO valor en claro y oscuro. Cuando el contraste no alcanza sobre fondo oscuro, se
resuelve con una utilidad `dark:` en el punto de uso — nunca redefiniendo el token de marca.

## Typography

**Display Font:** Kantumruy Pro Variable — **toda la web** (admin/OFV + Save público)
**Body Font:** la misma; `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` queda solo como
fallback de la cadena
**Label/Mono Font:** ninguna familia aparte; los números usan `tabular-nums` sobre la fuente base

**Character:** Neutral y de trabajo, por decisión. La consola no busca personalidad tipográfica: busca
que trece columnas quepan y se lean. Kantumruy Pro se carga por `@fontsource-variable/kantumruy-pro`
**una sola vez**, en `globals.css`, que es también donde se declara la familia (`--font-sans` + `body`)
— el subárbol admin la HEREDA y no declara familia propia.

**Coste.** El paquete parte el woff2 por `unicode-range`: con contenido es/en/pt el navegador baja
solo el subset `latin` (**33 KB**; `latin-ext` 2.1 KB si aparecen sus glifos) y **nunca** el `khmer`
(56 KB). Con `font-display: swap` no bloquea el LCP del Save público.

**Techo de peso.** El eje variable es `wght 100–700`: **no hay 800 ni 900**. Cualquier
`font-extrabold`/`font-black` se aplasta a 700 — usá `font-bold` como peso máximo y hacé la jerarquía
con tono, no con más peso.

### Hierarchy
- **Display** (700, `1.5rem`/`2rem`): título de pantalla y cifras de KPI. Escaso — 8 usos en toda la
  consola.
- **Headline** (600, `1.125rem`): encabezado de panel dentro de una pantalla.
- **Title** (600, `1rem`): título de card y de modal.
- **Body** (400, `0.875rem`/`1.25rem`): el tamaño por defecto de la consola. Celdas de tabla,
  etiquetas de formulario, prosa. Es el 55% de todo el texto.
- **Label** (500, `0.75rem`): metadatos, badges, cabeceras de columna, timestamps, unidades. El 40%
  restante.

### Named Rules

**La Regla de los Dos Tamaños.** La consola se construye con `0.875rem` y `0.75rem`. Todo lo demás
es excepción y necesita justificarse. La jerarquía se hace con **peso y tono**, no con tamaño: subir
de tamaño en una tabla densa rompe el ritmo de la fila.

**La Regla de las Cifras Alineadas.** Todo número que un operador pueda comparar en vertical
—precio, confianza, conteo, porcentaje— lleva `tabular-nums`. Sin ella, las columnas bailan y el ojo
pierde la comparación, que es el trabajo entero de esta pantalla.

**La Regla de la Fuente Única.** La web tiene UNA tipografía y se declara en UN solo archivo:
`globals.css` (import del `@font-face` + `--font-sans` + `body`). Ningún layout, componente
compartido, página o primitivo de `components/ui*` importa una fuente ni declara `font-family`
propia — todo hereda. Una familia hardcodeada en un componente es drift esperando ocurrir.

## Layout

El admin es un shell de tres franjas: `EcosystemRail` fijo de 70px flush-left (shell oscuro del
ecosistema aispace), el `Sidebar` de Base UI desplazado 70px en desktop mediante una regla scopeada
a `.admin-shell`, y el `SidebarInset` con el contenido. En móvil el rail se oculta y el sidebar pasa
a sheet.

El ritmo de espaciado es la escala de Tailwind, concentrada en cuatro pasos: `4px` para separar un
ícono de su etiqueta, `8px` dentro de un control, `16px` entre elementos de un panel, `24px` entre
paneles y como padding interno de card. El padding lateral del contenido es `16px` y sube a `24px`
desde `md`.

Los paneles del detalle se apilan en una sola columna de arriba abajo, en orden de decisión: primero
qué es el producto, después la evidencia que lo sostiene, después el análisis, y al final la
actividad. Nada compite por el primer viewport salvo la identidad del producto.

**El contenedor de tabla scrollea solo.** `SidebarInset` lleva `min-w-0` y `Table` envuelve en un
`div` con `overflow-x-auto`. Sin ese `min-w-0` el flex item toma el ancho intrínseco de trece
columnas `whitespace-nowrap` y la página entera scrollea horizontal, metiéndose bajo el sidebar. El
scroll horizontal pertenece a la tabla; **el body nunca scrollea en horizontal**.

## Elevation & Depth

**Este sistema es plano.** Las superficies se separan por borde hairline y por radio, no por sombra.
El borde por defecto está aplicado globalmente (`* { border-color: var(--border) }`), así que
declarar un borde es barato y consistente. En tema oscuro el trabajo lo hace la rampa tonal por
elevación (`#000406` → `#161616` → `#0e0e0e`), con el borde `#002523` reforzando.

La sombra está reservada para lo que **realmente flota sobre la página**: dropdowns, sheets,
modales, popovers y toasts. Un panel que no flota no lleva sombra.

### Shadow Vocabulary
- **Flotante** (`shadow-xl`): overlays que se despegan de la página — sheets, modales, dropdowns.
- **Apoyo** (`shadow-sm`): elevación mínima para un control que se levanta sobre su fondo, como el
  botón `outline`. No es el lenguaje de separación de paneles.

### Named Rules

**La Regla de lo Plano por Defecto.** Un panel en reposo no tiene sombra. Si necesita separarse, usa
borde y radio. Ocho paneles con sombra compiten entre sí y ninguno gana.

**La Regla del Borde Único.** Un hairline `--border` basta para separar. Nunca se apila borde +
sombra + cambio de fondo sobre el mismo límite: es la misma frase dicha tres veces.

## Shapes

Radios generosos y consistentes. La escala nace de `--radius: 0.75rem` (12px) y deriva `md` (10px) y
`sm` (8px). Las cards y contenedores usan 12px; los contenedores grandes y las superficies del rail
llegan a 16px y, en piezas de shell fieles al Figma, a 28–32px.

**Todo lo que clasifica es una píldora.** Badges de categoría, chips de estado, contadores y el ítem
activo del sidebar usan `rounded-full`. Es el radio más frecuente del sistema (133 usos) y funciona
como señal de tipo: si es una píldora, es una etiqueta, no un botón.

Los controles interactivos —inputs y celdas de selección— se quedan en 10px.

> **SIN RESOLVER — la forma del botón del admin.** Este documento decía que "un botón nunca es una
> píldora". **Medido, es falso**: de los botones del admin con forma explícita, 28 son
> `rounded-full` y 1 es `rounded-md`. La píldora ES la forma del botón en la consola, igual que el
> lima es su color — ambas cosas vienen del Figma, y ambas contradecían lo que este documento
> derivó del primitivo `Button`.
>
> La consecuencia real: en el admin **la forma NO distingue un botón de una etiqueta**, porque los
> dos son píldoras. Eso puede ser aceptable (lo dice el Figma vinculante) o ser una debilidad de
> escanabilidad que valga la pena corregir. **Está sin decidir.** Hasta que se decida, ningún
> comando debe restilar botones apoyándose en la regla vieja.

## Components

### Buttons
- **Shape:** esquinas suaves (10px, `rounded-md`); alto fijo de 36px por defecto, con `xs` a 24px,
  `sm` a 32px y `lg` a 40px.
- **Primary (admin):** lima `#bbec6c` con texto bosque `#015442`, padding horizontal `10px`, peso
  `medium`, `0.875rem`. Sin sombra — la sombra de apoyo pertenece al `outline`, no al primario.
- **Primary (Save público):** verde Cuadra sólido con texto blanco, mismas medidas.
- **Hover / Focus:** el primario aclara a `primary/80`. El foco es un anillo de 3px en
  `ring/50` más borde en `--ring` — visible siempre, nunca `outline: none` a secas. Al presionar,
  el botón se desplaza 1px hacia abajo (`active:translate-y-px`): el único movimiento del sistema, y
  es táctil, no decorativo.
- **Outline:** fondo de página, borde `--border`, `shadow-xs`. Es el botón de acción secundaria.
- **Ghost:** sin fondo hasta el hover, donde toma `--muted`. Para acciones terciarias y de tabla.
- **Destructive:** invertido respecto a la convención — texto rojo sobre lavado al 10%, no rojo
  sólido. Una acción peligrosa debe leerse como advertencia, no como una invitación a hacer clic.

### Chips / Badges
- **Categoría:** píldora con el par `bg`/`text` exacto del slug, `0.75rem`, peso `medium`, padding
  `2px 8px`, sin borde ni ícono. El color ES la información.
- **Estado / conteo:** píldora sobre `--secondary` o `--muted` con texto de par correspondiente.
- **Fallback:** un slug desconocido da chip neutro con copy localizado, nunca una celda vacía.

### Cards / Containers
- **Corner Style:** 12px (`rounded-xl`).
- **Background:** `--card`, que en tema claro es blanco puro sobre fondo blanco — el borde hace todo
  el trabajo.
- **Shadow Strategy:** ninguna en reposo. Ver Elevation & Depth.
- **Border:** hairline `--border`.
- **Internal Padding:** `24px`, con `24px` de gap entre bloques internos.

### Inputs / Fields
- **Style:** fondo transparente, borde `--input`, 10px de radio, alto 36px.
- **Focus:** anillo de 3px en `ring/50` más borde `--ring`, igual que el botón. El foco es un único
  lenguaje en todo el sistema.
- **Error:** `aria-invalid` dispara borde e anillo destructivos. El estado inválido se comunica por
  atributo ARIA, no por una clase suelta.

### Tables
El componente central de la consola. Filas separadas por `border-b`, hover en `muted/50`, selección
en `--muted`, cuerpo en `0.875rem` y cabeceras en `0.75rem`. Sin cebra: las líneas bastan y el rayado
compite con los badges de color. Contenedor con `overflow-x-auto` propio.

### Navigation (Sidebar)
Blanco con texto verde bosque. El ítem activo es una **píldora lima** (`#daff9f` con borde
`#b7e36f` y texto `#015442`) — el acento de color más fuerte de toda la interfaz, y el único que
ocupa área. Las etiquetas de sección van en `0.75rem` verde bosque. En oscuro invierte a fondo
`#000406` con acento `#26421d`/`#cdf19a`. En móvil el sidebar es un sheet; el rail desaparece.

### Signature: el par Evidencia
El patrón que define esta consola: cada dato derivado se muestra junto a **de dónde salió**. Método
de match y confianza, tienda de origen, corrida que lo creó, procedencia de la imagen. Visualmente
es una fila de dos niveles: el valor en `0.875rem` y su procedencia en `0.75rem` `--muted-foreground`
justo debajo o al lado. Lo decidido por una persona y lo decidido por el sistema **nunca comparten
tratamiento visual**.

## Do's and Don'ts

### Do:
- **Do** usar `0.875rem` y `0.75rem` para casi todo, y crear jerarquía con peso (`600`) y tono
  (`--muted-foreground`) en vez de tamaño.
- **Do** poner `tabular-nums` en toda cifra comparable en vertical: precio, confianza, conteo, %.
- **Do** separar superficies con el hairline `--border` y radio, dejando la sombra para overlays.
- **Do** tomar los colores de categoría de `category-colors.ts`, y dejar que un slug desconocido caiga
  al neutro con copy localizado.
- **Do** mostrar junto a cada dato derivado su procedencia, y distinguir siempre lo humano de lo
  automático.
- **Do** mantener el anillo de foco de 3px en todo elemento interactivo, en ambos temas.
- **Do** confinar el scroll horizontal al contenedor de la tabla.
- **Do** escribir en lenguaje de operador, con capitalización tipo oración y sin nombres de tabla o
  de columna del backend filtrados a la pantalla.

### Don't:
- **Don't** importar una fuente ni declarar `font-family` fuera de `globals.css`. Kantumruy Pro es
  la fuente de TODA la web y se hereda; una segunda declaración es drift.
- **Don't** usar `font-extrabold` ni `font-black`. El eje de Kantumruy Pro llega a 700: se aplastan
  a `font-bold` y solo mienten sobre la jerarquía.
- **Don't** redefinir un token de marca en `.dark`. Si falta contraste, se resuelve con `dark:` en
  el punto de uso.
- **Don't** poner sombra a un panel en reposo, ni apilar borde + sombra + cambio de fondo sobre el
  mismo límite.
- **Don't** usar `--lime` (`#7eb427`) ni `--brand-green` (`#93d454`) en controles de UI: pertenecen
  a los charts. Ojo con el parecido de nombre: el botón del admin usa `--brand-lime` (`#bbec6c`),
  que es otro token.
- **Don't** cruzar la frontera de superficie: `bg-brand` en el admin, o `bg-brand-lime` en el Save
  público. Un grep lo verifica.
- **Don't** escribir un `<button>` a mano. Si el primitivo `Button` no tiene la variante que
  necesitás, se le agrega la variante — no se recrea el botón en la pantalla. Cada botón a mano
  reintroduce forma, color, foco y sombra equivocados a la vez.
- **Don't** restilar la forma de los botones del admin apoyándose en este documento: la regla vieja
  ("un botón nunca es una píldora") resultó falsa contra el código y la decisión está abierta. Ver
  la nota en Shapes.
- **Don't** rellenar el rojo destructivo en sólido; se usa como texto sobre lavado al 10%.
- **Don't** rayar las tablas en cebra ni subir el tamaño de fuente dentro de una fila densa.
- **Don't** dejar un hueco vacío donde falta un dato: siempre chip neutro, guion o estado vacío con
  su explicación.
- **Don't** hacer que la página scrollee en horizontal para acomodar una tabla ancha.

<!-- Deuda registrada, no resuelta:
     1. Varios pares de color de categoría no alcanzan WCAG 2.2 AA en texto pequeño (p. ej.
        #e18200 sobre #ffedd4 ≈ 2.6:1). Los colores son vinculantes por decisión del usuario, así
        que la salida es peso, tamaño, borde o rol del badge — no cambiar los valores.
     2. La superficie pública de Save heredó la pila de fuente del sistema; nunca fue una decisión
        de diseño. Queda abierta a propuesta vía `/impeccable typeset`.
     3. Faltan 2 de los 16 slugs de taxonomía sin color en el Figma (`lacteos-huevos`, `mascotas`):
        hoy caen al neutro. -->
