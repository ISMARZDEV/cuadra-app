import type { RunEventDto } from "@cuadra/api-client";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Cog,
  type LucideIcon,
  Package,
  Play,
  Terminal,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { formatAdminTimeWithSeconds } from "@/features/admin/lib/format-datetime";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

/**
 * La línea de tiempo de UNA corrida (US-OR-D7).
 *
 * **Qué NO es**: un visor de logs. Dagster ya tiene uno y lo hace mejor que nosotros; construir un
 * segundo sería duplicar herramienta. Lo nuestro es DESTILAR — que la corrida se lea como una
 * historia (encolada → arrancó → pasos → produjo → terminó) y que el fallo, si lo hubo, se lea
 * primero y en castellano operativo.
 *
 * Las tres decisiones que gobiernan el diseño salieron de MEDIR corridas reales, no de suponer:
 *
 * 1. El runner manda los hitos de la corrida con `message: ""` — el hecho ES el evento. La palabra
 *    la pone acá desde `kind`, o la línea de tiempo pinta filas mudas.
 * 2. La mitad de los eventos son maquinaria en DEBUG (24 de 30 en una corrida exitosa). Se ocultan
 *    por defecto y se revelan con un clic, SIN ir al servidor: la página ya los trajo todos.
 * 3. La causa útil de un fallo es la RAÍZ, no el envoltorio de Dagster. El envoltorio no se tira
 *    —el que sabe leerlo lo quiere— pero vive plegado, sin competir.
 */

type Kind = RunEventDto["kind"];

/**
 * Icono + tono por tipo de evento.
 *
 * El COLOR lo lleva el icono, no el texto. Antes cada fila tenía su etiqueta en mayúsculas y en
 * verde de marca, y con diez filas seguidas el resultado era que todo gritaba lo mismo: el color
 * dejaba de significar nada. Ahora el texto es neutro salvo el fallo, y lo que distingue de un
 * vistazo es el icono — que además dice QUÉ pasó sin leer una palabra.
 *
 * `bg` y `fg` van SEPARADOS porque el disco se pinta en dos capas: una base OPACA del color del
 * panel y encima el tinte. Los tintes de marca llevan alfa (`brand-lime/25`, `brand-forest/10`) y
 * en una sola capa el riel se veía pasar POR DENTRO del círculo. Bajar el alfa habría apagado los
 * colores de marca; la base opaca los conserva y tapa la línea igual.
 */
const EVENT_STYLE: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  queued: { icon: Clock, bg: "bg-muted", fg: "text-muted-foreground" },
  started: {
    icon: Play,
    bg: "bg-sky-100 dark:bg-sky-950",
    fg: "text-sky-700 dark:text-sky-300",
  },
  succeeded: {
    icon: Check,
    bg: "bg-brand-lime/30 dark:bg-brand-lime/15",
    fg: "text-brand-forest dark:text-brand-lime",
  },
  canceled: { icon: Ban, bg: "bg-muted", fg: "text-muted-foreground" },
  failure: {
    icon: X,
    bg: "bg-red-100 dark:bg-red-950",
    fg: "text-red-600 dark:text-red-300",
  },
  // `slate-200` y no `slate-100`: a 100 el disco desaparecía contra el blanco del panel y el icono
  // quedaba flotando suelto mientras sus vecinos sí tenían círculo — verificado en una captura 3x.
  step: {
    icon: ChevronRight,
    bg: "bg-slate-200 dark:bg-slate-800",
    fg: "text-slate-700 dark:text-slate-300",
  },
  materialization: {
    icon: Package,
    bg: "bg-brand-lime/25 dark:bg-brand-lime/15",
    fg: "text-brand-forest dark:text-brand-lime",
  },
  // Nuestro propio código hablando: una terminal es exactamente lo que es.
  log: {
    icon: Terminal,
    bg: "bg-brand-forest/10 dark:bg-brand-lime/10",
    fg: "text-brand-forest dark:text-brand-lime",
  },
  machinery: { icon: Cog, bg: "bg-muted", fg: "text-muted-foreground/60" },
};

function kindLabel(kind: Kind, t: (k: MessageKey) => string): string {
  return t(`admin.orchestration.event.${kind}` as MessageKey) ?? kind;
}

