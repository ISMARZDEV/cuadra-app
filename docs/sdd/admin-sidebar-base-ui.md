# SDD: admin-sidebar-base-ui

> Modo: Interactivo · Artefactos: este único .md · Strict TDD: ON

## Fase 1 — EXPLORE

### Estado actual (admin shell)
- `apps/web/src/features/admin/shell/AdminLayout.tsx:1-38` — shell mínimo hand-rolled: `<aside>` con
  `<a href>` planos, SIN active-state, SIN shadcn `Sidebar` component. Nav = `ADMIN_RESOURCES.filter(r => capabilities.includes(r.capability))`.
- `apps/web/pages/+Wrapper.tsx` — `<ClerkShell>` (ClerkProvider) monta UNA sola vez, en la raíz. NUNCA ponerlo en un Layout.
- `apps/web/pages/admin/+Layout.clear.tsx` — layout de TODO `/admin/*`, sufijo `.clear` corta la herencia de `LayoutDefault` (chrome de marketing). Lee `capabilities` vía `useData<Partial<AdminShellData>>()`.
- `apps/web/pages/admin/+guard.ts:1-19` — gate SSR del subárbol; solo chequea `ADMIN_RESOURCES[0]`. Guards de Vike NO componen: cada resource con capability distinta necesita su propio `+guard.ts`.
- `apps/web/pages/admin/+data.ts` — `AdminShellData.capabilities` vía `resolveAdminIdentity`.
- `apps/web/src/features/admin/shell/require-admin.ts` — extrae token de cookie `__session` o header Authorization, llama `/identity/me`. dev-login (localStorage) es INALCANZABLE SSR → `/admin/*` siempre 403 sin Clerk real.
- Test de regresión existente a mirror: `apps/web/src/test/admin-layout-no-double-provider.test.tsx` (mockea `vike-react/useData` + `ClerkShell`).

### ADMIN_RESOURCES + capability gating
- `apps/web/src/features/admin/shell/admin-resource.ts:1-45`:
  ```ts
  interface AdminResource { key: string; label: string; path: string; capability: string; navIcon?: LucideIcon }
  ```
  4 resources hoy: save-matching-review, save-providers, save-sources, save-basket. `capability` es un mirror manual (comentado) de `CapabilityKey` del backend — no hay tipo compartido/generado.
- Filtrado: `AdminLayout.tsx:18` — `ADMIN_RESOURCES.filter(r => capabilities.includes(r.capability))`.
- Origen de `capabilities`: SSR, `resolveAdminIdentity()` → `getMe()` (`@cuadra/api-client`) con el JWT de la cookie `__session`.

### Vike (pathname, links, nav)
- `usePageContext().urlPathname` (import `usePageContext` from `"vike-react/usePageContext"`) es el
  API usado en TODO el codebase para pathname activo — ya importado en
  `apps/web/src/features/admin/resources/save-matching/components/ReviewQueueListScreen.tsx:3,38`.
  `urlPathname` viene YA "lógico" (sin prefijo `/{locale}/{country}`, Vike lo strippea) — confirmado
  en `category-filters.tsx:103` y `pages/+guard.ts:16` (`if (pageContext.urlPathname.startsWith("/admin")) return;` — `/admin/*` está exento del locale prefix).
- Links: SIEMPRE `<a href>` planos — CERO router-side client (`package.json` no tiene react-router/wouter/etc.). Confirmado en `AdminLayout.tsx:24` y en el sidebar de referencia (que usa Next `<Link>` — hay que reemplazarlo 1:1 por `<a href>`). Para navegación programática (logout redirect) existe `navigate()` de Vike, ya usado en `ReviewQueueListScreen.tsx`.
- No existe hoy ningún componente de nav "activo" que mirror — hay que construirlo desde cero, adaptando el de referencia.

### Tokens / components.json / Tailwind v4 / verde Cuadra
- `apps/web/components.json`: `style: "new-york"`, `tailwind.css: "src/styles/globals.css"`, `baseColor: "neutral"`, `cssVariables: true`, NO campo `registries`. `iconLibrary: "lucide"`.
- `apps/web/src/styles/globals.css:1-90` — Tailwind v4 CSS-first (`@theme inline`), dark mode por clase `.dark`. Tokens hoy: background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring + `--brand`/`--lime` (constantes de marca). **NO existen `--sidebar*` tokens** — hay que agregarlos.
- Verde Cuadra: `--primary: #16a34a` (light y dark), `--lime: #7eb427` (accent secundario). Mismos valores que mobile (`theme-provider`). El sidebar de referencia usa AZUL — todo `--sidebar-primary`/`--sidebar-ring`/etc. debe remapearse a estos verdes, NUNCA copiar los valores azules del origen.
- Radius: `--radius: 0.75rem` con `--radius-lg/md/sm` derivados.

### shadcn registry / MCP — ¿bloqueante? **NO como se reportó — pero hay un blocker MÁS SERIO debajo**
1. **Causa raíz del "No registries are configured"**: es un artefacto de **cwd**. `npx shadcn info` desde la RAÍZ del monorepo
   falla (`monorepo_root` — no hay `components.json` en la raíz). Con cwd/`-c apps/web` SÍ resuelve: el CLI/MCP
   inyecta un registry `@shadcn` default (`https://ui.shadcn.com/r/styles/{style}/{name}.json`). **Fix real: apuntar
   siempre las herramientas/MCP a `apps/web`, NO agregar un campo `registries` manual.**
