# Save Web — Pendientes de F1 + Deuda Arquitectónica

> Estado al **2026-07-05**. Rama `feat/save-web-f1-followups`. Verificado contra el código, no de
> memoria. Las 3 piezas CORE de F1 (lista D1, alertas G4, histórico C9) están cerradas; A6
> (colecciones curadas) también. La deuda arquitectónica web (§2) quedó RESUELTA (PR #16). Lo que
> queda es **hardening pre-producción** (IdP real) y trabajo que es F2/F3.

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
- [x] **`Accept-Language` en el guard** ✅ (2026-07-05, rama `feat/save-web-f1-followups`). El guard
  negocia el idioma del browser (es/en/pt) contra los soportados; el país queda fijo en DO.
  - `apps/web/pages/+guard.ts`
- [ ] **Multi-país real** (US/CO/BR) — **es F3, NO F1.** No es un toggle: requiere `store_registry`
  por país, datos de catálogo por mercado y el vertical financiero. Ver roadmap Save F3.

### 1.2 Home — assets/contenido
- [ ] **Logos de supermercados** en "Ofertas por supermercado" — hoy son badges de texto.
- [x] ~~"Inspiración"~~ — es contenido de News, **deferido, no necesario ahora**.

### 1.3 Hardening pre-producción (hoy en modo dev)
- [ ] **IdP real** — el `dev-login` (`/identity/dev-login`) es solo para desarrollo. GRANDE: requiere
  decidir proveedor (Clerk/Supabase/Auth0/custom) antes de codear.
- [x] **Matching de alertas como schedule de Dagster** ✅ (2026-07-05, rama `feat/save-web-f1-followups`).
  Nuevo asset `alert_matching` en `apps/api/ingestion/save/assets.py` (hermano de `price_drops`,
  deps de las 3 fuentes): tras el refresh cruza bajadas × suscripciones y persiste las notificaciones
  (idempotente, commitea); push best-effort vía `ExpoPushSender`. La schedule diaria `save_daily_refresh`
  (`selection="*"`) ya lo recoge. El endpoint dev-guarded `POST /save/alerts/run-matching` se MANTIENE
  como disparador manual de demo.
- [x] **G4 read/unread** ✅ (2026-07-05, rama `feat/save-web-f1-followups`). Endpoint
  `mark-notifications-read` (use-case+repo+puerto, TDD), la campanita cuenta no-leídas, marca leído al
  abrir el feed y muestra dot de nueva.
- [ ] **Copy de push localizado** — diferido. Hoy español fijo; el backend no conoce el locale del
  user al matchear. Bloqueado además por el push remoto (Apple Developer de pago); la notif LOCAL ya
  localiza. Ver `docs/pending/save-alerts-remote-push.md`.

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

### Fase 1 — Higiene ✅ (verificado en código, 2026-07-05)
- [x] **Matar duplicación de `asList()`** — extraído a `features/save/lib/query.ts` (con test);
  lo consumen `category-listing.tsx` y `category-filters.tsx`.
- [x] **Extraer `<ProductRail>`** — `features/save/components/product-rail.tsx`, consumido por
  `section-rail.tsx` y `category-overview.tsx`.
- [x] **Centralizar magic strings** — en `features/save/enums.ts` (union `as const`, con test).
- [x] **Mover `category-icons.tsx`** — ahora en `features/save/components/`.

### Fase 2 — Estructura ✅ (verificado en código, 2026-07-05)
- [x] **Reorganizar `components/`** — `components/{layout/ · ui/}` (compartido) + los de dominio bajo
  `features/save/components/`.
- [x] **Separar `lib/`** — dominio en `features/save/lib/`, api en `features/save/api.ts`, hooks en
  `features/save/hooks/`, `scripts/sitemap.js` aparte.

### Fase 3 — Descomposición ✅ (verificado en código, 2026-07-05)
- [x] Partido el `category/@slug/+Page.tsx` — `CategoryOverview` + `CategoryListing` viven en
  `features/save/components/`; la ruta Vike es re-export fino del screen.

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
Rama actual `feat/save-web-f1-followups` (SIN pushear). Contiene los follow-ups de cierre de F1:
Accept-Language en el guard, G4 read/unread, y el matching de alertas como schedule de Dagster
(#3). Base ya en `developer`: F0+F1 backend/web/mobile (PR #14), slug SEO (PR #15), estructura
feature-first web (PR #16).

**Pendiente inmediato:** push + PR a `developer` (preguntar squash vs rebase). Ver
`.claude/skills/cuadra-git-workflow`.

**Pendiente de F1 que queda abierto:** solo **IdP real** (§1.3) — requiere decidir proveedor.
Todo lo demás es F2 (§3) o F3 (multi-país).
