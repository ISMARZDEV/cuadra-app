import type {
  ProviderOrchestrationDetailDto,
  RunEventDto,
  RunSummaryDto,
} from "@cuadra/api-client";
import { AlertTriangle, ArrowLeft, Ban, Pencil, Play, Power, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useData } from "vike-react/useData";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui-base/table";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminDateTime } from "@/features/admin/components/AdminDateTime";
import { formatAdminDateTime } from "@/features/admin/lib/format-datetime";
import { ConfirmDialog } from "@/features/admin/components/ConfirmDialog";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import { useAdminI18n } from "@/features/admin/shell/useAdminI18n";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import {
  cancelRun,
  getProviderDetail,
  getRunEvents,
  listProviderRuns,
  pausePolicy,
  resumePolicy,
  retryRun,
  runPolicy,
} from "../api";
import { isCancellable, isRetriable } from "../lib/run-state";
import { FlowStatusBadge } from "./FlowStatusBadge";
import { PolicyModal } from "./PolicyModal";
import { FailureCause, RunActivityPanel } from "./RunActivityPanel";

type Detail = ProviderOrchestrationDetailDto;

/** Etiqueta legible del trigger, con la clave cruda como red de seguridad (mismo criterio que
 * `flowLabel`: `translate` devuelve `undefined` para una clave inexistente, que React pinta vacío). */
function triggerLabel(trigger: string | null | undefined, t: (k: MessageKey) => string): string {
  if (!trigger) return "—";
  return t(`admin.orchestration.trigger.${trigger}` as MessageKey) ?? trigger;
}

function flowLabel(flowKey: string, t: (k: MessageKey) => string): string {
  return t(`admin.orchestration.flow.${flowKey}` as MessageKey) ?? flowKey;
}

/** `15s` bajo el minuto, `1m 11s` por encima. `71s` es legible para una máquina, no para un
 * operador escaneando una tabla; el corte en minutos es cómo la gente lee una duración. */
function formatDuration(
  seconds: number | null | undefined,
  locale: Locale,
  t: (k: MessageKey) => string,
): string {
  if (seconds == null) return t("admin.orchestration.detail.durationRunning");
  if (seconds < 60) return format(locale, "admin.orchestration.detail.durationSeconds", {
    seconds: String(seconds),
  });
  return format(locale, "admin.orchestration.detail.durationMinutes", {
    minutes: String(Math.floor(seconds / 60)),
    seconds: String(seconds % 60),
  });
}

// Feedback de press en TODO lo accionable (la falta de un `:active` es la diferencia entre una UI
// que "escucha" y una que se siente muerta). `scale(0.97)` es sutil a propósito; se desactiva cuando
// el botón está deshabilitado para no fingir una respuesta que no ocurre.
const PRIMARY_BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-lime px-4 text-sm font-semibold text-brand-forest transition-[transform,background-color] duration-150 hover:bg-brand-lime/90 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100";
const GHOST_BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-white px-4 text-sm font-medium text-foreground transition-[transform,background-color] duration-150 hover:bg-muted active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 dark:bg-transparent dark:hover:bg-white/5";

/** Panel-tarjeta del detalle. `tone="muted"` lo baja de jerarquía (para lo que aún no aporta dato,
 * como Actividad): sigue visible pero deja de competir con los paneles que sí informan. */
