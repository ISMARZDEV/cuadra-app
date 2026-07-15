// Servidor SSR de producción (Vike + Express). En dev usá `pnpm --filter @cuadra/web dev`
// (el plugin de Vike sirve por middleware de Vite). Este server es para `build` + `server`.
import express from "express";
import { renderPage } from "vike/server";

import { DEFAULT_COUNTRY, DEFAULT_LOCALE, LOCALES, MARKET_BY_COUNTRY } from "../src/i18n/locales.js";
import { buildRobots, buildSitemap, logicalPaths } from "../src/scripts/sitemap.js";

const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 3006;
const root = new URL("..", import.meta.url).pathname;
const apiBase = process.env.VITE_API_BASE_URL || "http://localhost:8005";

// Origin público del sitio (para <loc> absolutas). En prod = dominio real via SITE_URL.
function siteUrl(req) {
  return process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
}

async function fetchProducts(market) {
  try {
    const res = await fetch(`${apiBase}/v1/save/products?market=${market}&limit=5000`);
    return res.ok ? await res.json() : [];
  } catch {
    return []; // sitemap degradado (home+search) si la API no responde — no rompe el server
  }
}

async function startServer() {
  const app = express();

  if (isProduction) {
    app.use(express.static(`${root}dist/client`));
  } else {
    const vite = await import("vite");
    const viteServer = await vite.createServer({
      root,
      server: { middlewareMode: true },
    });
    app.use(viteServer.middlewares);
  }

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(buildRobots(siteUrl(req)));
  });

  app.get("/sitemap.xml", async (req, res) => {
    // Por ahora un país (DO); multi-país = loop sobre los países cuando entren US/CO/BR.
    const products = await fetchProducts(MARKET_BY_COUNTRY[DEFAULT_COUNTRY]);
    const xml = buildSitemap(siteUrl(req), {
      locales: LOCALES,
      country: DEFAULT_COUNTRY,
      paths: logicalPaths(products),
      defaultLocale: DEFAULT_LOCALE,
    });
    res.type("application/xml").send(xml);
  });

  app.get("*", async (req, res) => {
    try {
      const pageContext = await renderPage({
        urlOriginal: req.originalUrl,
        acceptLanguage: req.headers["accept-language"], // → el guard negocia el idioma
        headersOriginal: req.headers, // → pageContext.headers (SSR): gate de /admin/* (require-admin.ts)
      });
      if (pageContext.errorWhileRendering) {
        console.error("[render error]", pageContext.errorWhileRendering);
      }
      const { httpResponse } = pageContext;
      if (!httpResponse) return res.status(200).end();
      res.status(httpResponse.statusCode);
      httpResponse.headers.forEach(([name, value]) => res.setHeader(name, value));
      res.send(httpResponse.body);
    } catch (err) {
      console.error("[server catch]", err);
      res.status(500).send("Internal error");
    }
  });

  app.listen(port, () => {
    console.log(`Cuadra Save web → http://localhost:${port}`);
  });
}

startServer();
