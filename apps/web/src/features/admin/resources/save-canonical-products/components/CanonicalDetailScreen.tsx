import type {
  AdminCanonicalPriceHistoryDto,
  AdminCanonicalProductRowDto,
} from "@cuadra/api-client";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Barcode,
  ExternalLink,
  Link2,
  RefreshCw,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
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
import { ConfirmDialog } from "@/features/admin/components/ConfirmDialog";
import { MethodBadge } from "@/features/admin/components/MethodBadge";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { FunnelIcon } from "@/features/admin/resources/save-matching/components/toolbar-icons";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { formatMoney } from "@/features/save/lib/format";
import { DEFAULT_LOCALE } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

import {
  archiveCanonicalProduct,
  getCanonicalProductHistory,
  listCanonicalProducts,
  listCanonicalProductProviders,
  previewCanonicalSlug,
  regenerateCanonicalSlug,
  setCanonicalCategory,
  unarchiveCanonicalProduct,
  updateCanonicalProduct,
  updateInternalNote,
} from "../api";
import type { CanonicalDetailData } from "../interfaces";
import {
  countActiveFilters,
  serializeCanonicalProductsParams,
  type CanonicalProductsParams,
} from "../lib/canonical-products-params";
import { formatCatalogDate } from "../lib/format-date";
import { toGtin14 } from "../lib/gtin";
import { MEASURE_LABEL_KEY } from "../lib/quality-status";
import { CanonicalFiltersModal } from "./CanonicalFiltersModal";
import { CanonicalFormModal, type CanonicalFormState } from "./CanonicalFormModal";
import { CanonicalHero } from "./CanonicalHero";
import { CanonicalPager } from "./CanonicalPager";
import { CategoryPicker } from "./CategoryPicker";
import { DescriptionPanel } from "./DescriptionPanel";
import { DetailTabs, type DetailTabId, tabId, tabPanelId } from "./DetailTabs";
import { IdentityPanel } from "./IdentityPanel";
import { ImageGalleryPanel } from "./ImageGalleryPanel";
import { ProvidersPanel } from "./ProvidersPanel";
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
    providers: initialProviders,
    evidence,
    duplicates,
    auditLog,
    taxonomyLeaves = [],
    categorySuggestions = [],
    images: initialImages = [],
    params,
    cursor,
    locale = DEFAULT_LOCALE,
  } = useData<CanonicalDetailData>();
  const { t } = useAdminI18n(locale);

  const [product, setProduct] = useState(initialProduct);
  // Los proveedores llegan por SSR, pero las cuatro acciones del menú por fila los MUTAN, así que
  // viven en estado local para poder recargarlos sin un refresh completo de la página.
  const [providers, setProviders] = useState(initialProviders);
  const [images, setImages] = useState(initialImages);

  // Al navegar prev/next client-side Vike reutiliza el componente y cambia `initialProduct`.
  // Sin esto el estado local conservaría el producto anterior aunque la URL y los props SSR ya
  // sean del nuevo canónico.
  useEffect(() => setProduct(initialProduct), [initialProduct]);
  useEffect(() => setProviders(initialProviders), [initialProviders]);
  useEffect(() => setImages(initialImages), [initialImages]);
  const [tab, setTab] = useState<DetailTabId>("summary");
  const [syncing, setSyncing] = useState(false);
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

  /**
   * Recarga la tabla de proveedores desde el servidor tras una acción del menú por fila.
   *
   * Se REFETCHEA en vez de mutar el array en memoria: quitar una fila a mano dejaría los cuatro
   * tiles (precio más bajo/más alto/diferencia) calculados sobre datos viejos, y "Mejor precio
   * Save" apuntando a una tienda que ya no está. El servidor es el único que sabe el estado real.
   */
  const reloadProviders = async () => {
    const fresh = await listCanonicalProductProviders(product.canonical_product_id);
    if (fresh) setProviders(fresh);
  };

  const [range, setRange] = useState<(typeof RANGES)[number]>("1m");
  const [history, setHistory] = useState<AdminCanonicalPriceHistoryDto | null>(null);
  // `null` solo no alcanza: "todavía cargando" y "falló" se ven igual (un panel en blanco) y el
  // operador no sabe si esperar o si el dato no existe.
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  /** Contador de reintentos: cambiarlo re-dispara el efecto sin tocar el rango elegido. */
  const [historyReload, setHistoryReload] = useState(0);
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  }, [id, range, historyReload]);

  const toggleSeries = (providerId: string) =>
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      // Set vacío = TODAS visibles. Al apagar la primera hay que materializar el resto, si no
      // "quitar una" se leería como "dejar sólo una".
      if (next.size === 0) {
        history?.series.forEach((s) => next.add(s.provider_id));
      }
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });

  const toggleArchive = async () => {
    setBusy(true);
    // `finally`: si la promesa RECHAZA, un `setBusy(false)` suelto no corre y la ficha queda
    // bloqueada hasta recargar la página.
    try {
      const updated = archived
        ? await unarchiveCanonicalProduct(id)
        : await archiveCanonicalProduct(id);
      if (updated) setProduct(updated);
      setArchiveOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const openSlugDialog = async () => {
    const preview = await previewCanonicalSlug(id);
    if (preview) setSlugPreview(preview as never);
  };

  const confirmRegenerateSlug = async () => {
    setBusy(true);
    try {
      const updated = await regenerateCanonicalSlug(id);
      if (updated) setProduct(updated);
      setSlugPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const pickCategory = async (taxonomyNodeId: string) => {
    setBusy(true);
    try {
      const updated = await setCanonicalCategory(id, taxonomyNodeId);
      if (updated) setProduct(updated);
    } finally {
      setBusy(false);
    }
  };

  const publicHref = product.slug ? `/${locale}/do/save/producto/${product.slug}` : null;

  const activeFilters = countActiveFilters(params);
  const qs = serializeCanonicalProductsParams(params).toString();

  const detailHref = (productId: string, query = qs) =>
    `/admin/canonical-products/${productId}${query ? `?${query}` : ""}`;

  const backToList = () => void navigate(`/admin/canonical-products${qs ? `?${qs}` : ""}`);

  /**
   * Vuelve a pedir el detalle al servidor.
   *
   * NO dispara una corrida de ingesta: no existe endpoint para refrescar un canónico suelto, y
   * un botón que promete ir a las tiendas sin hacerlo sería peor que no tenerlo. Lo que sí
   * resuelve es la pregunta real del curador mientras corre una ingesta — "¿ya bajaron los
   * precios nuevos?" — releyendo el SSR sin perder la sección abierta.
   */
  const syncFromServer = async () => {
    setSyncing(true);
    try {
      await navigate(detailHref(id), { overwriteLastHistoryEntry: true });
    } finally {
      setSyncing(false);
    }
  };

  const goPrev = () => {
    if (cursor.previous_id) void navigate(detailHref(cursor.previous_id));
  };

  const goNext = () => {
    if (cursor.next_id) void navigate(detailHref(cursor.next_id));
  };

  const jumpToPosition = async (position: number) => {
    const page = await listCanonicalProducts({
      search: params.search,
      brand_id: params.brand_id,
      taxonomy_node_id: params.taxonomy_node_id,
      quality_status: params.quality_status,
      ean_reachable: params.ean_reachable,
      min_provider_count: params.min_provider_count,
      updated_since: params.updated_since,
      include_archived: params.include_archived,
      sort: params.sort,
      limit: 1,
      offset: Math.max(0, position - 1),
    });
    const target = page?.rows[0];
    if (!target) return;
    void navigate(detailHref(target.canonical_product_id));
  };

  const applyFilters = (patch: Partial<CanonicalProductsParams>) => {
    const next = { ...params, ...patch, offset: 0 };
    const nextQs = serializeCanonicalProductsParams(next).toString();
    void navigate(detailHref(id, nextQs), { overwriteLastHistoryEntry: true });
  };

  // Navegación con flechas del teclado: prev/next sin salir del detalle.
  // Se desactiva mientras un modal está abierto o el foco está en un campo de texto,
  // para no interferir con formularios ni accesibilidad.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (archiveOpen || filtersOpen || slugPreview !== null || formState !== null || busy) {
        return;
      }
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [archiveOpen, filtersOpen, slugPreview, formState, busy, goPrev, goNext]);

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      {/* MISMO envoltorio que `/admin/canonical-products`: card `bg-muted` de la consola. */}
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted p-4 shadow-sm md:p-6 dark:bg-muted [corner-shape:squircle]">
      {/* Header: volver + filtros + pager */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={backToList}
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-brand-forest hover:underline dark:text-brand-lime"
        >
          <ArrowLeft className="size-4" />
          {t("admin.canonicalDetail.back")}
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-label={t("admin.canonicalProducts.filters.button")}
            className="relative flex size-9 items-center justify-center rounded-full bg-brand-lime text-brand-forest hover:bg-brand-lime/90"
          >
            <FunnelIcon className="size-4" />
            {activeFilters > 0 ? (
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-brand-forest text-[10px] font-bold text-brand-lime">
                {activeFilters}
              </span>
            ) : null}
          </button>
          <CanonicalPager
            position={cursor.position}
            total={cursor.total}
            hasPrev={cursor.previous_id !== null}
            hasNext={cursor.next_id !== null}
            onPrev={goPrev}
            onNext={goNext}
            onJumpToPosition={jumpToPosition}
            disabled={busy}
            t={t}
          />
        </div>
      </div>

      {/* ── Hero: maqueta pública + identidad + indicadores ──────────────────── */}
      <CanonicalHero
        product={product}
        providers={providers}
        imageCount={images.length}
        locale={locale}
        t={t}
        publicHref={publicHref}
        onSync={syncFromServer}
        onEdit={() => setFormState({ mode: "edit", row: product })}
        syncing={syncing}
        tabs={<DetailTabs active={tab} onChange={setTab} t={t} />}
      >
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
          {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {t(
            archived
              ? "admin.canonicalProducts.actions.unarchive"
              : "admin.canonicalProducts.actions.archive",
          )}
        </Button>
      </CanonicalHero>

      {/* ── Resumen: identidad + proveedores + histórico ─────────────────────── */}
      <TabPanel id="summary" active={tab}>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <IdentityPanel product={product} locale={locale} t={t} />

        <Panel
          id="canonical-providers-panel"
          title={t("admin.canonicalDetail.section.providers")}
          count={providers.length}
          className="lg:col-span-2"
        >
          <ProvidersPanel
            providers={providers}
            locale={locale}
            t={t}
            canonicalProductId={product.canonical_product_id}
            taxonomyLeaves={taxonomyLeaves}
            onProvidersChanged={reloadProviders}
          />
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
          // Un error que dice "reintentá" sin darte con qué es un callejón sin salida: el operador
          // sólo puede recargar la página entera y perder el rango que había elegido.
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{t("admin.canonicalDetail.chart.error")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryReload((n) => n + 1)}
              className="shrink-0"
            >
              <RefreshCw className="size-3.5" />
              {t("admin.canonicalDetail.chart.retry")}
            </Button>
          </div>
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
      </TabPanel>

      {/* ── Categoría con sugerencias (US-CP-D2c) ───────────────────────────── */}
      <TabPanel id="categories" active={tab}>
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
      </TabPanel>

      {/* ── Descripción con las de cada tienda como candidatas (US-CP-D2) ──── */}
      <TabPanel id="description" active={tab}>
      <Panel title={t("admin.canonicalDetail.description.title")}>
        <DescriptionPanel
          canonicalProductId={id}
          description={product.description ?? null}
          providers={providers}
          onSaved={setProduct}
          t={t}
        />
      </Panel>
      </TabPanel>

      {/* ── Imagen del producto: galería ORDENADA (US-CP-D3/D4b) ───────────── */}
      <TabPanel id="images" active={tab}>
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
      </TabPanel>

      {/* ── Auditoría: evidencia + duplicados + actividad ────────────────────── */}
      <TabPanel id="audit" active={tab}>
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

      {/* `items-start`: sin esto el grid estira ambas columnas a la altura de la más alta, y
          "Duplicados posibles (0)" ocupaba media pantalla para decir una línea. Cada panel toma
          su altura natural. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
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
      </TabPanel>

      </div>

      <CanonicalFormModal
        state={formState}
        onClose={() => setFormState(null)}
        onSaved={() => void navigate(detailHref(id))}
        t={t}
        taxonomyLeaves={taxonomyLeaves}
      />

      <CanonicalFiltersModal
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        params={params}
        onApply={applyFilters}
        t={t}
        locale={locale}
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
          <div className="space-y-1.5 rounded-xl bg-muted p-3 font-mono text-xs dark:bg-white/5">
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

/**
 * Nombre legible de una acción de auditoría.
 *
 * Cubre las 11 acciones que emite hoy `apps/api` (grep de `"canonical_product.*"`). El fallback
 * NUNCA devuelve la clave cruda: hacerlo puso "canonical_product.reorder_images" delante del
 * operador, que es exactamente la jerga de backend que el PRODUCT.md prohíbe en pantalla. Una
 * acción nueva del backend se degrada a un texto genérico y honesto hasta que se le dé nombre.
 */
function auditActionLabel(action: string, t: (key: MessageKey) => string): string {
  const map: Record<string, MessageKey> = {
    "canonical_product.create": "admin.canonicalDetail.activity.action.create",
    "canonical_product.import": "admin.canonicalDetail.activity.action.import",
    "canonical_product.update": "admin.canonicalDetail.activity.action.update",
    "canonical_product.archive": "admin.canonicalDetail.activity.action.archive",
    "canonical_product.unarchive": "admin.canonicalDetail.activity.action.unarchive",
    "canonical_product.internal_note": "admin.canonicalDetail.activity.action.note",
    "canonical_product.add_image": "admin.canonicalDetail.activity.action.addImage",
    "canonical_product.remove_image": "admin.canonicalDetail.activity.action.removeImage",
    "canonical_product.reorder_images": "admin.canonicalDetail.activity.action.reorderImages",
    "canonical_product.set_category": "admin.canonicalDetail.activity.action.setCategory",
    "canonical_product.regenerate_slug": "admin.canonicalDetail.activity.action.regenerateSlug",
  };
  return t(map[action] ?? "admin.canonicalDetail.activity.action.unknown");
}

/**
 * Contenedor de una sección.
 *
 * Se DESMONTA cuando no está activa en vez de esconderse con CSS: los paneles dormidos traen
 * inputs (la nota interna, el buscador de categoría) que, ocultos pero en el DOM, siguen siendo
 * alcanzables con el tabulador y el lector de pantalla los sigue anunciando.
 */
function TabPanel({
  id,
  active,
  children,
}: {
  id: DetailTabId;
  active: DetailTabId;
  children: React.ReactNode;
}) {
  if (id !== active) return null;
  return (
    <div
      role="tabpanel"
      id={tabPanelId(id)}
      aria-labelledby={tabId(id)}
      className="flex flex-col gap-4"
    >
      {children}
    </div>
  );
}

function Panel({
  id,
  title,
  count,
  className,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // Sin sombra: el borde y el radio ya separan. Apilar borde + sombra en los 9 paneles es la
    // misma frase dicha dos veces, y deja a Evidencia pesando igual que Duplicados.
    <section
      id={id}
      className={cn(
        "rounded-2xl border border-black/5 bg-white p-4 md:p-5 dark:border-white/10 dark:bg-card",
        className,
      )}
    >
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-brand-forest dark:text-brand-lime">
        {title}
        {count !== undefined ? (
          <span className="text-sm font-semibold tabular-nums">({count})</span>
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
    <div className="rounded-2xl bg-muted p-3 dark:bg-white/5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          // Display (1.5rem/700): el sistema asigna ese rol justamente a las cifras de KPI, y son
          // el dato que el operador compara de un vistazo.
          "mt-1 text-2xl font-bold tabular-nums",
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
  const titleId = useId();
  const hintId = useId();

  const save = async () => {
    setSaving(true);
    setSaved(false);
    // `finally`: si la promesa RECHAZA, el botón queda deshabilitado para siempre.
    try {
      const updated = await updateInternalNote(productId, note.trim() || null);
      if (updated) {
        onSaved(updated);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <h3 id={titleId} className="text-sm font-semibold">
        {t("admin.canonicalDetail.note.title")}
      </h3>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t("admin.canonicalDetail.note.hint")}
      </p>
      <textarea
        aria-labelledby={titleId}
        aria-describedby={hintId}
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
        {/* Siempre en el DOM: una live region que aparece junto con su texto no se anuncia. */}
        <span
          role="status"
          aria-live="polite"
          className="text-xs text-emerald-600 dark:text-emerald-400"
        >
          {saved ? t("admin.canonicalDetail.note.saved") : ""}
        </span>
      </div>
    </div>
  );
}
