import { Check, Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

const ADMIN_LOCALE_COOKIE = "admin_locale";

// Switcher de idioma del admin (topbar, al lado de la campana). Admin-scoped: escribe el locale en
// la cookie `admin_locale` (SSR-readable, la lee `pages/admin/+data.ts` con prioridad sobre
// `MeResponse.locale`) y recarga — así TODO el subárbol `/admin/*` re-renderiza SSR en el nuevo
// idioma. No toca la cuenta global del usuario (a diferencia de un PATCH a `user.locale`). El
// `+data.ts` ya thread-ea el locale resultante a `useAdminI18n`, no hay estado client que sincronizar.
export function LanguageSwitcher({
  locale,
  t,
}: {
  locale: Locale;
  t: (key: MessageKey) => string;
}) {
  const choose = (next: Locale) => {
    if (next === locale) return;
    document.cookie = `${ADMIN_LOCALE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("admin.topbar.language")}
        className="flex size-9 items-center justify-center rounded-full text-brand-forest hover:bg-muted dark:text-brand-lime"
      >
        <Languages className="size-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((loc) => (
          <DropdownMenuItem key={loc} onClick={() => choose(loc)} className="justify-between gap-6">
            {LOCALE_NAMES[loc]}
            {loc === locale ? <Check className="size-4 text-brand-forest dark:text-brand-lime" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
