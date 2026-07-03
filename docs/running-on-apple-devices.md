# Correr Cuadra en iPhone / iPad físicos (gratis, sin Apple Developer pago)

Guía específica de Cuadra. La receta **genérica y reutilizable** (con todos los problemas y
soluciones) vive en la skill `expo-ios-free-device` de este repo
(`.claude/skills/expo-ios-free-device/` — su `references/troubleshooting.md` tiene cada error → fix).

## TL;DR — uso diario

Una vez que el dev-build ya está instalado en el device:

```bash
./scripts/dev-up.sh          # Postgres + migrate + API en LAN + Metro en LAN (IP autodetectada)
```

En el iPhone/iPad (misma Wi-Fi): abrí la app **Cuadra** → dev-client → conectá a `IP:8082` →
login con **cualquier email** (el dev-login crea el usuario al vuelo) → listo.

> Datos de ejemplo (opcional, una vez): `make seed`. El login NO lo necesita (crea el user solo),
> pero algunas pantallas (Insights, etc.) se ven vacías sin datos sembrados.

## Atajo: simulador con Expo Go (iteración rápida de UI)

Para iterar UI sin compilar nada nativo (no necesita Xcode build ni firma), corré la app en el
**simulador** con **Expo Go**:

```bash
pnpm mobile:sim                 # = ./scripts/sim-up.sh
./scripts/sim-up.sh "iPhone 17" # forzar un device por nombre
./scripts/sim-up.sh --clear     # flags extra van a `expo start`
```

El script **bootea un simulador** si no hay ninguno, **instala Expo Go si falta** (vía
`expo start --go --ios`) y abre la app. El simulador comparte la red de la Mac, así que `localhost`
alcanza la API local — no hace falta IP LAN ni dev-client.

> **Caveat de fidelidad:** Expo Go (SDK 56) **sí** incluye Skia y Reanimated, así que el orbe y las
> animaciones cargan. Pero módulos que Expo Go NO trae degradan a su fallback — sobre todo
> **`expo-glass-effect`** (el liquid-glass nativo de iOS 26): en Expo Go se ve el fallback
> blur+gradiente, no el cristal real. Para fidelidad nativa COMPLETA usá el dev-build (abajo).

## Por qué dev-build (no Expo Go) para fidelidad y device físico

Expo Go sirve para iterar rápido en el simulador, pero tiene dos límites: (1) **`expo-glass-effect`**
no está → el liquid glass cae a fallback; (2) en **device físico** hay que **firmar**. Por eso, para
ver el look nativo real o correr en iPhone/iPad, se usa un **development build** (o EAS). El simulador
también corre el dev-build sin firma (`npx expo run:ios` sin `--device`); el device físico sí requiere
firma.

## Primera vez: instalar el dev-build en un device

```bash
./scripts/ios-device-build.sh            # primer device conectado
./scripts/ios-device-build.sh <UDID>     # uno específico
```

Requiere que la **firma gratis** ya esté resuelta. Si nunca firmaste con este Mac/Apple ID,
hacé el **truco del proyecto señuelo** una vez (detalle completo en la skill
`expo-ios-free-device/references/troubleshooting.md`):

1. Agregá tu Apple ID en **Xcode → Settings → Accounts** (crea el "Personal Team").
2. **File → New → Project → App**, Bundle Identifier **idéntico** al de la app
   (`com.ismarzdev.cuadra`), Team = Personal Team. Corrélo al device con ▶.
   Esto crea el certificado (con clave privada) + el provisioning profile + registra el device.
3. El **Team ID real** sale del `DEVELOPMENT_TEAM` de ESE proyecto (en Cuadra: `DF4622YDDJ`),
   **no** del texto entre paréntesis del certificado.

## Datos clave de Cuadra

| Cosa | Valor |
|---|---|
| Bundle id | `com.ismarzdev.cuadra` |
| Team ID (free) | `DF4622YDDJ` |
| API (backend) | `apps/api` · FastAPI · puerto `8005` · Postgres `:5433` (Docker) |
| API URL en la app | `EXPO_PUBLIC_API_URL` (se inyecta en el bundle; el script la setea a la IP LAN) |
| Login | dev-login, **cualquier email**, sin password |
| Xcode mínimo | **26.6 / Swift 6.3.3** (por `weak let` de `expo-modules-jsi`) |
| Plataforma iOS | instalar **iOS 26.5** (Xcode → Settings → Components) |

## Gotchas específicos (resumen)

- **`localhost` no sirve en el device** — debe apuntar a la IP LAN de la Mac. El `dev-up.sh`
  lo resuelve solo (`ipconfig getifaddr en0`) y arranca la API en `0.0.0.0`.
- **`expo prebuild` borra `ios/`** y con eso el `DEVELOPMENT_TEAM` inyectado → `ios-device-build.sh`
  lo reinyecta si falta.
- **Otro device** (ej. el iPad) hay que **registrarlo**: `ios-device-build.sh <UDID-del-iPad>`
  usa `-allowProvisioningDeviceRegistration` y regenera el perfil.
- **Free signing caduca a los 7 días** → recompilar (`ios-device-build.sh`) lo renueva.

Procesos que deja corriendo `dev-up.sh`: Postgres (`cuadra-db`), API (`:8005`), Metro (`:8082`).
