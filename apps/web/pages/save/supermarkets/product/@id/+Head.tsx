import { useData } from "vike-react/useData";

import { formatMoney } from "@/lib/format";
import { buildProductJsonLd } from "@/lib/seo";
import type { ProductData } from "./+data";

// OG tags + JSON-LD (Product/AggregateOffer) por producto → previews de WhatsApp/redes y
// rich results de Google con el rango de precio. La <meta name="description"> la maneja
// vike-react vía +description.ts (evita duplicado).
export default function Head() {
  const { comparison } = useData<ProductData>();
  const best = comparison.entries.find((e) => e.is_cheapest) ?? comparison.entries[0];
  const bestPrice = best ? formatMoney(best.price_minor, best.currency) : "";
  const description = `Compara ${comparison.name} entre supermercados de RD. Mejor precio: ${bestPrice} en ${comparison.cheapest_provider}.`;
  return (
    <>
      <meta property="og:type" content="product" />
      <meta property="og:title" content={`${comparison.name} — precios en RD`} />
      <meta property="og:description" content={description} />
      <script
        type="application/ld+json"
        // JSON-LD: contenido controlado (números + nombre del catálogo), no input de usuario.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(comparison)) }}
      />
    </>
  );
}
