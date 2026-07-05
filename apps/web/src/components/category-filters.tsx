import type { CategoryFacetsDto, FacetValueDto, PriceBucketDto } from "@cuadra/api-client";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { navigate } from "vike/client/router";

import { Checkbox } from "./ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Slider } from "./ui/slider";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import type { Locale } from "../i18n/config";
import { format, translate } from "../i18n/messages";
import { formatMoney } from "../lib/format";

type Search = Record<string, string | undefined>;

const asList = (v: string | undefined): string[] =>
  v ? v.split(",").filter(Boolean) : [];

const FACET_LIMIT = 5; // top N facetas antes de "Ver todas (N)" (paridad SupermercadosRD)

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

// Sección colapsable con chevron (shadcn Collapsible). El chevron rota según data-[state].
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible defaultOpen className="group/section">
      <CollapsibleTrigger className="flex w-full items-center justify-between font-medium">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]/section:-rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

// Lista de facetas (tiendas/marcas) con truncación "Ver todas (N)"/"Ver menos" + Checkbox shadcn.
function FacetChecklist({
  values,
  active,
  onToggle,
  locale,
}: {
  values: FacetValueDto[];
  active: string[];
  onToggle: (id: string) => void;
  locale: Locale;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? values : values.slice(0, FACET_LIMIT);
  return (
    <>
      {shown.map((v) => (
        <label
          key={v.id}
          className="flex cursor-pointer items-center gap-2 py-1 text-muted-foreground hover:text-foreground"
        >
          <Checkbox checked={active.includes(v.id)} onCheckedChange={() => onToggle(v.id)} />
          <span className="flex-1">{v.name}</span>
          <span className="text-xs">{v.count}</span>
        </label>
      ))}
      {values.length > FACET_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded
            ? translate(locale, "category.facetLess")
            : format(locale, "category.facetMore", { n: String(values.length) })}
        </button>
      )}
    </>
  );
}

