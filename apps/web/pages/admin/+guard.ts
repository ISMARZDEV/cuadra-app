import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { ADMIN_RESOURCES } from "@/features/admin/shell/admin-resource";
import { hasAdminCapability } from "@/features/admin/shell/require-admin";

// Gate anidado de TODO el subárbol `/admin/*` — server-side (SAGRADO, cuadra-clerk/cuadra-web):
// nunca confiar en un check de solo-cliente, probado saltándose la UI. 403 si falta la capability.
//
// F2·B1 (batch 2.1-2.6, un único resource registrado) usa la capability del único `AdminResource`
// existente como gate "de entrada" al subárbol; cuando existan varios módulos con capabilities
// distintas, este gate deja de ser suficiente por sí solo y cada resource deberá re-chequear la
// suya en su propio +guard.ts/+data.ts (fuera de este batch).
export async function guard(pageContext: PageContext) {
  const [resource] = ADMIN_RESOURCES;
  if (!resource) throw render(403, "Sin módulos admin disponibles.");

  const allowed = await hasAdminCapability(pageContext.headers, resource.capability);
  if (!allowed) throw render(403, "No autorizado.");
}
