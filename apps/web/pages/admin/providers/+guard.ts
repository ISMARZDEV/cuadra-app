import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { hasAdminCapability } from "@/features/admin/shell/require-admin";

// Gate propio de `/admin/providers/*`: el `+guard.ts` del padre (`pages/admin/+guard.ts`) solo
// chequea la capability del PRIMER `AdminResource` registrado (limitación documentada ahí, de
// cuando existía un único resource). Vike resuelve UN SOLO hook `guard()` por página — el más
// específico gana, nunca se acumulan (mismo comportamiento no-composición que `+data.ts`) — así que
// con un segundo resource de capability DISTINTA ("admin_save_ingestion_ops" vs
// "admin_save_matching_review") ese gate del padre deja de alcanzar para este subárbol: sin este
// archivo, un admin con SOLO `admin_save_ingestion_ops` (sin `admin_save_matching_review`)
// quedaría 403 en `/admin/providers` — bug, no gate. Re-chequea su propia capability.
export async function guard(pageContext: PageContext) {
  const allowed = await hasAdminCapability(pageContext.headers, "admin_save_ingestion_ops");
  if (!allowed) throw render(403, "No autorizado.");
}
