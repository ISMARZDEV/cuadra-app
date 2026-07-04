import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import { CountrySwitcher, LocaleSwitcher } from "./switcher";
import { ThemeToggle } from "./theme-toggle";

// Nav corporativo (Imagen #3): logo · Save▾ (Supermercados/Financieros/Inversiones/Seguros) ·
// News · Nosotros · Precios · país · idioma · tema · Descargar App.
export function SiteHeader() {
  const { locale, country, t } = usePageI18n();
  const href = (path: string) => localeHref(locale, country, path);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <a href={href("/")} className="text-xl font-extrabold tracking-tight">
          <span className="text-primary">CUA</span>DRA
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium outline-none">
              {t("nav.save")} <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <a href={href("/save/supermarkets")}>{t("nav.supermarkets")}</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={href("/save/financial-products")}>{t("nav.financial")}</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={href("/save/investments")}>{t("nav.investments")}</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={href("/save/insurance")}>{t("nav.insurance")}</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium outline-none">
              {t("nav.news")} <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem asChild>
                <a href={href("/news")}>{t("nav.news")}</a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <a href={href("/about")} className="text-sm font-medium">
            {t("nav.about")}
          </a>
          <a href={href("/pricing")} className="text-sm font-medium">
            {t("nav.pricing")}
          </a>
        </nav>

        <div className="flex items-center gap-1.5">
          <CountrySwitcher />
          <LocaleSwitcher />
          <ThemeToggle />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href={href("/pricing")}>{t("nav.download")}</a>
          </Button>
        </div>
      </div>
    </header>
  );
}
