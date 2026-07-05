import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

import { GlobalHead } from "../src/components/layout/global-head";
import { Layout } from "../layouts/LayoutDefault";

// Config global de Vike (vike-react = renderer React SSR). `Head` global = hreflang (SEO
// multilingüe). `passToClient` expone locale/country a la navegación de cliente. title/description
// se localizan por página (+title.ts/+description.ts); acá solo el fallback estático.
export default {
  Layout,
  Head: GlobalHead,
  title: "Cuadra",
  description: "Cuadra — administra tu dinero y compara precios de supermercado.",
  passToClient: ["locale", "country"],
  extends: vikeReact,
} satisfies Config;
