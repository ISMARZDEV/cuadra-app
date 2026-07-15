import type { PageContext } from "vike/types";
import { describe, expect, it } from "vitest";

import { onBeforeRoute } from "./+onBeforeRoute";

function context(urlPathname: string, searchOriginal = ""): PageContext {
  return {
    urlPathname,
    urlParsed: { searchOriginal },
  } as unknown as PageContext;
}

describe("onBeforeRoute — query string preservation", () => {
  it("preserva el query string en rutas con prefijo locale/país", () => {
    const res = onBeforeRoute(context("/es/do/save/supermarkets", "?q=arroz"));
    expect(res.pageContext.urlLogical).toBe("/save/supermarkets?q=arroz");
  });

  it("preserva el query string en la rama fallback (/admin/*, sin prefijo)", () => {
    // Regresión: sin esto, `/admin/review-queue?limit=20` perdía el `?limit=20` → `data()` recibía
    // `urlParsed.search` vacío → paginación/filtros/orden del admin NUNCA aplicaban.
    const res = onBeforeRoute(context("/admin/review-queue", "?limit=20&offset=20"));
    expect(res.pageContext.urlLogical).toBe("/admin/review-queue?limit=20&offset=20");
  });

  it("no rompe la rama fallback cuando no hay query", () => {
    const res = onBeforeRoute(context("/admin/review-queue", ""));
    expect(res.pageContext.urlLogical).toBe("/admin/review-queue");
  });
});