/** La causa del fallo, con el envoltorio técnico plegado detrás de un `<details>`.
 *
 * Se exporta porque la card de "Última corrida" (US-OR-D2) muestra exactamente lo mismo: el
 * operador no debería tener que bajar a la línea de tiempo para saber por qué se rompió. Una
 * segunda implementación del mismo bloque es como se empiezan a desincronizar. */
export function FailureCause({
  failure,
  t,
}: {
  failure: NonNullable<RunEventDto["failure"]>;
  t: (k: MessageKey) => string;
}) {
  return (
    <div
      data-testid="failure-cause"
      // Tarjeta CONTENIDA (borde completo), no una franja con barra lateral: el contenido anidado
      // se lee como una pieza aparte del evento que lo trajo, que es justo lo que es.
      className="rounded-xl border border-red-200 bg-red-50/70 p-3 dark:border-red-900/60 dark:bg-red-950/30"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
        {t("admin.orchestration.detail.failureTitle")}
      </p>
      <p className="mt-1 break-words text-sm text-red-900 dark:text-red-100">{failure.summary}</p>
      {failure.detail && failure.detail !== failure.summary ? (
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-red-700 transition-colors hover:text-red-900 dark:text-red-300 dark:hover:text-red-100">
            <ChevronDown className="size-3 transition-transform duration-150 group-open:rotate-180" />
            {t("admin.orchestration.detail.failureTechnical")}
          </summary>
          <p className="mt-1.5 break-words font-mono text-[11px] leading-relaxed text-red-800/80 dark:text-red-200/70">
            {failure.detail}
          </p>
        </details>
      ) : null}
    </div>
  );
}

