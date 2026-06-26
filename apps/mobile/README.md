# Cuadra Mobile

React Native · **Expo Router** (file-based). Feature-first + atomic. Ver `docs/estructura-monorepo.md`.

## Correr

```bash
pnpm install
pnpm --filter @cuadra/mobile start   # Expo
```

## Estructura

- `app/` — rutas (Expo Router): `(auth)` · `(tabs)` (News·Insights·AISpace·Save·Config).
- `src/features/*` — feature-first (components·hooks·api·store·types).
- `src/components/*` — UI atómica (charts con Reanimated/Skia · §9).
- `src/lib/{offline,stt}` — PowerSync (offline-first §12·C) · STT on-device (§7.7).
- `src/{store,theme,i18n}` — Zustand · verde cálido · es-DO.

> Consume el backend solo por `@cuadra/api-client` (contrato OpenAPI · ADR 24).
