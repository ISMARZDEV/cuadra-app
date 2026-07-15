import type { PageContext } from "vike/types";

import type { StoreData } from "./+data";

export default function title(pageContext: PageContext): string {
  const data = pageContext.data as StoreData | undefined;
  return `${data?.name ?? ""} | Cuadra Save`;
}
