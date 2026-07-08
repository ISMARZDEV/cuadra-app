import type { ReactNode } from "react";

// Inter (fuente del Figma) — importado UNA sola vez acá, en el entry-point del shell admin
// (`AdminLayout` solo se monta bajo `/admin/*` vía `pages/admin/+Layout.clear.tsx`; nunca en el
// árbol de `LayoutDefault` de las páginas públicas). Cero impacto en la fuente global del `body`
// (`globals.css`) ni en el bundle de las páginas públicas — es un side-effect CSS import
// code-split junto con este módulo.
import "@fontsource-variable/inter";

import { SidebarInset, SidebarProvider } from "@/components/ui-base/sidebar";
import { Toaster } from "@/components/ui-base/sonner";
import type { Locale } from "@/i18n/config";

import { AdminSidebar } from "./AdminSidebar";
import { EcosystemRail } from "./rail/EcosystemRail";

// Familia aplicada SOLO al subárbol admin (vía `style` en el `SidebarProvider` de más abajo, que
// envuelve sidebar + contenido) — NUNCA tocar `body` en `globals.css`.
const ADMIN_FONT_FAMILY =
  "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

interface AdminLayoutProps {
  /** Capabilities efectivas del usuario actual (resueltas server-side, ver `require-admin.ts`). */
  capabilities: string[];
  /** Locale explícito, resuelto SSR (`AdminShellData.locale`) — `/admin/*` está exento del prefijo
   * `/{locale}/{country}` de la URL, así que NO puede derivarse ahí (ver `useAdminI18n`). */
  locale: Locale;
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
export function AdminLayout({ capabilities, locale, children }: AdminLayoutProps) {
  return (
    <div className="admin-shell flex min-h-screen">
      <EcosystemRail />
      <SidebarProvider
        className="bg-background text-foreground"
        style={{ fontFamily: ADMIN_FONT_FAMILY }}
      >
        <AdminSidebar capabilities={capabilities} locale={locale} />
        <SidebarInset>{children}</SidebarInset>
        <Toaster richColors position="bottom-right" />
      </SidebarProvider>
    </div>
  );
}
