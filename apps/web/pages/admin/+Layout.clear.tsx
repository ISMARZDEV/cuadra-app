import type { ReactNode } from "react";
import { useData } from "vike-react/useData";

import { AdminLayout } from "@/features/admin/shell/AdminLayout";
import type { AdminShellData } from "./+data";

import "../../src/styles/globals.css";

// Layout de TODO el subárbol `/admin/*`. Sufijo `.clear` (convención de Vike, ver vike.dev/clear):
// `Layout` es una config ACUMULATIVA — sin `.clear` este layout se ANIDARÍA dentro del `Layout`
// global de `pages/+config.ts` (`layouts/LayoutDefault`, con SiteHeader/SiteFooter de marketing).
// `.clear` corta esa herencia: `/admin/*` usa SOLO este layout, no el de marketing — por diseño la
// consola admin es una herramienta operativa interna (ver el comentario de `AdminLayout`). El
// `<ClerkProvider>` NO se pierde: `pages/+Wrapper.tsx` es una config aparte (`Wrapper`, no
// `Layout`) que sigue envolviendo todo el árbol, admin incluido.
//
// `capabilities` llega vía `useData()` — el `+data.ts` de la página ACTUAL (`review-queue/+data.ts`
// o `review-queue/@id/+data.ts`) las fusiona a mano desde `pages/admin/+data.ts` (Vike no acumula
// hooks `data()` entre niveles de ruta; ver el comentario ahí).
export default function Layout({ children }: { children: ReactNode }) {
  const data = useData<Partial<AdminShellData>>();
  return <AdminLayout capabilities={data?.capabilities ?? []}>{children}</AdminLayout>;
}