2. **BLOCKER REAL — `new-york` es un style LEGACY sin contraparte Base UI.**
   `shadcn info --json -c apps/web` → `"preset": {"code": null}`: `new-york` NO es un preset prefijado; es legacy.
   Verificado en vivo: `curl .../r/styles/base-nova/sidebar.json` → 200 (deps: button/input/separator/sheet/skeleton/tooltip/use-mobile,
   imports `@base-ui/react/*`); `curl .../r/styles/base/sidebar.json` → 404. **No existe `base-new-york`.**
   El paso 1 del plan original ("flip `style` de `new-york` a `base-*`") ES INVIÁLIDO — no hay destino directo.
   - **Opción A (RECOMENDADA, bajo blast radius):** NO tocar `style` global. Traer el `sidebar` + deps
     (`separator`, `sheet`, `tooltip`, `skeleton`, `use-mobile`) desde un style prefijado concreto (p.ej. `base-nova`)
     como archivos NUEVOS en `components/ui/`, e instalar `@base-ui/react` JUNTO a Radix (coexisten, cero remoción).
     Es el modo "progressive" de `migrate-radix-to-base`.
   - **Opción B (alto blast radius, NO recomendada):** migración whole-project `new-york` → `radix-<style>` → `base-<style>`,
     re-estiliza TODOS los componentes existentes. Fuera de alcance de "agregar un sidebar".

### Radix vs Base UI (estado hoy, deps)
- `apps/web/src/components/ui/` hoy: badge, button, card, carousel, checkbox, collapsible, dropdown-menu, input,
  pagination, radio-group, select, slider, textarea, toggle-group, toggle — TODOS Radix.
- `apps/web/package.json`: `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slot`, `radix-ui`, `class-variance-authority`,
  `clsx`, `tailwind-merge`. **CERO** `@base-ui/react` hoy — se instala desde cero.
- **No existen** `use-mobile`, `separator`, `sheet`, `tooltip`, `skeleton` en `components/ui/` — son registryDependencies del sidebar, hay que traerlos todos.

### Diseño de referencia (qué adaptar a Vike)
`/Users/ismartz/Desktop/DEV/fiscal-contable.agentic-ai-app/frontend/partials/sidebars/super-admin-sidebar.tsx`:
- Header: logo dual light/dark; Cuadra puede reusar el wordmark `CUA`+`DRA` que ya usa `AdminLayout.tsx:20-22`.
- `SidebarGroup` con label mono-uppercase (`font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60`) + chevron decorativo.
- Item activo: `bg-card text-foreground shadow-sm`; inactivo `text-muted-foreground hover:text-foreground hover:bg-accent/50`. Active = `pathname === href || pathname.startsWith(href + "/")`.
- Badge contador: `font-mono text-[11px] bg-accent border border-border px-[7px] py-[1px] rounded-full` — opcional (ADMIN_RESOURCES no tiene `count` hoy).
- Footer: avatar + nombre/email (mono, truncado) + botón logout icon-only.
- **Next/Radix-specific a adaptar:** `"use client"` no aplica; `next/link` → `<a href>`; `next/navigation` `usePathname` → `usePageContext().urlPathname`; logout con Clerk (`useClerk().signOut()` vía `@clerk/clerk-react`), NO endpoint propio; `sonner`/`Avatar` no existen en web hoy.

### Testing (stack web, test a espejar)
- Stack: `vitest` (jsdom) + `@testing-library/react` + `@testing-library/jest-dom`. Config `apps/web/vitest.config.ts` (alias `@`→`src`, `setupFiles: src/test/setup.ts`).
- Mirror: `apps/web/src/test/admin-layout-no-double-provider.test.tsx` y `.../save-providers/components/ProvidersScreen.test.tsx` (mockean `vike-react/useData`). Para active-state: mockear `vike-react/usePageContext` → `{ urlPathname: "/admin/providers" }`.

### i18n
- Admin hoy SIN i18n a propósito, pero la decisión fue REVERTIDA (ver `docs/pending/save-admin-review-pendientes.md` §"P0 — i18n en el admin").
- Gotcha: `/admin/*` está EXENTO del prefijo `/{locale}/{country}/` (`pages/+guard.ts:16`), así que `usePageI18n()` (lee locale de la URL) siempre cae a `DEFAULT_LOCALE` en admin.
- Plan ya escrito: exponer `locale` en `MeResponse` → thread por `AdminShellData` → un `useAdminI18n(locale)` (NO `usePageI18n`) que envuelve `translate(locale, key)` de `apps/web/src/i18n/messages.ts`. **El AdminSidebar debe seguir YA este patrón** (namespace `admin.*`) en vez de hardcodear español.

