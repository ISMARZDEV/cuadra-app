import { useData } from "vike-react/useData";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { CompareTable } from "@/components/compare-table";
import { PriceHistoryChart } from "@/components/price-history-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "@/i18n/messages";
import { usePageI18n } from "@/i18n/usePageI18n";
import { formatMoney } from "@/lib/format";

import type { ProductData } from "./+data";

// Producto (Imagen #2): breadcrumb · cabecera (rango de precio + agregar a lista) · tabla
// comparativa + disclaimer · historial (C9, datos reales) · feedback. Las secciones que dependen
// de matching/embeddings (alternativas, relacionados, más de la marca) quedan como próximamente.
export default function Page() {
  const { locale, t } = usePageI18n();
  const { comparison, history, nowMs } = useData<ProductData>();

  // "Compara desde RD$X hasta RD$Y" — derivado de las entries (el backend las ordena por precio).
  const prices = comparison.entries.map((e) => e.price_minor);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const priceRange = format(locale, "product.priceFrom", {
    min: formatMoney(min, comparison.currency),
    max: formatMoney(max, comparison.currency),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={comparison.breadcrumb ?? []} currentName={comparison.name} />

      <header className="mt-4">
        <h1 className="text-2xl font-bold">{comparison.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{priceRange}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t("product.bestPriceAt")}{" "}
          <strong className="text-foreground">{comparison.cheapest_provider}</strong>
        </p>
        <div className="mt-3">
          <Button size="sm" variant="outline">
            + {t("product.addToList")}
          </Button>
        </div>
      </header>

      <section className="mt-6">
        <CompareTable comparison={comparison} locale={locale} />
        <p className="mt-2 text-xs text-muted-foreground">{t("product.onlineDisclaimer")}</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">{t("product.history")}</h2>
        {history && history.series.length > 0 ? (
          <PriceHistoryChart history={history} locale={locale} nowMs={nowMs} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
        )}
      </section>

      {[t("product.alternatives"), t("product.related")].map((section) => (
        <section key={section} className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{section}</h2>
          <Badge variant="secondary">{t("common.comingSoon")}</Badge>
        </section>
      ))}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">{t("product.feedback")}</h2>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <button type="button" className="underline hover:text-primary">
            {t("product.reportProblem")}
          </button>
          <button type="button" className="underline hover:text-primary">
            {t("product.suggestCategory")}
          </button>
        </div>
      </section>
    </div>
  );
}
