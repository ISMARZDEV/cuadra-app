import type { PageContext } from "vike/types";

import { formatMoney } from "../../../src/lib/format";
import type { ProductData } from "./+data";

// meta description por producto (override del default global) → SEO. vike-react la renderiza;
// evita el <meta name="description"> duplicado que salía al meterla a mano en +Head.
export default function description(pageContext: PageContext): string {
  const data = pageContext.data as ProductData;
  const best = data.entries.find((e) => e.is_cheapest) ?? data.entries[0];
  const bestPrice = best ? formatMoney(best.price_minor, best.currency) : "";
  return `Compara ${data.name} entre supermercados de RD. Mejor precio: ${bestPrice} en ${data.cheapest_provider}.`;
}
