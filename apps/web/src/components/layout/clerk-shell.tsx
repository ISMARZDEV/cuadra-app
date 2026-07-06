import { ClerkProvider } from "@clerk/clerk-react";
import type { ReactNode } from "react";

import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY } from "@/features/save/hooks/clerk";
import { ClerkAuthBridge } from "@/features/save/hooks/clerk-auth-bridge";

// Envoltorio dual-mode de Clerk, extraído de `layouts/LayoutDefault.tsx` (batch 2e): en modo Clerk
// provee el contexto de auth + registra el token-getter async (`ClerkAuthBridge` — SAGRADO,
// cuadra-clerk: short-lived-token / async token-getter rule); en dev-login (sin publishable key)
// devuelve los children sin envolver — ni el SSR ni los tests dependen de Clerk. Compartido por
// CUALQUIER layout que necesite auth de Clerk sin el chrome del sitio público (`LayoutDefault` y
// `pages/admin/+Layout.tsx`) — evita duplicar la rama dual-mode una tercera vez.
export function ClerkShell({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ClerkAuthBridge />
      {children}
    </ClerkProvider>
  );
}
