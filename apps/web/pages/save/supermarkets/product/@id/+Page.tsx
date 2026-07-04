import { useData } from "vike-react/useData";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompareTable } from "@/components/compare-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePageI18n } from "@/i18n/usePageI18n";

import type { ProductData } from "./+data";

// Producto (Imagen #5): breadcrumb · cabecera · tabla comparativa · secciones (alternativas,
// relacionados, historial, propiedades). La tabla + historial usan datos reales; el resto skeleton.
export default function Page() {
  const { locale, t } = usePageI18n();
  const comparison = useData<ProductData>();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={comparison.breadcrumb ?? []} currentName={comparison.name} />

      <header className="mt-4">
        <h1 className="text-2xl font-bold">{comparison.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("product.bestPriceAt")} <strong className="text-foreground">{comparison.cheapest_provider}</strong>
        </p>
        <div className="mt-3">
          <Button size="sm" variant="outline">
            + {t("product.addToList")}
          </Button>
        </div>
      </header>

      <div className="mt-6">
        <CompareTable comparison={comparison} locale={locale} />
      </div>

      {[
        t("product.alternatives"),
        t("product.related"),
        t("product.history"),
        t("product.properties"),
      ].map((section) => (
        <section key={section} className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{section}</h2>
          <Badge variant="secondary">{t("common.comingSoon")}</Badge>
        </section>
      ))}
    </div>
  );
}
