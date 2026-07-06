import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

import "../src/styles/globals.css";

// Shell del sitio Cuadra: header corporativo + contenido + footer. Tema claro/oscuro y colores
// de la app móvil (globals.css). i18n + país heredados del pageContext. El envoltorio dual-mode de
// Clerk (`ClerkShell`) vive en `pages/+Wrapper.tsx` — este es el `Layout` global de
// `pages/+config.ts`, y `/admin/*` lo limpia con `pages/admin/+Layout.clear.tsx` (no quiere el
// chrome de marketing), pero SIEMPRE hereda el `+Wrapper` de arriba con el ClerkProvider.
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
