import type { ReactNode } from "react";
import { useData } from "vike-react/useData";

import { ClerkShell } from "@/components/layout/clerk-shell";
import { AdminLayout } from "@/features/admin/shell/AdminLayout";
import type { AdminShellData } from "./+data";

import "../../src/styles/globals.css";

// Layout de TODO el subárbol `/admin/*` (convención de archivo de Vike/vike-react: un `+Layout.tsx`
// más específico sustituye al `Layout` global de `pages/+config.ts` — `layouts/LayoutDefault` con
// su header/footer del sitio público — SOLO para las páginas bajo `pages/admin/`). Cierra el gap
// conocido desde batch 2c: `AdminLayout` (el shell con el nav filtrado por capability) no estaba
// cableado a ninguna ruta.
//
// Envuelve en `ClerkShell` (NO en `LayoutDefault`): la consola admin necesita el mismo contexto de
// auth de Clerk (`authHeaders()` de las mutaciones client-side depende del token-getter registrado
// por `ClerkAuthBridge`) pero SIN el chrome de marketing (SiteHeader/SiteFooter) — por diseño la
// consola admin es una herramienta operativa interna (ver el comentario de `AdminLayout`).
//
// `capabilities` llega vía `useData()` — el `+data.ts` de la página ACTUAL (`review-queue/+data.ts`
// o `review-queue/@id/+data.ts`) las fusiona a mano desde `pages/admin/+data.ts` (Vike no acumula
// hooks `data()` entre niveles de ruta; ver el comentario ahí).
export default function Layout({ children }: { children: ReactNode }) {
  const data = useData<Partial<AdminShellData>>();
  return (
    <ClerkShell>
      <AdminLayout capabilities={data?.capabilities ?? []}>{children}</AdminLayout>
    </ClerkShell>
  );
}
