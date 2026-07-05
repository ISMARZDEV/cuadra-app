import { ClerkProvider } from "@clerk/clerk-react";
import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { CLERK_ENABLED, CLERK_PUBLISHABLE_KEY } from "@/features/save/hooks/clerk";
import { ClerkAuthBridge } from "@/features/save/hooks/clerk-auth-bridge";

import "../src/styles/globals.css";

// Shell del sitio Cuadra: header corporativo + contenido + footer. Tema claro/oscuro y colores
// de la app móvil (globals.css). i18n + país heredados del pageContext.
export function Layout({ children }: { children: ReactNode }) {
  const shell = (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );

  // Dual-mode: en Clerk mode envuelve el shell en <ClerkProvider> + el bridge del token. Sin key
  // (dev/CI) devuelve el shell plano → el SSR y los tests no dependen de Clerk.
  if (!CLERK_ENABLED) return shell;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ClerkAuthBridge />
      {shell}
    </ClerkProvider>
  );
}
