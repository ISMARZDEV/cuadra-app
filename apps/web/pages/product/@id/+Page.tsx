import { useData } from "vike-react/useData";

import { CompareTable } from "../../../src/components/compare-table";
import { usePageI18n } from "../../../src/i18n/usePageI18n";
import type { ProductData } from "./+data";

export default function Page() {
  const { locale, t } = usePageI18n();
  const comparison = useData<ProductData>();
  return (
    <main>
      <h1>{comparison.name}</h1>
      <p>
        {t("product.bestPriceAt")} <strong>{comparison.cheapest_provider}</strong>.
      </p>
      <CompareTable comparison={comparison} locale={locale} />
    </main>
  );
}
