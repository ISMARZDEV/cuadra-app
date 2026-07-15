import type { PageContext } from "vike/types";

import type { CollectionData } from "./+data";

export default function title(pageContext: PageContext): string {
  const data = pageContext.data as CollectionData | undefined;
  return `${data?.name ?? ""} | Cuadra Save`;
}
