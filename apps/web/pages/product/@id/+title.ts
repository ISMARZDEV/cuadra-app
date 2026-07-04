import type { PageContext } from "vike/types";

import { COUNTRY_NAMES, DEFAULT_COUNTRY, DEFAULT_LOCALE } from "../../../src/i18n/config";
import { format } from "../../../src/i18n/messages";
import type { ProductData } from "./+data";

// <title> por producto y por idioma → SEO. El nombre del producto NO se traduce (dato).
export default function title(pageContext: PageContext): string {
  const data = pageContext.data as ProductData;
  const locale = pageContext.locale ?? DEFAULT_LOCALE;
  const country = pageContext.country ?? DEFAULT_COUNTRY;
  return format(locale, "product.title", {
    name: data.name,
    country: COUNTRY_NAMES[locale][country],
  });
}
