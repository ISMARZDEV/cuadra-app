import { ClerkProvider } from "@clerk/clerk-react";
import type { ReactNode } from "react";

import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY } from "@/features/save/hooks/clerk";
import { ClerkAuthBridge } from "@/features/save/hooks/clerk-auth-bridge";

// Envoltorio dual-mode de Clerk: en modo Clerk provee el contexto de auth + registra el
// token-getter async (`ClerkAuthBridge` — SAGRADO, cuadra-clerk: short-lived-token / async
// token-getter rule); en dev-login (sin publishable key) devuelve los children sin envolver — ni
// el SSR ni los tests dependen de Clerk. Montado UNA SOLA VEZ, en `pages/+Wrapper.tsx` (por encima
// de TODOS los `+Layout`, público y admin) — nunca dentro de un `+Layout` individual, o dos
// `<ClerkProvider>` terminan en el árbol y Clerk crashea la página (ver el fix del batch de
// `/admin/*` en blanco).
export function ClerkShell({ children }: { children: ReactNode }) {
  if (!CLERK_ENABLED) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ClerkAuthBridge />
      {children}
    </ClerkProvider>
  );
}