// Sidebar de filtros (Imagen #5): Precio (histograma + Slider + rangos preset) · Supermercados ·
// Marcas. URL-driven → cada cambio navega y el SSR recalcula. `facets` viene del backend.
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

  const priceLo = facets.price.min_minor;
  const priceHi = facets.price.max_minor;
  // rango del Slider (minor units), sincronizado con la URL; se comitea al soltar.
  const [range, setRange] = useState<[number, number]>([
    search.pmin ? Number(search.pmin) : priceLo,
    search.pmax ? Number(search.pmax) : priceHi,
  ]);
  useEffect(() => {
    setRange([
      search.pmin ? Number(search.pmin) : priceLo,
      search.pmax ? Number(search.pmax) : priceHi,
    ]);
  }, [search.pmin, search.pmax, priceLo, priceHi]);

  const toggle = (key: "stores" | "brands", value: string, activeVals: string[]) => {
    const next = activeVals.includes(value)
      ? activeVals.filter((v) => v !== value)
      : [...activeVals, value];
    applyPatch(pathname, search, { [key]: next.join(",") || undefined });
  };

  const commitRange = ([lo, hi]: number[]) => {
    applyPatch(pathname, search, {
      pmin: lo > priceLo ? String(lo) : undefined,
      pmax: hi < priceHi ? String(hi) : undefined,
    });
  };

  const applyBucket = (b: PriceBucketDto) => {
    applyPatch(pathname, search, {
      pmin: String(b.min_minor),
      pmax: b.max_minor != null ? String(b.max_minor) : undefined,
    });
  };

  const bucketLabel = (b: PriceBucketDto, i: number): string => {
    const currency = facets.price.currency;
    if (i === 0)
      return `${translate(locale, "category.upTo")} ${formatMoney(b.max_minor ?? 0, currency)}`;
    if (b.max_minor == null)
      return `${formatMoney(b.min_minor, currency)} ${translate(locale, "category.orMore")}`;
    return `${formatMoney(b.min_minor, currency)} – ${formatMoney(b.max_minor, currency)}`;
  };

  const brands = facets.brands.filter((b) =>
    b.name.toLowerCase().includes(brandQuery.toLowerCase()),
  );
  const hasFilters = activeStores.length || activeBrands.length || search.pmin || search.pmax;
  const viewMode = search.view === "pages" ? "pages" : "loadmore";

  const histogram = facets.price.histogram ?? [];
  const buckets = facets.price.buckets ?? [];
  const histMax = Math.max(1, ...histogram);
  // qué bucket refleja el filtro actual (para marcar el RadioGroup); "" = ninguno.
  const activeBucket = buckets.findIndex(
    (b) =>
      String(b.min_minor) === (search.pmin ?? String(priceLo)) &&
      (b.max_minor != null ? String(b.max_minor) : undefined) === search.pmax,
  );

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

      {/* Vista de resultados: cargar más (default) vs paginación numerada (shadcn ToggleGroup) */}
      <div>
        <p className="mb-2 font-medium">{translate(locale, "category.viewMode")}</p>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) =>
            v &&
            applyPatch(pathname, search, {
              view: v === "pages" ? "pages" : undefined,
              page: undefined,
            })
          }
          variant="outline"
          size="sm"
          className="w-full"
        >
          <ToggleGroupItem value="loadmore">
            {translate(locale, "category.viewMode.loadMore")}
          </ToggleGroupItem>
          <ToggleGroupItem value="pages">
            {translate(locale, "category.viewMode.pages")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Precio: histograma + Slider de rango + rangos preset (RadioGroup) */}
      <Section title={translate(locale, "compare.price")}>
        {histogram.length > 0 && (
          <div className="mb-1 flex h-12 items-end gap-px" aria-hidden>
            {histogram.map((count, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-muted-foreground/30"
                style={{ height: `${Math.max(4, (count / histMax) * 100)}%` }}
              />
            ))}
          </div>
        )}

        <Slider
          className="my-3"
          min={priceLo}
          max={priceHi}
          step={100}
          value={range}
          onValueChange={(v) => setRange([v[0], v[1]])}
          onValueCommit={commitRange}
          aria-label={translate(locale, "compare.price")}
        />
        <p className="mb-3 text-xs text-muted-foreground">
          {formatMoney(range[0], facets.price.currency)} –{" "}
          {formatMoney(range[1], facets.price.currency)}
        </p>

        {buckets.length > 0 && (
          <RadioGroup
            value={activeBucket >= 0 ? String(activeBucket) : ""}
            onValueChange={(v) => applyBucket(buckets[Number(v)])}
          >
            {buckets.map((b, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <RadioGroupItem value={String(i)} />
                <span className="flex-1">{bucketLabel(b, i)}</span>
                <span className="text-xs">{b.count}</span>
              </label>
            ))}
          </RadioGroup>
        )}
      </Section>

      {/* Supermercados */}
      {facets.stores.length > 0 && (
        <Section title={translate(locale, "category.stores")}>
          <FacetChecklist
            values={facets.stores}
            active={activeStores}
            onToggle={(id) => toggle("stores", id, activeStores)}
            locale={locale}
          />
        </Section>
      )}

      {/* Marcas */}
      {facets.brands.length > 0 && (
        <Section title={translate(locale, "category.brands")}>
          <input
            type="search"
            aria-label={translate(locale, "category.searchBrand")}
            placeholder={translate(locale, "category.searchBrand")}
            value={brandQuery}
            onChange={(e) => setBrandQuery(e.target.value)}
            className="mb-2 w-full rounded-md border border-border bg-card px-2 py-1"
          />
          <FacetChecklist
            values={brands}
            active={activeBrands}
            onToggle={(id) => toggle("brands", id, activeBrands)}
            locale={locale}
          />
        </Section>
      )}
    </aside>
  );
}
