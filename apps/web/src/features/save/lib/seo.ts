import type { PriceComparisonDto } from "@cuadra/api-client";

// SEO del lado React (bundleado por Vite): JSON-LD Product+AggregateOffer para rich results de
// comparación. El sitemap.xml / robots.txt viven en sitemap.js (JS plano, los usa el server Node).

const MINOR = 100;

function major(minor: number): string {
  return (minor / MINOR).toFixed(2);
}

/**
 * JSON-LD Product con AggregateOffer (schema.org): un producto, varias tiendas → Google muestra
 * el rango de precio. lowPrice/highPrice/offerCount salen de las cotizaciones. Sin reviews aún.
 */
export function buildProductJsonLd(comparison: PriceComparisonDto): Record<string, unknown> {
  const prices = comparison.entries.map((e) => e.price_minor);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: comparison.name,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: comparison.currency,
      lowPrice: major(low),
      highPrice: major(high),
      offerCount: comparison.entries.length,
    },
  };
}
