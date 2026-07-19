import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { hasAnyAdminCapability } from "@/features/admin/shell/require-admin";

// Gate de ENTRADA de TODO el subárbol `/admin/*` — server-side (SAGRADO, cuadra-clerk/cuadra-web):
// nunca confiar en un check de solo-cliente, probado saltándose la UI. 403 si el request no resuelve
// una identidad con NINGUNA capability admin.
//
// 10.D: antes gateaba con `ADMIN_RESOURCES[0].capability` — frágil, funcionaba solo porque
// review-queue es el primero (reordenar el array lo rompía). Ahora chequea "¿tiene ALGUNA capability
// admin?" (independiente del orden). Vike resuelve UN hook `guard()` por página, el más específico
// gana (no se acumulan), así que cada subárbol (review-queue/providers/sources/basket) re-chequea su
// capability ESPECÍFICA en su propio +guard.ts — este solo corta el acceso de quien no es admin.
export async function guard(pageContext: PageContext) {
  const allowed = await hasAnyAdminCapability(pageContext.headers);
  if (!allowed) throw render(403, "No autorizado.");
}
