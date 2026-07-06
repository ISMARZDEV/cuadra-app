import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { hasAdminCapability } from "@/features/admin/shell/require-admin";

// Gate propio de `/admin/basket-queries/*`: el `+guard.ts` del padre (`pages/admin/+guard.ts`) solo
// chequea la capability del PRIMER `AdminResource` registrado. Vike resuelve UN SOLO hook
// `guard()` por página — el más específico gana, nunca se acumulan (mismo comportamiento
// no-composición que `+data.ts`) — así que sin este archivo, un admin con SOLO
// `admin_save_ingestion_ops` quedaría 403 acá (mismo bug que motivó `pages/admin/providers/+guard.ts`
// y `pages/admin/sources/+guard.ts`). Re-chequea su propia capability.
export async function guard(pageContext: PageContext) {
  const allowed = await hasAdminCapability(pageContext.headers, "admin_save_ingestion_ops");
  if (!allowed) throw render(403, "No autorizado.");
}
