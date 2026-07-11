import { Bell, Settings } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui-base/avatar";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import { useAdminI18n } from "./useAdminI18n";

export interface AdminTopBarProps {
  name: string;
  email?: string | null;
  locale: Locale;
}

export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0] + words[1]![0]).toUpperCase();
}

export function AdminTopBar({ name, locale }: AdminTopBarProps) {
  const { t } = useAdminI18n(locale);
  const initials = initialsFromName(name);

  // Topbar del admin (Figma 483:12416): barra verde-gris con esquina inferior-izquierda redondeada,
  // campana (punto rojo) + settings + nombre + avatar. Tamaños/estructura IDÉNTICOS en claro y
  // oscuro; solo el color se adapta vía token (íconos/nombre verde-forest → lima en dark; el avatar
  // es lima de marca en ambos). Sin hex crudos ni px hardcodeados.
  return (
    <header className="flex h-14 w-full shrink-0 items-center justify-end gap-3 rounded-bl-2xl bg-muted/60 px-6 dark:bg-secondary">
      <button
        type="button"
        aria-label={t("admin.topbar.notifications" as MessageKey)}
        className="relative flex size-9 items-center justify-center rounded-full text-brand-forest hover:bg-muted dark:text-brand-lime"
      >
        <Bell className="size-5" />
        <span className="absolute top-2 right-2 size-2 rounded-full bg-red-500" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={t("admin.topbar.settings" as MessageKey)}
        className="flex size-9 items-center justify-center rounded-full text-brand-forest hover:bg-muted dark:text-brand-lime"
      >
        <Settings className="size-5" />
      </button>
      <span className="text-sm font-semibold text-brand-forest dark:text-brand-lime">{name}</span>
      <Avatar className="size-9">
        <AvatarFallback className="bg-brand-lime font-semibold text-brand-forest">{initials}</AvatarFallback>
      </Avatar>
    </header>
  );
}
