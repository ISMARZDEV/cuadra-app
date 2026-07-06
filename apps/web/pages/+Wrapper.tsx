import type { ReactNode } from "react";

import { ClerkShell } from "@/components/layout/clerk-shell";

// `+Wrapper` de Vike: envuelve TODO el árbol de páginas (todos los `+Layout`, público y admin) una
// única vez — a diferencia de `Layout`, `Wrapper` no anida por nivel de ruta salvo que exista más
// de un archivo `+Wrapper`, así que este es el único punto de montaje de `<ClerkShell>` (y por
// tanto de `<ClerkProvider>` + `ClerkAuthBridge`) de toda la app. Antes vivía duplicado en
// `layouts/LayoutDefault.tsx` Y `pages/admin/+Layout.tsx`, lo que montaba DOS `<ClerkProvider>`
// para `/admin/*` y crasheaba la consola con pantalla en blanco (Clerk lanza si detecta más de
// un provider en el árbol). Ver vike.dev/Wrapper.
export default function Wrapper({ children }: { children: ReactNode }) {
  return <ClerkShell>{children}</ClerkShell>;
}
