import { describe, expect, it } from "vitest";

import { ADMIN_RESOURCES } from "./admin-resource";
import { ADMIN_NAV, isActiveHref } from "./admin-nav";

function findResource(key: string) {
  const resource = ADMIN_RESOURCES.find((r) => r.key === key);
  if (!resource) throw new Error(`fixture error: ADMIN_RESOURCES missing key "${key}"`);
  return resource;
}

describe("ADMIN_NAV", () => {
  it("tiene las 4 secciones en el orden exacto del Figma", () => {
    expect(ADMIN_NAV.map((section) => section.key)).toEqual(["menu", "users", "news", "save"]);
  });

  it("sección Save → grupo Supermercado con los 5 sub-ítems en orden exacto", () => {
    const saveSection = ADMIN_NAV.find((s) => s.key === "save");
    expect(saveSection).toBeDefined();

    const supermercadoGroup = saveSection!.entries.find(
      (e) => e.kind === "group" && e.key === "supermercado"
    );
    expect(supermercadoGroup).toBeDefined();
    expect(supermercadoGroup!.kind).toBe("group");
    if (supermercadoGroup!.kind !== "group") throw new Error("unreachable");

    expect(supermercadoGroup!.items.map((item) => item.key)).toEqual([
      "metricas",
      "review-queue",
      "providers",
      "sources",
      "basket",
    ]);

    const statuses = Object.fromEntries(
      supermercadoGroup!.items.map((item) => [item.key, item.status])
    );
    expect(statuses).toEqual({
      metricas: "wip",
      "review-queue": "ready",
      providers: "ready",
      sources: "ready",
      basket: "ready",
    });
  });

  it("cada ítem ready tiene href + capability que coinciden EXACTO con ADMIN_RESOURCES (sin drift)", () => {
    const saveSection = ADMIN_NAV.find((s) => s.key === "save");
    const supermercadoGroup = saveSection!.entries.find(
      (e) => e.kind === "group" && e.key === "supermercado"
    );
    if (supermercadoGroup!.kind !== "group") throw new Error("unreachable");

    const expectations: Record<string, string> = {
      "review-queue": "save-matching-review",
      providers: "save-providers",
      sources: "save-sources",
      basket: "save-basket",
    };

    for (const item of supermercadoGroup!.items) {
      if (item.status !== "ready") continue;
      const resourceKey = expectations[item.key];
      expect(resourceKey, `no expectation mapped for ready item "${item.key}"`).toBeDefined();
      const resource = findResource(resourceKey);
      expect(item.href).toBe(resource.path);
      expect(item.capability).toBe(resource.capability);
    }
  });

  it("cada ítem wip NO tiene href", () => {
    const saveSection = ADMIN_NAV.find((s) => s.key === "save");
    const supermercadoGroup = saveSection!.entries.find(
      (e) => e.kind === "group" && e.key === "supermercado"
    );
    if (supermercadoGroup!.kind !== "group") throw new Error("unreachable");

    const metricas = supermercadoGroup!.items.find((i) => i.key === "metricas");
    expect(metricas).toBeDefined();
    expect(metricas!.status).toBe("wip");
    expect(metricas!.href).toBeUndefined();

    // leaf "Productos Financieros" tampoco navega
    const productosFinancieros = saveSection!.entries.find(
      (e) => e.kind === "leaf" && e.key === "productos-financieros"
    );
    expect(productosFinancieros).toBeDefined();
    if (productosFinancieros!.kind !== "leaf") throw new Error("unreachable");
    expect(productosFinancieros!.status).toBe("wip");
    expect(productosFinancieros!.href).toBeUndefined();
  });

  it("MENÚ → grupo Dashboard (defaultOpen true) con 3 sub-ítems wip", () => {
    const menuSection = ADMIN_NAV.find((s) => s.key === "menu");
    expect(menuSection).toBeDefined();
    const dashboard = menuSection!.entries.find((e) => e.kind === "group" && e.key === "dashboard");
    expect(dashboard).toBeDefined();
    if (dashboard!.kind !== "group") throw new Error("unreachable");
    expect(dashboard!.defaultOpen).toBe(true);
    expect(dashboard!.items.every((i) => i.status === "wip")).toBe(true);
    expect(dashboard!.items.every((i) => i.href === undefined)).toBe(true);
  });

  it("Users y News → grupos wip con defaultOpen false", () => {
    const usersSection = ADMIN_NAV.find((s) => s.key === "users");
    expect(usersSection).toBeDefined();
    const groupKeys = usersSection!.entries
      .filter((e) => e.kind === "group")
      .map((e) => (e.kind === "group" ? e.key : ""));
    expect(groupKeys).toEqual(["soporte-usuarios", "gestion-usuarios"]);
    for (const entry of usersSection!.entries) {
      if (entry.kind !== "group") continue;
      expect(entry.defaultOpen).toBe(false);
    }

    const newsSection = ADMIN_NAV.find((s) => s.key === "news");
    expect(newsSection).toBeDefined();
    const publicaciones = newsSection!.entries.find(
      (e) => e.kind === "group" && e.key === "publicaciones"
    );
    expect(publicaciones).toBeDefined();
    if (publicaciones!.kind !== "group") throw new Error("unreachable");
    expect(publicaciones!.defaultOpen).toBe(false);
  });

  it("Supermercado (grupo Save) tiene defaultOpen true", () => {
    const saveSection = ADMIN_NAV.find((s) => s.key === "save");
    const supermercado = saveSection!.entries.find(
      (e) => e.kind === "group" && e.key === "supermercado"
    );
    if (supermercado!.kind !== "group") throw new Error("unreachable");
    expect(supermercado!.defaultOpen).toBe(true);
  });
});

describe("isActiveHref", () => {
  it("match exacto → true", () => {
    expect(isActiveHref("/admin/review-queue", "/admin/review-queue")).toBe(true);
  });

  it("match por prefijo (subrutas) → true", () => {
    expect(isActiveHref("/admin/review-queue", "/admin/review-queue/123")).toBe(true);
  });

  it("sin match → false", () => {
    expect(isActiveHref("/admin/review-queue", "/admin/providers")).toBe(false);
  });

  it("href undefined → false", () => {
    expect(isActiveHref(undefined, "/admin/review-queue")).toBe(false);
  });

  it("prefijo parcial de segmento NO cuenta como match (evita falsos positivos)", () => {
    // "/admin/review-queue-old" no debe matchear con href "/admin/review-queue"
    expect(isActiveHref("/admin/review-queue", "/admin/review-queue-old")).toBe(false);
  });
});
