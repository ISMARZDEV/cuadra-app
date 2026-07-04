import type { Config } from "vike/types";
import vikeReact from "vike-react/config";

import { Layout } from "../layouts/LayoutDefault";

// Config global de Vike (vike-react = renderer React SSR). title/description por defecto;
// cada página los sobreescribe (+title.ts, +Head.tsx) para el SEO por producto (doc 06 §9).
export default {
  Layout,
  title: "Cuadra Save — compara precios de supermercado en RD",
  description:
    "Compara el precio de tu compra entre los supermercados de República Dominicana.",
  extends: vikeReact,
} satisfies Config;
