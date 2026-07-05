// Builders de sitemap.xml + robots.txt. JS ESM plano A PROPÓSITO: los importa el Express server
// con Node crudo (sin transpilar) Y los tests de vitest — una sola fuente de verdad, sin duplicar.
// Emite la matriz idioma×país×ruta con hreflang alternates (SEO multilingüe multi-país).

/** @typedef {{ slug: string }} ProductRef */

/** Rutas LÓGICAS indexables por país: landing, Supermercados y sus páginas, + una por producto.
 * La URL de producto usa el SLUG legible (llave pública/canónica), no el UUID.
 * @param {ProductRef[]} products @returns {string[]} */
export function logicalPaths(products) {
  return [
    "/",
    "/save/supermarkets",
    "/save/supermarkets/categories",
    ...products.map((p) => `/save/supermarkets/product/${p.slug}`),
  ];
}

/** sitemap.xml: para cada ruta × locale, un <url> con hreflang de todos los locales + x-default.
 * @param {string} baseUrl
 * @param {{ locales: string[], country: string, paths: string[], defaultLocale?: string }} opts */
export function buildSitemap(baseUrl, { locales, country, paths, defaultLocale = "es" }) {
  const origin = baseUrl.replace(/\/$/, "");
  const href = (loc, path) => `${origin}/${loc}/${country}${path === "/" ? "" : path}`;
  const blocks = [];
  for (const path of paths) {
    for (const loc of locales) {
      const alternates = [
        ...locales.map(
          (l) =>
            `    <xhtml:link rel="alternate" hreflang="${l}-${country}" href="${href(l, path)}"/>`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${href(defaultLocale, path)}"/>`,
      ].join("\n");
      blocks.push(
        ["  <url>", `    <loc>${href(loc, path)}</loc>`, alternates, "  </url>"].join("\n"),
      );
    }
  }
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    blocks.join("\n"),
    `</urlset>`,
  ].join("\n");
}

/** robots.txt: permite todo y apunta al sitemap. @param {string} baseUrl */
export function buildRobots(baseUrl) {
  const origin = baseUrl.replace(/\/$/, "");
  return ["User-agent: *", "Allow: /", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
}
