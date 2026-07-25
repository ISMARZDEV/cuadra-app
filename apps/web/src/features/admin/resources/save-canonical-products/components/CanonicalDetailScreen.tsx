import type {
  AdminCanonicalPriceHistoryDto,
  AdminCanonicalProductRowDto,
} from "@cuadra/api-client";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Barcode,
  Boxes,
  Check,
  ExternalLink,
  ImageOff,
  Link2,
  Pencil,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useData } from "vike-react/useData";
import { navigate } from "vike/client/router";

import { Button } from "@/components/ui-base/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { CategoryBadge } from "@/features/admin/components/CategoryBadge";
import { ConfirmDialog } from "@/features/admin/components/ConfirmDialog";
import { MethodBadge } from "@/features/admin/components/MethodBadge";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { formatMoney } from "@/features/save/lib/format";
import { DEFAULT_LOCALE } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import {
  archiveCanonicalProduct,
  getCanonicalProductHistory,
  previewCanonicalSlug,
  regenerateCanonicalSlug,
  setCanonicalCategory,
  unarchiveCanonicalProduct,
  updateCanonicalProduct,
  updateInternalNote,
} from "../api";
import type { CanonicalDetailData } from "../interfaces";
import { formatCatalogDate } from "../lib/format-date";
import { toGtin14 } from "../lib/gtin";
import {
  MEASURE_LABEL_KEY,
  QUALITY_HINT_KEY,
  QUALITY_LABEL_KEY,
  QUALITY_PILL_CLASS,
  isQualityStatus,
} from "../lib/quality-status";
import { CanonicalFormModal, type CanonicalFormState } from "./CanonicalFormModal";
import { CategoryPicker } from "./CategoryPicker";
import { ImageGalleryPanel } from "./ImageGalleryPanel";
import { PriceHistoryChart } from "./PriceHistoryChart";

const RANGES = ["15d", "1m", "3m", "6m", "1y", "all"] as const;
const RANGE_KEY = {
  "15d": "admin.canonicalDetail.range.15d",
  "1m": "admin.canonicalDetail.range.1m",
  "3m": "admin.canonicalDetail.range.3m",
  "6m": "admin.canonicalDetail.range.6m",
  "1y": "admin.canonicalDetail.range.1y",
  all: "admin.canonicalDetail.range.all",
} as const;

