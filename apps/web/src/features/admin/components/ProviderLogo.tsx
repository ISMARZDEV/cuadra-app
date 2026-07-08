import { ProviderBadge } from "@/features/save/components/provider-badge";
import type { ProviderBadgeProps } from "@/features/save/interfaces";

// Columna "Tienda" de la cola de revisión (Figma 483:12411, nodo de logos 502:6717): NO se
// duplica el componente. `ProviderBadge` (features/save/components/provider-badge.tsx) YA cubre
// exactamente este caso — img cuando `logoUrl`/`provider_logo_url` llegó, texto (`provider_name`)
// como fallback cuando no — y ya se reusa en el admin (`ProvidersScreen`). `ProviderLogo` es solo
// un re-export con nombre semántico para esta columna; ver `docs/sdd/admin-workspace.md` Batch 3.
export const ProviderLogo = ProviderBadge;
export type { ProviderBadgeProps as ProviderLogoProps };
