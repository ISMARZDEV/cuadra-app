import { Dialog } from "@base-ui/react/dialog";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui-base/button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** El IMPACTO, no un "¿estás seguro?". Es lo que separa esto de un `confirm()` del navegador. */
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Tiñe la acción de rojo. Para `Eliminar`; `Cancelar corrida` no es destructivo (no borra nada). */
  destructive?: boolean;
  /** Mutación en vuelo: bloquea un segundo disparo y deja el diálogo abierto. */
  busy?: boolean;
  /** Bloquea el confirmar por una PRECONDICIÓN sin cumplir (distinto de `busy`, que es "ya está
   * corriendo"). Existe para acciones que necesitan un dato antes de poder ejecutarse — p.ej.
   * canonizar en lote con filas sin categoría: dejar el botón activo y saltarlas en silencio sería
   * la mentira que este módulo tiene prohibida. */
  confirmDisabled?: boolean;
  /** Cuerpo extra bajo la descripción. Va FUERA de `Dialog.Description` a propósito: esa renderiza
   * un `<p>`, y meterle un dropdown adentro es HTML inválido. */
  children?: ReactNode;
}

/**
 * Confirmación fuerte para acciones con impacto operativo.
 *
 * Vive en `admin/components` (compartido) a propósito: Orquestación (cancelar corrida, eliminar
 * policy), Canónicos (archivar) y Productos exigen todas la misma confirmación en sus SDD.
 * Construirla dentro de un recurso sería duplicarla tres veces con tres copys distintos.
 *
 * Se apoya en la MISMA primitiva que `FilterModal` (`@base-ui/react/dialog`) para que el admin no
 * termine con dos sistemas de diálogo.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  busy = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] bg-card text-card-foreground shadow-xl transition duration-200 [corner-shape:squircle] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start gap-3 px-6 pt-6">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
                destructive
                  ? "bg-destructive/10 text-destructive"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              <AlertTriangle />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-bold text-brand-forest dark:text-brand-lime">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-sm text-muted-foreground">
                {description}
              </Dialog.Description>
              {children ? <div className="mt-4">{children}</div> : null}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 px-6 pb-6">
            <Button
              type="button"
              data-testid="confirm-dismiss"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="rounded-full border-border font-medium"
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              data-testid="confirm-accept"
              disabled={busy || confirmDisabled}
              onClick={() => {
                // La guarda vive acá y no solo en `disabled`: en jsdom (y con un doble clic real
                // antes del re-render) un botón deshabilitado igual recibe el evento.
                if (busy || confirmDisabled) return;
                onConfirm();
              }}
              className={cn(
                "rounded-full px-5 font-semibold",
                destructive
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
