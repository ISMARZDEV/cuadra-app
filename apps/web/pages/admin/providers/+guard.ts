import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { hasAdminCapability } from "@/features/admin/shell/require-admin";

// Gate propio de `/admin/providers/*`: el `+guard.ts` del padre (`pages/admin/+guard.ts`) solo
// verifica que seas admin (ALGUNA capability admin, 10.D). Vike resuelve UN SOLO hook `guard()` por
// página — el más específico gana, nunca se acumulan (mismo comportamiento no-composición que
// `+data.ts`) — así que la capability ESPECÍFICA se re-chequea acá: sin este archivo, un admin con
// SOLO `admin_save_matching_review` (sin `admin_save_ingestion_ops`) entraría a `/admin/providers`.
export async function guard(pageContext: PageContext) {
  const allowed = await hasAdminCapability(pageContext.headers, "admin_save_ingestion_ops");
  if (!allowed) throw render(403, "No autorizado.");
}
