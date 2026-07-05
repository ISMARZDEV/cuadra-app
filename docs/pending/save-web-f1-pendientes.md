# Save Web — Pendientes de F1 + Deuda Arquitectónica

> Estado al **2026-07-04**. Rama `feat/save-supermercados`. Verificado contra el código, no de
> memoria. Las 3 piezas CORE de F1 (lista D1, alertas G4, histórico C9) están cerradas; A6
> (colecciones curadas) también. Lo que queda es **pulido, SEO, hardening y deuda de organización**.

---

## 1. Pendientes de FEATURE (F1)

### 1.1 SEO / i18n — el bloque de mayor valor
- [ ] **Slugs legibles de producto** — hoy la ruta es `product/@id` con **UUID** (`routeParams.id`).
  Necesita un campo `slug` en el backend (canonical_product) y resolver por slug. Es la pieza
  ANCLA: destraba `og:image` y `canonical`.
  - `apps/web/pages/save/supermarkets/product/@id/` · backend `canonical_product`
- [ ] **`og:image` dinámico por producto** — `+Head.tsx` hoy tiene `og:type/title/description` +
  JSON-LD, pero **falta `og:image`** (previews de WhatsApp/redes salen sin imagen).
  - `apps/web/pages/save/supermarkets/product/@id/+Head.tsx`
- [ ] **`<link rel="canonical">`** — no está presente en ninguna página.
- [ ] **`Accept-Language` en el guard** — hoy redirige a `es-do` FIJO (ignora el idioma del browser).
  El propio comentario del archivo lo marca como follow-up.
  - `apps/web/pages/+guard.ts`
- [ ] **Multi-país real** (US/CO/BR) — hoy solo DO en `src/i18n/locales.js` + datos backend.

### 1.2 Home — assets/contenido
- [ ] **Logos de supermercados** en "Ofertas por supermercado" — hoy son badges de texto.
- [x] ~~"Inspiración"~~ — es contenido de News, **deferido, no necesario ahora**.

### 1.3 Hardening pre-producción (hoy en modo dev)
- [ ] **IdP real** — el `dev-login` (`/identity/dev-login`) es solo para desarrollo.
- [ ] **Matching de alertas como schedule de Dagster** — hoy es un endpoint con dev-guard
  (`POST /save/alerts/run-matching`), no un job programado.
- [ ] **G4 menores**: badge read/unread de notificaciones + **copy de push localizado** (hoy
  español fijo; el backend no conoce el locale del user al matchear).

### 1.4 Placeholders de nav — OK como "próximamente" (verificado)
Los 6 usan `PlaceholderPage` y muestran "próximamente". **No están rotos; se quedan así.**
- `/news`, `/about`, `/pricing`, `/save/financial-products`, `/save/investments`, `/save/insurance`

### 1.5 Acción del usuario (no código)
- [ ] Correr `./scripts/ios-device-build.sh` en el iPhone físico + aceptar permiso → probar las
  notificaciones LOCALES de G4 (el push remoto iOS requiere Apple Developer de pago).

---

## 2. Deuda ARQUITECTÓNICA (apps/web)

> Referencia: `apps/mobile` es feature-oriented (`features/{name}/components`, `components/{ui,charts,
> forms,navigation}`, `lib/{api,hooks,theme}`). OJO: mobile tiene su PROPIA deuda (`types` en 3
> lugares, `theme` en 2) y sus `shared/{enums,interfaces,types}` están **vacíos** → seguimos su
> INTENCIÓN, no clonamos su desorden.

### Fase 1 — Higiene (bajo riesgo, alto valor) 🔴
- [ ] **Matar duplicación de `asList()`** — idéntico en `category-filters.tsx:23` y
  `category/@slug/+Page.tsx:129` → extraer a `lib/`.
- [ ] **Extraer `<ProductRail>`** — el markup del carrusel Embla está duplicado en
  `section-rail.tsx` y el Overview de `category/@slug/+Page.tsx` (introducido el 2026-07-04).
- [ ] **Centralizar magic strings** en `lib/save/constants.ts` (union `as const`, NO enums):
  - `SORT` = `popular | unit_price | price | name`
  - `VIEW_MODE` = `loadmore | pages`
  - `MARKET` / default. Hoy hardcodeados en data-loaders, `+Page` y `category-filters`.
- [ ] **Mover `category-icons.tsx`** de `lib/` a `components/` (es un componente, no una utilidad).

### Fase 2 — Estructura (riesgo medio: muchos imports; commit aislado) 🟡
- [ ] **Reorganizar `components/`** (hoy plano, 15 archivos) en:
  - `components/save/` — product-card, category-filters, section-rail, compare-table,
    price-history-chart, pagination, breadcrumbs
  - `components/layout/` — site-header, site-footer, switcher, theme-toggle, theme-script,
    hreflang, global-head
  - `components/ui/` — primitivos shadcn (ya existe)
- [ ] **Separar `lib/`** en:
  - `lib/api/` — api.ts, alerts-api.ts
  - `lib/hooks/` — use-auth.ts, use-shopping-list.ts
  - `lib/save/` (dominio) — format, links, seo, price-history, shopping-list, constants
  - `scripts/` — sitemap.js (es build, no runtime)

### Fase 3 — Descomposición (bajo riesgo) 🟡
- [ ] Partir `category/@slug/+Page.tsx` (281 LOC) — hoy mete `CategoryOverview` + `CategoryListing`
  + `navigateWith` + `loadMore` en un archivo → componentes propios.

### Descartado (decisión de arquitectura)
- ❌ **NO** copiar `shared/enums|interfaces|types` de mobile (vacíos, aspiracionales).
- ❌ **NO** introducir `enum` de TS — union `as const` es superior (cero runtime, tree-shakeable,
  structural typing, mejor narrowing).
- ✅ `dist/` ya está gitignored (no es basura del repo). `site-header/footer` NO están muertos
  (van en `LayoutDefault.tsx`).

**Regla:** el refactor va en commits `refactor(web):` SEPARADOS del PR de features. No mezclar.

---

## 3. Fuera de F1 (es F2)
- ShopifyAdapter / Plaza Lama → baja a agente-IA (Plaza Lama es Next.js custom, no Shopify).
- **Alternativas / Relacionados** del producto → matching + embeddings.
- **D2** — "en qué súper cuesta menos la canasta entera" (optimización backend).
- Persistir la lista de compra al meter auth (hoy es local, sin auth — decisión del usuario).

---

## 4. Estado de la rama
Todo commiteado en `feat/save-supermercados` (SIN pushear). Pendiente: push + PR a `developer`
(preguntar squash vs rebase). Ver `.claude/skills/cuadra-git-workflow`.
