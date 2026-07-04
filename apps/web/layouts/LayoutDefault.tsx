import type { ReactNode } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "../src/styles/globals.css";

// Shell del sitio Cuadra: header corporativo + contenido + footer. Tema claro/oscuro y colores
// de la app móvil (globals.css). i18n + país heredados del pageContext.
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
