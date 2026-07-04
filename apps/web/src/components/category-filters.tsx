import type { CategoryFacetsDto } from "@cuadra/api-client";
import { useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { navigate } from "vike/client/router";

import type { Locale } from "../i18n/config";
import { translate } from "../i18n/messages";
import { formatMoney } from "../lib/format";

type Search = Record<string, string | undefined>;

const asList = (v: string | undefined): string[] =>
  v ? v.split(",").filter(Boolean) : [];

// Aplica un parche de filtros a la URL actual (preservando el prefijo /{locale}/{country}) y navega
// del lado cliente → el servidor re-renderiza el listado filtrado (SSR + compartible).
function applyPatch(pathname: string, search: Search, patch: Search) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...search, ...patch })) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  void navigate(qs ? `${pathname}?${qs}` : pathname);
}

// Sidebar de filtros (Imagen #5): Precio (rango) · Supermercados (conteos) · Marcas (buscador +
// conteos). URL-driven → cada cambio navega y el SSR recalcula. `facets` viene del backend.
export function CategoryFilters({
  facets,
  locale,
}: {
  facets: CategoryFacetsDto;
  locale: Locale;
}) {
  const pageContext = usePageContext();
  const search = pageContext.urlParsed.search as Search;
  const pathname = pageContext.urlPathname;

  const activeStores = asList(search.stores);
  const activeBrands = asList(search.brands);

  const [brandQuery, setBrandQuery] = useState("");
  const [pmin, setPmin] = useState(search.pmin ? String(Number(search.pmin) / 100) : "");
  const [pmax, setPmax] = useState(search.pmax ? String(Number(search.pmax) / 100) : "");

  const toggle = (key: "stores" | "brands", value: string, active: string[]) => {
    const next = active.includes(value)
      ? active.filter((v) => v !== value)
      : [...active, value];
    applyPatch(pathname, search, { [key]: next.join(",") || undefined });
  };

  const applyPrice = () => {
    applyPatch(pathname, search, {
      pmin: pmin ? String(Math.round(Number(pmin) * 100)) : undefined,
      pmax: pmax ? String(Math.round(Number(pmax) * 100)) : undefined,
    });
  };

  const brands = facets.brands.filter((b) =>
    b.name.toLowerCase().includes(brandQuery.toLowerCase()),
  );
  const hasFilters = activeStores.length || activeBrands.length || search.pmin || search.pmax;

  return (
    <aside className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{translate(locale, "category.filters")}</h2>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => void navigate(pathname)}
            className="text-xs text-muted-foreground underline hover:text-primary"
          >
            {translate(locale, "category.clear")}
          </button>
        ) : null}
      </div>

      {/* Precio */}
      <div>
        <p className="mb-2 font-medium">{translate(locale, "compare.price")}</p>
        <p className="mb-2 text-xs text-muted-foreground">
          {formatMoney(facets.price.min_minor, facets.price.currency)} –{" "}
          {formatMoney(facets.price.max_minor, facets.price.currency)}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            aria-label={translate(locale, "category.priceMin")}
            placeholder={translate(locale, "category.priceMin")}
            value={pmin}
            onChange={(e) => setPmin(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            inputMode="numeric"
            aria-label={translate(locale, "category.priceMax")}
            placeholder={translate(locale, "category.priceMax")}
            value={pmax}
            onChange={(e) => setPmax(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-2 py-1"
          />
        </div>
        <button
          type="button"
          onClick={applyPrice}
          className="mt-2 w-full rounded-md border border-border py-1 text-xs hover:border-primary"
        >
          {translate(locale, "category.apply")}
        </button>
      </div>

      {/* Supermercados */}
      {facets.stores.length > 0 && (
        <div>
          <p className="mb-2 font-medium">{translate(locale, "category.stores")}</p>
          {facets.stores.map((s) => (
            <label key={s.id} className="flex items-center gap-2 py-1 text-muted-foreground">
              <input
                type="checkbox"
                checked={activeStores.includes(s.id)}
                onChange={() => toggle("stores", s.id, activeStores)}
              />
              <span className="flex-1">{s.name}</span>
              <span className="text-xs">{s.count}</span>
            </label>
          ))}
        </div>
      )}

      {/* Marcas */}
      {facets.brands.length > 0 && (
        <div>
          <p className="mb-2 font-medium">{translate(locale, "category.brands")}</p>
          <input
            type="search"
            aria-label={translate(locale, "category.searchBrand")}
            placeholder={translate(locale, "category.searchBrand")}
            value={brandQuery}
            onChange={(e) => setBrandQuery(e.target.value)}
            className="mb-2 w-full rounded-md border border-border bg-card px-2 py-1"
          />
          {brands.map((b) => (
            <label key={b.id} className="flex items-center gap-2 py-1 text-muted-foreground">
              <input
                type="checkbox"
                checked={activeBrands.includes(b.id)}
                onChange={() => toggle("brands", b.id, activeBrands)}
              />
              <span className="flex-1">{b.name}</span>
              <span className="text-xs">{b.count}</span>
            </label>
          ))}
        </div>
      )}
    </aside>
  );
}
