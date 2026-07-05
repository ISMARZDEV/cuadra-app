# Pendiente — Push remoto (24/7) para las alertas de precio G4

> Estado: **PENDIENTE (requiere cuenta Apple Developer de pago)**. Fecha: 2026-07-04.
> Rama de referencia: `feat/save-supermercados`.

## Qué funciona hoy (gratis)

Las alertas de precio G4 funcionan **cross-plataforma** con firma Apple **gratuita**, vía
**notificaciones LOCALES**:

- El usuario sigue productos en la web (o donde haya "Avísame cuando baje").
- El backend detecta la bajada (`RunAlertMatching`) y crea la notificación en el feed
  (`alert_notification`), por `user_id` → compartido entre web y app.
- La app móvil (`apps/mobile/src/lib/notifications/local-alerts.ts`) consulta el feed y dispara una
  **notificación local** por cada alerta nueva. Aparece incluso en la pantalla de bloqueo.
- Verificado end-to-end en iPhone físico con Apple ID gratuito.

### Límite del tier gratis (por diseño de iOS)

La notificación local la dispara la app, así que **solo se dispara con la app activa o al volver a
primer plano** (y en el poll periódico mientras está activa). **NO** suena con la app forzada a
cerrar ni de forma garantizada en segundo plano. El "buzz 24/7 con la app cerrada" necesita **push
remoto** (APNs) → **cuenta Apple Developer de pago ($99/año)**. Confirmado en la doc oficial de Expo
(`docs.expo.dev/push-notifications/push-notifications-setup` → iOS: *"A paid Apple Developer Account
is required to generate credentials."*).

## Qué falta para el push remoto (cuando haya cuenta de pago)

El backend **ya envía** el push remoto — solo está desconectado en el cliente. Pasos:

1. **Entitlement**: re-agregar `aps-environment` a `apps/mobile/ios/Cuadra/Cuadra.entitlements`.
   OJO: `ios/` es gitignored (CNG) y `expo prebuild` lo RE-AGREGA solo; hoy lo quitamos a mano para
   que la firma gratis compilara. Con cuenta de pago **no hay que quitarlo**.
2. **Registro del token**: volver a llamar `registerForPushNotifications()` de
   `apps/mobile/src/lib/push/register-push.ts` en `app/_layout.tsx` (hoy se llama
   `startLocalAlertNotifications()` en su lugar). Ese archivo ya pide permiso, obtiene el Expo push
   token (`getExpoPushTokenAsync({ projectId })`, projectId ya está en `app.json`) y lo manda a
   `POST /v1/save/alerts/push-token`.
3. **Credenciales APNs**: `eas credentials` (o el prompt de `eas build`) genera la APNs key. Lo más
   limpio es construir con **EAS Build** (`eas build -p ios --profile development`) usando el paid team.
4. **Backend**: ya listo — `ExpoPushSender` (`apps/api/src/contexts/save/infrastructure/
   expo_push_sender.py`) hace `POST https://exp.host/--/api/v2/push/send`; `RunAlertMatching` lo
   invoca al crear cada notificación. Nada que cambiar.

## Seguir productos DESDE LA APP (pendiente — parte del Save móvil)

La idea es poder seguir productos tanto desde **cuadra.do** como **desde la app**. A nivel de
backend **ya funciona**: `POST /v1/save/alerts` es autenticado y sirve a cualquier cliente con la
sesión (el móvil ya inyecta el Bearer). El hook `useSubscribeAlert()` ya existe en
`apps/mobile/src/features/save/api.ts`, listo para cablear.

Lo que falta es la **UI de Save en el móvil**: hoy el tab Save es solo la pantalla de alertas
(feed + suscripciones). Cuando se porte el marketplace de Save a la app (buscar · categorías ·
página de producto), la página de producto lleva el botón **"Avísame cuando baje"** → llama
`useSubscribeAlert` → misma alerta compartida por `user_id` entre web y app. Es solo UI; el
dominio y los endpoints ya están.

## Follow-ups relacionados (menores)

- Notificaciones **read/unread** + badge (`alert_notification.read_at` ya existe en el schema; falta
  el endpoint de marcar-leído + el badge en la campana web / tab Save).
- **Copy del push localizado por usuario**: hoy el push remoto arma el título/cuerpo en español fijo
  en el backend (`RunAlertMatching._notify`) porque no conoce el locale del usuario al matchear. La
  notificación LOCAL sí respeta el idioma de la app (usa `t()`). Para el remoto: guardar el locale
  del usuario o mandar `data` y armar el copy en el cliente.
- **Matching en prod como schedule de Dagster** (hoy `POST /save/alerts/run-matching` está
  dev-guarded). Mover a un asset/schedule en `apps/api/ingestion`.
