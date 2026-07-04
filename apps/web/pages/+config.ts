import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

import { HreflangTags } from "../src/components/hreflang";
import { Layout } from "../layouts/LayoutDefault";

// Config global de Vike (vike-react = renderer React SSR). `Head` global = hreflang (SEO
// multilingüe). `passToClient` expone locale/country a la navegación de cliente. title/description
// se localizan por página (+title.ts/+description.ts); acá solo el fallback estático.
export default {
  Layout,
  Head: HreflangTags,
  title: "Cuadra Save",
  description: "Compara precios de supermercado.",
  passToClient: ["locale", "country"],
  extends: vikeReact,
} satisfies Config;
