import type { PageContext } from "vike/types";

import type { CategoryData } from "./+data";

export default function title(pageContext: PageContext): string {
  const data = pageContext.data as CategoryData | undefined;
  const name = data?.name ?? (pageContext.routeParams?.slug ?? "").replace(/-/g, " ");
  return `${name} | Cuadra Save`;
}
