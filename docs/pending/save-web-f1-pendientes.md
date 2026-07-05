# Save Web — Pendientes de F1 + Deuda Arquitectónica

> Estado al **2026-07-04**. Rama `feat/save-supermercados`. Verificado contra el código, no de
> memoria. Las 3 piezas CORE de F1 (lista D1, alertas G4, histórico C9) están cerradas; A6
> (colecciones curadas) también. Lo que queda es **pulido, SEO, hardening y deuda de organización**.

---

## 1. Pendientes de FEATURE (F1)

### 1.1 SEO / i18n — el bloque de mayor valor
- [x] **Slugs legibles de producto** ✅ (2026-07-05, rama `feat/save-product-slug`). `slug` en
  `canonical_product` (columna `UNIQUE(market_id, slug)` + migración `b2c3d4e5f6a7` con backfill),
  helper de dominio `product_slug` (omite marca ya presente en el nombre), autogen+dedupe en el
  repo (`add`), `get_by_slug`, y `/save/compare` resuelve por slug **con fallback a UUID** (patrón
  permalink: las páginas privadas —lista local, feed de alertas— siguen linkeando por id). Ruta web
  `product/@id` → `product/@slug`; links públicos (rails/categoría/colección/búsqueda) por slug;
  sitemap por slug. 154 tests save + 28 web verdes.
  - `apps/web/pages/save/supermarkets/product/@slug/` · backend `canonical_product`
- [x] **`og:image` dinámico por producto** ✅ (2026-07-05). `+Head.tsx` ahora emite `og:image`
  (desde `image_url`, que ya estaba en el DTO) + `og:url`.
  - `apps/web/pages/save/supermarkets/product/@slug/+Head.tsx`
- [x] **`<link rel="canonical">`** ✅ (2026-07-05). En la página de producto, apunta SIEMPRE a la
  URL del slug (aunque se entre por el UUID de fallback) → una sola URL canónica por producto.
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

## 2. Deuda ARQUITECTÓNICA (apps/web) — ✅ RESUELTA (2026-07-05, rama `refactor/web-feature-structure`)

> **HECHO.** `apps/web` ahora ESPEJA a `apps/mobile` (feature-first), guiado por la skill nueva
> `cuadra-web`. 6 commits (`chore(skills)` + 5 `refactor(web)` Fase 1/2/3a/3b). typecheck limpio,
> 33 tests (subieron de 28), SEO intacto. Estructura final:
> - `features/save/{screens/ · components/ · hooks/ · lib/ · api.ts · enums.ts · interfaces.ts · types.ts}`
> - `components/{ui/ · layout/}` · `lib/{api.ts · links.ts · utils.ts}` (compartido) · `scripts/sitemap.js`
> - Rutas Vike `pages/**/+Page.tsx` = re-exports finos (1-2 LOC) del screen del feature (espejo app/→features).
> - Decisiones: `links.ts` quedó compartido (layout+save+sitemap, no baja a feature); tipos SSR
>   (CategoryData/ProductData/…) definidos en `features/save/types.ts` y re-exportados por `+data`
>   (single source, sin dependencia feature→pages). Bug de raíz arreglado: alias `@` faltaba en
>   `vitest.config.ts`. FALTA: push + PR a `developer`.
>
> Referencia: `apps/mobile` es feature-oriented. OJO: sus `shared/{enums,interfaces,types}` están
> **vacíos** → seguimos su INTENCIÓN (tipos POR-FEATURE), no clonamos su desorden.

### Fase 1 — Higiene ✅
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