### Riesgos y preguntas abiertas
1. **[ALTO] No hay `base-new-york`** — decidir Opción A (progressive, sin flip global) vs B (whole-project). Recomendado: A.
2. **[ALTO] Elegir qué `base-<style>` usar como fuente** (base-nova confirmado; verificar cuál se acerca a new-york).
3. **[MEDIO] Nombre npm real del paquete Base UI** — verificar `@base-ui/react` vs `@base-ui-components/react` antes de `pnpm add`.
4. **[MEDIO] i18n del sidebar** — construir con `useAdminI18n` desde el arranque o se repite deuda.
5. **[MEDIO] Logout / Avatar** — fuente de `user.name`/`email` (¿extender `AdminShellData`/`MeResponse`?) y logout real con Clerk.
6. **[BAJO] `ADMIN_RESOURCES` sin campo `count`** — si se quiere el badge, decidir su fuente de datos.
7. **[BAJO] `SidebarProvider`** — confirmar que no rompe `admin-layout-no-double-provider.test.tsx` (no es un ClerkProvider, no debería).

### Constraints (de las skills)
- **cuadra-web**: estructura feature-oriented que espeja mobile; Tailwind v4 + shadcn (wrap, no fight); icons SOLO `lucide-react`; refactor estructural y feature en commits separados; alias `@` sincronizado en 3 configs.
- **cuadra-save-admin**: Vike guards NO componen; `ClerkProvider` monta UNA vez en `+Wrapper.tsx`; `+Layout.clear.tsx` para no heredar chrome; capabilities gateadas server-side; no reinventar auth/refresh; Strict TDD (RED→GREEN).
- **shadcn / migrate-radix-to-base**: nunca asumir un preset (siempre `shadcn info --json` primero, con cwd `apps/web`); legacy styles (`new-york`) NO se re-apuntan a base-*; Radix y Base UI coexisten; reportar gaps de mapeo en vez de adivinar.

### Design target — Figma (fuente de verdad)
`https://www.figma.com/design/MJlNTbiNLuUl4ythDuAPDX/Cuadra-App?node-id=483-12411` (frame `483:12411`).
El Figma redibuja TODA la pantalla del admin; **el sidebar (nodo `483:13776`) es el alcance de ESTE cambio**. El archivo de referencia `fiscal-contable/.../super-admin-sidebar.tsx` queda DESCARTADO — el Figma manda pixel a pixel.

**Decisiones de alcance bloqueadas por el usuario:**
- Alcance = **solo el sidebar** exacto al Figma. Topbar/toolbar/contenido/footer → cambios siguientes.
- Rail oscuro extremo-izquierdo (Drive/Calendar/Meet/aispace/tema) → **FUERA** (es el shell del ecosistema aispace, no del admin de Cuadra).
- Adopción Base UI = **admin-scoped**: construir el sidebar en Base UI (componentes nuevos aislados + tokens de admin) SIN flip global de `components.json` ni tocar páginas públicas de Save. Cero regresión SEO/visual. End-state sigue siendo Base UI, admin primero.
- i18n = **desde el arranque** (`useAdminI18n(locale)`, namespace `admin.nav.*`), NO hardcodear español.

**Specs exactas del sidebar (nodo `483:13776`, del `get_design_context`):**
- Contenedor: flex-col, `justify-between`, pt 32px / pb 21px, ancho ~262px (contenido interno 203px). Fondo verde muy tenue (gradiente pálido→blanco).
- **Header**: logo Cuadra (ícono ~60px + wordmark "Cuadra") + botón de **colapso** a la derecha: bg `#daff9f`, borde `#b7e36f` 0.725px, `rounded-full`, 35px, ícono panel-left 14px.
- **Tokens de color del diseño** (Figma variables): lima activo `#daff9f` / borde `#b7e36f`; label sección `#015442` (secondary-02); ítem-grupo `#1c614e`; sub-ítem / texto `#015442`; leaf `#014335`/`#1c614e`; footer `#718b8b`. (Variables globales del frame: `primary-01 #bbec6c`, `primary-02 #93d555`, `secondary-01 #237961`, `secondary-02 #015442`, `bg-black #091113`, `accents-01 #ff3d3d`.)
- **Tipografía**: Inter. Labels de sección = ExtraBold ~14px, opacity 80%. Ítems-grupo = **Bold** ~14px. Sub-ítems = Regular ~13px con bullet (`list-disc`, ms ~17px). Footer = Medium ~15px. (Valores del export escalados ×~0.916; redondear a rem limpios preservando jerarquía.)
- **Ítems-grupo**: `flex gap 4.6px h ~20px items-center`, ícono 24px + texto + chevron 20px. Chevron **up** = expandido, **down** = colapsado.
- **Sub-ítems**: `h 30px rounded-10px`, texto con bullet. Activo (Cola de revisión) = bg `#daff9f` + borde `#b7e36f` 0.725px + texto **Bold**.
- **Footer**: Feedback + Ayuda (ícono 18px + texto Medium `#718b8b`).

