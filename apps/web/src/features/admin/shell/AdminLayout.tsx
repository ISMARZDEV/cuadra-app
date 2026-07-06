import type { ReactNode } from "react";

import { ADMIN_RESOURCES } from "./admin-resource";

interface AdminLayoutProps {
  /** Capabilities efectivas del usuario actual (resueltas server-side, ver `require-admin.ts`). */
  capabilities: string[];
  children: ReactNode;
}

// Shell mínimo de la OFV: sidebar con nav filtrada por capability — un resource sin permiso
// simplemente no se renderiza (nunca un link muerto). Sin i18n a propósito: la consola admin es
// herramienta interna de operación (equipo Cuadra), no superficie pública — no aplica el mandato
// es/en/pt del resto de `apps/web` (decisión F2·B1, revisar si un módulo futuro lo requiere).
export function AdminLayout({ capabilities, children }: AdminLayoutProps) {
  const visible = ADMIN_RESOURCES.filter((r) => capabilities.includes(r.capability));

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-60 shrink-0 border-r border-border p-4">
        <div className="mb-6 text-lg font-extrabold tracking-tight">
          <span className="text-primary">CUA</span>DRA{" "}
          <span className="text-muted-foreground">admin</span>
        </div>
        <nav className="flex flex-col gap-1">
          {visible.map((resource) => {
            const Icon = resource.navIcon;
            return (
              <a
                key={resource.key}
                href={resource.path}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                {Icon ? <Icon className="size-4" /> : null}
                {resource.label}
              </a>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
