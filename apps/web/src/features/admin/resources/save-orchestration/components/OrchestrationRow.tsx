import type { ProviderFlowDto } from "@cuadra/api-client";

import { TableCell, TableRow } from "@/components/ui-base/table";
import { Badge } from "@/components/ui/badge";
import { AdminDateTime } from "@/features/admin/components/AdminDateTime";
import { ProviderLogo } from "@/features/admin/components/ProviderLogo";
import type { Locale } from "@/i18n/config";
import { format, type MessageKey } from "@/i18n/messages";

import { runQueueHref } from "../lib/run-queue-href";
import { isInFlight } from "../lib/run-state";
import { SelectCheckbox } from "@/features/admin/resources/save-matching/components/SelectCheckbox";

import { FlowStatusBadge } from "./FlowStatusBadge";
import { OrchestrationActionsMenu } from "./OrchestrationActionsMenu";

type T = (key: MessageKey) => string;

/** Nombre LEGIBLE de un flujo, con la clave cruda como red de seguridad.
 *
 * El fallback no es decorativo: `translate` devuelve `MESSAGES[locale][key]`, o sea `undefined` para
 * una clave que no existe — y React renderiza `undefined` como NADA. Sin este `??`, el día que entre
 * un flujo nuevo sin traducir (`provider_coverage`, §14 #16) la columna saldría EN BLANCO en vez de
 * fallar. Mostrar el identificador es feo pero cierto; una celda vacía miente. */
function flowLabel(flowKey: string, t: T): string {
  return t(`admin.orchestration.flow.${flowKey}` as MessageKey) ?? flowKey;
}

/** Píldora compacta para un número con etiqueta. Vive acá y NO en `admin/components` a propósito:
 * hoy la usa solo esta tabla, y subir al inventario compartido algo con un único consumidor es
 * adivinar una abstracción. Cuando Canónicos la pida, se sube — con dos casos reales a la vista. */
