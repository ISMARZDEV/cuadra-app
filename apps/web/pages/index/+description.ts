import type { PageContext } from "vike/types";

import { DEFAULT_LOCALE } from "../../src/i18n/config";
import { translate } from "../../src/i18n/messages";

export default function description(pageContext: PageContext): string {
  return translate(pageContext.locale ?? DEFAULT_LOCALE, "meta.home.description");
}
