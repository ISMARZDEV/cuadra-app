import { Bell, ChevronDown, LogOut, ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePageI18n } from "@/i18n/usePageI18n";
import { myNotifications } from "@/lib/alerts-api";
import { localeHref } from "@/lib/links";
import { useAuth } from "@/lib/use-auth";
import { useShoppingList } from "@/lib/use-shopping-list";

import { CountrySwitcher, LocaleSwitcher } from "./switcher";
import { ThemeToggle } from "./theme-toggle";

// Campana de notificaciones (G4): visible solo con sesión. Muestra el nº de alertas disparadas
// (el MISMO feed que ve la app móvil). Enlaza a "Mis alertas".
function AlertsBell({ href, label }: { href: string; label: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    void myNotifications().then((r) => setCount(r.data?.length ?? 0));
  }, []);
  return (
    <a
      href={href}
      aria-label={label}
      className="relative flex size-9 items-center justify-center rounded-md hover:bg-accent"
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </a>
  );
}

// Enlace al carrito con badge de nº de artículos (lista local). El count es client-only
// (useSyncExternalStore) → 0 en SSR, se actualiza tras hidratar.
function CartLink({ href, label }: { href: string; label: string }) {
  const { count } = useShoppingList();
  return (
    <a
      href={href}
      aria-label={label}
      className="relative flex size-9 items-center justify-center rounded-md hover:bg-accent"
    >
      <ShoppingCart className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </a>
  );
}

// Menú desplegable SSR-CRAWLABLE: los <a> viven SIEMPRE en el DOM (no como Radix, que los monta
// al abrir en cliente) → Google los indexa. Se revelan por hover/focus con CSS (group).
function NavMenu({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  return (
    <div className="group relative">
      <button className="flex items-center gap-1 text-sm font-medium outline-none">
        {label} <ChevronDown className="size-4" />
      </button>
      <ul className="invisible absolute left-0 top-full z-50 min-w-52 rounded-md border border-border bg-popover p-1 opacity-0 shadow-md transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {items.map((it) => (
          <li key={it.href}>
            <a href={it.href} className="block rounded px-3 py-2 text-sm hover:bg-accent">
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteHeader() {
  const { locale, country, t } = usePageI18n();
  const { isAuthed, logout } = useAuth();
  const href = (path: string) => localeHref(locale, country, path);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <a href={href("/")} className="text-xl font-extrabold tracking-tight">
          <span className="text-primary">CUA</span>DRA
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          <NavMenu
            label={t("nav.save")}
            items={[
              { href: href("/save/supermarkets"), label: t("nav.supermarkets") },
              { href: href("/save/financial-products"), label: t("nav.financial") },
              { href: href("/save/investments"), label: t("nav.investments") },
              { href: href("/save/insurance"), label: t("nav.insurance") },
            ]}
          />
          <NavMenu label={t("nav.news")} items={[{ href: href("/news"), label: t("nav.news") }]} />
          <a href={href("/about")} className="text-sm font-medium">
            {t("nav.about")}
          </a>
          <a href={href("/pricing")} className="text-sm font-medium">
            {t("nav.pricing")}
          </a>
        </nav>

        <div className="flex items-center gap-1.5">
          <CartLink href={href("/save/supermarkets/list")} label={t("list.title")} />
          {isAuthed && (
            <AlertsBell href={href("/save/supermarkets/alerts")} label={t("alerts.title")} />
          )}
          <CountrySwitcher />
          <LocaleSwitcher />
          <ThemeToggle />
          {isAuthed ? (
            <button
              type="button"
              onClick={logout}
              aria-label={t("nav.logout")}
              className="flex size-9 items-center justify-center rounded-md hover:bg-accent"
            >
              <LogOut className="size-5" />
            </button>
          ) : (
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
              <a href={href("/save/supermarkets/login")}>{t("nav.login")}</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
