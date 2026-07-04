import { isCountry, isLocale, type Country, type Locale } from "../i18n/config";

// Prefija una ruta LÓGICA ("/product/123", "/search", "/") con /{locale}/{country}.
// Todas las URLs internas pasan por acá para no perder el idioma/país al navegar.
export function localeHref(locale: Locale, country: Country, path: string): string {
  const suffix = path === "/" ? "" : path;
  return `/${locale}/${country}${suffix}`;
}

// Quita el prefijo /{locale}/{country} de una URL → la ruta lógica (para los switchers).
export function logicalPath(urlPathname: string): string {
  const segments = urlPathname.split("/").filter(Boolean);
  if (isLocale(segments[0]) && isCountry(segments[1])) {
    return "/" + segments.slice(2).join("/");
  }
  return urlPathname;
}