**Modelo de navegación (del Figma) — más rico que `ADMIN_RESOURCES` plano de hoy:**
| Sección | Entrada | Tipo | Ícono | Estado |
|---|---|---|---|---|
| MENÚ | Dashboard | grupo (↑ expandido) → Users, News, Save | line-chart | **WIP** (los 3 sub) |
| Users | Soporte a usuarios | grupo (↓) | user-cog | **WIP** |
| Users | Gestión de usuarios | grupo (↓) | users | **WIP** |
| News | Publicaciones | grupo (↓) | share/route | **WIP** |
| Save | Supermercado | grupo (↑ expandido) | store | — |
| Save | ↳ Metricas | sub-ítem | — | **WIP** |
| Save | ↳ Cola de revisión | sub-ítem (**ACTIVO**) | — | **real** → `save-matching-review` |
| Save | ↳ Proveedores | sub-ítem | — | **real** → `save-providers` |
| Save | ↳ Fuentes | sub-ítem | — | **real** → `save-sources` |
| Save | ↳ Canasta curada | sub-ítem | — | **real** → `save-basket` |
| Save | Productos Financieros | leaf | dollar-circle | **WIP** |
| Footer | Feedback / Ayuda | leaf | message / headset | **WIP** |

Los ítems **real** conservan gating por capability + href a las rutas Vike ya existentes. Los **WIP** al seleccionarse muestran "en construcción / aún no disponible" (sin navegar).

---

## Fase 2 — PROPOSE

### Intent
Reemplazar el `<aside>` hand-rolled de `AdminLayout.tsx` por un `AdminSidebar` que replica EXACTAMENTE el sidebar del Figma, construido sobre primitivas **Base UI** de shadcn (aisladas, sin flip global), con un modelo de navegación por secciones/grupos/sub-ítems, estados WIP para lo aún no construido, capability-gating intacto en los ítems reales, colapso + responsive móvil, e i18n (es/en/pt) desde el arranque. Es el PRIMER incremento de la adopción Base UI del admin.

### Enfoques evaluados
- **A — Primitivas Base UI de shadcn (`Sidebar`) aisladas + estilado exacto al Figma (RECOMENDADO).**
  Traer el `sidebar` de Base UI + deps (`separator`, `sheet`, `tooltip`, `skeleton`, `use-mobile`, `button`) desde un style `base-*` como archivos NUEVOS en un namespace aislado (`apps/web/src/components/ui-base/`) para NO clobberear los Radix existentes (`button`/`input` ya viven en `components/ui/`). Componer `AdminSidebar` en `features/admin/shell/`. Ganamos GRATIS: estado de colapso (`SidebarProvider` + cookie), sheet móvil, semántica/a11y de menú, atajo de teclado. Estilamos con tokens `--sidebar-*` + clases para clavar el Figma. Es "wrap, don't fight" (cuadra-web) y coexistencia Radix/Base (migrate-radix-to-base).
- **B — Sidebar hand-rolled (sin dep de shadcn sidebar).** Control total del markup, pero reimplementamos colapso/sheet-móvil/a11y a mano → más código, más riesgo, contra "wrap don't fight". Solo si Base UI sidebar choca con Vike/SSR.
- **C — Flip global `components.json` a `base-*`.** DESCARTADO por el usuario (re-estiliza páginas públicas, riesgo SEO/visual).

**Recomendación: A.**

### Alcance de A (qué se construye)
1. **Primitivas Base UI aisladas** en `components/ui-base/`: `sidebar`, `separator`, `sheet`, `tooltip`, `skeleton`, `use-mobile`, `button` (Base UI). Sin tocar los Radix de `components/ui/`.
2. **Tokens `--sidebar-*`** en `globals.css` (Tailwind v4 `@theme`), en los verdes del Figma (`#daff9f`/`#b7e36f`/`#015442`/`#1c614e`/`#718b8b`), light + dark.
3. **Modelo de nav** `admin-nav.ts`: `AdminNavSection[]` con grupos colapsables, sub-ítems, leafs y flag `status: 'ready' | 'wip'`. Los `ready` mapean a `ADMIN_RESOURCES` (capability + href); los `wip` no navegan.
4. **`AdminSidebar`** en `features/admin/shell/`: header (logo + toggle colapso), secciones con label, grupos colapsables (chevron up/down), sub-ítems con bullet, estado activo (píldora `#daff9f`) vía `usePageContext().urlPathname`, footer Feedback/Ayuda. Links = `<a href>`. WIP → toast/dialog "🚧 En construcción".
5. **i18n**: `useAdminI18n(locale)` + claves `admin.nav.*` en `i18n/messages.ts`; threading de `locale` por `AdminShellData` (`pages/admin/+data.ts`) — según el plan ya escrito en `docs/pending/save-admin-review-pendientes.md`.
6. **Wiring**: `AdminLayout.tsx` envuelto en `SidebarProvider`, renderizando `<AdminSidebar>` + `<SidebarInset>` para el contenido. Sin duplicar `ClerkProvider` (regla sagrada).

### Fuera de alcance (cambios siguientes)
Topbar (search/notif/settings/user), toolbar (filtro/toggle vista/export/Mostrar todos/Acciones), card de contenido y su empty-state, footer de contenido, rail oscuro del ecosistema, y páginas reales para los WIP.

