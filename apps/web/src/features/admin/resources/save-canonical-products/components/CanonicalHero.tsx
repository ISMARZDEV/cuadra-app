import type {
  AdminCanonicalProductRowDto,
  AdminCanonicalProviderPriceDto,
} from "@cuadra/api-client";
import {
  Archive,
  ChevronDown,
  Pencil,
  PlusCircle,
  RefreshCw,
  ScanBarcode,
  ShieldCheck,
  Star,
  Tag,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { ProviderLogo } from "@/features/admin/components/ProviderLogo";

import { formatCatalogDate } from "../lib/format-date";
import { priceDrop } from "../lib/price-drop";
import { HeroKpiCards } from "./HeroKpiCards";
import { ProductPreviewCard } from "./ProductPreviewCard";

type T = (key: MessageKey) => string;

/**
 * Encabezado del detalle canónico.
 *
 * Layout de 3 columnas contra Figma nodo 708:25704:
 * - Columna izquierda: ProductPreviewCard (maqueta pública)
 * - Columna central: identidad + precio + proveedores
 * - Columna derecha: KPIs de audiencia + botones de acción
 */
export function CanonicalHero({
  product,
  providers,
  imageCount,
  locale,
  t,
  publicHref,
  onSync,
  onEdit,
  syncing,
  children,
  tabs,
}: {
  product: AdminCanonicalProductRowDto;
  providers: AdminCanonicalProviderPriceDto[];
  imageCount: number;
  locale: Locale;
  t: T;
  publicHref: string | null;
  onSync: () => void;
  onEdit: () => void;
  syncing: boolean;
  /** Acciones que siguen siendo del contenedor (slug, archivar): sus flujos viven allá. */
  children?: React.ReactNode;
  /** Tabs de navegación del detalle (Resumen/Categorías/…). Renderizados dentro del card. */
  tabs?: React.ReactNode;
}) {
  const archived = Boolean(product.archived_at);
  const currency = product.price_currency ?? providers[0]?.currency ?? "DOP";

  const cheapest = providers.find((p) => p.is_cheapest) ?? providers[0];
  const priceMinor = product.min_price_minor ?? cheapest?.price_minor ?? null;
  const previousPriceMinor = cheapest?.previous_price_minor ?? null;
  const drop =
    typeof priceMinor === "number" ? priceDrop(priceMinor, previousPriceMinor) : null;
  const showPrevious = drop !== null;

  return (
    <section className="rounded-[28px] border border-black/5 bg-white p-4 shadow-sm md:p-6 [corner-shape:squircle] dark:border-white/10 dark:bg-card">
      {/* Layout: preview + identity + KPIs. En pantallas muy anchas los KPI van a la derecha;
           en pantallas medianas los KPI pasan abajo para no comprimir el centro. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[240px_1fr] 2xl:grid-cols-[240px_1fr_440px] xl:gap-6">
        {/* Columna izquierda: ProductPreviewCard */}
        <ProductPreviewCard
          name={product.name}
          displaySize={product.display_size}
          currency={currency}
          priceMinor={priceMinor}
          previousPriceMinor={showPrevious ? previousPriceMinor : null}
          drop={drop}
          imageUrl={product.image_url}
          imageCount={imageCount}
          matchedProviderCount={product.matched_provider_count ?? providers.length}
          publicHref={publicHref}
          t={t}
        />

        {/* Columna central: identidad + status + proveedores */}
        <div className="min-w-0 space-y-3">
          <Identity product={product} archived={archived} locale={locale} t={t} />
          <StatusChips product={product} locale={locale} t={t} />
          <Dates product={product} locale={locale} t={t} />
          <ProviderLogos providers={providers} t={t} />
          {product.description ? (
            <p className="max-w-prose text-sm text-muted-foreground leading-relaxed">{product.description}</p>
          ) : null}
        </div>

        {/* Columna derecha: botones + KPIs (en 2xl a la derecha; en xl pasan abajo como fila completa) */}
        <div className="col-span-full flex min-w-0 flex-col items-start gap-4 xl:col-span-2 2xl:col-span-1 2xl:items-end">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-gradient-to-r from-[#C2FB7E] via-[#D9FFAB] to-[#C2FB7E] px-4 text-sm font-bold text-brand-forest shadow-sm hover:opacity-90"
            >
              <Pencil className="size-4" aria-hidden />
              {t("admin.canonicalProducts.actions.edit")}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 items-center gap-2 rounded-full bg-[#015442] px-4 text-sm font-medium text-[#BBEC6C] hover:bg-[#015442]/90">
                <span className="inline-flex items-center gap-1">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  {t("admin.canonicalDetail.hero.actions")}
                </span>
                <ChevronDown className="size-3" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onClick={onSync} disabled={syncing}>
                  <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                  {t("admin.canonicalDetail.hero.sync")}
                </DropdownMenuItem>
                {children}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <HeroKpiCards t={t} />
        </div>
      </div>

      {tabs ? <div className="mt-4">{tabs}</div> : null}
    </section>
  );
}

function Identity({
  product,
  archived,
  locale,
  t,
}: {
  product: AdminCanonicalProductRowDto;
  archived: boolean;
  locale: Locale;
  t: T;
}) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-[28px] font-semibold leading-tight text-brand-forest dark:text-brand-lime">
        {product.name}
      </h1>
      <p className="font-mono text-sm font-semibold text-[#A6D46F]">{product.slug}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
        {archived ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Archive className="size-3.5" aria-hidden />
            {t("admin.canonicalProducts.archive.badge")}
          </span>
        ) : (
          <span className="rounded-full bg-[#00DE8C] px-3 py-1 text-xs font-bold text-[#005928]">
            {t("admin.canonicalDetail.hero.active")}
          </span>
        )}
        <span className="text-muted-foreground" aria-hidden>•</span>
        <span className="inline-flex items-center gap-1.5">
          <Tag className="size-4 text-brand-forest dark:text-brand-lime" aria-hidden />
          <span className="text-muted-foreground">{t("admin.canonicalDetail.hero.brand")}:</span>
          <span className="font-bold text-brand-forest dark:text-brand-lime">{product.brand || "—"}</span>
        </span>
        <span className="text-muted-foreground" aria-hidden>•</span>
        <span className="inline-flex items-center gap-1.5">
          <ScanBarcode className="size-4 text-brand-forest dark:text-brand-lime" aria-hidden />
          <span className="text-muted-foreground">{t("admin.canonicalDetail.hero.eanSku")}:</span>
          {product.ean ? (
            <span className="rounded-md bg-[#DCFFB3] px-2 py-0.5 font-mono font-bold text-[#007E62]">
              {product.ean}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("admin.canonicalDetail.hero.noEan")}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** Los cuatro badges de estado del diseño: categoría, calidad, EAN y completitud. */
function StatusChips({
  product,
  locale,
  t,
}: {
  product: AdminCanonicalProductRowDto;
  locale: Locale;
  t: T;
}) {
  const score = product.completeness_score ?? 0;
  const completeness =
    score >= 80
      ? "admin.canonicalDetail.hero.completenessHigh"
      : score >= 50
        ? "admin.canonicalDetail.hero.completenessMid"
        : "admin.canonicalDetail.hero.completenessLow";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Primera fila: Categoría + Calidad */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Categoría: azul claro con ícono de estrella en círculo */}
        <div className="inline-flex items-center gap-2 rounded-2xl bg-[#EDFBFF] px-3 py-2">
          <div className="grid size-10 place-items-center rounded-full bg-[#29A2C6]">
            <Star className="size-5 text-white" strokeWidth={2} aria-hidden />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-[#29A2C6]">{product.category_top || "—"}</span>
            <span className="text-sm font-semibold text-[#1a8aa8]">{product.category || "—"}</span>
          </div>
        </div>

        {/* Calidad: gris con estrella en círculo verde forest */}
        <div className="inline-flex items-center gap-2 rounded-2xl bg-[#F0F0F0] px-3 py-2">
          <div className="grid size-10 place-items-center rounded-full bg-[#0B6A53]">
            <Star className="size-5 text-[#A7E842]" strokeWidth={2} aria-hidden />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-[#7E7C7C]">{t("admin.canonicalDetail.info.quality")}</span>
            <span className="text-sm font-semibold text-[#1a1a1a]">{product.quality || t("admin.canonicalDetail.hero.qualityUndefined")}</span>
          </div>
        </div>
      </div>

      {/* Segunda fila: EAN + Completitud */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* EAN Alcanzable: lima con círculo verde y texto verde oscuro */}
        {product.ean_reachable ? (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-[#C2FB7E] px-3 py-2">
            <div className="grid size-10 place-items-center rounded-full bg-[#00AF6C]">
              <ScanBarcode className="size-5 text-white" strokeWidth={2} aria-hidden />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium text-[#007E62]">{t("admin.canonicalProducts.ean.reachable")}</span>
              <span className="text-sm font-bold text-[#034842]">{format(locale, "admin.canonicalProducts.ean.products", { count: "2" })}</span>
            </div>
          </div>
        ) : null}

        {/* Completitud: verde forest con círculo lima y texto invertido */}
        <div className="inline-flex items-center gap-2 rounded-2xl bg-[#007E62] px-3 py-2">
          <div className="grid size-10 place-items-center rounded-full bg-[#C2FB7E]">
            <span className="text-xs font-bold text-[#034842]">{score}</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-[#C2FB7E]">{t("admin.canonicalProducts.col.completeness")}</span>
            <span className="text-sm font-semibold text-white">{t(completeness)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dates({
  product,
  locale,
  t,
}: {
  product: AdminCanonicalProductRowDto;
  locale: Locale;
  t: T;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span>
        <span className="font-semibold text-black dark:text-white">
          {t("admin.canonicalDetail.hero.lastPriceUpdate")}:{" "}
        </span>
        <span className="text-muted-foreground">
          {formatCatalogDate(product.last_price_seen_at, locale)}
        </span>
      </span>
      <span className="text-muted-foreground">•</span>
      <span>
        <span className="font-semibold text-black dark:text-white">{t("admin.canonicalDetail.info.lastMatch")}: </span>
        <span className="text-muted-foreground">
          {formatCatalogDate(product.last_match_at, locale)}
        </span>
      </span>
    </div>
  );
}

function ProviderLogos({
  providers,
  t,
}: {
  providers: AdminCanonicalProviderPriceDto[];
  t: T;
}) {
  if (providers.length === 0) return null;

  const visible = providers.slice(0, 4);
  const remaining = providers.length - visible.length;

  const scrollToProviders = () => {
    const panel = document.getElementById("canonical-providers-panel");
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pt-1">
      {visible.map((provider, index) => (
        <span key={provider.provider_id} className="inline-flex items-center gap-2">
          <ProviderLogo
            name={provider.provider_name}
            logoUrl={provider.provider_logo_url ?? null}
            className="w-20 h-auto object-contain"
          />
          {index < visible.length - 1 ? (
            <span className="text-muted-foreground" aria-hidden>•</span>
          ) : null}
        </span>
      ))}
      {remaining > 0 ? (
        <>
          <span className="text-muted-foreground" aria-hidden>•</span>
          <button
            type="button"
            onClick={scrollToProviders}
            className="inline-flex items-center gap-2 rounded-full bg-[#E8FDD0] px-3 py-1.5 text-sm font-semibold text-[#034842] hover:bg-[#DAFF9F]"
          >
            <PlusCircle className="size-4" aria-hidden />
            <span className="flex flex-col leading-tight">
              <span className="text-xs font-medium">{t("admin.canonicalDetail.hero.viewMore")}</span>
              <span className="text-sm font-bold">{t("admin.canonicalDetail.hero.providers")}</span>
            </span>
          </button>
        </>
      ) : null}
    </div>
  );
}
