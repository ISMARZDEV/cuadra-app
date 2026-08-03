// Test stub for expo-haptics. Aliased in vitest.config so Vite never resolves the real package: su
// build web (`ExpoHaptics.web.ts`) llama a `window.matchMedia` EN EL IMPORT, y jsdom no lo trae —
// el módulo revienta antes de que ningún test corra. Misma razón que reanimated/svg.
// Inerte a propósito: la háptica se dispara en el handler, y lo que testeamos es el handler.
export const impactAsync = async () => {};
export const selectionAsync = async () => {};
export const notificationAsync = async () => {};
export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy" } as const;
export const NotificationFeedbackType = {
  Success: "success",
  Warning: "warning",
  Error: "error",
} as const;