### Decisiones abiertas para SPEC/DESIGN
- **WIP UX**: toast efímero vs dialog "en construcción" vs badge inline "pronto". (Propongo: dialog/toast, sin rutas nuevas — mantiene el cambio sidebar-scoped.)
- **Style base-\*** fuente de las primitivas (`base-nova` u otro) — elegir el visualmente más neutro; el estilado final lo fija el Figma, así que el style base solo aporta estructura.
- **Namespace** de primitivas Base UI: `components/ui-base/` (propuesto) vs `features/admin/ui/`.
- **Fuente Inter**: confirmar que `apps/web` ya la carga; si no, agregarla (o mapear a la fuente actual preservando jerarquía).

### Riesgos
1. **Base UI + Vike SSR**: verificar que las primitivas (que usan `use-render`/`merge-props` de Base UI) hidraten bien bajo Vike SSR (no client-only). Mitigación: test de render + smoke SSR.
2. **`SidebarProvider` en `AdminLayout`**: no debe romper `admin-layout-no-double-provider.test.tsx` (no es ClerkProvider; agregar aserción explícita de single ClerkShell).
3. **i18n plumbing**: threading de `locale` toca `+data.ts`/`AdminShellData`; contenido, pero acotado y ya especificado en el pending.
4. **Nombre npm del paquete Base UI** (`@base-ui/react` vs `@base-ui-components/react`): verificar antes de instalar.

### Contrato de fase
`status: ready-for-spec` · `next_recommended: sdd-spec` (requisitos + escenarios del sidebar, Strict TDD).

**Decisión bloqueada (UX WIP):** toast efímero "🚧 En construcción — aún no disponible", sin navegar. (`apps/web` no tiene toast hoy → se agrega `sonner` + `<Toaster>`.)

---

## Fase 3 — SPEC

### Capability: admin-sidebar (Figma-exact, Base UI, admin-scoped)

**R1 (ADDED) — Modelo de navegación.** El sidebar renderiza el modelo del Figma: secciones con label (MENÚ, Users, News, Save), grupos colapsables, sub-ítems con bullet y leaf items, en el orden exacto de la tabla del design target.

**R2 (ADDED) — Ítems reales enlazan a rutas Vike.** Cola de revisión, Proveedores, Fuentes y Canasta curada son `<a href>` a sus rutas existentes (mapeadas a `ADMIN_RESOURCES`), y se ocultan si el usuario no tiene la capability correspondiente.
- Escenario: *Given* un usuario con capability `save:providers:read` *When* renderiza el sidebar *Then* "Proveedores" aparece como link a `/admin/save/providers`. *Given* sin esa capability *Then* "Proveedores" no se renderiza.

**R3 (ADDED) — Ítems WIP no navegan.** Dashboard (y sub Users/News/Save), Soporte a usuarios, Gestión de usuarios, Publicaciones, Metricas, Productos Financieros, Feedback y Ayuda muestran un toast "🚧 En construcción — aún no disponible" al hacer clic, sin cambiar de ruta.
- Escenario: *Given* el sidebar *When* clic en "Metricas" *Then* aparece el toast y `urlPathname` no cambia (no hay `<a href>`).

**R4 (ADDED) — Estado activo por pathname.** El sub-ítem cuyo href matchea `usePageContext().urlPathname` (exacto o `startsWith(href + "/")`) se renderiza con la píldora activa (bg `#daff9f`, borde `#b7e36f`, texto Bold).
- Escenario: *Given* `urlPathname = /admin/save/review` *Then* "Cola de revisión" tiene la píldora activa y los demás no.

**R5 (ADDED) — Grupos colapsables.** Cada grupo abre/cierra al hacer clic en su fila; el chevron apunta up (abierto) / down (cerrado). Estado inicial: Dashboard y Supermercado abiertos; Soporte, Gestión, Publicaciones cerrados.
- Escenario: *Given* Supermercado abierto *When* clic en su fila *Then* sus sub-ítems se ocultan y el chevron pasa a down.

**R6 (ADDED) — Colapso global + responsive.** El botón del header colapsa/expande el sidebar (Base UI `SidebarProvider`, persistido); en viewport móvil se muestra como sheet.

**R7 (ADDED) — i18n.** Todos los labels vienen de `useAdminI18n(locale)` con claves `admin.nav.*` en es/en/pt. Cero strings hardcodeados. `locale` llega por `AdminShellData` (SSR), no por `usePageI18n` (roto en `/admin/*`).
- Escenario: *Given* `locale = en` *Then* "Cola de revisión" se muestra como "Review queue".

**R8 (ADDED) — Fidelidad visual.** Colores, tipografía Inter, spacing, radios y estados igualan el Figma (nodo `483:13776`).

**R9 (MODIFIED) — Sin doble ClerkProvider.** Al envolver `AdminLayout` en `SidebarProvider`, sigue montándose exactamente UN `ClerkShell`. El test `admin-layout-no-double-provider.test.tsx` sigue verde + aserción explícita.

**Fuera de spec:** topbar, toolbar, card de contenido, footer de contenido, rail del ecosistema, páginas reales de los WIP.

---

## Fase 4 — DESIGN

