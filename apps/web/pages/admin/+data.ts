import type { PageContextServer } from "vike/types";

import { resolveAdminIdentity } from "@/features/admin/shell/require-admin";

/** Data compartida por TODO el subárbol `/admin/*` — las capabilities del usuario actual,
 * consumidas por `+Layout.tsx` (vía `useData`) para filtrar el nav de `AdminLayout`. */
export interface AdminShellData {
  capabilities: string[];
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
  return { capabilities: identity?.capabilities ?? [] };
}