function Panel({
  title,
  action,
  tone = "solid",
  children,
}: {
  title: string;
  action?: React.ReactNode;
  tone?: "solid" | "muted";
  children: React.ReactNode;
}) {
  const surface =
    tone === "muted"
      ? "border-dashed border-border bg-muted/30"
      : "border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card";
  return (
    <section className={`rounded-2xl border p-4 md:p-5 ${surface}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-brand-forest dark:text-brand-lime">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Par etiqueta/valor con ritmo consistente: la etiqueta chica en mayúsculas-suaves marca la
 * jerarquía sin gritar, el valor manda. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

// El histórico se trae en tandas grandes del runner (el tamaño lo fija `listProviderRuns`, 1 request)
// y se PAGINA del lado del cliente, igual que la lista de provider-flows — misma UX, mismos controles.
const PAGE_SIZE_OPTIONS = [10, 20, 50];

/** Ventana de páginas alrededor de la actual (evita pintar 40 botones). Igual que la consola. */
function pageWindow(current: number, total: number, max = 5): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(max / 2));
  let end = start + max - 1;
  if (end > total) {
    end = total;
    start = end - max + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const SLA_TONE: Record<string, string> = {
  within: "border-green-200 bg-green-100 text-green-800",
  breached: "border-red-200 bg-red-100 text-red-800",
  not_applicable: "border-gray-200 bg-gray-100 text-gray-600",
};
const SLA_KEY: Record<string, MessageKey> = {
  within: "admin.orchestration.detail.slaWithin",
  breached: "admin.orchestration.detail.slaBreached",
  not_applicable: "admin.orchestration.detail.slaNa",
};

export function ProviderDetailScreen() {
  const {
    detail: initial,
    initialRuns = [],
    initialCursor = null,
    runsAvailable = true,
    initialEvents = null,
    initialEventsCursor = null,
    selectedRunId: initialSelectedRunId = null,
    locale = DEFAULT_LOCALE,
  } = useData<
    {
      detail: Detail;
      initialRuns?: RunSummaryDto[];
      initialCursor?: string | null;
      runsAvailable?: boolean;
      initialEvents?: RunEventDto[] | null;
      initialEventsCursor?: string | null;
      selectedRunId?: string | null;
    } & { locale?: Locale }
  >();
  const { t } = useAdminI18n(locale);

  const [detail, setDetail] = useState<Detail>(initial);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  // El histórico llega SEMBRADO por SSR (ver `+data.ts`): así está en el primer paint y no hay
  // carrera con el token de auth en un refresh. La paginación cliente y el "cargar más" operan
  // sobre esta semilla.
  const [runs, setRuns] = useState<RunSummaryDto[]>(initialRuns);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [histLimit, setHistLimit] = useState(10);
  const [histOffset, setHistOffset] = useState(0);
  // Actividad (D7): sembrada por SSR igual que el histórico y por la MISMA razón — un `useEffect`
  // en un refresh sale sin token y el panel diría "sin actividad" cuando lo cierto es "no pude
  // preguntar". `null` = no pudimos preguntar; `[]` = la corrida no registró eventos.
  const [events, setEvents] = useState<RunEventDto[] | null>(initialEvents);
  const [eventsCursor, setEventsCursor] = useState<string | null>(initialEventsCursor);
  const [loadingEvents, setLoadingEvents] = useState(false);
  // Qué corrida está mirando el panel de Actividad. Arranca en la actual, pero el operador puede
  // apuntarlo a cualquiera del histórico: el caso REAL es ver "Fallida" en una fila de hace tres
  // días y querer saber por qué. Un panel clavado en la corrida actual dejaba esa pregunta —la
  // única que importa cuando algo se rompió— sin forma de hacerse desde la consola.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialSelectedRunId ?? initial.current_run?.run_id ?? null,
  );

  const { policy, current_run: currentRun, result_summary: metrics } = detail;

  async function reload() {
    const res = await getProviderDetail(detail.provider_id);
    if (res.data) setDetail(res.data);
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await reload();
    } finally {
      setBusy(false);
    }
  }

  // Solo trae la SIGUIENTE tanda del runner cuando el operador agota lo ya sembrado (>50 corridas).
  // El fetch inicial ya lo hizo el SSR.
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listProviderRuns(detail.provider_id, cursor);
      if (res.data) {
        setRuns((prev) => [...prev, ...res.data!.runs]);
        setCursor(res.data.next_cursor ?? null);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  /** Apunta el panel de Actividad a otra corrida (una fila del histórico). */
  async function selectRun(runId: string) {
    if (runId === selectedRunId || loadingEvents) return;
    setSelectedRunId(runId);
    // La URL sigue a la selección para que un refresh no pierda lo que se estaba investigando y el
    // enlace se pueda compartir. `replaceState` y no `navigate`: los datos ya se piden acá abajo, y
    // una navegación real re-dispararía el SSR de la página entera para cambiar un panel.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("run_id", runId);
      window.history.replaceState(null, "", url.toString());
    }
    setEvents(null);
    setEventsCursor(null);
    setLoadingEvents(true);
    try {
      const res = await getRunEvents(detail.provider_id, runId);
      // `res.data` ausente = no pudimos preguntar → el panel queda en `null` y lo DICE. No se
      // sustituye por una lista vacía, que se leería como "esa corrida no hizo nada".
      if (res.data) {
        setEvents(res.data.events);
        setEventsCursor(res.data.next_cursor ?? null);
      }
    } finally {
      setLoadingEvents(false);
    }
  }

  // Siguiente tanda de eventos. El log se lee HACIA ADELANTE, así que lo nuevo se APENDA — al
  // revés que el histórico de corridas, que va de la más nueva a la más vieja.
  async function loadMoreEvents() {
    if (!eventsCursor || loadingEvents || !selectedRunId) return;
    setLoadingEvents(true);
    try {
      const res = await getRunEvents(detail.provider_id, selectedRunId, eventsCursor);
      if (res.data) {
        setEvents((prev) => [...(prev ?? []), ...res.data!.events]);
        setEventsCursor(res.data.next_cursor ?? null);
      }
    } finally {
      setLoadingEvents(false);
    }
  }

  // Paginación cliente sobre lo ya traído, idéntica a la consola.
  const histTotal = runs.length;
  const histTotalPages = Math.max(1, Math.ceil(histTotal / histLimit));
  const histPage = Math.min(histTotalPages, Math.floor(histOffset / histLimit) + 1);
  const histRows = useMemo(
    () => runs.slice(histOffset, histOffset + histLimit),
    [runs, histOffset, histLimit],
  );
  const histFrom = histTotal > 0 ? histOffset + 1 : 0;
  const histTo = Math.min(histOffset + histLimit, histTotal);

  // La corrida que el panel de Actividad está mostrando. Puede no estar en `runs` si el operador
  // paginó lejos, así que la actual entra como respaldo.
  const selectedRun =
    runs.find((r) => r.run_id === selectedRunId) ??
    (currentRun?.run_id === selectedRunId ? currentRun : undefined);

  const canRetry = currentRun != null && isRetriable(currentRun.state);
  const canCancel = currentRun != null && isCancellable(currentRun.state);
  // Deep-link corrida→cola: solo si esta corrida dejó algo a revisar. Misma regla que la lista
  // (`runQueueHref`), pero acá los datos vienen sueltos, no en un `ProviderFlowDto`.
  const queueHref =
    currentRun && metrics && metrics.queued_for_review > 0
      ? `/admin/review-queue?run_id=${encodeURIComponent(currentRun.run_id)}`
      : null;

  return (
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1 space-y-4 rounded-[32px] bg-muted/60 p-4 shadow-sm md:p-6 dark:bg-secondary [corner-shape:squircle]">
        <a
          href="/admin/orchestration"
          className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {/* La flecha se corre un pelo a la izquierda al hover: un guiño de dirección ("volver"),
              no una animación gratuita. */}
          <ArrowLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          {t("admin.orchestration.detail.back")}
        </a>

        {/* Header: identidad + estado + acciones. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-14 shrink-0 items-center">
              <ProviderLogo
                name={detail.provider_name ?? ""}
                logoUrl={detail.provider_logo_url}
                className="max-h-10 max-w-14 object-contain"
              />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-brand-forest dark:text-brand-lime">
                {detail.provider_name ?? detail.provider_id}
              </h1>
              <span className="text-sm text-muted-foreground" title={detail.flow_key}>
                {flowLabel(detail.flow_key, t)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {policy.enabled ? (
                <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800">
                  {t("admin.orchestration.state.active")}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-gray-200 bg-gray-100 text-gray-600">
                  {t("admin.orchestration.state.paused")}
                </Badge>
              )}
              <Badge
                variant="outline"
                data-testid="detail-sla"
                className={SLA_TONE[detail.sla_status ?? "not_applicable"] ?? SLA_TONE.not_applicable}
              >
                {t(SLA_KEY[detail.sla_status ?? "not_applicable"] ?? "admin.orchestration.detail.slaNa")}
              </Badge>
            </div>
          </div>

          {/* Acciones (US-OR-D8). Cada una aparece solo cuando aplica — las mismas reglas que la
              fila de la lista, para no ofrecer lo imposible (reintentar una corrida exitosa da 503). */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !policy.enabled}
              onClick={() => void act(() => runPolicy(policy.policy_id))}
              className={PRIMARY_BTN}
            >
              <Play className="size-4" /> {t("admin.orchestration.action.run")}
            </button>
            {canRetry ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => retryRun(currentRun!.run_id))}
                className={GHOST_BTN}
              >
                <RotateCcw className="size-4 text-blue-600 dark:text-blue-400" />
                {t("admin.orchestration.action.retry")}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCancel(currentRun!.run_id)}
                className={GHOST_BTN}
              >
                <Ban className="size-4 text-amber-600 dark:text-amber-400" />
                {t("admin.orchestration.action.cancel")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className={GHOST_BTN}
            >
              <Pencil className="size-4 text-orange-500" /> {t("admin.orchestration.action.edit")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(() =>
                  policy.enabled ? pausePolicy(policy.policy_id) : resumePolicy(policy.policy_id),
                )
              }
              className={GHOST_BTN}
            >
              <Power className="size-4 text-sky-600 dark:text-sky-400" />
              {t(
                policy.enabled
                  ? "admin.orchestration.action.pause"
                  : "admin.orchestration.action.resume",
              )}
            </button>
          </div>
        </div>

        {/* Runner caído: se DECLARA (no se infiere de que falten métricas). La config sigue viéndose. */}
        {!detail.runner_available ? (
          <div
            data-testid="detail-runner-down"
            className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertTriangle className="size-4 shrink-0" />
            {t("admin.orchestration.detail.runnerDown")}
          </div>
        ) : null}

        {/* Las TRES cards de resumen van juntas y a la misma altura; la Actividad sale de la
            rejilla (ver abajo). Antes eran 2×2 con el log adentro, y como el grid iguala las
            alturas de la fila, el log estiraba a "Salud y SLA" dejándole un vacío blanco enorme al
            lado. Un log no es una card de resumen: no tiene altura natural. */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* D2 — última corrida */}
          <Panel title={t("admin.orchestration.detail.lastRunTitle")}>
            {currentRun ? (
              <div className="flex flex-col gap-3">
                {/* DOS columnas, no tres. `sm:` es un breakpoint de VIEWPORT, no del contenedor: en una
                      pantalla ancha se activaba igual y partía la card de un tercio en columnas de
                      ~143px, donde "Lun 20, Julio 2026" y las etiquetas se rompían en tres renglones. */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label={t("admin.orchestration.col.runOutcome")}>
                    <FlowStatusBadge state={currentRun.state} t={t} />
                  </Field>
                  <Field label={t("admin.orchestration.detail.trigger")}>
                    {triggerLabel(currentRun.trigger, t)}
                  </Field>
                  <Field label={t("admin.orchestration.detail.startedAt")}>
                    <AdminDateTime iso={currentRun.started_at} locale={locale} />
                  </Field>
                  <Field label={t("admin.orchestration.detail.endedAt")}>
                    <AdminDateTime iso={currentRun.ended_at} locale={locale} />
                  </Field>
                  <Field label={t("admin.orchestration.detail.duration")}>
                    {formatDuration(currentRun.duration_seconds, locale, t)}
                  </Field>
                </div>
                {/* US-OR-D2: "Fallida" sin el porqué obliga al operador a irse a Dagster a
                    averiguarlo. La causa RAÍZ va acá mismo, donde ya está mirando. */}
                {currentRun.failure ? (
                  <FailureCause failure={currentRun.failure} t={t} />
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("admin.orchestration.detail.noRun")}</p>
            )}
          </Panel>

          {/* D4 — resultados de la corrida, tratados como KPI: el número manda (confianza a
              `text-[40px]`, como los KpiCard de la cola de revisión), los chips desglosan, y la
              barra de progreso da paridad con la lista. */}
          <Panel title={t("admin.orchestration.detail.resultsTitle")}>
            {metrics ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[40px] font-bold leading-none tabular-nums text-foreground">
                      {metrics.seen}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t("admin.orchestration.products.seenLabel")}
                    </span>
                  </div>
                  {metrics.query_progress != null ? (
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {format(locale, "admin.orchestration.products.queryProgress", {
                          processed: String(metrics.queries_processed),
                          total: String(metrics.queries_total),
                        })}
                      </span>
                      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-brand-lime transition-[width] duration-500"
                          style={{ width: `${Math.round(metrics.query_progress * 100)}%` }}
                        />
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline" className="border-brand-lime/40 bg-brand-lime/20">
                    {format(locale, "admin.orchestration.outcome.chipLinked", {
                      n: String(metrics.auto_linked),
                    })}
                  </Badge>
                  {queueHref ? (
                    <a
                      href={queueHref}
                      className="rounded-full transition-transform duration-150 active:scale-[0.97]"
                    >
                      <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-200">
                        {format(locale, "admin.orchestration.outcome.chipQueued", {
                          n: String(metrics.queued_for_review),
                        })}
                      </Badge>
                    </a>
                  ) : (
                    <Badge variant="outline">
                      {format(locale, "admin.orchestration.outcome.chipQueued", {
                        n: String(metrics.queued_for_review),
                      })}
                    </Badge>
                  )}
                  {metrics.new_canonicals > 0 ? (
                    <Badge variant="outline">
                      {format(locale, "admin.orchestration.outcome.chipNew", {
                        n: String(metrics.new_canonicals),
                      })}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </Panel>

          {/* D5 — salud y SLA */}
          <Panel title={t("admin.orchestration.detail.healthTitle")}>
            {/* DOS columnas, no tres. `sm:` es un breakpoint de VIEWPORT, no del contenedor: en una
                      pantalla ancha se activaba igual y partía la card de un tercio en columnas de
                      ~143px, donde "Lun 20, Julio 2026" y las etiquetas se rompían en tres renglones. */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {/* El SLA vive acá además de en el header: el panel se titula "Salud y SLA", así que
                  omitirlo dejaba el título prometiendo un dato ausente. */}
              <Field label={t("admin.orchestration.kpi.withinSla")}>
                <Badge
                  variant="outline"
                  className={SLA_TONE[detail.sla_status ?? "not_applicable"] ?? SLA_TONE.not_applicable}
                >
                  {t(SLA_KEY[detail.sla_status ?? "not_applicable"] ?? "admin.orchestration.detail.slaNa")}
                </Badge>
              </Field>
              <Field label={t("admin.orchestration.detail.lastSync")}>
                <AdminDateTime iso={detail.last_sync_at} locale={locale} />
              </Field>
              <Field label={t("admin.orchestration.col.nextRun")}>
                <AdminDateTime iso={detail.next_run_at} locale={locale} />
              </Field>
              <Field label={t("admin.orchestration.detail.queryLimit")}>
                {detail.resolved_query_limit != null
                  ? detail.resolved_query_limit
                  : t("admin.orchestration.detail.queryLimitNone")}
              </Field>
            </div>
          </Panel>

        </div>

        {/* D7 — actividad REAL: la corrida contada como una historia. La maquinaria del runner va
            oculta por defecto (la mitad de los eventos) y se revela sin ir al servidor.
            A ANCHO COMPLETO y fuera de la rejilla, por dos razones que se vieron al mirarlo con
            datos de verdad: (1) metido en la rejilla vaciaba la card de al lado, y (2) nuestras
            propias líneas de log (`query_catalog_prices[uuid]: query 3/5 · acumulado: …`) se
            partían en tres renglones a media pantalla. Un log necesita ancho, no una columna. */}
        <Panel
          title={t("admin.orchestration.detail.activityTitle")}
          action={
            // Qué corrida se está mirando. Solo aparece cuando NO es la actual: en el caso normal
            // sería ruido que repite lo que la card de arriba ya dice.
            selectedRunId && currentRun && selectedRunId !== currentRun.run_id ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {format(locale, "admin.orchestration.detail.activityOfRun", {
                    when: formatAdminDateTime(selectedRun?.started_at, locale),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => void selectRun(currentRun.run_id)}
                  className="rounded-full px-2 py-0.5 font-medium text-brand-forest transition-transform duration-150 hover:bg-muted active:scale-[0.97] dark:text-brand-lime"
                >
                  {t("admin.orchestration.detail.activityBackToCurrent")}
                </button>
              </div>
            ) : null
          }
        >
          <RunActivityPanel
            events={events}
            nextCursor={eventsCursor}
            onLoadMore={loadMoreEvents}
            loading={loadingEvents}
            locale={locale}
            t={t}
          />
        </Panel>

        {/* D6 — histórico. Se AUTO-CARGA al montar (una tanda) y se pagina del lado del cliente, con
            el MISMO lenguaje que la tabla de la lista: card blanco, filas con divisor y hover, y el
            footer de paginación (tamaño de página + rango + páginas). Sin clic previo para verlo. */}
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-brand-forest dark:text-brand-lime">
            {t("admin.orchestration.detail.historyTitle")}
          </h2>
          {runsAvailable && histTotal > 0 ? (
            <span className="text-sm font-semibold text-brand-forest dark:text-brand-lime">
              ({histTotal})
            </span>
          ) : null}
        </div>

        {/* `runsAvailable=false` (runner caído al SSR) NO es "sin corridas": se declara. El histórico
            vive solo en el runner; sin él no hay nada honesto que mostrar, pero la config de arriba
            sigue. */}
        {!runsAvailable ? (
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            {t("admin.orchestration.detail.historyUnavailable")}
          </div>
        ) : histTotal === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("admin.orchestration.detail.historyEmpty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent [&>th]:h-11 [&>th]:text-sm [&>th]:font-semibold [&>th]:text-muted-foreground">
                    <TableHead>{t("admin.orchestration.detail.colWhen")}</TableHead>
                    <TableHead>{t("admin.orchestration.detail.colTrigger")}</TableHead>
                    <TableHead>{t("admin.orchestration.detail.colState")}</TableHead>
                    {/* Duración a la DERECHA: son números, y alineados a la derecha se comparan de
                        un vistazo (los dígitos quedan en columna). */}
                    <TableHead className="text-right">
                      {t("admin.orchestration.detail.colDuration")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {histRows.map((r) => {
                    // Las fallidas se DESTACAN al escanear: tinte rojo tenue + acento a la izquierda.
                    // El badge solo no alcanza cuando la tabla tiene decenas de filas casi idénticas.
                    const failed = r.state === "failed" || r.state === "canceled";
                    // La fila APUNTA el panel de Actividad a esa corrida. Es el recorrido real del
                    // operador: ve "Fallida" en una fila de hace tres días y quiere el porqué. Con
                    // el panel clavado en la corrida actual, esa pregunta no tenía forma de hacerse
                    // desde la consola y obligaba a irse a la UI de Dagster.
                    const selected = r.run_id === selectedRunId;
                    return (
                      <TableRow
                        key={r.run_id}
                        onClick={() => void selectRun(r.run_id)}
                        aria-selected={selected}
                        title={t("admin.orchestration.detail.rowSeeActivity")}
                        className={`cursor-pointer border-border/60 transition-colors hover:bg-muted/40 ${
                          failed ? "bg-red-50/50 dark:bg-red-950/15" : ""
                        } ${selected ? "bg-brand-lime/15 hover:bg-brand-lime/20 dark:bg-brand-lime/10" : ""}`}
                      >
                        <TableCell
                          className={`text-xs ${failed ? "border-l-2 border-red-400/70" : ""}`}
                        >
                          <AdminDateTime iso={r.ended_at ?? r.started_at} locale={locale} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {triggerLabel(r.trigger, t)}
                        </TableCell>
                        <TableCell>
                          <FlowStatusBadge state={r.state} t={t} />
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {formatDuration(r.duration_seconds, locale, t)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Skeleton mientras se trae la SIGUIENTE tanda del runner (>50 corridas): filas
                      con `animate-pulse` que dicen "cargando" de verdad — es el único caso en que el
                      histórico está pidiendo datos, ya que la primera tanda vino por SSR. */}
                  {loadingMore
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={`sk-${i}`} className="border-border/60">
                          {Array.from({ length: 4 }).map((__, c) => (
                            <TableCell key={c} className={c === 3 ? "text-right" : undefined}>
                              <span
                                className={`inline-block h-3.5 animate-pulse rounded bg-muted ${
                                  c === 0 ? "w-32" : c === 2 ? "w-16" : "w-12"
                                }`}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : null}
                </TableBody>
              </Table>
            </div>

            {/* Footer de paginación — idéntico a la consola: tamaño de página, rango y páginas. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>{t("admin.orchestration.pagination.show")}</span>
                <Select
                  value={String(histLimit)}
                  onValueChange={(v) => {
                    setHistLimit(Number(v));
                    setHistOffset(0);
                  }}
                >
                  <SelectTrigger size="sm" className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>{t("admin.orchestration.pagination.perPage")}</span>
              </div>

              <span data-testid="history-pagination-range">
                {format(locale, "admin.orchestration.pagination.of", {
                  from: String(histFrom),
                  to: String(histTo),
                  total: String(histTotal),
                })}
              </span>

              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setHistOffset(Math.max(0, histOffset - histLimit))}
                      aria-disabled={histPage <= 1}
                      className={histPage <= 1 ? "pointer-events-none opacity-50" : undefined}
                    />
                  </PaginationItem>
                  {pageWindow(histPage, histTotalPages).map((pg) => (
                    <PaginationItem key={pg}>
                      <PaginationLink
                        isActive={pg === histPage}
                        onClick={() => setHistOffset((pg - 1) * histLimit)}
                      >
                        {pg}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => {
                        // Última página local Y hay más en el runner → trae otra tanda antes de avanzar.
                        if (histPage >= histTotalPages && cursor) {
                          void loadMore().then(() => setHistOffset(histOffset + histLimit));
                        } else {
                          setHistOffset(histOffset + histLimit);
                        }
                      }}
                      aria-disabled={histPage >= histTotalPages && !cursor}
                      className={
                        histPage >= histTotalPages && !cursor
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        )}
      </div>

      {editing ? (
        <PolicyModal
          policy={policy}
          onClose={() => setEditing(false)}
          refresh={reload}
          t={t}
          locale={locale}
        />
      ) : null}

      <ConfirmDialog
        open={confirmCancel !== null}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
        destructive
        busy={busy}
        title={t("admin.orchestration.confirm.cancel.title")}
        description={t("admin.orchestration.confirm.cancel.body")}
        confirmLabel={t("admin.orchestration.confirm.cancel.accept")}
        cancelLabel={t("admin.orchestration.confirm.back")}
        onConfirm={() => {
          const runId = confirmCancel;
          setConfirmCancel(null);
          if (runId) void act(() => cancelRun(runId));
        }}
      />
    </div>
  );
}