### Estructura de archivos
```
apps/web/src/
  components/ui-base/              # Base UI, AISLADO de components/ui (Radix)
    sidebar.tsx  separator.tsx  sheet.tsx  tooltip.tsx  skeleton.tsx  button.tsx
    sonner.tsx                    # <Toaster/>
  hooks/use-mobile.ts             # (Base UI) si no existe
  features/admin/shell/
    admin-nav.ts                  # modelo + tipos + mapeo a ADMIN_RESOURCES
    AdminSidebar.tsx              # composición (header, secciones, grupos, footer)
    useAdminI18n.ts               # translate(locale, key) namespaced admin.*
    AdminLayout.tsx               # (MOD) SidebarProvider + AdminSidebar + SidebarInset + Toaster
    admin-shell-data.ts           # (MOD) AdminShellData += locale
  i18n/messages.ts                # (MOD) admin.nav.* (es/en/pt)
apps/web/pages/admin/+data.ts     # (MOD) exponer locale desde MeResponse
```

### Modelo de nav (tipos)
```ts
type AdminNavStatus = "ready" | "wip";
interface AdminNavLeaf { kind: "leaf"; key: string; labelKey: string; icon: LucideIcon;
  status: AdminNavStatus; href?: string; capability?: string; }
interface AdminNavGroup { kind: "group"; key: string; labelKey: string; icon: LucideIcon;
  defaultOpen: boolean; items: AdminNavSubItem[]; }
interface AdminNavSubItem { key: string; labelKey: string; status: AdminNavStatus;
  href?: string; capability?: string; }
interface AdminNavSection { key: string; labelKey: string; entries: (AdminNavGroup | AdminNavLeaf)[]; }
```
- Los `ready` con `capability` se filtran contra `capabilities` (SSR); los `wip` siempre visibles.
- `href` de los reales = de `ADMIN_RESOURCES` (única fuente de rutas) para no duplicar paths.

### Comportamiento
- **Activo**: helper `isActive(href, urlPathname)` = `urlPathname === href || urlPathname.startsWith(href + "/")`.
- **WIP click**: `onClick={() => toast(t("admin.nav.wip"))}`, elemento `<button>` (no `<a>`).
- **Colapso de grupo**: estado local por grupo (`useState(defaultOpen)`), Base UI `Collapsible`/`SidebarMenu`.
- **Colapso global + móvil**: `SidebarProvider` de Base UI (cookie + sheet).
- **Toast**: `sonner` `<Toaster richColors position="bottom-right" />` montado en `AdminLayout`.

### Tokens (`globals.css`, Tailwind v4 `@theme`)
`--sidebar`, `--sidebar-foreground`, `--sidebar-accent` (`#daff9f`), `--sidebar-accent-border` (`#b7e36f`), `--sidebar-section-label` (`#015442`), `--sidebar-group-item` (`#1c614e`), `--sidebar-muted` (`#718b8b`), `--sidebar-ring` (verde), light + dark.

### Plan de test (RED-first, vitest + @testing-library/react)
1. `admin-nav.test.ts` — el modelo tiene las secciones/ítems esperados; `ready` mapean a hrefs de `ADMIN_RESOURCES`.
2. `AdminSidebar.capability.test.tsx` — ítem real oculto sin capability, visible con ella.
3. `AdminSidebar.active.test.tsx` — píldora activa según `urlPathname` (mock `usePageContext`).
4. `AdminSidebar.wip.test.tsx` — clic en WIP dispara toast (mock `sonner`) y no hay `href`.
5. `AdminSidebar.i18n.test.tsx` — labels cambian con `locale` (es/en).
6. `admin-layout-no-double-provider.test.tsx` — sigue verde + assert single ClerkShell con `SidebarProvider`.

### Riesgos técnicos (design)
- Base UI bajo Vike SSR (hydration). Mitigación: test de render SSR-safe + smoke en `web:3006`.
- Obtener las primitivas Base UI sin flip global: `shadcn add` respeta el style del proyecto (new-york→Radix); traerlas desde el registry `base-*` por URL/`-c apps/web` y ubicarlas en `ui-base/`. Verificar en apply.
- Nombre npm `@base-ui/react` vs `@base-ui-components/react`: confirmar antes de `pnpm add`.

---

## Fase 5 — TASKS (Strict TDD: RED → GREEN → REFACTOR)

### Batch 1 — Cimientos Base UI (estructural, sin tests de dominio) ✅ DONE
- [x] 1.1 Paquete confirmado: **`@base-ui/react@1.6.0`** (`@base-ui-components/react` está DEPRECADO). + `sonner@2.0.7`. Instalados en `@cuadra/web`.
- [x] 1.2 Primitivas Base UI en `components/ui-base/` (`sidebar`, `separator`, `sheet`, `tooltip`, `skeleton`, `button`, `input`*, `sonner`) + `hooks/use-mobile.ts`. Fuente: style **`base-vega`** (el más neutro; el look final lo fija el Figma). `components/ui/` (Radix) INTACTO. *`input` agregado por ser dep dura de `SidebarInput`.
- [x] 1.3 Typecheck limpio (`tsc --noEmit`, exit 0). `sonner.tsx` adaptado (sin `next-themes`, lee la clase `.dark` con MutationObserver, SSR-safe).

