import { ChevronRight } from "lucide-react";

import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

export type Crumb = { name: string; slug: string };

// Breadcrumb (Imagen #5): Inicio > Categoría > … Cada slug enlaza a /save/supermarkets/category/:slug.
// El último (la página actual) va sin link. SSR (los <a> están en el DOM).
export function Breadcrumbs({ trail, currentName }: { trail: Crumb[]; currentName?: string }) {
  const { locale, country, t } = usePageI18n();
  const catHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/category/${slug}`);
  const homeHref = localeHref(locale, country, "/save/supermarkets");

  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="breadcrumb">
      <a href={homeHref} className="hover:text-primary">
        {t("nav.supermarkets")}
      </a>
      {trail.map((c) => (
        <span key={c.slug} className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          <a href={catHref(c.slug)} className="hover:text-primary">
            {c.name}
          </a>
        </span>
      ))}
      {currentName && (
        <span className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          <span className="text-foreground">{currentName}</span>
        </span>
      )}
    </nav>
  );
}
