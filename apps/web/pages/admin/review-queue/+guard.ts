import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { hasAdminCapability } from "@/features/admin/shell/require-admin";

// Gate propio de `/admin/review-queue/*` (10.D): simétrico con providers/sources/basket. Antes este
// subárbol dependía del `+guard.ts` del padre, que gateaba con `ADMIN_RESOURCES[0].capability` — y
// funcionaba SOLO porque review-queue es el primer resource (frágil: reordenar el array lo rompía).
// Vike resuelve UN hook `guard()` por página (el más específico gana, no se acumulan), así que cada
// subárbol re-chequea su capability aquí; el guard padre queda como gate de entrada genérico.
export async function guard(pageContext: PageContext) {
  const allowed = await hasAdminCapability(pageContext.headers, "admin_save_matching_review");
  if (!allowed) throw render(403, "No autorizado.");
}
