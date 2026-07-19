import { render } from "vike/abort";
import type { PageContext } from "vike/types";

import { hasAdminCapability } from "@/features/admin/shell/require-admin";

// Gate propio de `/admin/orchestration/*`. OBLIGATORIO: los hooks `guard()` de Vike NO componen —
// se resuelve UNO SOLO por página, el más específico — así que el `+guard.ts` del padre (que solo
// verifica que seas admin, 10.D) NO alcanza. Sin este archivo, cualquier admin con `ingestion_ops`
// entraría a operar corridas.
//
// Y acá la capability específica pesa más que en los otros recursos: Dagster OSS no tiene
// autenticación propia (verificado 2026-07-19), así que esta comprobación es el ÚNICO control de
// acceso real sobre el runner — lanzar, cancelar y reintentar corridas pasa por acá.
export async function guard(pageContext: PageContext) {
  const allowed = await hasAdminCapability(pageContext.headers, "admin_save_orchestration_ops");
  if (!allowed) throw render(403, "No autorizado.");
}
