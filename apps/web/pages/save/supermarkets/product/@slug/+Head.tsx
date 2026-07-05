import { usePageContext } from "vike-react/usePageContext";
import { useData } from "vike-react/useData";

import { DEFAULT_COUNTRY, DEFAULT_LOCALE, type Country, type Locale } from "@/i18n/config";
import { formatMoney } from "@/features/save/lib/format";
import { localeHref } from "@/lib/links";
import { buildProductJsonLd } from "@/features/save/lib/seo";
import type { ProductData } from "./+data";

const SITE = import.meta.env.VITE_SITE_URL ?? "http://localhost:3006";

// OG tags (con imagen) + <link rel="canonical"> + JSON-LD (Product/AggregateOffer) por producto →
// previews de WhatsApp/redes CON imagen, una sola URL canónica (el slug legible) y rich results de
// Google con el rango de precio. La <meta name="description"> la maneja vike-react vía
// +description.ts (evita duplicado).
export default function Head() {
  const { comparison } = useData<ProductData>();
  const pageContext = usePageContext();
  const locale = (pageContext.locale ?? DEFAULT_LOCALE) as Locale;
  const country = (pageContext.country ?? DEFAULT_COUNTRY) as Country;
  const origin = SITE.replace(/\/$/, "");
  // Canónico = SIEMPRE la URL del slug legible (aunque se haya entrado por el UUID de fallback) →
  // Google indexa una sola URL por producto.
  const canonical = `${origin}${localeHref(
    locale,
    country,
    `/save/supermarkets/product/${comparison.slug}`,
  )}`;
  const best = comparison.entries.find((e) => e.is_cheapest) ?? comparison.entries[0];
  const bestPrice = best ? formatMoney(best.price_minor, best.currency) : "";
  const description = `Compara ${comparison.name} entre supermercados de RD. Mejor precio: ${bestPrice} en ${comparison.cheapest_provider}.`;
  return (
    <>
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="product" />
      <meta property="og:title" content={`${comparison.name} — precios en RD`} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      {comparison.image_url ? (
        <meta property="og:image" content={comparison.image_url} />
      ) : null}
      <script
        type="application/ld+json"
        // JSON-LD: contenido controlado (números + nombre del catálogo), no input de usuario.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(comparison)) }}
      />
    </>
  );
}
