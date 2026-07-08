import { Bell, Settings } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui-base/avatar";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import { useAdminI18n } from "./useAdminI18n";

export interface AdminTopBarProps {
  /** Nombre del usuario actual (`MeResponse.name`, threadeado por `AdminShellData` — ver
   * `require-admin.ts`/`pages/admin/+data.ts`). Nunca vacío en un request autenticado real, pero
   * el componente no asume eso (fallback gracioso en `initialsFromName`). */
  name: string;
  /** `MeResponse.email` — no se renderiza todavía (no hay lugar en el Figma), solo threadeado por
   * si un follow-up lo necesita (p.ej. tooltip/dropdown del user chip). */
  email?: string | null;
  locale: Locale;
}

// Iniciales del Avatar cuando no hay foto (MeResponse NO trae avatar/photo url — ver el
// comentario de Fase 1 en docs/sdd/admin-workspace.md). Regla: primera letra de las DOS primeras
// palabras del nombre; con una sola palabra, sus dos primeras letras; nombre vacío/solo espacios
// → string vacío (el Avatar cae al fallback en blanco, no revienta).
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0] + words[1]![0]).toUpperCase();
}

// Top bar del admin (Figma 483:12411): cluster right-aligned — campana (con punto rojo de
// notificación), settings, nombre del usuario + Avatar de iniciales sobre verde de marca
// (`bg-primary`, el mismo verde del tema admin). Montada dentro de `SidebarInset`, ARRIBA de
// `children` (ver `AdminLayout`). Campana/settings son botones presentacionales por ahora —
// sin dropdown/panel todavía (stub; el click no hace nada, follow-up).
export function AdminTopBar({ name, locale }: AdminTopBarProps) {
  const { t } = useAdminI18n(locale);
  const initials = initialsFromName(name);

  return (
    <header className="flex h-16 w-full shrink-0 items-center justify-end gap-4 border-b border-border bg-background px-6">
      <button
        type="button"
        aria-label={t("admin.topbar.notifications" as MessageKey)}
        className="relative flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <Bell className="size-5" />
        <span className="absolute top-2 right-2 size-2 rounded-full bg-red-500" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t("admin.topbar.settings" as MessageKey)}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <Settings className="size-5" />
      </button>
      <span className="text-sm font-medium text-foreground">{name}</span>
      <Avatar>
        <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
    </header>
  );
}