### Batch 2 — Tokens ✅ DONE
- [x] 2.1 `--sidebar-*` en `globals.css` (light + dark) + mapeo `@theme inline` a `--color-sidebar-*`. Cubre las 6 clases que usa la primitiva (`bg-sidebar`, `bg-sidebar-accent`, `border/ring-sidebar-border`, `ring-sidebar-ring`, `text-sidebar-accent-foreground`, `text-sidebar-foreground`) + extras Figma (`--sidebar-accent-border #b7e36f`, `--sidebar-section-label #015442`, `--sidebar-group-item #1c614e`, `--sidebar-muted #718b8b`).

### Batch 3 — Modelo de nav (RED→GREEN) ✅ DONE
- [x] 3.1 [RED confirmado] `admin-nav.test.ts` (12 tests: estructura, orden, ready/wip, cross-check con `ADMIN_RESOURCES`, `isActiveHref`).
- [x] 3.2 [GREEN] `admin-nav.ts` (tipos + `ADMIN_NAV` + `isActiveHref`). Sin paths hardcodeados — derivados de `ADMIN_RESOURCES`.
- **Rutas/capabilities REALES confirmadas** (corrigen lo asumido): Cola de revisión `/admin/review-queue` (`admin_save_matching_review`); Proveedores `/admin/providers`, Fuentes `/admin/sources`, Canasta curada `/admin/basket-queries` (todas `admin_save_ingestion_ops`).
- Íconos: `LineChart` (Dashboard), `UserCog`/`Users`, `Share2` (Publicaciones), `Store` (Supermercado), `CircleDollarSign` (Productos Financieros).
- Grupos WIP sin sub-ítems (`Soporte`, `Gestión`, `Publicaciones`) → `items: []`; Batch 5 maneja el clic en una fila-grupo sin hijos = toast WIP.
- Full suite: 137 tests verdes, cero regresiones.

### Batch 4 — i18n ✅ DONE
- [x] 4.1 [RED confirmado] `useAdminI18n.test.ts` (7 tests; testeo el hook directo, no el AdminSidebar que aún no existe) — falla sin `useAdminI18n`.
- [x] 4.2 [GREEN] `useAdminI18n(locale) → { locale, t }` (wrapper fino sobre `translate`) + claves `admin.nav.*` (es/en/pt) en `messages.ts` (incluye `admin.nav.wip` toast + footer).
- [x] 4.3 Threading `locale`: **`MeResponse.locale` VERIFICADO que existe** (campo requerido, `types.gen.ts:404`) → `require-admin.ts` (`AdminIdentity.locale`) → `+data.ts` (`AdminShellData.locale`, normalizado con `isLocale`/`DEFAULT_LOCALE`). Sin follow-up de backend.
- **Nota para Batch 5**: `t` tipa la key como `MessageKey`; `admin-nav.ts` la tiene como `string` → Batch 5 castea `entry.labelKey as MessageKey`.
- Full suite: 144 tests verdes (137 + 7), cero regresiones. Typecheck limpio.

### Batch 5 — AdminSidebar (RED→GREEN por escenario) ✅ DONE
- [x] 5.1 Render base (header wordmark + toggle colapso, labels de sección i18n, footer Feedback/Ayuda).
- [x] 5.2 Grupos colapsables (`useState(defaultOpen)`, chevron up/down; grupos WIP sin hijos → toast en vez de expandir).
- [x] 5.3 Estado activo (píldora `bg-sidebar-accent` + `border-sidebar-accent-border`) vía `usePageContext().urlPathname` + `isActiveHref`.
- [x] 5.4 Capability gating de ítems reales (oculta sin capability).
- [x] 5.5 WIP → `toast(t("admin.nav.wip"))`, sin `<a href>`. (6 tests verdes; full suite 150, cero regresiones; typecheck limpio.)
- [x] 5.6 Estilado a pixel del Figma con arbitrary values (`border-[0.725px]`, `h-[30px]`, `rounded-[10px]`, tokens `--sidebar-*`).
- **Fix infra**: stub global `window.matchMedia` en `src/test/setup.ts` (jsdom no lo trae; lo necesita `SidebarProvider` → también Batch 6).
- **Decisión "wrap, don't fight"**: NO se usó `SidebarMenuButton`/`SidebarMenuSubButton` (sus variantes `h-8/rounded-md` no calzan el Figma) — filas hechas a mano con `<button>`/`<a>` + Tailwind. Se consumen `Sidebar/SidebarHeader/Content/Footer` + `useSidebar`. Trade-off: no se aprovecha el `data-active`/tooltip/icon-collapse del primitivo.
- **⚠️ Follow-ups visuales acumulados (para Batch 7 / polish):**
  1. **Fuente Inter NO está cargada** en la app → se aplicó la jerarquía de pesos sobre `font-sans`. Cargar Inter para fidelidad total.
  2. **Ícono/logo mark del header no existe** como asset en `apps/web` → se reusó el wordmark "CUA/DRA". Falta el mark ~60px del Figma.
  3. **Colapso-a-ícono**: al no usar `SidebarMenuButton`, el estado colapsado del sidebar no muestra icon-only nativo — revisar en Batch 6/7 (el Figma no especifica el aspecto colapsado).

