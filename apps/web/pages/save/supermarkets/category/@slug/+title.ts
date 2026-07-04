import type { PageContext } from "vike/types";

export default function title(pageContext: PageContext): string {
  const slug = (pageContext.routeParams?.slug ?? "").replace(/-/g, " ");
  return `${slug} | Cuadra Save`;
}
