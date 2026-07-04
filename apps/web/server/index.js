// Servidor SSR de producción (Vike + Express). En dev usá `pnpm --filter @cuadra/web dev`
// (el plugin de Vike sirve por middleware de Vite). Este server es para `build` + `server`.
import express from "express";
import { renderPage } from "vike/server";

const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 3000;
const root = new URL("..", import.meta.url).pathname;

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

  app.get("*", async (req, res) => {
    const pageContext = await renderPage({ urlOriginal: req.originalUrl });
    const { httpResponse } = pageContext;
    if (!httpResponse) return res.status(200).end();
    res.status(httpResponse.statusCode);
    httpResponse.headers.forEach(([name, value]) => res.setHeader(name, value));
    res.send(httpResponse.body);
  });

  app.listen(port, () => {
    console.log(`Cuadra Save web → http://localhost:${port}`);
  });
}

startServer();
