import type { ReactNode } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui-base/sidebar";
import { Toaster } from "@/components/ui-base/sonner";
import type { Locale } from "@/i18n/config";

import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar } from "./AdminTopBar";
import { EcosystemRail } from "./rail/EcosystemRail";

// Tipografía: NO se declara acá. Kantumruy Pro es la fuente ÚNICA de toda la web y se importa y
// aplica en `src/styles/globals.css` (`@font-face` + `--font-sans` + `body`); el subárbol admin la
// HEREDA. Antes este shell importaba Inter y la fijaba con un `style` propio porque el admin era la
// única superficie con webfont — al unificar, esa familia local pasó a ser drift esperando ocurrir.
interface AdminLayoutProps {
  /** Capabilities efectivas del usuario actual (resueltas server-side, ver `require-admin.ts`). */
  capabilities: string[];
  /** Locale explícito, resuelto SSR (`AdminShellData.locale`) — `/admin/*` está exento del prefijo
   * `/{locale}/{country}` de la URL, así que NO puede derivarse ahí (ver `useAdminI18n`). */
  locale: Locale;
  /** `MeResponse.name` para el user chip del `AdminTopBar` (threadeado por `AdminShellData`). */
  name: string;
  /** `MeResponse.email` — threadeado, no renderizado aún. */
  email?: string | null;
  children: ReactNode;
}

// Shell de la OFV: `EcosystemRail` (shell oscuro del ecosistema aispace, Figma nodo 484:6497) +
// `AdminSidebar` (Base UI, fiel al Figma nodo 483:13776) + `SidebarInset` para el contenido de la
// página. `SidebarProvider` (Base UI) da GRATIS el estado de colapso (persistido en cookie) y el
// sheet móvil — ver `components/ui-base/sidebar.tsx`. `Toaster` se monta UNA sola vez acá para los
// toasts "🚧 en construcción" que dispara `AdminSidebar` en los ítems WIP.
//
// Batch 8: el rail va FUERA del `SidebarProvider` (no es parte del sidebar de Cuadra, es el shell
// del ecosistema aispace — Drive/Calendar/Meet/tema) en un `<div className="flex min-h-screen">`
// que lo pone flush-left, con `SidebarProvider` (que ya trae su propio `flex min-h-svh w-full`
// interno) llenando el resto como hermano flex. El `w-full` del wrapper de `SidebarProvider` actúa
// como `flex-basis` (no fuerza overflow): al ser un flex item por default puede encogerse junto al
// `shrink-0` del rail, dejando sidebar+contenido con el ancho remanente exacto.
// Regla sagrada: `SidebarProvider` NO es un `ClerkProvider` — el único `<ClerkProvider>` sigue
// viviendo en `pages/+Wrapper.tsx` (raíz). NUNCA agregar otro acá (ver
// `admin-layout-no-double-provider.test.tsx`).
export function AdminLayout({ capabilities, locale, name, email, children }: AdminLayoutProps) {
  return (
    <div className="admin-shell flex min-h-screen">
      <EcosystemRail />
      <SidebarProvider className="min-w-0 bg-white text-foreground">
        <AdminSidebar capabilities={capabilities} locale={locale} />
        {/* `min-w-0`: sin esto, el flex item toma `min-width:auto` y crece hasta el ancho intrínseco
            de la tabla (13 columnas `whitespace-nowrap`) → toda la página scrollea horizontal y el
            contenido se mete BAJO el sidebar. Con `min-w-0` el inset se contiene al viewport y el
            scroll-x queda confinado al contenedor `overflow-x-auto` de la tabla (regla WIG). */}
        <SidebarInset className="min-w-0">
          <div className="ps-4 md:ps-6">
            <AdminTopBar name={name} email={email} locale={locale} />
          </div>
          {children}
        </SidebarInset>
        <Toaster richColors position="bottom-right" />
      </SidebarProvider>
    </div>
  );
}
