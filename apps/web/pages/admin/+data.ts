import type { PageContextServer } from "vike/types";

import { extractAdminLocale, resolveAdminIdentity } from "@/features/admin/shell/require-admin";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";

/** Data compartida por TODO el subárbol `/admin/*` — las capabilities del usuario actual,
 * consumidas por `+Layout.tsx` (vía `useData`) para filtrar el nav de `AdminLayout`, y el `locale`
 * para `useAdminI18n(locale)`. `/admin/*` está exento del prefijo `/{locale}/{country}` (ver
 * `+guard.ts`), así que el locale NO puede leerse de la URL como en el resto del sitio
 * (`usePageI18n`) — viaja explícito acá, resuelto de `MeResponse.locale` (SSR). */
export interface AdminShellData {
  capabilities: string[];
  locale: Locale;
  /** `MeResponse.name` — para el user chip de `AdminTopBar` (batch 4). */
  name: string;
  /** `MeResponse.email` — threadeado por si un follow-up lo necesita; no se renderiza aún. */
  email: string | null;
}

// Vike NO acumula `+data.ts` automáticamente entre niveles de ruta: el `+data.ts` más específico
// (p.ej. `review-queue/+data.ts`) gana por completo y pisaría este si no se compone a mano. Por
// eso cada `+data.ts` hijo bajo `pages/admin/` DEBE importar y llamar esta función explícitamente
// y fusionar su resultado (patrón documentado de Vike para "layout data" + "page data") — nunca un
// segundo mecanismo de resolución de identidad, reusa `resolveAdminIdentity` (MISMO helper que
// `+guard.ts`). Nota conocida: esto implica una segunda llamada a `/identity/me` por request
// (`+guard.ts` ya resolvió la identidad para el gate) — aceptado como simplificación de B1; no hay
// un mecanismo limpio en Vike para compartir el resultado entre `guard()` y `data()` sin acoplar
// pageContext con un campo custom, y el volumen de tráfico admin es bajo.
export async function data(pageContext: PageContextServer): Promise<AdminShellData> {
  const identity = await resolveAdminIdentity(pageContext.headers);
  // Prioridad: switcher del admin (cookie) → locale del usuario (MeResponse) → default.
  const userLocale = isLocale(identity?.locale) ? identity.locale : DEFAULT_LOCALE;
  return {
    capabilities: identity?.capabilities ?? [],
    locale: extractAdminLocale(pageContext.headers) ?? userLocale,
    name: identity?.name ?? "",
    email: identity?.email ?? null,
  };
}
