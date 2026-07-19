import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { hasAdminCapability } from "@/features/admin/shell/require-admin";

// Gate propio de `/admin/basket-queries/*`: el `+guard.ts` del padre solo verifica que seas admin
// (ALGUNA capability admin, 10.D); la ESPECÍFICA se re-chequea acá. Vike resuelve UN SOLO hook
// `guard()` por página — el más específico gana, no se acumulan — así que sin este archivo un admin
// con SOLO `admin_save_matching_review` entraría acá. Re-chequea su propia capability.
export async function guard(pageContext: PageContext) {
  const allowed = await hasAdminCapability(pageContext.headers, "admin_save_ingestion_ops");
  if (!allowed) throw render(403, "No autorizado.");
}
