# Pendientes — `save-admin-review` (OFV · consola admin de Save)

> Estado **2026-07-19** · Este doc lista lo que queda ABIERTO. Contexto de dominio: skill `cuadra-save-admin`.
> Prioridad: **P1** = valioso, planificado · **P2** = follow-up/deuda · **OPS** = entorno/despliegue,
> no código de feature.
>
> **Purga 2026-07-19 (F4 #4.1-4.3):** se retiraron los ítems que la Fase 3 P0 ya cerró y que este doc
> seguía listando como abiertos — un "pendientes" que enumera trabajo hecho manda a la próxima sesión a
> re-resolver lo resuelto. Cerrados y verificados contra el código: **i18n admin es/en/pt** (10.A, +
> selector de idioma en la topbar) · **cutover de la canasta** (`BASKET_QUERIES` y `build_sources` ya no
> existen, F0 #4) · **`GET /admin/save/providers` con DTO admin** (#11, `admin_save.py:314`) ·
> **dev-login 500** (10.C) · **gate SSR con dev-login** (10.B-D, la cookie `__session` se espeja) ·
> **guard padre frágil** (10.D, ahora `hasAnyAdminCapability`). Git guarda el detalle.

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

1. **`position` de la canasta sin consumo downstream.** El reorder ↑/↓ funciona y ordena la LISTA del
   editor, pero nada aguas abajo usa el orden todavía. No urge.
2. **Logo del proveedor en la tabla de comparación pública.** `compare-table.tsx` usa `ComparedPriceDto`
   (solo `provider_id`/`provider_name`), NO `ProviderRefDto` — así que el logo real (que YA se agregó al
   `ProviderRefDto` público y a la home "Ofertas por supermercado") NO llega a la tabla de comparación de
   un producto. Wirearlo requiere tocar `PriceComparisonEntry`/`PriceComparisonDto.from_comparison` +
   la infra de comparación (más que un campo de DTO). Follow-up de 3.4-b.
3. **Health de fuentes: solo manual-pause + frescura.** Por diseño (checkpoint 3.17: no existe hook de
   detección de rotura en el pipeline). Si en el futuro se agrega detección de schema-break/error-rate,
   `derive_source_health` se extiende con esas señales — hoy sería inventar un dato que no está.
4. **Falta el clic-through con sesión CLERK real en navegador.** Lo que SÍ está verificado (2026-07-19):
   backend en vivo (401/403, CRUD, SSRF 422, health, basket 213); y con **dev-login** el SSR del admin
   renderiza autenticado (403 sin cookie / 200 con cookie), en es/en/pt, con screenshots leídos en tema
   claro y oscuro. Lo que falta es específicamente el pase manual con un login **Clerk** real — el resto
   del camino ya no es humo sin verificar.

---

## OPS — entorno / despliegue (no código de feature)

1. **Re-correr `seed_identity` en cada entorno ya sembrado — SIGUE VIGENTE, y crece con cada módulo.**
   `seed_identity` usa `on_conflict_do_nothing`: un entorno sembrado ANTES de que se agregara una
   capability NO la tiene, y el super_admin come 403 **sin que nada falle ruidosamente**. Ya pasó con
   `admin_save_matching_review`/`admin_save_ingestion_ops` (F2·B1) y vuelve a aplicar con
   `admin_save_orchestration_ops` (F4 #4.1). **Paso obligatorio de post-deploy.** En dev se auto-sana:
   `POST /identity/dev-login` llama al seed (10.C, verificado 2026-07-19 sobre un super_admin ya
   existente). En prod NO hay ese atajo.
2. **No hay super_admin sembrado.** Los usuarios se auto-provisionan por Clerk como `normal_user`. Para
   dar acceso admin: provisionar (login) + `INSERT INTO identity.user_role (user_id, role_key) VALUES
   ('<uuid>', 'super_admin') ON CONFLICT DO NOTHING`. Considerar un allowlist de emails super_admin por
   env, o un CLI de bootstrap, para no depender de SQL manual. (En dev basta
   `dev-login {role:"super_admin"}`.)
3. **Dagster OSS no tiene autenticación** (verificado 2026-07-19). Cualquiera con la URL del webserver
   tiene control total del runner: lanzar, cancelar, borrar. Al desplegar la Orquestación (F4), el
   webserver **no puede quedar expuesto públicamente** — la API lo alcanza por red privada y la URL vive
   en config (`SAVE_DAGSTER_GRAPHQL_URL`), nunca hardcodeada. La capability
   `admin_save_orchestration_ops` es el único control de acceso real sobre la ejecución del pipeline.

---

## Referencias

- Plan + features: `docs/sdd/save-admin-review/{plan.md,features.md}` · aispace-men `sdd/save-admin-review/*`
- Dominio de la consola: skill `cuadra-save-admin` · matching que la alimenta: `cuadra-save-matching`
- i18n del web: `apps/web/src/i18n/{usePageI18n.ts,messages.ts,config.ts}`
