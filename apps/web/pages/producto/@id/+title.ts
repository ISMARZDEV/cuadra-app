import type { PageContext } from "vike/types";

import type { ProductData } from "./+data";

// <title> por producto → SEO ("Arroz La Garza 10 Lbs — precios en supermercados RD | Cuadra Save").
export default function title(pageContext: PageContext): string {
  const data = pageContext.data as ProductData;
  return `${data.name} — precios en supermercados RD | Cuadra Save`;
}
