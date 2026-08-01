import { ChevronRight } from "lucide-react";

import { categoryLabel } from "@/i18n/categories";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

export type Crumb = { name: string; slug: string; key?: string | null };

// Breadcrumb (Imagen #5): Inicio > Categoría > … Cada slug enlaza a /save/supermarkets/category/:slug.
// El último (la página actual) va sin link. SSR (los <a> están en el DOM).
//
// El slug NO se traduce (es la URL, estable) pero la etiqueta SÍ: `categoryLabel` resuelve la key
// del nodo contra el bundle y cae al `name` del catálogo si no la encuentra.
export function Breadcrumbs({
  trail,
  currentName,
  currentKey,
}: {
  trail: Crumb[];
  currentName?: string;
  currentKey?: string | null;
}) {
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
            {categoryLabel(c.key, c.name, locale)}
          </a>
        </span>
      ))}
      {currentName && (
        <span className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          <span className="text-foreground">
            {categoryLabel(currentKey, currentName, locale)}
          </span>
        </span>
      )}
    </nav>
  );
}