function Chip({
  children,
  tone = "neutral",
  interactive = false,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn";
  interactive?: boolean;
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    ok: "bg-brand-lime/25 text-brand-forest dark:text-brand-lime",
    warn: "bg-amber-200/40 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  } as const;
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium tabular-nums ${tones[tone]}${
        interactive ? " underline-offset-2 hover:underline" : ""
      }`}
    >
      {children}
    </span>
  );
}

// Fila de la consola de Orquestación, alineada al lenguaje del admin (`ReviewRow`/`SourceRow`):
// logo de proveedor, dos líneas donde aporta, y el menú de acciones redondo al final.
//
// El PROVEEDOR va primero (después del estado) porque con `flow_key` al frente las tres filas de
// `provider_prices_refresh` se ven idénticas y el operador no sabe cuál es cuál. Se detectó mirando
// el render real en F4, no con tests.
//
// El checkbox de selección entró CON las acciones en lote: antes no existía justamente porque sin
// bulk habría sido un control decorativo — el mismo criterio por el que F4 no pintó la tab "Assets"
// vacía.
export function OrchestrationRow({
  flow,
  t,
  locale,
  busy,
  onRun,
  onRetry,
  onCancel,
  onEdit,
  onToggle,
  onDelete,
  selected,
  onSelectedChange,
}: {
  flow: ProviderFlowDto;
  t: T;
  locale: Locale;
  busy: boolean;
  onRun: () => void;
  onRetry: () => void;
  onCancel: () => void;
  /** Omitido = sin ítem "Editar" (ver `OrchestrationActionsMenu`). */
  onEdit?: () => void;
  onToggle: () => void;
  onDelete: () => void;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
}) {
  const { policy, last_run_metrics: metrics } = flow;
  // Que la corrida esté EN VUELO lo dice el runner, no la ausencia de métricas: un flujo que nunca
  // corrió se ve igual que uno arrancando, y esa inferencia ya se hizo mal una vez en este módulo.
  const running = isInFlight(flow.last_run_state);
  // Deep-link corrida→cola (F4 #4.7): solo enlaza si hay corrida Y quedó algo pendiente.
  const queueHref = runQueueHref(flow);

  return (
    <TableRow
      className={`border-border/60 ${policy.enabled ? "" : "opacity-60"}`}
    >
      <TableCell className="w-10">
        <SelectCheckbox
          checked={selected}
          onChange={(e) => onSelectedChange(e.target.checked)}
          aria-label={t("admin.orchestration.bulk.selectRow")}
          data-testid={`orchestration-select-${policy.policy_id}`}
        />
      </TableCell>

      {/* ESTADO = ¿el flujo está operando? Una sola dimensión, un solo badge.
          Antes acá se apilaban dos ("Exitosa" + "Pausado") y una columna llamada "Estado" con dos
          píldoras no tiene UN significado, tiene dos: una es el presente (¿corre o está detenido?) y
          la otra el pasado (¿cómo terminó la última corrida?). El desenlace se mudó a la columna
          "Última corrida", junto a la FECHA de esa misma corrida, que es su sitio natural. */}
      <TableCell>
        {policy.enabled ? (
          <Badge
            variant="outline"
            data-testid="orchestration-active"
            className="border-green-200 bg-green-100 text-green-800"
          >
            {t("admin.orchestration.state.active")}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            data-testid="orchestration-paused"
            className="border-gray-200 bg-gray-100 text-gray-600"
          >
            {t("admin.orchestration.state.paused")}
          </Badge>
        )}
      </TableCell>

      {/* Proveedor: logo en caja uniforme (los logos anchos como Bravo se acotan igual que los
          cuadrados) + nombre. Cae al `provider_id` si el proveedor no resolvió. */}
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-12 shrink-0 items-center">
            <ProviderLogo
              name={flow.provider_name ?? ""}
              logoUrl={flow.provider_logo_url}
              className="max-h-8 max-w-12 object-contain"
            />
          </div>
          <span className="truncate font-medium text-foreground">
            {flow.provider_name ?? policy.provider_id ?? "—"}
          </span>
        </div>
      </TableCell>

      {/* Flujo: nombre LEGIBLE, no la clave. `provider_prices_refresh` es vocabulario del código —
          el mismo problema que las descripciones de assets llenas de `F3.2a`. La clave técnica
          queda en el `title` para quien la necesite (logs, soporte), sin ocupar la fila. */}
      <TableCell>
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-foreground" title={policy.flow_key ?? undefined}>
            {policy.flow_key ? flowLabel(policy.flow_key, t) : "—"}
          </span>
          <span className="text-xs text-muted-foreground">
            {t(
              `admin.orchestration.mode.${policy.execution_mode}` as MessageKey,
            )}
          </span>
        </div>
      </TableCell>

      {/* Horario: el cron SOLO significa algo en modo `cron`. En `manual` o `automatic_chain` el
          reloj no dispara este flujo, y mostrar una expresión ahí sería prometer lo que no pasa. */}
      <TableCell>
        {policy.execution_mode === "cron" && policy.cron_expression ? (
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-xs text-foreground">
              {policy.cron_expression}
            </span>
            <span className="text-xs text-muted-foreground">
              {policy.timezone}
            </span>
          </div>
        ) : (
          // Badge gris, mismo lenguaje que los estados: "Sin programar" NO es un dato ausente sino
          // un ESTADO del flujo (lo dispara una persona, o lo arrastra una dependencia). Como texto
          // suelto se leía igual que un hueco; como píldora se lee como lo que es.
          <Badge
            variant="outline"
            data-testid="orchestration-schedule-none"
            className="border-gray-200 bg-gray-100 text-gray-600"
          >
            {t("admin.orchestration.schedule.none")}
          </Badge>
        )}
      </TableCell>

      {/* DESENLACE de la última corrida — columna propia. No cabe en "Estado" (que responde "¿el
          flujo opera?") ni en "Resultado" (que es el desenlace del MATCHEO). Tres columnas, tres
          preguntas: ¿está encendido? · ¿cómo terminó? · ¿qué produjo? */}
      <TableCell data-testid="orchestration-run-outcome">
        <FlowStatusBadge state={flow.last_run_state} t={t} />
      </TableCell>

      {/* Última corrida: CUÁNDO se intentó por última vez, con el desenlace que sea. Es distinto de
          `last_success_at` (solo las exitosas) — un flujo que falla cada 5 minutos tiene una última
          corrida fresquísima y una última sincronización vieja, y el operador necesita ambas.
          En vuelo muestra su inicio: todavía no hay final. */}
      <TableCell data-testid="orchestration-last-run" className="text-xs tabular-nums">
        <AdminDateTime iso={flow.last_run_at} locale={locale} />
      </TableCell>

      <TableCell className="text-xs tabular-nums">
        {/* `—` y no una fecha inventada: en manual o cadena declarativa el reloj no dispara.
            Mismo par de dos líneas que la cola de revisión: antes usaba `toLocaleString`, que salía
            en una sola línea a 24h, desalineado con el resto del admin. */}
        <AdminDateTime iso={policy.next_run_at} locale={locale} />
      </TableCell>

      {/* Progreso de la corrida — columna propia (§14 #14). Vivía dentro de "Productos" y ahí
          competía con los conteos: son dos preguntas distintas ("¿por dónde va?" vs "¿qué
          encontró?") y mezclarlas obligaba a leer tres renglones para responder cualquiera.

          Tres estados, ninguno confundible con otro:
          - hay plan  → barra + `5/5 búsquedas`
          - corriendo sin snapshot → "Iniciando…" (el runner tarda en levantar su proceso; una barra
            al 0% afirmaría "no avanzó", que es distinto de "todavía no sabemos")
          - el resto → `—` honesto. Incluye las corridas anteriores al contador. */}
      <TableCell data-testid="orchestration-progress">
        {metrics?.query_progress != null ? (
          <span
            data-testid="orchestration-query-progress"
            title={t("admin.orchestration.products.queryProgressTitle")}
            className="flex flex-col gap-1"
          >
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-brand-lime transition-[width] duration-500"
                style={{
                  width: `${Math.round(metrics.query_progress * 100)}%`,
                }}
              />
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {format(locale, "admin.orchestration.products.queryProgress", {
                processed: String(metrics.queries_processed),
                total: String(metrics.queries_total),
              })}
            </span>
          </span>
        ) : running ? (
          <span
            data-testid="orchestration-products-starting"
            title={t("admin.orchestration.products.startingHint")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-brand-lime" />
            {t("admin.orchestration.products.starting")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Productos: QUÉ encontró la corrida (el avance vive en su propia columna, a la izquierda).
          Dos niveles de lectura — el número grande manda y los chips desglosan. Antes eran renglones
          de texto corrido del mismo peso, y el operador tenía que LEERLOS para ver si algo iba mal. */}
      <TableCell data-testid="orchestration-products">
        {metrics ? (
          <div className="flex flex-col gap-1">
            <span className="flex items-baseline gap-1.5">
              <span className="text-lg leading-none font-semibold tabular-nums text-foreground">
                {metrics.seen}
              </span>
              <span className="text-[14px] font-bold text-muted-foreground">
                {t("admin.orchestration.products.seenLabel")}
              </span>
            </span>

            <span className="flex flex-wrap gap-1">
              <Chip>
                {format(locale, "admin.orchestration.products.chipRefreshed", {
                  n: String(metrics.refreshed),
                })}
              </Chip>
              <Chip>
                {format(locale, "admin.orchestration.products.chipMatched", {
                  n: String(metrics.matched),
                })}
              </Chip>
              {/* Los descartados solo se muestran si los HAY: un "0 descartados" permanente es ruido
                  que compite por atención con los números que sí cambian. */}
              {metrics.discarded > 0 ? (
                <Chip tone="warn">
                  {format(
                    locale,
                    "admin.orchestration.products.chipDiscarded",
                    { n: String(metrics.discarded) },
                  )}
                </Chip>
              ) : null}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Resultado del matcheo. Chips con semántica, no texto corrido separado por puntos: cada
          número significa una cosa distinta para el operador y merece color propio.
          - enlazados: la cascada resolvió sola (bien, verde)
          - a la cola: TRABAJO HUMANO pendiente → ámbar y es el ÚNICO clicable, porque es lo único
            sobre lo que se puede actuar
          - nuevos: canónicos nacidos de esa corrida (neutro, informativo) */}
      <TableCell>
        {metrics ? (
          <span className="flex flex-wrap gap-1">
            <Chip tone="ok">
              {format(locale, "admin.orchestration.outcome.chipLinked", {
                n: String(metrics.auto_linked),
              })}
            </Chip>
            {queueHref ? (
              <a
                href={queueHref}
                title={t("admin.orchestration.outcome.queuedLinkTitle")}
                className="rounded-full"
              >
                <Chip tone="warn" interactive>
                  {format(locale, "admin.orchestration.outcome.chipQueued", {
                    n: String(metrics.queued_for_review),
                  })}
                </Chip>
              </a>
            ) : (
              <Chip>
                {format(locale, "admin.orchestration.outcome.chipQueued", {
                  n: String(metrics.queued_for_review),
                })}
              </Chip>
            )}
            {metrics.new_canonicals > 0 ? (
              <Chip>
                {format(locale, "admin.orchestration.outcome.chipNew", {
                  n: String(metrics.new_canonicals),
                })}
              </Chip>
            ) : null}
          </span>
        ) : running ? (
          <span className="text-xs text-muted-foreground">
            {t("admin.orchestration.outcome.nothing")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      {/* Cabecera y botón CENTRADOS. Ojo: el disparador del menú es `flex size-8`, o sea un elemento
          de BLOQUE — `text-align` no lo mueve, así que el `text-right` que había acá nunca hizo
          nada. Centrarlo de verdad necesita un contenedor flex. */}
      <TableCell>
        <div className="flex justify-center">
          <OrchestrationActionsMenu
            flow={flow}
            t={t}
            busy={busy}
            onRun={onRun}
            onRetry={onRetry}
            onCancel={onCancel}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}
