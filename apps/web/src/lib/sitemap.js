// Builders de sitemap.xml + robots.txt. JS ESM plano (no TS) A PROPÓSITO: los importa el
// Express server con Node crudo (sin transpilar) Y los tests de vitest — una sola fuente de
// verdad, sin duplicar. `locales` prepara el hreflang del slice i18n (es/en/pt).

/**
 * @typedef {{ path: string, changefreq?: string, priority?: string }} SitemapEntry
 * @typedef {{ id: string }} ProductRef
 */

/** URLs base: home, buscar y una por producto (para que Google descubra las páginas).
 * @param {ProductRef[]} products @returns {SitemapEntry[]} */
export function sitemapEntries(products) {
  return [
    { path: "/", changefreq: "daily", priority: "1.0" },
    { path: "/buscar", changefreq: "weekly", priority: "0.6" },
    ...products.map((p) => ({ path: `/producto/${p.id}`, changefreq: "daily", priority: "0.8" })),
  ];
}

/** sitemap.xml. `locales` vacío = single-locale; con locales emite hreflang alternates (i18n).
 * @param {string} baseUrl @param {SitemapEntry[]} entries @param {string[]} [locales] */
export function buildSitemap(baseUrl, entries, locales = []) {
  const origin = baseUrl.replace(/\/$/, "");
  const renderUrl = (e) => {
    const alternates = locales
      .map(
        (loc) =>
          `    <xhtml:link rel="alternate" hreflang="${loc}" href="${origin}/${loc}${e.path === "/" ? "" : e.path}"/>`,
      )
      .join("\n");
    return [
      "  <url>",
      `    <loc>${origin}${e.path}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : "",
      e.priority ? `    <priority>${e.priority}</priority>` : "",
      alternates,
    ]
      .filter(Boolean)
      .join("\n");
  };
  const xmlns = locales.length ? ` xmlns:xhtml="http://www.w3.org/1999/xhtml"` : "";
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlns}>`,
    entries.map(renderUrl).join("\n"),
    `</urlset>`,
  ].join("\n");
}

/** robots.txt: permite todo y apunta al sitemap. @param {string} baseUrl */
export function buildRobots(baseUrl) {
  const origin = baseUrl.replace(/\/$/, "");
  return ["User-agent: *", "Allow: /", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
}
