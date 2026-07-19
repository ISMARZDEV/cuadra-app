import type { LucideIcon } from "lucide-react";
import { Database, ListChecks, ListPlus, Store, Workflow } from "lucide-react";

// Seam de extensibilidad de la OFV (back-office único): cada módulo admin futuro (News,
// accesos/RBAC, financieros...) se registra acá — F2·B1 habilita SOLO la cola de revisión de
// matching de Save. `AdminLayout` filtra este catálogo por las capabilities efectivas del usuario
// (resuelto server-side, ver `require-admin.ts`), así un resource sin permiso simplemente no
// aparece en el nav — nunca un link roto.
export interface AdminResource {
  key: string;
  label: string;
  path: string;
  /** Debe hacer mirror EXACTO del string de `CapabilityKey` en el backend
   * (`apps/api/src/contexts/identity/domain/enums.py`) — no hay tipo compartido/generado porque el
   * OpenAPI expone `MeResponse.capabilities` como `string[]` plano (sin enum). */
  capability: string;
  navIcon?: LucideIcon;
}

export const ADMIN_RESOURCES: AdminResource[] = [
  {
    key: "save-matching-review",
    label: "Cola de revisión (Save)",
    path: "/admin/review-queue",
    capability: "admin_save_matching_review", // = CapabilityKey.ADMIN_SAVE_MATCHING_REVIEW
    navIcon: ListChecks,
  },
  {
    key: "save-providers",
    label: "Proveedores (Save)",
    path: "/admin/providers",
    capability: "admin_save_ingestion_ops", // = CapabilityKey.ADMIN_SAVE_INGESTION_OPS
    navIcon: Store,
  },
  {
    key: "save-sources",
    label: "Fuentes (Save)",
    path: "/admin/sources",
    capability: "admin_save_ingestion_ops", // = CapabilityKey.ADMIN_SAVE_INGESTION_OPS
    navIcon: Database,
  },
  {
    key: "save-basket",
    label: "Canasta curada (Save)",
    path: "/admin/basket-queries",
    capability: "admin_save_ingestion_ops", // = CapabilityKey.ADMIN_SAVE_INGESTION_OPS
    navIcon: ListPlus,
  },
  {
    key: "save-orchestration",
    label: "Orquestación (Save)",
    path: "/admin/orchestration",
    // F4: capability PROPIA, no `ingestion_ops` — lanzar/cancelar/reintentar corridas es más
    // sensible que editar un provider. = CapabilityKey.ADMIN_SAVE_ORCHESTRATION_OPS
    capability: "admin_save_orchestration_ops",
    navIcon: Workflow,
  },
];
