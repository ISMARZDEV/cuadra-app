# SDD: admin-workspace (top bar + workspace/tabla del admin)

> Modo: Interactivo · Artefactos: este único .md · Strict TDD: ON · Rama: `feat/admin-workspace` (off developer, con el sidebar ya mergeado)

Segunda fase de la consola OFV. El sidebar + rail ya están en developer (PR #21). Ahora: **top bar** + **workspace/body** (pantalla Cola de revisión: toolbar con search/filtros/toggle/dropdowns + TABLA con badges de categoría y logos de provider + paginación) + **componentes reusables**. Fiel al Figma nodo 483:12411.

## Fase 1 — EXPLORE

### Design target — Figma
- **Pantalla completa**: nodo `483:12411` (`https://www.figma.com/design/MJlNTbiNLuUl4ythDuAPDX/Cuadra-App?node-id=483-12411`).
- **Categorías**: nodo `502:6713` (colores extraídos abajo).
- **Logos de providers (supermercados)**: nodo `502:6717` (se descargan en apply).

### Categorías — colores exactos (del nodo 502:6713)
Cada categoría: `bg` (fondo de card / badge) · `text` (título = texto del badge) · `desc` (descripción, tono más oscuro). Fuentes del Figma: título Raleway Bold, desc SF Pro — pero el **badge** de la tabla usará estos COLORES con la fuente del admin (Inter). El badge = pill con `bg` + `text`.

| # | Categoría | badge bg | badge text | desc |
|---|-----------|----------|------------|------|
| 1 | Panadería & Tortillería | `#ffedd4` | `#e18200` | `#704100` |
| 2 | Bebés | `#f7f7f7` | `#979797` | `#5c5b5a` |
| 3 | Bebidas | `#ffe2f8` | `#d308a2` | `#940070` |
| 4 | Frutas & Verduras | `#dfffc8` | `#335e00` | `#013116` |
| 5 | Snacks & Dulces | `#ffe7e7` | `#e1000b` | `#700002` |
| 6 | Despensa & Abarrotes | `#edfff2` | `#034842` | `#5c5b5a` |
| 7 | Bebidas (alcohólicas) | `#ffeded` | `#952325` | `#581112` |
| 8 | Cuidado del Hogar | `#d1feff` | `#239b9d` | `#005152` |
| 9 | Cuidado Personal | `#e9fff5` | `#00904c` | `#00522b` |
| 10 | Embutidos & Delicatessen | `#edfbff` | `#29a2c6` | `#005d7a` |
| 11 | Carnes & Pescados | `#fffbec` | `#937800` | `#745f00` |
| 12 | Salud & Farmacia | `#e8fff8` | `#169672` | `#036348` |
| 13 | Ofertas de la semana | `#faffe3` | `#475537` | `#5c5b5a` |
| 14 | Escolares & Oficina | `#f3edff` | `#8559e2` | `#2d008b` |

⚠️ El nodo 502:6713 tiene **14** categorías; el usuario dijo **16 "por ahora"** → faltan 2 (pedir / confirmar cuáles). "Bebidas" aparece 2× (energéticas #3 vs alcohólicas #7) — resolver con la taxonomía real del backend (¿son 2 categorías distintas o subcategorías?).

### Estado del código actual (del explore)
- **Pantalla review-queue**: `resources/save-matching/components/ReviewQueueListScreen.tsx` → `<table>` HTML crudo (no `Table` primitivo — no existe). Toolbar inline (filtros: `provider_id` texto, `method` Select, `confidence_min/max`, `order_by` Select). Bulk-select (checkbox + bulk approve/reject). Paginación manual prev/next (NO usa `ui/pagination.tsx`). Refresh vía `window.location.reload()` (NO `useAdminList` — inconsistencia). Columnas hoy: checkbox · Confianza · Producto (name+brand) · Tamaño · Tienda (`provider_name` TEXTO plano) · Método (string) · Candidatos.
- **Data shape** (`AdminReviewQueueRowDto`, `apps/api/.../application/dtos.py:350`): `match_id, store_product_id, confidence, method, provider_id, provider_name, store_product_name?, store_product_brand?, store_product_size_text?, candidate_count, created_at`. **NO hay campo categoría. NO hay logo de provider en la row** (solo `provider_name`). Detail tiene `store_product_image_url`.
- **Categorías**: taxonomy backend existe (`domain/taxonomy.py`, `application/categories.py`, doc `docs/research/save-fable/Categorias_y_Subcategorias.md` ~16 top). Mapa de ÍCONO por categoría existe (`features/save/components/category-icons.tsx`), pero **NO hay mapa de COLOR ni componente de badge**. Las rows de review NO cargan categoría.
- **Providers/logos**: `Provider.logo_url` existe; componente `ProviderBadge` (img o texto fallback) existe y testeado. Pero la row DTO NO trae `provider_logo_url` → hay que agregarlo.
- **Inventario UI**: Radix (`ui/`): badge, button, card, checkbox, dropdown-menu (sin usar en admin), input, pagination (sin usar en admin), select, toggle-group, etc. Base UI (`ui-base/`): button, input, separator, sheet, sidebar, skeleton, sonner, tooltip. **Falta para el Figma**: `Table`, `Avatar` (no existe), uso de `DropdownMenu` (para "Acciones ⋯" y "Mostrar todos"), badge de categoría con color, paginación numerada cableada, view-toggle (el `ToggleGroup` ya existe y se reusa).
- **Otros recursos admin**: Providers/Sources/Basket usan listas `<ul>/<li>` tipo card (no tabla). Hook `useAdminList<T>` (`shell/use-admin-list.ts`) para refetch tras mutación (review-queue NO lo usa — gap).
- **Top bar**: **NO existe**. Montaría dentro de `SidebarInset`, arriba de `children`. `MeResponse` tiene `name`/`email` pero **NO avatar/foto**; `resolveAdminIdentity`/`AdminShellData` hoy solo pasan `{capabilities, locale}` → hay que threadear `name`/`email`. Avatar = iniciales (o Clerk `useUser().imageUrl` client-side).
- **i18n + testing**: `useAdminI18n` (locale por `AdminShellData`, SSR). vitest + jsdom + @testing-library, Strict TDD. Ojo: `ReviewQueueListScreen` hoy hardcodea español + `window.location.reload()` — gaps a NO copiar.

### ⚠️ Hallazgo clave (cambia el alcance)
El Figma muestra columnas **Categoría (badge)**, **Tienda (logo provider)** y **Método (badge)** que **NO existen en la data actual** de la cola de revisión:
- **Categoría**: la row DTO no tiene categoría, y un `store_product` EN REVISIÓN puede no tener categoría canónica aún (no está matcheado). → requiere decisión: ¿la categoría sale del `store_product` crudo (ingesta), del canonical candidato, o se difiere la columna?
- **Provider logo**: `provider_logo_url` no está en la row → requiere agregar el campo (join a `provider.logo_url`) en `ListReviewQueue` + DTO.
Ambos son **cambios de backend** (DTO + use-case, posible migración/join), no solo re-estilado de front. Esto agranda el alcance más allá de "re-estilar la tabla".

### Decisiones del usuario (post-explore)
- **Alcance = fidelidad total (front + back).**
- **Fuente de categoría**: las 14/16 categorías + subcategorías estarán ALMACENADAS; la categoría se **asigna al producto vía los mismos mecanismos del matching** (EAN/trgm/vector/LLM) — es una capa de **clasificación de categorías** en el pipeline (feature de backend nueva, NO existe hoy).
- **Grid/list**: solo tabla/list por ahora (toggle presente, grid = follow-up).

### Descomposición propuesta (para no mezclar clasificación ML con restyle de UI)
- **CAMBIO A — `save-category-classification` (backend, su propio SDD)**: almacenar la taxonomía (14/16 cats + subcats) + clasificar cada producto asignándole categoría vía los mecanismos del matching (trgm/vector/LLM sobre nombre/descr.) + persistir la categoría. Es la fuente de verdad que POBLA la categoría.
- **CAMBIO B — `admin-workspace` (ESTE cambio)**: UI del admin (top bar + Table + Avatar + DropdownMenu + CategoryBadge con el mapa de 14/16 colores + ProviderLogo/ProviderBadge + paginación numerada + toolbar search/filtros/view-toggle) fiel al Figma, + el bit CHICO de backend: agregar `provider_logo_url` y `category` (nullable) a `AdminReviewQueueRowDto`/`ListReviewQueue`. El CategoryBadge renderiza la categoría cuando existe y cae elegante (N/A) mientras la clasificación (Cambio A) no haya corrido.
- Así la UI del admin avanza YA (progreso visible), con la columna categoría lista y poblándose cuando aterrice la clasificación.

### Riesgos / preguntas abiertas
- Faltan 2 de las 16 categorías (el Figma muestra 14).
- Otros gaps de data para las columnas del Figma (resolver en SPEC): **imagen de producto** en la row (hoy solo el detail tiene `store_product_image_url`), **logo de marca** (Figma muestra GOYA etc. — ¿tenemos brand logos?), **Tipo Peso** y **Descripción** por row.
- La pantalla Cola de revisión YA existe → re-estilar + componentes reusables, no de cero.

---

## Fase 2 — PROPOSE

### Intent
Construir el **workspace del admin** (top bar + pantalla Cola de revisión) fiel al Figma (nodo 483:12411), con **componentes reusables** para toda la OFV, + el bit chico de backend para las columnas nuevas. Secuencia elegida: UI ahora; la clasificación de categorías es un cambio aparte que poblará la categoría después.

### Enfoque
**Backend (chico, Strict TDD):** agregar a `AdminReviewQueueRowDto` + `ListReviewQueue`:
- `provider_logo_url` (join a `provider.logo_url`).
- `category` nullable (slug + name; NULL hasta que exista la clasificación).
- `store_product_image_url` en la row (hoy solo en el detail) — para el thumbnail de producto.
- (evaluar en SPEC) `weight_type`/`size_unit` y `description` si el Figma los exige y hay data.

**Frontend — componentes reusables (Base UI para lo nuevo, reusar lo que hay):**
- `ui-base/table.tsx` — Table primitivo (header sortable, row, cell) estilado al Figma. Reemplaza el `<table>` crudo.
- `ui-base/avatar.tsx` — Avatar con fallback a iniciales (para el user chip del top bar; no hay foto en `MeResponse`).
- **DropdownMenu** para "Acciones ⋯" (por row) y "Mostrar todos" — decisión SPEC: reusar el Radix `ui/dropdown-menu.tsx` existente vs traer el de Base UI a `ui-base/` (consistencia con el admin Base UI). Propongo Base UI.
- `CategoryBadge` — pill con el **mapa de 14/16 colores** (bg+text de la tabla de arriba) + nombre; fallback "N/A" si `category` es null. (Compone `ui/badge` o propio.)
- `ProviderLogo` — reusar `ProviderBadge` (img `provider_logo_url` o texto fallback).
- **Paginación numerada** — adaptar `ui/pagination.tsx` al patrón `navigate()` + `serializeReviewQueueParams` (URL-state), reemplazando el prev/next manual.
- **Toolbar**: search input (⌘F), botón filtros, view-toggle grid/list (`ToggleGroup`, grid=stub), export, "Mostrar todos" (dropdown), "Acciones" (dropdown). Fiel al Figma.
- `AdminTopBar` — campana + settings + user chip (name/email + Avatar), montado en `SidebarInset` arriba de `children`. Threading de `name`/`email` por `AdminShellData` (extender `resolveAdminIdentity`).

**Restyle de `ReviewQueueListScreen`** a las columnas del Figma (Inf.Producto [badge nº candidatos], Producto [img+name], Tamaño, Tipo Peso, Descripción, Categoría [badge], Marca, Tienda [logo], Método [badge], Fecha, Acciones [⋯]). De paso: `window.location.reload()` → `useAdminList`, e i18n de los strings (hoy hardcodean español).

### Fuera de alcance
- Clasificación de categorías (cambio `save-category-classification`).
- Vista grid (solo list/tabla ahora).
- Resto de pantallas admin (Providers/Sources/Basket) — se re-estilan después reusando estos componentes.

### Riesgos
1. Columnas del Figma con data faltante (imagen en row, brand logo, tipo peso, descripción) — acotar en SPEC qué entra ahora vs follow-up.
2. Base UI + Vike SSR para Table/Avatar/DropdownMenu (mismo cuidado que el sidebar).
3. Avatar sin foto en `MeResponse` → iniciales; foto Clerk client-side es opcional (regla de token Clerk).
4. Alcance grande → conviene fasear el APPLY (backend DTO → componentes reusables → topbar → restyle de la tabla).

### Contrato de fase
`status: ready-for-spec` · `next: sdd-spec` (acotar columnas/data + escenarios, Strict TDD).

---

## Fase 3 — SPEC

### Columnas de la tabla — acotadas a la data disponible
`StoreProduct` del dominio es mínimo (id/provider/canonical/price/url/ean); `name`/`brand`/`size_text` vienen de attrs de ingesta. `size_text` es UN string ("24 Oz"). No hay descripción ni logo de marca.

| Col Figma | Fuente | Acción |
|---|---|---|
| Inf. Producto (nº) | `candidate_count` (existe) | badge numérico |
| Producto (img+name) | `store_product_name` (existe) + **`store_product_image_url`** | **ADD image a la row** |
| Tamaño (nº) | parse de `size_text` | front: regex nº |
| Tipo Peso (unidad) | parse de `size_text` | front: regex unidad |
| Descripción | ❌ no hay campo | **OMITIR este round** (follow-up) |
| Categoría (badge) | **`category`** nullable | **ADD nullable** (N/A hasta clasificación); `CategoryBadge` |
| Marca | `store_product_brand` (texto) | texto (sin logo este round) |
| Tienda (logo) | **`provider_logo_url`** | **ADD join**; `ProviderLogo`/`ProviderBadge` |
| Método (badge) | `method` (existe) | `MethodBadge` |
| Fecha del match | `created_at` (existe) | formato fecha |
| Acciones (⋯) | approve/reject/detail existentes | `DropdownMenu` (Ver/Editar[stub]/Compartir[stub]/Eliminar→reject) |

**Backend a agregar a `AdminReviewQueueRowDto` + `ListReviewQueue`**: `store_product_image_url`, `category` (nullable: slug+name), `provider_logo_url` (join a `provider.logo_url`).

### Requisitos + escenarios (Strict TDD)
- **R1** La row DTO expone `provider_logo_url`, `store_product_image_url`, `category?`. *Escenario*: provider con `logo_url` → la row lo trae; sin categoría clasificada → `category = null`.
- **R2** `CategoryBadge` pinta bg+text del mapa de 14/16 por slug; `category=null` → chip "N/A" neutro. *Escenario*: slug `frutas-verduras` → bg `#dfffc8`/text `#335e00`.
- **R3** `MethodBadge` pinta el método (ean/trgm/vector/hybrid/llm/human) con su color. `ProviderLogo` = img o texto fallback.
- **R4** `Table` renderiza las columnas del Figma; header sortable donde hoy hay `order_by`. Paginación numerada refleja `total`/página y navega por URL-params.
- **R5** Toolbar: search (filtra por nombre), filtros (los actuales), view-toggle (list activo; grid stub deshabilitado), "Mostrar todos"/"Acciones" dropdowns.
- **R6** `AdminTopBar`: campana + settings + user chip (name + `Avatar` iniciales). `name` llega por `AdminShellData`. Montado en `SidebarInset` arriba de `children`.
- **R7** El screen usa `useAdminList` (no `window.location.reload()`) y `useAdminI18n` (no español hardcode).
- **R8** Sin regresión: single-ClerkShell; backend tests verdes.

### Fuera de spec
Descripción por row, logo de marca, vista grid, clasificación de categorías.

---

## Fase 4 — TASKS (Strict TDD, APPLY faseado)

- **Batch 1 — Backend DTO** ✅ DONE: `provider_logo_url` + `store_product_image_url` + `category: CategoryRefDto|None` (reusa el `CategoryRefDto` existente slug+name; null por ahora) en `AdminReviewQueueRowDto`. Join de `provider.logo_url` en `product_match_repository.py`; `sp.image_url` para la imagen; category hardcoded None (la puebla el cambio `save-category-classification`). Dominio puro (`ReviewQueueRow` con primitivas). RED→GREEN genuino. **Corrección al explore**: `types.ts` NO es mirror manual — importa `AdminReviewQueueRowDto` del `@cuadra/api-client`, así que heredó los campos vía `make openapi`+gen (cero edición web). Web typecheck limpio. ⚠️ 1 fallo backend **pre-existente verificado por stash** (`test_admin_api.py::test_super_admin_gets_200_on_review_queue_routes` — match sembrado no aparece en la lista; falla igual en baseline/developer, tema de fixture post size-gate, fuera de alcance).
- **Batch 2 — Componentes reusables base** ✅ DONE: `ui-base/table.tsx` (styled `<table>`, sin dep), `ui-base/avatar.tsx` (`@base-ui/react/avatar`), `ui-base/dropdown-menu.tsx` (`@base-ui/react/menu`; gap del `IconPlaceholder` del registry arreglado → lucide `ChevronRight`/`Check`) + tests. Fuente `base-vega`. Radix (`components/ui/`) intacto. 159 tests, typecheck limpio, 0 deps nuevas.
  - **Nota categorías (del usuario)**: total **15** ("la dejamos en 15"). El Figma (nodos 502:6713 + 482:6172) muestra **14** con color exacto (tabla de arriba). La 15ª no está en el frame de categorías (posible *Lácteos & Huevos* / *Mascotas* de la taxonomía, o una card aparte) → **color pendiente**. El `CategoryBadge` se hace **data-driven** (`categoryColor(slug)` → color del mapa; slug sin color → chip neutro), así cualquier slug funciona y agregar la 15ª es trivial cuando el usuario dé su color.
- **Batch 3 — Componentes de dominio** ✅ DONE: en `apps/web/src/features/admin/components/` → `category-colors.ts` (`categoryColor(slug)` data-driven, 14 colores + neutro fallback), `CategoryBadge` (text-only, N/A cuando null), `MethodBadge` (colores aprox., refinables Batch 6, labels i18n), `ProviderLogo` (re-export de `ProviderBadge`). i18n `admin.category.none` + `admin.method.*` (es/en/pt). Slugs mapeados a `category-icons.tsx`. 172 tests, typecheck limpio.
  - **Hallazgo**: "Ofertas de la semana" NO es categoría (es el feed price-drops A7) → slug sintético + TODO. Las categorías reales del Figma con color son 13 + Ofertas(promo). La taxonomía tiene `lacteos-huevos`/`mascotas` sin color Figma (caen a neutro). El "15" del usuario se resuelve con el fallback data-driven.
- **Batch 4 — AdminTopBar** ✅ DONE (el sub-agente se cortó por límite de sesión de la API a mitad; **terminado inline**): `AdminTopBar` (campana con punto rojo + settings + name + `Avatar` iniciales sobre `bg-primary`; `initialsFromName`; botones stub). Threading `name`/`email`: `AdminIdentity` (`require-admin.ts`) + `AdminShellData`/`data()` (`pages/admin/+data.ts`) + `+Layout.clear.tsx` + `AdminLayout` (montado en `SidebarInset` arriba de children). i18n `admin.topbar.*`. Single-ClerkShell regresión verde. 180 tests, typecheck limpio.
  - **Fix de gap latente (del sidebar)**: las 5 páginas admin (`review-queue`/`providers`/`sources`/`basket-queries`/`@id`) fusionaban SOLO `capabilities` del shell → ahora `...shell` (capabilities+locale+name+email) con tipo `& AdminShellData`. Antes el `locale` nunca llegaba (caía a DEFAULT_LOCALE) y el topbar saldría sin nombre.
- **Batch 5 — Toolbar** ✅ DONE: `ReviewQueueToolbar.tsx` (props `params/onParamsChange`, `search/onSearchChange`, `view/onViewChange`, `selectedCount/onBulkApprove/onBulkReject`, `bulkBusy`, `locale`). Filtros (provider/method/confidence/order, i18n'd) en un popover custom bajo el botón funnel. "Acciones" = bulk approve/reject real (disabled sin selección). Stubs: search (surface value → Batch 6 hace el filtro client-side por nombre), "Mostrar todos" (no-op), export (disabled "próximamente"), grid (disabled). i18n `admin.toolbar.*` (es/en/pt). 9 tests, 189 full suite, typecheck limpio. **Batch 6**: montar sobre la tabla + implementar el search client-side + borrar el bloque de filtros inline viejo + estado `view`.
- **Batch 6 — Restyle tabla** ✅ DONE: `ReviewQueueListScreen` + `ReviewRow` reescritos con `Table` (ui-base) + columnas del Figma (checkbox, Inf.Producto[candidate_count badge], Producto[img+ImageOff fallback+name], Tamaño/Tipo Peso[`parseSize`], Descripción[—, sin data], Categoría[CategoryBadge], Marca[texto], Tienda[ProviderLogo], Método[MethodBadge], Fecha[`formatMatchDate` Intl+UTC], Acciones[⋯ DropdownMenu: Ver→detail, Editar/Compartir stub, Eliminar→reject]). Paginación numerada (`ui/pagination` + `pageWindow`) + "Mostrar N por página". `window.location.reload()`→`useAdminList` (`fetchReviewQueue`). Filtros inline viejos borrados (los tiene la toolbar). i18n `admin.reviewQueue.*` (~30 claves es/en/pt). Helpers `parse-size.ts` + `format-match-date.ts` con tests (RED→GREEN). 217 tests, typecheck limpio.
  - **Flags**: (1) el Figma NO tiene columna "Confianza" pero `confidenceColor` es señal SAGRADA de triaje (tests lo asertan) → se mantuvo como un **punto de color** junto al nombre (decisión del usuario: mantener/reubicar/quitar). (2) `total` del footer no re-sincroniza tras bulk (igual que ProvidersScreen). (3) Descripción + logo de marca sin data backend (follow-ups, fuera de SPEC).
- **Batch 7 — VERIFY** ✅ (automático): backend sin cambios desde Batch 1 (commiteado); **suite web 217 passed**, typecheck limpio, cero regresiones. Falta el **smoke visual del usuario** vs Figma en `web:3006` `/admin/review-queue`.

### Contrato de fase
`status: ready-for-apply` · Batches 1→7. Providers logos (nodo 502:6717) se descargan cuando se necesiten (Batch 3/6).
