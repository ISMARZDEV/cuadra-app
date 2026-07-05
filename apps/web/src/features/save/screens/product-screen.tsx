import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { navigate } from "vike/client/router";
import { useData } from "vike-react/useData";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "@/i18n/messages";
import { usePageI18n } from "@/i18n/usePageI18n";
import { localeHref } from "@/lib/links";

import { myAlerts, subscribe } from "../api";
import { Breadcrumbs } from "../components/breadcrumbs";
import { CompareTable } from "../components/compare-table";
import { PriceHistoryChart } from "../components/price-history-chart";
import { SectionRail } from "../components/section-rail";
import { useAuth } from "../hooks/use-auth";
import { useShoppingList } from "../hooks/use-shopping-list";
import { formatMoney } from "../lib/format";
import type { ProductData } from "../types";

// Producto (Imagen #2): breadcrumb · cabecera (rango de precio + agregar a lista) · tabla
// comparativa + disclaimer · historial (C9, datos reales) · feedback. Las secciones que dependen
// de matching/embeddings (alternativas, relacionados, más de la marca) quedan como próximamente.
export function ProductScreen() {
  const { locale, country, t } = usePageI18n();
  const { comparison, history, brandProducts, nowMs } = useData<ProductData>();
  const { add } = useShoppingList();
  const productHref = (slug: string) =>
    localeHref(locale, country, `/save/supermarkets/product/${slug}`);
  const { isAuthed } = useAuth();
  const [watching, setWatching] = useState(false);
  const productId = comparison.canonical_product_id;

  // Refleja la suscripción YA existente al cargar (persistencia): sin esto el botón vuelve a
  // "Avísame cuando baje" tras refrescar aunque la alerta esté guardada. Corre al hidratar y
  // cuando cambia la sesión (isAuthed pasa a true tras Clerk/hidratación).
  useEffect(() => {
    if (!isAuthed) {
      setWatching(false);
      return;
    }
    let cancelled = false;
    void myAlerts().then((res) => {
      if (cancelled) return;
      const alerts = res.data ?? [];
      setWatching(alerts.some((a) => a.canonical_product_id === productId));
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthed, productId]);

  const onNotifyMe = async () => {
    if (!isAuthed) {
      void navigate(localeHref(locale, country, "/save/supermarkets/login"));
      return;
    }
    const res = await subscribe(productId);
    if (!res.error) setWatching(true);
  };

  // "Compara desde RD$X hasta RD$Y" — derivado de las entries (el backend las ordena por precio).
  const prices = comparison.entries.map((e) => e.price_minor);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const priceRange = format(locale, "product.priceFrom", {
    min: formatMoney(min, comparison.currency),
    max: formatMoney(max, comparison.currency),
  });

  // Propiedades (C10): Tipo = categoría hoja (último del breadcrumb) · Marca · Calidad.
  const leafCategory = comparison.breadcrumb?.at(-1)?.name;
  const properties: [string, string][] = [
    ...(leafCategory ? [[t("product.propType"), leafCategory] as [string, string]] : []),
    ...(comparison.brand ? [[t("product.propBrand"), comparison.brand] as [string, string]] : []),
    ...(comparison.quality
      ? [[t("product.propQuality"), comparison.quality] as [string, string]]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Breadcrumbs trail={comparison.breadcrumb ?? []} currentName={comparison.name} />

      <header className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-[240px_1fr]">
        <div className="relative">
          {comparison.image_url ? (
            <img
              src={comparison.image_url}
              alt={comparison.name}
              className="aspect-square w-full rounded-lg border border-border object-contain p-2"
            />
          ) : (
            <div className="aspect-square rounded-lg bg-muted" aria-hidden />
          )}
          {comparison.display_size && (
            <span className="absolute left-2 top-2 rounded-md bg-foreground/85 px-2 py-0.5 text-xs font-medium text-background">
              {comparison.display_size}
            </span>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{comparison.name}</h1>
          {comparison.brand && (
            <p className="mt-0.5 text-sm text-muted-foreground">{comparison.brand}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">{priceRange}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("product.bestPriceAt")}{" "}
            <strong className="text-foreground">{comparison.cheapest_provider}</strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                add({
                  id: comparison.canonical_product_id,
                  name: comparison.name,
                  brand: comparison.brand,
                  image_url: comparison.image_url ?? null,
                  price_minor: min,
                  currency: comparison.currency,
                  qty: 1,
                })
              }
            >
              + {t("product.addToList")}
            </Button>
            <Button size="sm" variant={watching ? "secondary" : "default"} onClick={onNotifyMe}>
              <Bell className="mr-1.5 size-3.5" />
              {watching ? t("alerts.watching") : t("alerts.notifyMe")}
            </Button>
          </div>
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

      {brandProducts.length > 0 && (
        <div className="mt-4">
          <SectionRail
            title={format(locale, "product.moreFromBrand", { brand: comparison.brand })}
            products={brandProducts}
            locale={locale}
            productHref={productHref}
          />
        </div>
      )}

      {[t("product.alternatives"), t("product.related")].map((section) => (
        <section key={section} className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{section}</h2>
          <Badge variant="secondary">{t("common.comingSoon")}</Badge>
        </section>
      ))}

      {properties.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{t("product.properties")}</h2>
          <table className="w-full max-w-md text-sm">
            <tbody>
              {properties.map(([label, value]) => (
                <tr key={label} className="border-b border-border">
                  <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                  <td className="py-2 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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
