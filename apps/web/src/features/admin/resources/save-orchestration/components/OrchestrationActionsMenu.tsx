import type { ProviderFlowDto } from "@cuadra/api-client";
import { Ban, Eye, MoreHorizontal, Pencil, Play, Power, RotateCcw, Trash2 } from "lucide-react";
import { navigate } from "vike/client/router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-base/dropdown-menu";
import type { MessageKey } from "@/i18n/messages";

import { isCancellable, isRetriable } from "../lib/run-state";

// Menú de acciones de un provider-flow. Mismo patrón que `ReviewRow` y `SourceActionsMenu`: trigger
// redondo lima + ítems con íconos Lucide coloreados.
//
// El override de color usa `**` (todos los descendientes) y NO `[&_svg]`, porque los íconos Lucide
// dibujan con `stroke="currentColor"`: el color real lo decide el `color` del `<path>` interior, y
// el estilo base tiñe ese path de gris vía `**:text-accent-foreground`.
//
// PRESENTACIONAL: no muta nada. El estado y las confirmaciones viven en la screen — así "Cancelar"
// y "Eliminar" pasan sí o sí por su diálogo y no hay un segundo camino que se saltee la confirmación.
export function OrchestrationActionsMenu({
  flow,
  t,
  busy,
  onRun,
  onRetry,
  onCancel,
  onEdit,
  onToggle,
  onDelete,
}: {
  flow: ProviderFlowDto;
  t: (key: MessageKey) => string;
  busy: boolean;
  onRun: () => void;
  onRetry: () => void;
  onCancel: () => void;
  /** Omitido = el ítem NO se renderiza. Un "Editar" que no abre nada es un botón que miente; se
   * ofrece recién cuando existe el formulario que lo respalda. */
  onEdit?: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { policy } = flow;
  // Solo se ofrece lo que el runner puede realmente atender. Un "Reintentar" sin corrida previa, o
  // un "Cancelar" sobre algo terminado, son botones que no hacen nada — y eso erosiona la confianza
  // en la consola entera.
  // Reintentar exige una corrida FALLIDA: el adapter re-ejecuta con FROM_FAILURE y sin fallo del
  // cual partir Dagster devuelve PythonError (500), que la consola traduce a "Orquestador no
  // disponible" — culpándolo de una acción imposible que le pedimos nosotros.
  const canRetry = flow.last_run_id != null && isRetriable(flow.last_run_state);
  const canCancel = flow.last_run_id != null && isCancellable(flow.last_run_state);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="orchestration-row-menu"
        disabled={busy}
        aria-label={t("admin.orchestration.actions.menuLabel")}
        className="flex size-8 items-center justify-center rounded-full border border-[#b7e36f] bg-[#daff9f] text-[#015442] hover:bg-[#cdf58a] disabled:opacity-50 dark:border-brand-lime/30 dark:bg-brand-lime/20 dark:text-brand-lime"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>

      {/* `min-w`/`nowrap`: el `min-w-[96px]` del base parte "Ejecutar ahora" en dos líneas. */}
      <DropdownMenuContent align="end" className="min-w-48 [&_[role=menuitem]]:whitespace-nowrap">
        {/* Ver detalle (#11): la pantalla ya existe, así que dejó de ser un enlace a 404. Va PRIMERO
            porque abrir el proveedor es la acción exploratoria; lanzar/pausar son las operativas. */}
        {policy.provider_id ? (
          <DropdownMenuItem
            onClick={() => void navigate(`/admin/orchestration/providers/${policy.provider_id}`)}
            className="focus:bg-emerald-500/10 focus:text-emerald-600 not-data-[variant=destructive]:focus:**:text-emerald-600 dark:focus:text-emerald-400 dark:not-data-[variant=destructive]:focus:**:text-emerald-400"
          >
            <Eye className="text-emerald-600 dark:text-emerald-400" />
            {t("admin.orchestration.action.detail")}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          disabled={!policy.enabled}
          onClick={onRun}
          className="focus:bg-emerald-500/10 focus:text-emerald-600 not-data-[variant=destructive]:focus:**:text-emerald-600 dark:focus:text-emerald-400 dark:not-data-[variant=destructive]:focus:**:text-emerald-400"
        >
          <Play className="text-emerald-600 dark:text-emerald-400" />
          {t("admin.orchestration.action.run")}
        </DropdownMenuItem>

        {canRetry ? (
          <DropdownMenuItem
            onClick={onRetry}
            className="focus:bg-blue-500/10 focus:text-blue-600 not-data-[variant=destructive]:focus:**:text-blue-600 dark:focus:text-blue-400 dark:not-data-[variant=destructive]:focus:**:text-blue-400"
          >
            <RotateCcw className="text-blue-600 dark:text-blue-400" />
            {t("admin.orchestration.action.retry")}
          </DropdownMenuItem>
        ) : null}

        {canCancel ? (
          <DropdownMenuItem
            onClick={onCancel}
            className="focus:bg-amber-500/10 focus:text-amber-600 not-data-[variant=destructive]:focus:**:text-amber-600 dark:focus:text-amber-400 dark:not-data-[variant=destructive]:focus:**:text-amber-400"
          >
            <Ban className="text-amber-600 dark:text-amber-400" />
            {t("admin.orchestration.action.cancel")}
          </DropdownMenuItem>
        ) : null}

        {onEdit ? (
          <DropdownMenuItem
            onClick={onEdit}
            className="focus:bg-orange-500/10 focus:text-orange-600 not-data-[variant=destructive]:focus:**:text-orange-500 dark:focus:text-orange-400 dark:not-data-[variant=destructive]:focus:**:text-orange-400"
          >
            <Pencil className="text-orange-500" />
            {t("admin.orchestration.action.edit")}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          onClick={onToggle}
          className="focus:bg-sky-500/10 focus:text-sky-600 not-data-[variant=destructive]:focus:**:text-sky-600 dark:focus:text-sky-400 dark:not-data-[variant=destructive]:focus:**:text-sky-400"
        >
          <Power className="text-sky-600 dark:text-sky-400" />
          {t(policy.enabled ? "admin.orchestration.action.pause" : "admin.orchestration.action.resume")}
        </DropdownMenuItem>

        {/* Destructivo y SECUNDARIO (§5.3): nunca CTA primaria, siempre al final y con confirmación
            fuerte, que la dispara la screen. El backend lo resuelve como soft-delete. */}
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          {t("admin.orchestration.action.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
