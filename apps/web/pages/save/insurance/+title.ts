import type { PageContext } from "vike/types";

import { DEFAULT_LOCALE } from "@/i18n/config";
import { translate } from "@/i18n/messages";

export default function title(pageContext: PageContext): string {
  return `${translate(pageContext.locale ?? DEFAULT_LOCALE, "nav.insurance")} | Cuadra`;
}