export function RunActivityPanel({
  events,
  nextCursor,
  onLoadMore,
  loading = false,
  locale,
  t,
}: {
  /** `null` = no pudimos preguntar (runner caído). `[]` = la corrida no registró eventos. Son cosas
   *  distintas y el panel dice cosas distintas: confundirlas es exactamente la mentira que este
   *  módulo ya cometió una vez con "nunca corrió" vs "runner muerto". */
  events: RunEventDto[] | null;
  nextCursor: string | null;
  onLoadMore: () => void;
  loading?: boolean;
  locale: Locale;
  t: (k: MessageKey) => string;
}) {
  const [showAll, setShowAll] = useState(false);

  const hiddenCount = useMemo(
    () => (events ?? []).filter((e) => e.is_noise).length,
    [events],
  );
  const visible = useMemo(
    () => (events ?? []).filter((e) => showAll || !e.is_noise),
    [events, showAll],
  );

  // El orden importa: "estoy cargando" se comprueba ANTES que "no pude preguntar". Al seleccionar
  // otra corrida del histórico el estado también pasa por `null`, y sin esta guarda el panel
  // parpadearía "el orquestador no respondió" en cada clic — otra vez la confusión entre no saber
  // todavía y saber que no hay.
  if (loading && events === null) {
    return (
      <div data-testid="activity-loading" className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-4 animate-pulse rounded-full bg-muted" style={{ width: `${85 - i * 12}%` }} />
        ))}
      </div>
    );
  }
  if (events === null) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("admin.orchestration.detail.activityUnavailable")}
      </p>
    );
  }
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("admin.orchestration.detail.activityEmpty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* La altura va ACOTADA con scroll propio, y no es un capricho de estilo: sin tope, una
          corrida de 5 búsquedas estiraba el panel a ~800px y —como el grid iguala las alturas de la
          fila— dejaba a "Salud y SLA" al lado como un vacío blanco enorme. Un log crece sin control
          por definición; el que tiene que ceder es él, no la página.
          El scroll vive en el ENVOLTORIO y no en el `<ol>`: la lista lleva el riel como pseudo
          absoluto, y un `overflow` sobre ella misma lo recortaría. El `pr-1` deja aire para la
          barra de scroll sin que se monte encima del texto. */}
      <div className="max-h-[26rem] overflow-y-auto pr-1">
      {/* El riel vertical convierte una lista en una SECUENCIA: es lo que hace que se lea como una
          historia y no como filas sueltas. */}
      {/* El riel es una LÍNEA CONTINUA detrás de los iconos, no un borde a la izquierda de la
          lista: así los eventos se ven ensartados en una secuencia en vez de sangrados bajo un
          margen. Se recorta arriba y abajo para que no sobresalga del primer y último icono. */}
      <ol className="relative flex flex-col gap-4 before:absolute before:bottom-3 before:left-[13.5px] before:top-3 before:w-px before:bg-border before:content-['']">
        {(() => {
          // Cuando un paso revienta llegan DOS eventos con la excepción IDÉNTICA
          // (`ExecutionStepFailureEvent` y después `RunFailureEvent`) — verificado con fallos
          // reales. Las dos LÍNEAS se quedan (son hechos distintos: falló el paso, falló la
          // corrida), pero el bloque de causa se pinta una sola vez: dos recuadros rojos con el
          // mismo texto no informan el doble, solo tapan el resto de la línea de tiempo.
          let lastCause: string | null = null;
          return visible.map((e, i) => {
          const isFailure = e.kind === "failure";
          const showCause = e.failure != null && e.failure.summary !== lastCause;
          if (e.failure) lastCause = e.failure.summary;
          const style = EVENT_STYLE[e.kind] ?? EVENT_STYLE.machinery;
          const Icon = style.icon;
          return (
            <li key={`${e.timestamp ?? "t"}-${i}`} className="relative flex gap-3">
              {/* Disco en DOS capas: base opaca del color del panel + tinte encima. Con una sola
                  capa, los tintes con alfa dejaban ver el riel por dentro del círculo. El `ring`
                  añade el respiro que separa la línea del disco. */}
              <span
                aria-hidden
                className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-white ring-4 ring-white dark:bg-card dark:ring-card ${style.fg}`}
              >
                <span className={`absolute inset-0 rounded-full ${style.bg}`} />
                <Icon className="relative size-3.5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                {/* Se lee como una FRASE, no como una fila de tabla: qué pasó (fuerte) y cuándo
                    (atenuado, a la derecha). Antes hora/tipo/paso eran tres columnas de ancho fijo,
                    y los hitos sin texto dejaban dos tercios de la fila en blanco — una tabla exige
                    celda aunque no haya dato; una frase, no. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={`text-sm font-medium ${
                        isFailure ? "text-red-600 dark:text-red-400" : "text-foreground"
                      }`}
                    >
                      {kindLabel(e.kind, t)}
                    </span>
                    {e.step_key ? (
                      <span className="max-w-[14rem] truncate rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {e.step_key}
                      </span>
                    ) : null}
                  </span>
                  <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatAdminTimeWithSeconds(e.timestamp, locale) || "—"}
                  </time>
                </div>
                {/* Solo si el runner mandó texto propio: los hitos ya quedaron nombrados por su
                    tipo, y una línea vacía se leería como un dato que falta. */}
                {e.has_text && e.message ? (
                  <p className="mt-0.5 break-words text-sm text-muted-foreground">{e.message}</p>
                ) : null}
                {showCause && e.failure ? (
                  <div className="mt-2">
                    <FailureCause failure={e.failure} t={t} />
                  </div>
                ) : null}
              </div>
            </li>
          );
          });
        })()}
      </ol>
      </div>

      {/* Los controles quedan FUERA del área con scroll: si viajaran con la lista, el operador
          tendría que bajar hasta el final del log para encontrar el botón que revela el log.
          El filete de arriba los separa del riel — sin él parecían un evento más de la secuencia. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-forest transition-transform duration-150 hover:underline active:scale-[0.97] dark:text-brand-lime"
          >
            {t(
              showAll
                ? "admin.orchestration.detail.activityShowKey"
                : "admin.orchestration.detail.activityShowAll",
            )}
            {!showAll ? (
              <span className="text-muted-foreground">
                (
                {format(locale, "admin.orchestration.detail.activityHiddenCount", {
                  n: String(hiddenCount),
                })}
                )
              </span>
            ) : null}
          </button>
        ) : (
          <span />
        )}
        {nextCursor ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className="text-xs font-medium text-muted-foreground transition-transform duration-150 hover:text-foreground active:scale-[0.97] disabled:opacity-50"
          >
            {t("admin.orchestration.detail.activityLoadMore")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
