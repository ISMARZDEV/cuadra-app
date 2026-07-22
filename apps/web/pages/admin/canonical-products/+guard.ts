import { hasAdminCapability } from "@/features/admin/shell/require-admin";
import { render } from "vike/abort";
import type { PageContext } from "vike/types";

export async function guard(pageContext: PageContext) {
  const allowed = await hasAdminCapability(pageContext.headers, "admin_save_catalog_ops");
  if (!allowed) throw render(403, "No autorizado.");
}
