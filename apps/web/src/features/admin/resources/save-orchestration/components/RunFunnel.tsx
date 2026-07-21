import type { ProviderFlowDto } from "@cuadra/api-client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui-base/tooltip";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

type Metrics = NonNullable<ProviderFlowDto["last_run_metrics"]>;
type T = (key: MessageKey) => string;

/** Los cuatro destinos de una corrida, en el orden del flujo: lo que ya estaba → lo que el sistema
 * resolvió solo → lo nuevo → lo que espera a un humano. El color es fijo por destino (no por valor):
 * el operador aprende "naranja = trabajo pendiente" una vez y lo reconoce en toda la tabla. */
const SEGMENTS = [
  { key: "existing", swatch: "bg-slate-400 dark:bg-slate-500", helpKey: "admin.orchestration.products.knownHelp" },
  { key: "linked", swatch: "bg-green-500", helpKey: "admin.orchestration.outcome.linkedHelp" },
  { key: "new", swatch: "bg-amber-400", helpKey: "admin.orchestration.products.newHelp" },
  { key: "pending", swatch: "bg-orange-500", helpKey: "admin.orchestration.outcome.queuedHelp" },
] as const;

/** Una métrica de la leyenda: punto + número grande + etiqueta, donde la ETIQUETA dispara su ayuda.
 *
 * Sin ícono `ⓘ` propio: con cuatro métricas por fila y diez filas, esa ayuda pintaría cuarenta
 * glifos idénticos para explicar cuatro conceptos que no cambian entre filas. El subrayado punteado
 * ya dice "acá hay algo que leer", y la explicación del embudo completo vive una sola vez, en la
 * cabecera de la columna. */
function Metric({
  swatch,
  value,
  label,
  helpId,
  helpText,
  href,
  linkTitle,
}: {
  swatch: string;
  value: number;
  label: string;
  helpId: string;
  helpText: string;
  href?: string | null;
  linkTitle?: string;
}) {
  const labelCls =
    "cursor-help text-[10px] text-muted-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2";
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className={`size-2 shrink-0 rounded-full ${swatch}`} aria-hidden />
        <span className="text-sm leading-none font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            data-testid={helpId}
            render={
              href ? (
                <a href={href} title={linkTitle} className={`${labelCls} hover:text-foreground`} />
              ) : (
                <span className={labelCls} />
              )
            }
          >
            {label}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs leading-relaxed">{helpText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

/**
 * El resultado de una corrida: una barra de cuatro tramos + su leyenda alineada.
 *
 *     ▓▓▓░████▒▒▒▒▒▒▒▓▓▓▓▓▓▓
 *     ● 19        ● 13        ● 81        ● 68
 *     Existentes  Vinculados  Nuevos      Pendientes
 *
 * El total (`seen`) NO vive acá: se movió a la columna Progreso, junto a las búsquedas, porque
 * "cuánto se procesó" y "en qué terminó" son dos preguntas distintas y mezclarlas obligaba a leer
 * toda la celda para responder cualquiera.
 *
 * NOTA de dato — la barra normaliza sobre la SUMA de los cuatro, no sobre `seen`: `Nuevos` ya
 * contiene a `Vinculados` + `Pendientes` (esos dos SON el desenlace de los nuevos), así que los
 * tramos se solapan y la barra comunica proporción relativa, no una partición exacta del total.
 * Es una decisión de lectura: cuatro destinos de un vistazo. La descomposición sin solape es
 * `Existentes + Vinculados + Pendientes = seen`.
 */
export function RunFunnel({
  metrics,
  t,
  queueHref,
}: {
  metrics: Metrics;
  locale: Locale;
  t: T;
  queueHref: string | null;
}) {
  const values: Record<string, number> = {
    existing: metrics.refreshed,
    linked: metrics.auto_linked,
    new: metrics.matched,
    pending: metrics.queued_for_review,
  };
  const total = SEGMENTS.reduce((s, seg) => s + values[seg.key], 0);

  return (
    <div className="flex min-w-[15rem] flex-col gap-2">
      {/* La barra. Un solo objeto, tramos contiguos: la proporción se lee sin cifras. `min-w` en cada
          tramo con valor > 0 evita que un segmento chico (p.ej. 1 de 100) desaparezca del todo. */}
      <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {total > 0
          ? SEGMENTS.map((seg) => {
              const v = values[seg.key];
              if (v <= 0) return null;
              return (
                <span
                  key={seg.key}
                  data-testid={`funnel-seg-${seg.key}`}
                  className={`block h-full ${seg.swatch}`}
                  style={{ width: `${(v / total) * 100}%`, minWidth: "3px" }}
                />
              );
            })
          : null}
      </span>

      <span className="grid grid-cols-4 gap-2">
        {SEGMENTS.map((seg) => (
          <Metric
            key={seg.key}
            swatch={seg.swatch}
            value={values[seg.key]}
            label={t(`admin.orchestration.funnel.${seg.key}` as MessageKey)}
            helpId={`help-${seg.key}`}
            helpText={t(seg.helpKey)}
            href={seg.key === "pending" ? queueHref : undefined}
            linkTitle={seg.key === "pending" ? t("admin.orchestration.outcome.queuedLinkTitle") : undefined}
          />
        ))}
      </span>
    </div>
  );
}
