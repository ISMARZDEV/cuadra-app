import type { AdminCanonicalProductRowDto } from "@cuadra/api-client";
import {
  CalendarClock,
  CalendarPlus,
  FolderTree,
  Link2,
  PlayCircle,
  ShieldCheck,
  SquareStack,
  Tag,
  Weight,
} from "lucide-react";

import { AdminDateTime } from "@/features/admin/components/AdminDateTime";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import { MEASURE_LABEL_KEY } from "../lib/quality-status";

type T = (key: MessageKey) => string;

/**
 * Datos maestros del canónico.
 *
 * El diseño traía además una fila "Origen: República Dominicana". NO se implementa: no existe
 * campo de origen en `canonical_product` — lo más cercano es el `market_id`, que es el país del
 * MERCADO, no el de fabricación del producto. Pintarlo fijo habría inventado un dato de
 * procedencia sobre productos importados.
 */
export function IdentityPanel({
  product,
  locale,
  t,
}: {
  product: AdminCanonicalProductRowDto;
  locale: Locale;
  t: T;
}) {
  const measure = MEASURE_LABEL_KEY[product.size_measure];

  return (
    <section className="rounded-2xl border border-black/5 bg-white p-4 md:p-5 dark:border-white/10 dark:bg-card">
      <h2 className="text-base font-bold text-brand-forest dark:text-brand-lime">
        {t("admin.canonicalDetail.identity.title")}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {t("admin.canonicalDetail.identity.subtitle")}
      </p>

      <dl className="space-y-3 text-sm">
        <Row icon={<Weight className="size-4" />} label={t("admin.canonicalDetail.identity.weight")}>
          {product.display_size || "—"}
          {measure ? (
            <span className="ml-1 text-xs text-muted-foreground">({t(measure)})</span>
          ) : null}
        </Row>
        <Row icon={<Tag className="size-4" />} label={t("admin.canonicalDetail.hero.brand")}>
          {product.brand || "—"}
        </Row>
        <Row
          icon={<ShieldCheck className="size-4" />}
          label={t("admin.canonicalDetail.info.quality")}
        >
          {product.quality || "—"}
        </Row>
        <Row
          icon={<FolderTree className="size-4" />}
          label={t("admin.canonicalDetail.category.title")}
        >
          {product.category_top || "—"}
        </Row>
        <Row
          icon={<SquareStack className="size-4" />}
          label={t("admin.canonicalDetail.identity.subcategory")}
        >
          {product.category || "—"}
        </Row>
        <Row icon={<Link2 className="size-4" />} label={t("admin.canonicalDetail.info.slug")}>
          <span className="font-mono text-xs break-all">{product.slug}</span>
        </Row>
        {/* No está en el diseño, pero es dato REAL y es lo único que contesta "¿de dónde salió
            este canónico?" cuando aparece uno dudoso. Quitarlo por seguir el mockup habría sido
            una regresión silenciosa. */}
        <Row
          icon={<PlayCircle className="size-4" />}
          label={t("admin.canonicalDetail.info.originRun")}
        >
          {product.origin_run_id ? (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">
              {product.origin_run_id}
            </code>
          ) : (
            <span className="text-muted-foreground">
              {t("admin.canonicalDetail.info.originRunNone")}
            </span>
          )}
        </Row>
      </dl>

      <hr className="my-4 border-border" />

      <dl className="space-y-3 text-sm">
        <Row
          icon={<CalendarPlus className="size-4" />}
          label={t("admin.canonicalDetail.info.created")}
        >
          <AdminDateTime iso={product.created_at} locale={locale} className="items-end" />
        </Row>
        <Row
          icon={<CalendarClock className="size-4" />}
          label={t("admin.canonicalDetail.info.lastMatch")}
        >
          <AdminDateTime iso={product.last_match_at} locale={locale} className="items-end" />
        </Row>
        <Row
          icon={<CalendarClock className="size-4" />}
          label={t("admin.canonicalDetail.info.lastPrice")}
        >
          <AdminDateTime iso={product.last_price_seen_at} locale={locale} className="items-end" />
        </Row>
      </dl>
    </section>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <span className="text-brand-forest dark:text-brand-lime" aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}
