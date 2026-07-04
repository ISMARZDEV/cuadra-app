import type { PageContext } from "vike/types";

import { COUNTRY_NAMES, DEFAULT_COUNTRY, DEFAULT_LOCALE } from "@/i18n/config";
import { format } from "@/i18n/messages";
import { formatMoney } from "@/lib/format";
import type { ProductData } from "./+data";

// meta description por producto y por idioma → SEO. vike-react la renderiza (evita duplicado).
export default function description(pageContext: PageContext): string {
  const data = pageContext.data as ProductData;
  const locale = pageContext.locale ?? DEFAULT_LOCALE;
  const country = pageContext.country ?? DEFAULT_COUNTRY;
  const best = data.entries.find((e) => e.is_cheapest) ?? data.entries[0];
  return format(locale, "product.metaDescription", {
    name: data.name,
    country: COUNTRY_NAMES[locale][country],
    price: best ? formatMoney(best.price_minor, best.currency) : "",
    provider: data.cheapest_provider,
  });
}