### Batch 6 — Wiring ✅ DONE
- [x] 6.1 [RED confirmado: "no button /toggle sidebar/"] `admin-layout-no-double-provider.test.tsx` actualizado; assert single ClerkShell (`not.toHaveBeenCalled` + `queryAllByTestId length 0`).
- [x] 6.2 [GREEN] `AdminLayout.tsx`: `SidebarProvider` → `AdminSidebar` + `SidebarInset{children}` + `Toaster` (montado UNA vez). `<aside>` viejo borrado. ClerkShell solo en `+Wrapper.tsx`.
- [x] 6.3 Colapso (`useSidebar().toggleSidebar()`) + sheet móvil operativos vía `SidebarProvider` (verificación visual = Batch 7).
- **Decisión arquitectónica**: `useData()` se queda en `+Layout.clear.tsx` (que ahora lee `locale`), NO en `AdminLayout` (que sigue siendo props-puro) — para no invertir la dirección Vike `pages → src/features`.
- **⚠️ Riesgo a verificar en Batch 7**: el `locale` (y `capabilities`) llega del `+data.ts` de CADA página admin. Batch 4 tocó `pages/admin/+data.ts`; confirmar que `review-queue/+data.ts` (y demás) exponen `locale`, o el sidebar cae a `DEFAULT_LOCALE` (no rompe, pero locale incorrecto).
- Full suite: 150 verdes, typecheck limpio.

### Batch 7 — POLISH (fidelidad Figma) ✅ DONE
Tras ver el build vs Figma, el usuario pidió ajustes explícitos. Todos hechos:
- [x] 7.1 Quitadas las viñetas de los sub-ítems; indent movido a la fila → **píldora activa full-width**.
- [x] 7.2 Spacing/padding/ancho al Figma (gaps, dividers `Separator`, hover, min-h touch targets).
- [x] 7.3 **Inter** cargada (`@fontsource-variable/inter`) y SCOPEADA al admin (import en `AdminLayout`, `fontFamily` en `SidebarProvider`; body global intacto).
- [x] 7.4 **Logo real**: exportado del Figma (nodo 483:13936), transparencia arreglada (`-fuzz 16% -transparent white` — el export venía con caja blanca), `apps/web/src/features/admin/shell/cuadra-logo.png` (532×182, alpha), importado en `AdminSidebar`.
- [x] 7.5 **Colapso-a-ícono**: `collapsible="icon"`, `useSidebar().state`; grupos/labels/sub-ítems se ocultan (max-h-0/opacity-0) en colapsado.
- 155 tests, typecheck limpio. (Smoke visual = el usuario lo revisa corriendo; sin server live por su decisión.)

### Batch 8 — Ecosystem Rail (columna oscura izquierda) ✅ DONE
El usuario pidió agregar el rail del ecosistema (antes "Fuera", ahora dentro).
- [x] 8.1 Assets exportados del Figma (transparentes): `rail/ecosystem-top.png` (+, Drive, Calendar, Meet, campana lima, divisor, logo aispace 'a') + `rail/ecosystem-bottom.png` (luna/sol).
- [x] 8.2 `EcosystemRail.tsx`: barra `bg-[#091113]` fija ~70px, full-height, `flex-col justify-between`, top cluster + bottom = **toggle de tema funcional** (misma lógica que `theme-toggle.tsx`: `.dark` + localStorage). `hidden md:flex` (oculto en móvil).
- [x] 8.3 Cableado en `AdminLayout`: `<div flex min-h-screen>` → `EcosystemRail` + `SidebarProvider`. Single-ClerkShell intacto.

### ⚠️ Regresión cazada y corregida (post Batch 8)
Un sub-agente había **corrompido `admin-nav.ts`**: reordenó las secciones a `menu, save, users, news` (debe ser `menu, users, news, save`) y puso `defaultOpen: false` en Dashboard y Supermercado (deben ser `true`), y reescribió el test 5.2 para "coincidir" con la corrupción. Contradecía el Figma Y los screenshots del usuario. **Restaurado** el orden + `defaultOpen: true`, y el test 5.2 corregido al comportamiento real (Supermercado arranca ABIERTO, el clic lo cierra). 155/155 verdes.

### ⚠️ Fix de layout del rail (post revisión visual del usuario)
El usuario reportó que el rail NO aparecía a la izquierda. **Causa raíz**: el `Sidebar` de Base UI usa `data-slot="sidebar-container"` con `fixed ... data-[side=left]:left-0` → se monta pegado al borde izquierdo del viewport y **tapa** el rail (que sí ocupaba sus 70px en el flujo flex). **Fix**: (1) clase `admin-shell` en el contenedor de `AdminLayout`; (2) regla en `globals.css` `@media (min-width:768px){ .admin-shell [data-slot="sidebar-container"][data-side="left"]{ left:70px } }` (especificidad 0,3,0 > el `left-0` del primitivo, sin `!important`); (3) rail pasado a `sticky top-0 self-start h-screen` para pinearlo full-height. Resultado: rail 0–70px, sidebar fijo 70–326px, contenido después. Tests no lo cubren (jsdom no hace layout) → verificación visual del usuario.

### Contrato de fase
`status: apply-complete` · Batches 1–8 + fix de layout del rail. Pendiente: confirmación visual del usuario + commit + PR a developer.
