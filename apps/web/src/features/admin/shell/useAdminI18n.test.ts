import { describe, expect, it } from "vitest";

import type { MessageKey } from "@/i18n/messages";

import { useAdminI18n } from "./useAdminI18n";

// `useAdminI18n` es un wrapper EXPLÍCITO por locale (NO `usePageI18n`, que lee locale de la URL y
// siempre cae a DEFAULT_LOCALE en /admin/* — ver +guard.ts, admin está exento del prefijo
// /{locale}/{country}). El locale llega vía AdminShellData (SSR), no desde acá.
describe("useAdminI18n", () => {
  it("es: traduce las claves admin.nav.* al español", () => {
    const { t } = useAdminI18n("es");
    expect(t("admin.nav.save.reviewQueue")).toBe("Cola de revisión");
    expect(t("admin.nav.save.providers")).toBe("Proveedores");
    expect(t("admin.nav.save.sources")).toBe("Fuentes");
    expect(t("admin.nav.save.basket")).toBe("Canasta curada");
  });

  it("en: traduce las claves admin.nav.* al inglés", () => {
    const { t } = useAdminI18n("en");
    expect(t("admin.nav.save.reviewQueue")).toBe("Review queue");
    expect(t("admin.nav.save.providers")).toBe("Providers");
    expect(t("admin.nav.save.sources")).toBe("Sources");
    expect(t("admin.nav.save.basket")).toBe("Curated basket");
  });

  it("pt: traduce las claves admin.nav.* al portugués", () => {
    const { t } = useAdminI18n("pt");
    expect(t("admin.nav.save.reviewQueue")).toBe("Fila de revisão");
    expect(t("admin.nav.save.providers")).toBe("Fornecedores");
    expect(t("admin.nav.save.sources")).toBe("Fontes");
    expect(t("admin.nav.save.basket")).toBe("Cesta curada");
  });

  it("cubre TODOS los labelKey usados hoy en admin-nav.ts, en los 3 locales", () => {
    const labelKeys: MessageKey[] = [
      "admin.nav.section.menu",
      "admin.nav.section.users",
      "admin.nav.section.news",
      "admin.nav.section.save",
      "admin.nav.dashboard",
      "admin.nav.dashboard.users",
      "admin.nav.dashboard.news",
      "admin.nav.dashboard.save",
      "admin.nav.users.support",
      "admin.nav.users.management",
      "admin.nav.news.publications",
      "admin.nav.save.supermarket",
      "admin.nav.save.metrics",
      "admin.nav.save.reviewQueue",
      "admin.nav.save.providers",
      "admin.nav.save.sources",
      "admin.nav.save.basket",
      "admin.nav.save.financialProducts",
    ];

    for (const locale of ["es", "en", "pt"] as const) {
      const { t } = useAdminI18n(locale);
      for (const key of labelKeys) {
        expect(t(key), `[${locale}] "${key}" debe tener traducción`).toBeTruthy();
      }
    }
  });

  it("tiene traducción para el toast WIP y el footer (Feedback/Ayuda)", () => {
    expect(useAdminI18n("es").t("admin.nav.wip")).toBe(
      "🚧 En construcción — aún no disponible",
    );
    expect(useAdminI18n("en").t("admin.nav.wip")).toBe(
      "🚧 Under construction — not available yet",
    );
    expect(useAdminI18n("pt").t("admin.nav.wip")).toBe(
      "🚧 Em construção — ainda não disponível",
    );

    expect(useAdminI18n("es").t("admin.nav.footer.feedback")).toBe("Feedback");
    expect(useAdminI18n("en").t("admin.nav.footer.feedback")).toBe("Feedback");
    expect(useAdminI18n("pt").t("admin.nav.footer.feedback")).toBe("Feedback");

    expect(useAdminI18n("es").t("admin.nav.footer.help")).toBe("Ayuda");
    expect(useAdminI18n("en").t("admin.nav.footer.help")).toBe("Help");
    expect(useAdminI18n("pt").t("admin.nav.footer.help")).toBe("Ajuda");
  });

  it("locale queda expuesto (para debug/composición), explícito y no leído de la URL", () => {
    expect(useAdminI18n("en").locale).toBe("en");
  });

  it("clave desconocida no revienta — mismo comportamiento que `translate` hoy (undefined, sin fallback propio)", () => {
    const { t } = useAdminI18n("es");
    expect(() => t("admin.nav.nonexistent" as MessageKey)).not.toThrow();
    expect(t("admin.nav.nonexistent" as MessageKey)).toBeUndefined();
  });
});