// Detalle admin del canónico (SDD Detail by Id). Es la superficie principal de CURACIÓN del
// catálogo: por eso cada panel muestra la evidencia que sostiene el dato, no sólo el dato.
export function CanonicalDetailScreen() {
  const {
    product: initialProduct,
    providers,
    evidence,
    duplicates,
    auditLog,
    taxonomyLeaves = [],
    categorySuggestions = [],
    images: initialImages = [],
    locale = DEFAULT_LOCALE,
  } = useData<CanonicalDetailData>();
  const { t } = useAdminI18n(locale);

  const [product, setProduct] = useState(initialProduct);
  const [images, setImages] = useState(initialImages);
  const [formState, setFormState] = useState<CanonicalFormState | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Regenerar slug SIEMPRE pasa por preview: el operador tiene que ver la URL nueva antes de
  // romper la vieja, porque no hay redirección automática.
  const [slugPreview, setSlugPreview] = useState<{
    current_slug: string;
    new_slug: string;
    would_change: boolean;
  } | null>(null);

  const [range, setRange] = useState<(typeof RANGES)[number]>("1m");
  const [history, setHistory] = useState<AdminCanonicalPriceHistoryDto | null>(null);
  // `null` solo no alcanza: "todavía cargando" y "falló" se ven igual (un panel en blanco) y el
  // operador no sabe si esperar o si el dato no existe.
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(new Set());

  const id = product.canonical_product_id;
  const archived = Boolean(product.archived_at);

  // El histórico se pide en el cliente porque su rango es interactivo: fijarlo en el SSR
  // obligaría a elegir un default que el operador cambia de inmediato.
  useEffect(() => {
    let cancelled = false;
    setHistoryState("loading");
    void (async () => {
      const result = await getCanonicalProductHistory(id, range);
      if (cancelled) return;
      setHistory(result);
      setHistoryState(result ? "ready" : "error");
    })();
    return () => {
      cancelled = true;
    };
  }, [id, range]);

  const toggleSeries = (providerId: string) =>
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      // Set vacío = TODAS visibles. Al apagar la primera hay que materializar el resto, si no
      // "quitar una" se leería como "dejar sólo una".
      if (next.size === 0) {
        history?.series.forEach((s) => next.add(s.provider_id));
      }
      next.has(providerId) ? next.delete(providerId) : next.add(providerId);
      return next;
    });

  const toggleArchive = async () => {
    setBusy(true);
    const updated = archived
      ? await unarchiveCanonicalProduct(id)
      : await archiveCanonicalProduct(id);
    if (updated) setProduct(updated);
    setBusy(false);
    setArchiveOpen(false);
  };

  const openSlugDialog = async () => {
    const preview = await previewCanonicalSlug(id);
    if (preview) setSlugPreview(preview as never);
  };

  const confirmRegenerateSlug = async () => {
    setBusy(true);
    const updated = await regenerateCanonicalSlug(id);
    if (updated) setProduct(updated);
    setBusy(false);
    setSlugPreview(null);
  };

  const pickCategory = async (taxonomyNodeId: string) => {
    setBusy(true);
    const updated = await setCanonicalCategory(id, taxonomyNodeId);
    if (updated) setProduct(updated);
    setBusy(false);
  };

  const publicHref = product.slug ? `/${locale}/do/save/producto/${product.slug}` : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <button
        type="button"
        onClick={() => void navigate("/admin/canonical-products")}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-brand-forest hover:underline dark:text-brand-lime"
      >
        <ArrowLeft className="size-4" />
        {t("admin.canonicalDetail.back")}
      </button>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <section className="rounded-[32px] bg-muted/60 p-4 shadow-sm md:p-6 dark:bg-secondary [corner-shape:squircle]">
        <div className="flex flex-wrap items-start gap-5">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt=""
              className="size-28 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex size-28 items-center justify-center rounded-2xl bg-muted">
              <Boxes className="size-10 text-muted-foreground" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-[16rem] flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-brand-forest dark:text-brand-lime">
                {product.name}
              </h1>
              {archived ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Archive className="size-3" />
                  {t("admin.canonicalProducts.archive.badge")}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {product.brand || "—"} · {product.slug}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge slug={product.category} name={product.category} locale={locale} />
              {product.ean_reachable ? (
                <span
                  title={t("admin.canonicalProducts.ean.reachableHint")}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300"
                >
                  <Barcode className="size-3" />
                  {t("admin.canonicalProducts.ean.reachable")}
                </span>
              ) : null}
              {(product.quality_statuses ?? []).map((status) =>
                isQualityStatus(status) ? (
                  <span
                    key={status}
                    title={t(QUALITY_HINT_KEY[status])}
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      QUALITY_PILL_CLASS[status],
                    )}
                  >
                    {t(QUALITY_LABEL_KEY[status])}
                  </span>
                ) : null,
              )}
              <span className="text-xs text-muted-foreground">
                {product.completeness_score}% · {t("admin.canonicalProducts.col.completeness")}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFormState({ mode: "edit", row: product })}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest shadow-sm hover:bg-brand-lime/90"
            >
              <Pencil className="size-4" />
              {t("admin.canonicalProducts.actions.edit")}
            </button>
            <a
              href={publicHref ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!publicHref}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full bg-brand-forest px-4 text-sm font-semibold text-brand-lime shadow-sm",
                !publicHref && "pointer-events-none opacity-50",
              )}
            >
              <ExternalLink className="size-4" />
              {t("admin.canonicalProducts.actions.public")}
            </a>
            <Button
              variant="outline"
              onClick={() => void openSlugDialog()}
              disabled={busy}
              className="h-9 rounded-full"
            >
              <Link2 className="size-4" />
              {t("admin.canonicalDetail.slug.action")}
            </Button>
            <Button
              variant="outline"
              onClick={() => (archived ? void toggleArchive() : setArchiveOpen(true))}
              disabled={busy}
              className="h-9 rounded-full"
            >
              {archived ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
              {t(
                archived
                  ? "admin.canonicalProducts.actions.unarchive"
                  : "admin.canonicalProducts.actions.archive",
              )}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Información canónica ──────────────────────────────────────────── */}
        <Panel title={t("admin.canonicalDetail.section.info")}>
          <dl className="space-y-2.5 text-sm">
            <Row label={t("admin.canonicalDetail.info.size")}>
              {product.display_size || "—"}{" "}
              <span className="text-muted-foreground">
                ({MEASURE_LABEL_KEY[product.size_measure]
                  ? t(MEASURE_LABEL_KEY[product.size_measure])
                  : product.size_measure})
              </span>
            </Row>
            <Row label={t("admin.canonicalDetail.info.quality")}>{product.quality || "—"}</Row>
            <Row label={t("admin.canonicalDetail.info.description")}>
              {product.description || "—"}
            </Row>
            <Row label={t("admin.canonicalDetail.info.created")}>
              {formatCatalogDate(product.created_at, locale)}
            </Row>
            <Row label={t("admin.canonicalDetail.info.originRun")}>
              {product.origin_run_id ? (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {product.origin_run_id}
                </code>
              ) : (
                <span className="text-muted-foreground">
                  {t("admin.canonicalDetail.info.originRunNone")}
                </span>
              )}
            </Row>
            <Row label={t("admin.canonicalDetail.info.lastMatch")}>
              {formatCatalogDate(product.last_match_at, locale)}
            </Row>
            <Row label={t("admin.canonicalDetail.info.lastPrice")}>
              {formatCatalogDate(product.last_price_seen_at, locale)}
            </Row>
          </dl>
        </Panel>

        {/* ── Proveedores ───────────────────────────────────────────────────── */}
        <Panel
          title={t("admin.canonicalDetail.section.providers")}
          count={providers.length}
          className="lg:col-span-2"
        >
          {providers.length === 0 ? (
            <Empty>{t("admin.canonicalProducts.providers.empty")}</Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("admin.canonicalProducts.providers.col.provider")}</TableHead>
                  <TableHead>{t("admin.canonicalProducts.providers.col.lastSeen")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.canonicalProducts.providers.col.price")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("admin.canonicalProducts.providers.col.action")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.store_product_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProviderLogo
                          name={p.provider_name}
                          logoUrl={p.provider_logo_url}
                          className="max-h-7 max-w-12 object-contain"
                        />
                        {p.is_cheapest ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            {t("admin.canonicalProducts.providers.cheapest")}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCatalogDate(p.last_seen_at, locale)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(p.price_minor, p.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {t("admin.canonicalProducts.providers.open")}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      {/* ── Histórico + KPIs ────────────────────────────────────────────────── */}
      <Panel title={t("admin.canonicalDetail.section.history")}>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "h-8 rounded-full px-3 text-xs font-semibold transition-colors",
                r === range
                  ? "bg-brand-lime text-brand-forest"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {t(RANGE_KEY[r])}
            </button>
          ))}
        </div>

        {historyState === "ready" && typeof history?.kpis?.min_price_minor === "number" ? (
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={t("admin.canonicalDetail.kpi.min")}>
              {formatMoney(history.kpis.min_price_minor ?? 0, history.currency)}
            </Kpi>
            <Kpi label={t("admin.canonicalDetail.kpi.max")}>
              {formatMoney(history.kpis.max_price_minor ?? 0, history.currency)}
            </Kpi>
            <Kpi label={t("admin.canonicalDetail.kpi.spread")}>
              {formatMoney(history.kpis.spread_minor ?? 0, history.currency)}
            </Kpi>
            <Kpi label={t("admin.canonicalDetail.kpi.providers")}>
              {history.kpis.active_provider_count}
            </Kpi>
            <Kpi
              label={t("admin.canonicalDetail.kpi.change")}
              tone={
                (history.kpis.change_in_range_minor ?? 0) < 0
                  ? "good"
                  : (history.kpis.change_in_range_minor ?? 0) > 0
                    ? "bad"
                    : undefined
              }
            >
              {formatMoney(history.kpis.change_in_range_minor ?? 0, history.currency)}
            </Kpi>
            <Kpi label={t("admin.canonicalDetail.kpi.changes")}>
              {history.kpis.price_change_count}
            </Kpi>
          </div>
        ) : historyState === "ready" ? (
          <Empty>{t("admin.canonicalDetail.kpi.noData")}</Empty>
        ) : null}

        {historyState === "loading" ? (
          <Empty>{t("admin.canonicalDetail.chart.loading")}</Empty>
        ) : historyState === "error" ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {t("admin.canonicalDetail.chart.error")}
          </p>
        ) : history ? (
          <PriceHistoryChart
            history={history}
            visible={visibleSeries}
            onToggle={toggleSeries}
            t={t}
            locale={locale}
          />
        ) : null}
      </Panel>

      {/* ── Categoría con sugerencias (US-CP-D2c) ───────────────────────────── */}
      <Panel title={t("admin.canonicalDetail.category.title")}>
        <CategoryPicker
          currentId={product.taxonomy_node_id ?? null}
          suggestions={categorySuggestions}
          leaves={taxonomyLeaves}
          onPick={(nodeId) => void pickCategory(nodeId)}
          busy={busy}
          t={t}
        />
      </Panel>

      {/* ── Imagen del producto: galería ORDENADA (US-CP-D3/D4b) ───────────── */}
      <Panel title={t("admin.canonicalDetail.section.image")} count={images.length}>
        <ImageGalleryPanel
          canonicalProductId={id}
          images={images}
          providers={providers}
          onChanged={setImages}
          t={t}
          locale={locale}
        />
      </Panel>

      {/* ── Evidencia ───────────────────────────────────────────────────────── */}
      <Panel title={t("admin.canonicalDetail.section.evidence")} count={evidence.length}>
        {evidence.length === 0 ? (
          <Empty>{t("admin.canonicalDetail.evidence.empty")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("admin.canonicalDetail.evidence.col.provider")}</TableHead>
                  <TableHead>{t("admin.canonicalDetail.evidence.col.raw")}</TableHead>
                  <TableHead>{t("admin.canonicalDetail.evidence.col.ean")}</TableHead>
                  <TableHead>{t("admin.canonicalDetail.evidence.col.method")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.canonicalDetail.evidence.col.confidence")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence.map((e) => (
                  <TableRow key={e.store_product_id}>
                    <TableCell className="whitespace-nowrap">{e.provider_name}</TableCell>
                    <TableCell>
                      <div className="flex max-w-[20rem] flex-col">
                        <span>{e.raw_name || "—"}</span>
                        <span className="text-xs text-muted-foreground">
                          {[e.raw_brand, e.raw_size_text].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                    </TableCell>
                    {/* GTIN-14 zero-padded: mostrar la forma cruda haría creer que dos tiendas
                        no coinciden cuando en realidad tienen el MISMO código. */}
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-col">
                        <span>{toGtin14(e.ean) ?? "—"}</span>
                        <span className="text-muted-foreground">{e.sku || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {e.match_method ? (
                        <div className="flex flex-col gap-1">
                          <MethodBadge method={e.match_method} locale={locale} />
                          {/* `human` puede significar que lo decidió una persona O que el juez
                              estaba degradado — por eso se etiqueta el ORIGEN, no la certeza. */}
                          <span className="text-xs text-muted-foreground">
                            {t(
                              e.match_method === "human"
                                ? "admin.canonicalDetail.evidence.human"
                                : "admin.canonicalDetail.evidence.auto",
                            )}
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {/* Un match HUMANO no tiene confianza de modelo: la fila guarda 0, y pintar
                        "0%" al lado de "Decidido por una persona" se lee como "el sistema no
                        estaba seguro" — lo contrario de lo que pasó. */}
                    <TableCell className="text-right tabular-nums">
                      {e.match_method === "human" ||
                      e.match_confidence === null ||
                      e.match_confidence === undefined
                        ? "—"
                        : `${Math.round(e.match_confidence * 100)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Duplicados ────────────────────────────────────────────────────── */}
        <Panel title={t("admin.canonicalDetail.section.duplicates")} count={duplicates.length}>
          {duplicates.length === 0 ? (
            <Empty>{t("admin.canonicalDetail.duplicates.empty")}</Empty>
          ) : (
            <>
              <ul className="space-y-2">
                {duplicates.map((d) => (
                  <li
                    key={d.canonical_product_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <a
                        href={`/admin/canonical-products/${d.canonical_product_id}`}
                        onClick={(ev) => {
                          ev.preventDefault();
                          void navigate(`/admin/canonical-products/${d.canonical_product_id}`);
                        }}
                        className="font-medium hover:underline"
                      >
                        {d.name}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {[d.brand, d.display_size, d.category].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {d.has_ean_collision ? (
                      <span
                        title={t("admin.canonicalDetail.duplicates.eanCollisionHint")}
                        className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300"
                      >
                        <Barcode className="size-3" />
                        {t("admin.canonicalDetail.duplicates.eanCollision")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                        {t("admin.canonicalDetail.duplicates.sameBrandSize")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("admin.canonicalDetail.duplicates.readOnly")}
              </p>
            </>
          )}
        </Panel>

        {/* ── Actividad + nota interna ──────────────────────────────────────── */}
        <Panel title={t("admin.canonicalDetail.section.activity")}>
          <InternalNote
            productId={id}
            initialNote={product.internal_note ?? ""}
            onSaved={setProduct}
            t={t}
          />

          <h3 className="mt-5 mb-2 text-sm font-semibold">
            {t("admin.canonicalDetail.action.audit")}
          </h3>
          {auditLog.length === 0 ? (
            <Empty>{t("admin.canonicalDetail.activity.empty")}</Empty>
          ) : (
            <ol className="space-y-2.5">
              {auditLog.map((e) => {
                const changed = (e.payload_summary?.changed as string[] | undefined) ?? [];
                return (
                  <li key={e.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-lime" />
                    <div className="min-w-0">
                      <p className="font-medium">{auditActionLabel(e.action, t)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCatalogDate(e.created_at, locale)}
                        {e.actor_user_id ? (
                          <>
                            {" "}
                            {t("admin.canonicalDetail.activity.by")}{" "}
                            <span className="font-mono">{e.actor_user_id.slice(0, 8)}</span>
                          </>
                        ) : null}
                      </p>
                      {changed.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("admin.canonicalDetail.activity.fields")} {changed.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>

      <CanonicalFormModal
        state={formState}
        onClose={() => setFormState(null)}
        onSaved={() => void navigate(`/admin/canonical-products/${id}`)}
        t={t}
        taxonomyLeaves={taxonomyLeaves}
      />

      <ConfirmDialog
        open={slugPreview !== null}
        onOpenChange={(open) => !open && setSlugPreview(null)}
        title={t("admin.canonicalDetail.slug.title")}
        description={t("admin.canonicalDetail.slug.warning")}
        confirmLabel={t("admin.canonicalDetail.slug.confirm")}
        cancelLabel={t("admin.canonicalProducts.archive.cancel")}
        onConfirm={() => void confirmRegenerateSlug()}
        busy={busy}
        // Sin cambios no hay nada que confirmar: dejar el botón activo invitaría a cambiar la
        // URL pública a cambio de nada.
        confirmDisabled={slugPreview?.would_change === false}
        destructive
      >
        {slugPreview ? (
          <div className="space-y-1.5 rounded-xl bg-muted/60 p-3 font-mono text-xs dark:bg-white/5">
            <p>
              <span className="font-sans text-muted-foreground">
                {t("admin.canonicalDetail.slug.from")}:{" "}
              </span>
              {slugPreview.current_slug}
            </p>
            <p>
              <span className="font-sans text-muted-foreground">
                {t("admin.canonicalDetail.slug.to")}:{" "}
              </span>
              <span className="font-semibold">{slugPreview.new_slug}</span>
            </p>
            {!slugPreview.would_change ? (
              <p className="font-sans text-muted-foreground">
                {t("admin.canonicalDetail.slug.unchanged")}
              </p>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t("admin.canonicalProducts.archive.title")}
        description={t("admin.canonicalProducts.archive.impact")}
        confirmLabel={t("admin.canonicalProducts.archive.confirm")}
        cancelLabel={t("admin.canonicalProducts.archive.cancel")}
        onConfirm={() => void toggleArchive()}
        busy={busy}
        destructive
      />
    </div>
  );
}

/** El `action` del log es una clave técnica (`canonical_product.archive`). El operador necesita
 * leer QUÉ pasó, no el identificador del evento. Una acción desconocida se muestra cruda en vez
 * de desaparecer: si el backend agrega un evento nuevo, la actividad no puede quedar muda. */
function auditActionLabel(action: string, t: (key: MessageKey) => string): string {
  const map: Record<string, MessageKey> = {
    "canonical_product.create": "admin.canonicalDetail.activity.action.create",
    "canonical_product.import": "admin.canonicalDetail.activity.action.import",
    "canonical_product.update": "admin.canonicalDetail.activity.action.update",
    "canonical_product.archive": "admin.canonicalDetail.activity.action.archive",
    "canonical_product.unarchive": "admin.canonicalDetail.activity.action.unarchive",
    "canonical_product.internal_note": "admin.canonicalDetail.activity.action.note",
  };
  const key = map[action];
  return key ? t(key) : action;
}

function Panel({
  title,
  count,
  className,
  children,
}: {
  title: string;
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:p-5 dark:border-white/10 dark:bg-card",
        className,
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-brand-forest dark:text-brand-lime">
        {title}
        {count !== undefined ? (
          <span className="text-sm font-semibold">({count})</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function Kpi({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "good" | "bad";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-muted/60 p-3 dark:bg-white/5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-bold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-red-600 dark:text-red-400",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-sm text-muted-foreground">{children}</p>;
}

function InternalNote({
  productId,
  initialNote,
  onSaved,
  t,
}: {
  productId: string;
  initialNote: string;
  onSaved: (row: AdminCanonicalProductRowDto) => void;
  t: (key: MessageKey) => string;
}) {
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const updated = await updateInternalNote(productId, note.trim() || null);
    if (updated) {
      onSaved(updated);
      setSaved(true);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {t("admin.canonicalDetail.note.title")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("admin.canonicalDetail.note.hint")}
      </p>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        rows={3}
        placeholder={t("admin.canonicalDetail.note.placeholder")}
        className="w-full rounded-xl border border-border bg-background p-2.5 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-brand-lime focus-visible:outline-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-8 items-center rounded-full bg-brand-forest px-3 text-xs font-semibold text-brand-lime disabled:opacity-50"
        >
          {saving
            ? t("admin.canonicalDetail.note.saving")
            : t("admin.canonicalDetail.note.save")}
        </button>
        {saved ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {t("admin.canonicalDetail.note.saved")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
