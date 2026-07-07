# Pendientes — `save-admin-review` (OFV · consola admin de Save)

> Estado **2026-07-06** · Rama `feat/save-admin-review` · Fase 3 COMPLETA (backend 675 + web 125 tests).
> Este doc lista lo que queda ABIERTO tras cerrar la Fase 3. Contexto de dominio: skill `cuadra-save-admin`.
> Prioridad: **P0** = decidido/pedido, hay que hacerlo · **P1** = valioso, planificado (Fase 4) ·
> **P2** = follow-up/deuda · **OPS** = entorno/despliegue, no código de feature.

---

## P0 — i18n en el admin (DECISIÓN REVERTIDA por el usuario)

**Contexto:** la consola admin se construyó a propósito **SIN i18n** (`AdminLayout` lo dice: "herramienta
interna de operación, no aplica el mandato es/en/pt"). **El usuario revirtió esa decisión (2026-07-06):
el i18n SÍ debe estar en el admin.**

**La fricción real:** las rutas `/admin/*` están **exentas del prefijo `/{locale}/{country}/`** (Fase 2,
tareas 2.5-2.6 — el `pages/+guard.ts` raíz hace early-return para `/admin/*` sin redirect de locale). Por
eso el admin NO tiene locale en la URL, y `usePageI18n()` (que lo lee del `pageContext` puesto por
`+onBeforeRoute` desde la URL) caería siempre a `DEFAULT_LOCALE`.

**Enfoque recomendado (fuente del locale = la identidad, no la URL):**
1. El `/identity/me` YA devuelve `locale` del usuario (`MeResponse.locale`, ej. `"es-DO"`) — verificado
   en runtime. El `pages/admin/+data.ts` ya llama a `resolveAdminIdentity`; extender ese `+data` para
   exponer también `locale` (además de `capabilities`) al shell.
2. Añadir las claves de mensajes del admin a `apps/web/src/i18n/messages.ts` (namespace `admin.*`:
   `admin.nav.reviewQueue`, `admin.providers.title`, `admin.sources.probe`, etc.) en es/en/pt.
3. En las pantallas admin, derivar `t()` del locale de la identidad — NO de `usePageI18n()` (que depende
   de la URL). Opciones: (a) un `useAdminI18n(locale)` que envuelve `translate(locale, key)`, o (b)
   inyectar el locale por contexto desde `+Layout.clear.tsx`. Preferir (a): explícito, testeable, espeja
   el patrón de `usePageI18n`.
4. **Opcional pero recomendado:** un selector de idioma en el `AdminLayout` (el admin puede querer operar
   en otro idioma que su `home_locale`), persistiendo la preferencia. Si se difiere, el locale de la
   identidad es el default correcto.
5. Reemplazar TODOS los strings hardcodeados en español de los 4 recursos
   (`features/admin/resources/{save-matching,save-providers,save-sources,save-basket}`) + `AdminLayout` +
   `admin-resource.ts` (los `label` del nav) por claves `t("admin.…")`.
6. **TDD:** test de que una screen admin renderiza en `en`/`pt` según el locale de la identidad; test de
   que los labels del nav se traducen. RED-first.

**Actualizar** la skill `cuadra-save-admin` (gotcha #8 ya corregido) y el comentario de `AdminLayout.tsx`
cuando esto aterrice.

---

## P1 — Fase 4: Observabilidad (planificada, NO construida)

Tareas 4.1-4.6 del plan (`docs/sdd/save-admin-review/plan.md`). Gate: las columnas de costo del juez
(`product_match.judge_*`, ya existen desde Fase 1) pobladas por corridas reales de matching.

- `GetMatchingMetrics` (backend): tasa de auto-link, tamaño de cola en el tiempo, % que llega al juez, y
  **costo/latencia del juez por percentiles `percentile_cont(0.5/0.95/0.99)`** — **NUNCA solo promedio**
  (anti-patrón: los promedios ocultan la cola de gasto/latencia). Estado "sin llamadas al juez" ≠ blanco/cero.
- `MatchingMetricsScreen` (web): renderiza p50/p95/p99, nunca promedio-solo. Nueva entrada en `ADMIN_RESOURCES`.
- Data-dependent: necesita volumen de juez seedeado/replayado para tests significativos.

---

## P2 — Follow-ups / deuda de las features ya entregadas

1. **Cutover de ingesta a `basket_query`.** El backfill de las 213 queries ya está en la tabla (migración
   `0990d45c068a`), pero la ingesta **sigue leyendo el `BASKET_QUERIES` hardcodeado** de
   `apps/api/ingestion/save/sources.py::build_sources`. Falta cambiar el wiring para que lea la tabla
   (usando `CatalogSourceFactory.build(...).for_query(provider_id, market_id, query_text)` por cada fila
   activa). Hasta ese cutover, editar la canasta en el admin NO afecta la ingesta real.
2. **`position` de la canasta sin consumo downstream.** El reorder ↑/↓ funciona y ordena la LISTA del
   editor, pero nada aguas abajo usa el orden todavía (depende del cutover #1). No urge.
3. **Sin endpoint admin de LISTADO de providers/sources.** La pantalla de Providers usa el público
   `listProviders` (por eso solo puede prellenar name/logo_url; tipo/plataforma/mercado son solo-alta).
   Sources usa `GET /sources/health`. Si se quiere edición completa de un provider existente, hace falta
   un `GET /admin/save/providers` con el DTO admin completo.
4. **Logo del proveedor en la tabla de comparación pública.** `compare-table.tsx` usa `ComparedPriceDto`
   (solo `provider_id`/`provider_name`), NO `ProviderRefDto` — así que el logo real (que YA se agregó al
   `ProviderRefDto` público y a la home "Ofertas por supermercado") NO llega a la tabla de comparación de
   un producto. Wirearlo requiere tocar `PriceComparisonEntry`/`PriceComparisonDto.from_comparison` +
   la infra de comparación (más que un campo de DTO). Follow-up de 3.4-b.
5. **Health de fuentes: solo manual-pause + frescura.** Por diseño (checkpoint 3.17: no existe hook de
   detección de rotura en el pipeline). Si en el futuro se agrega detección de schema-break/error-rate,
   `derive_source_health` se extiende con esas señales — hoy sería inventar un dato que no está.
6. **Verificación E2E de UI web con navegador (login Clerk real) — NO hecha.** El E2E de backend está
   verificado en vivo (401/403, CRUD, SSRF 422, health, basket 213). Falta el clic-through manual del
   panel autenticado por Clerk en un navegador real (el crash de doble-ClerkProvider ya se arregló y el
   SSR renderiza el panel completo con cookie, pero un pase manual de humo visual sigue pendiente).

---

## OPS — entorno / despliegue (no código de feature)

1. **Re-correr `seed_identity` en cada entorno ya sembrado.** Fase 1 agregó las capabilities
   `admin_save_matching_review` / `admin_save_ingestion_ops` al rol SUPER_ADMIN en el código del seed,
   pero `seed_identity` usa `on_conflict_do_nothing` → un entorno sembrado antes de B1 NO las tiene y un
   super_admin recibe 403. **Paso de post-deploy/onboarding: re-correr el seed.** (Detectado y arreglado
   en dev el 2026-07-06.)
2. **No hay super_admin sembrado.** Los usuarios se auto-provisionan por Clerk como `normal_user`. Para
   dar acceso admin: provisionar (login) + `INSERT INTO identity.user_role (user_id, role_key) VALUES
   ('<uuid>', 'super_admin') ON CONFLICT DO NOTHING`. Considerar un allowlist de emails super_admin por
   env, o un CLI de bootstrap, para no depender de SQL manual.
3. **BUG: `POST /v1/identity/dev-login` da 500** para un email ya provisionado por Clerk (app_env=dev;
   revienta dentro de `_get_or_create_dev_user` o `encode_token`). No bloquea el flujo Clerk (que es el
   real), pero rompe cualquier E2E headless que intente sacar token por dev-login. **Investigar y arreglar.**
4. **Gate SSR requiere cookie Clerk real.** El dev-login guarda el token en localStorage → inalcanzable
   server-side → `/admin/*` SIEMPRE 403 con dev-login puro. Para ver el admin en local sin Clerk: setear
   un token dev HS256 (`encode_token({"sub": user_id})`) como cookie `__session`. Documentado en
   `require-admin.ts` y en la skill `cuadra-save-admin`.
5. **Bug latente del guard padre.** `pages/admin/+guard.ts` solo chequea `ADMIN_RESOURCES[0].capability`.
   Hoy cubierto porque cada recurso tiene su `+guard.ts` propio (los guards de Vike NO componen), pero el
   guard padre debería iterar/derivar la capability correcta o quedar como baseline explícito.

---

## Referencias

- Plan + features: `docs/sdd/save-admin-review/{plan.md,features.md}` · aispace-men `sdd/save-admin-review/*`
- Dominio de la consola: skill `cuadra-save-admin` · matching que la alimenta: `cuadra-save-matching`
- i18n del web: `apps/web/src/i18n/{usePageI18n.ts,messages.ts,config.ts}`
