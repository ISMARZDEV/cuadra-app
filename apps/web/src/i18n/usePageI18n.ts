import { usePageContext } from "vike-react/usePageContext";

import { DEFAULT_COUNTRY, DEFAULT_LOCALE, type Country, type Locale } from "./config";
import { translate, type MessageKey } from "./messages";

// Lee locale/country del pageContext (los pone +onBeforeRoute) y devuelve un `t()` ya atado.
export function usePageI18n() {
  const pageContext = usePageContext();
  const locale = (pageContext.locale ?? DEFAULT_LOCALE) as Locale;
  const country = (pageContext.country ?? DEFAULT_COUNTRY) as Country;
  const t = (key: MessageKey) => translate(locale, key);
  return { locale, country, t };
}
